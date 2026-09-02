/**
 * Las peritaciones: quién va a ver el coche a Alemania, cuándo y qué vio.
 *
 * «No se le paga al vendedor hasta que uno de los nuestros ve el coche» es la
 * única promesa que hace este negocio, y hasta ahora era **una casilla**: alguien
 * pulsaba «Hemos visto el coche» y el sistema se lo creía, sin saber quién fue,
 * qué día ni qué encontró.
 *
 * Por eso tiene tabla y pantalla propias, como los transportes y los trámites.
 * El día que un cliente pregunte «¿quién vio mi coche?», la respuesta no puede
 * ser que alguien marcó una casilla.
 *
 * La peritación **nace sola** cuando el dinero entra, porque es justo entonces
 * cuando hay que mandar a alguien. Y su resultado es lo que marca el coche como
 * visto: si el perito dice que no es el que se anunció, no queda visto, y el
 * portero de la liberación sigue cerrado sin que nadie tenga que acordarse.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { enviar } from '../lib/correo.js';
import { nombreComparable } from '../lib/proveedores.js';
import { escritoEnLista } from '../lib/escrow.js';
import { pareceUnCorreo, asuntoLimpio, notaEnParrafos } from '../lib/revision-de-correo.js';
import {
  papelesQueSePuedenAdjuntar, traeLosAdjuntos, NoSePuedenAdjuntar,
} from '../lib/adjuntos-del-correo.js';
import {
  correoDeEncargoAlPerito, faltaParaEncargarLaRevision,
  esEstadoPeritacion, esVeredicto, abreLaPuertaAlPago,
} from '../lib/peritaciones.js';

export const peritacionesRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_peritaciones (
    id              TEXT PRIMARY KEY,
    lead_id         TEXT,
    vehiculo_titulo TEXT NOT NULL DEFAULT '',
    estado          TEXT NOT NULL DEFAULT 'Por encargar',
    perito          TEXT NOT NULL DEFAULT '',
    donde           TEXT NOT NULL DEFAULT '',
    contacto        TEXT NOT NULL DEFAULT '',
    fecha_prevista  DATE,
    fecha_hecha     TIMESTAMPTZ,
    veredicto       TEXT,
    notas           TEXT NOT NULL DEFAULT '',
    coste           NUMERIC(12,2),
    factura_numero  TEXT NOT NULL DEFAULT '',
    factura_fecha   DATE,
    encargo_enviado_at TIMESTAMPTZ,
    encargo_enviado_a  TEXT NOT NULL DEFAULT '',
    creado_por      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`;

/** Una peritación por coche: si ya hay, no se abre otra. */
const ENSURE_UNICA = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_peritaciones_lead
    ON erp_peritaciones (lead_id) WHERE lead_id IS NOT NULL`;

let preparado = false;
async function prepara(): Promise<void> {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_UNICA, []).catch(() => {});
  // Para las tablas que ya existían antes de que hubiera factura.
  await query(
    `ALTER TABLE erp_peritaciones
       ADD COLUMN IF NOT EXISTS factura_numero TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS factura_fecha  DATE`,
    []
  ).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, lead_id, vehiculo_titulo, estado, perito, donde, contacto,
                TO_CHAR(fecha_prevista, 'YYYY-MM-DD') AS fecha_prevista,
                fecha_hecha, veredicto, notas, coste::numeric AS coste,
                factura_numero,
                TO_CHAR(factura_fecha, 'YYYY-MM-DD') AS factura_fecha,
                encargo_enviado_at, encargo_enviado_a, creado_por, created_at, updated_at`;

// ── Listar ──────────────────────────────────────────────────────────────────
peritacionesRouter.get(
  '/peritaciones',
  requireRole(['admin', 'support', 'operations']),
  async (_req, res) => {
    await prepara();
    // Antes de enseñarlas, las que falten: el aviso de que el dinero ha
    // entrado no llega al ERP, así que se mira lo que hay.
    await abreLasQueFalten().catch(() => 0);
    try {
      const r = await query(`SELECT ${CAMPOS} FROM erp_peritaciones ORDER BY created_at DESC`, []);
      res.json({ ok: true, data: r.rows });
    } catch (err) {
      console.error('[peritaciones] listar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'peritaciones_failed' });
    }
  }
);

// ── Cambiar lo que se sabe ──────────────────────────────────────────────────
peritacionesRouter.patch(
  '/peritaciones/:id',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    await prepara();
    const sets: string[] = [];
    const valores: unknown[] = [req.params.id];
    const pon = (campo: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${campo} = $${valores.length}`);
    };

    for (const campo of ['perito', 'donde', 'contacto', 'notas'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.fecha_prevista !== undefined) {
      pon('fecha_prevista', nt(req.body.fecha_prevista) || null);
    }
    if (req.body?.coste !== undefined) {
      const n = Number(req.body.coste);
      pon('coste', Number.isFinite(n) && n >= 0 ? n : null);
    }
    if (req.body?.estado !== undefined) {
      const estado = nt(req.body.estado);
      if (!esEstadoPeritacion(estado)) {
        res.status(400).json({ ok: false, error: 'estado_no_valido' });
        return;
      }
      pon('estado', estado);
    }
    if (!sets.length) { res.status(400).json({ ok: false, error: 'nada_que_cambiar' }); return; }

    try {
      const r = await query(
        `UPDATE erp_peritaciones SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $1 RETURNING ${CAMPOS}`,
        valores
      );
      if (!r.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) {
      console.error('[peritaciones] guardar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'peritaciones_failed' });
    }
  }
);

// ── El encargo al perito ────────────────────────────────────────────────────
peritacionesRouter.post(
  '/peritaciones/:id/encargo',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    await prepara();
    try {
      const r = await query<Record<string, unknown>>(
        `SELECT p.*, o.url AS anuncio
           FROM erp_peritaciones p
           LEFT JOIN moveadvisor_market_leads l ON l.id = p.lead_id
           LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
          WHERE p.id = $1 LIMIT 1`,
        [req.params.id]
      );
      const p = r.rows[0];
      if (!p) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

      const nombre = nt(p.perito);
      if (!nombre) {
        res.status(409).json({ ok: false, error: 'sin_perito', detail: 'Elige antes quién va a verlo.' });
        return;
      }
      const v = await query<{ email: string | null }>(
        `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
        [nombreComparable(nombre)]
      ).catch(() => ({ rows: [] as { email: string | null }[] }));
      const para = nt(v.rows[0]?.email);
      if (!para) {
        res.status(409).json({
          ok: false, error: 'sin_correo_del_perito',
          detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
        });
        return;
      }

      const soloVista = req.body?.soloVista === true;
      const datos = {
        vehiculo: nt(p.vehiculo_titulo),
        anuncio: p.anuncio as string | null,
        donde: nt(p.donde),
        contacto: nt(p.contacto),
        nota: notaEnParrafos(req.body?.nota),
      };
      const falta = faltaParaEncargarLaRevision(datos);
      if (falta.length) {
        res.status(409).json({ ok: false, error: 'faltan_datos', detail: `Falta ${escritoEnLista(falta)}.` });
        return;
      }

      const { subject, html } = correoDeEncargoAlPerito(datos);
      const aQuien = pareceUnCorreo(req.body?.para) ? nt(req.body.para) : para;
      const elAsunto = asuntoLimpio(req.body?.asunto, subject);
      const cajones = [
        { ambito: 'lead', id: p.lead_id as string | null },
        { ambito: 'peritacion', id: req.params.id },
      ];
      const papeles = await papelesQueSePuedenAdjuntar(cajones);

      if (soloVista) {
        res.json({ ok: true, vista: true, para: aQuien, subject: elAsunto, html, papeles });
        return;
      }

      let adjuntos: { filename: string; content: string }[] = [];
      try {
        adjuntos = await traeLosAdjuntos(cajones, req.body?.adjuntos);
      } catch (e) {
        if (e instanceof NoSePuedenAdjuntar) {
          res.status(409).json({ ok: false, error: 'adjuntos', detail: e.message });
          return;
        }
        throw e;
      }

      await enviar({ to: aQuien, subject: elAsunto, html, attachments: adjuntos, alClienteSiempre: true });

      await query(
        `UPDATE erp_peritaciones
            SET encargo_enviado_at = NOW(), encargo_enviado_a = $2,
                estado = CASE WHEN estado = 'Por encargar' THEN 'Encargada' ELSE estado END,
                updated_at = NOW()
          WHERE id = $1`,
        [req.params.id, aQuien]
      );

      res.json({ ok: true, para: aQuien });
    } catch (err) {
      console.error('[peritaciones] encargo:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'encargo_failed' });
    }
  }
);

// ── Lo que vio ──────────────────────────────────────────────────────────────
/**
 * El resultado, que es lo que marca el coche como visto.
 *
 * La fecha de «visto en Alemania» sale de aquí y no de un botón suelto. Y solo
 * la marca el veredicto bueno: si el coche no es el que se anunció, no está
 * visto y validado, y el portero de la liberación sigue cerrado sin que nadie
 * tenga que acordarse de nada.
 */
peritacionesRouter.post(
  '/peritaciones/:id/resultado',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    await prepara();
    const veredicto = req.body?.veredicto;
    if (!esVeredicto(veredicto)) {
      res.status(400).json({
        ok: false, error: 'veredicto_no_valido',
        detail: 'Di si es el coche que se anunció o no.',
      });
      return;
    }
    try {
      const r = await query<{ lead_id: string | null }>(
        `UPDATE erp_peritaciones
            SET estado = 'Hecha', fecha_hecha = NOW(), veredicto = $2,
                notas = COALESCE(NULLIF($3, ''), notas), updated_at = NOW()
          WHERE id = $1
          RETURNING lead_id`,
        [req.params.id, veredicto, nt(req.body?.notas).slice(0, 4000)]
      );
      if (!r.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

      const leadId = r.rows[0].lead_id;
      if (leadId) {
        await query(
          `UPDATE moveadvisor_market_leads
              SET verificado_alemania_at = CASE WHEN $2 THEN NOW() ELSE NULL END
            WHERE id = $1`,
          [leadId, abreLaPuertaAlPago(veredicto)]
        );
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[peritaciones] resultado:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'resultado_failed' });
    }
  }
);

// ── Su factura ──────────────────────────────────────────────────────────────
/**
 * La factura del perito, y su coste donde se ve.
 *
 * No se queda solo aquí: se apunta como **gasto del pedido**, que es de donde
 * salen «Lo que cuesta este coche» y el margen. Un coste que solo vive en la
 * pantalla donde se generó no aparece en ninguna cuenta, y 289 € sobre 1.136 €
 * de margen no son un detalle.
 *
 * Se apunta una sola vez: si ya hay un gasto de peritación de este pedido, se
 * actualiza en vez de añadir otro. Corregir el importe de una factura no puede
 * duplicar el coste del coche.
 */
peritacionesRouter.post('/peritaciones/:id/factura', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const numero = nt(req.body?.numero);
    const fecha = nt(req.body?.fecha) || null;
    const importeCrudo = Number(req.body?.importe);
    const importe = Number.isFinite(importeCrudo) && importeCrudo >= 0 ? importeCrudo : null;
    if (!numero) {
      res.status(400).json({
        ok: false, error: 'sin_numero',
        detail: 'Sin el número de su factura no hay nada que apuntar.',
      });
      return;
    }

    const r = await query<{ lead_id: string | null; perito: string; coste: string | null }>(
      `UPDATE erp_peritaciones
          SET factura_numero = $2, factura_fecha = $3,
              coste = COALESCE($4, coste), updated_at = NOW()
        WHERE id = $1
        RETURNING lead_id, perito, coste::numeric AS coste`,
      [req.params.id, numero, fecha, importe]
    );
    if (!r.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

    const { lead_id: leadId, perito, coste } = r.rows[0];
    let enElPedido = false;
    if (leadId && Number(coste)) {
      const pedido = await query<{ id: string }>(
        `SELECT id FROM erp_pedidos WHERE lead_id = $1 ORDER BY created_at LIMIT 1`,
        [leadId]
      ).catch(() => ({ rows: [] as { id: string }[] }));
      const pedidoId = pedido.rows[0]?.id;
      if (pedidoId) {
        // Uno solo por pedido: se busca el que haya y se corrige.
        const ya = await query<{ id: string }>(
          `SELECT id FROM erp_gastos_pedido WHERE pedido_id = $1 AND concepto = 'Peritación en Alemania' LIMIT 1`,
          [pedidoId]
        ).catch(() => ({ rows: [] as { id: string }[] }));
        if (ya.rows[0]) {
          await query(
            `UPDATE erp_gastos_pedido SET importe = $2, proveedor = $3, fecha = $4, notas = $5 WHERE id = $1`,
            [ya.rows[0].id, coste, perito, fecha, `Factura ${numero}`]
          );
        } else {
          await query(
            `INSERT INTO erp_gastos_pedido (pedido_id, concepto, proveedor, importe, fecha, notas, creado_por)
             VALUES ($1, 'Peritación en Alemania', $2, $3, $4, $5, $6)`,
            [pedidoId, perito, coste, fecha, `Factura ${numero}`, req.actor?.name ?? req.actor?.sub ?? '']
          );
        }
        enElPedido = true;
      }
    }

    res.json({ ok: true, enElPedido });
  } catch (err) {
    console.error('[peritaciones] factura:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'factura_failed' });
  }
});

/**
 * Las que faltan, abiertas de golpe.
 *
 * Hace falta porque **el depósito no se marca desde aquí**: lo escribe PopCar
 * en la misma base cuando el cliente paga, sin pasar por el ERP. El enganche
 * que abre la peritación al cambiar de etapa nunca llega a dispararse en el
 * camino normal, que es justo el que va a usar todo el mundo.
 *
 * Así que en vez de confiar en un aviso que no llega, se mira lo que hay: todo
 * coche de importación con el dinero dentro y sin peritación necesita una. Se
 * ejecuta al abrir las pantallas que las enseñan, y es idempotente — el índice
 * único por expediente no deja abrir dos.
 */
export async function abreLasQueFalten(): Promise<number> {
  await prepara();
  const faltan = await query<{ id: string; vehicle_title: string | null }>(
    `SELECT l.id, l.vehicle_title
       FROM moveadvisor_market_leads l
       LEFT JOIN erp_peritaciones p ON p.lead_id = l.id
      WHERE l.lead_type = 'import'
        AND l.deposit_paid_at IS NOT NULL
        AND p.id IS NULL
      LIMIT 50`,
    []
  ).catch(() => ({ rows: [] as { id: string; vehicle_title: string | null }[] }));

  let abiertas = 0;
  for (const f of faltan.rows) {
    const id = await abrePeritacionDeImportacion({
      leadId: f.id,
      vehiculoTitulo: f.vehicle_title ?? '',
      creadoPor: 'al entrar el dinero',
    });
    if (id) abiertas += 1;
  }
  return abiertas;
}

/**
 * La peritación de una importación, abierta sola cuando el dinero entra.
 *
 * Ese es el momento: con el depósito dentro hay que mandar a alguien a ver el
 * coche, y esperar a que alguien se acuerde de crearla a mano es esperar a que
 * un día no se acuerde.
 */
export async function abrePeritacionDeImportacion(datos: {
  leadId: string;
  vehiculoTitulo: string;
  donde?: string | null;
  creadoPor: string;
}): Promise<string | null> {
  await prepara();
  const yaHay = await query(`SELECT id FROM erp_peritaciones WHERE lead_id = $1`, [datos.leadId]);
  if (yaHay.rows.length) return String((yaHay.rows[0] as { id: string }).id);

  try {
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_peritaciones', prefijoAnual('PER')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_peritaciones (id, lead_id, vehiculo_titulo, donde, creado_por)
           VALUES ($1,$2,$3,$4,$5)`,
          [nuevoId, datos.leadId, datos.vehiculoTitulo, datos.donde ?? '', datos.creadoPor]
        );
      }
    );
    return id;
  } catch (e) {
    console.error('[peritaciones] no se ha podido abrir:', (e as Error).message);
    return null;
  }
}
