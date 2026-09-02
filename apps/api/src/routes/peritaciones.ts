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
import { apuntaFacturaRecibida } from './provider-billing.js';
import { pareceUnCorreo, asuntoLimpio, notaEnParrafos } from '../lib/revision-de-correo.js';
import {
  papelesQueSePuedenAdjuntar, traeLosAdjuntos, NoSePuedenAdjuntar,
} from '../lib/adjuntos-del-correo.js';
import { costeQueSeGuarda, faltaParaApuntarUnDano, leeLoPegado } from '../lib/danos-del-coche.js';
import {
  correoDeEncargoAlPerito, faltaParaEncargarLaRevision,
  correoDeLaCitaAlVendedor, faltaParaAvisarDeLaCita,
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
    hora_prevista   TEXT NOT NULL DEFAULT '',
    telefono        TEXT NOT NULL DEFAULT '',
    quien_va        TEXT NOT NULL DEFAULT '',
    quien_va_email  TEXT NOT NULL DEFAULT '',
    quien_va_tel    TEXT NOT NULL DEFAULT '',
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

/**
 * Lo que vio roto, partida por partida.
 *
 * En tabla aparte y no en un campo de texto de la peritación porque la
 * pregunta que hay detrás es una suma: cuánto cuesta dejar el coche bien. Un
 * párrafo con «golpe en la aleta y el faro» no se suma, y el precio de
 * reacondicionamiento que se le da al cliente acaba saliendo de la memoria de
 * quien coge el teléfono.
 */
const ENSURE_DANOS = `
  CREATE TABLE IF NOT EXISTS erp_peritacion_danos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peritacion_id TEXT NOT NULL,
    pieza         TEXT NOT NULL DEFAULT '',
    coste         NUMERIC(12,2),
    notas         TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_DANOS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_peritacion_danos_peritacion
    ON erp_peritacion_danos (peritacion_id)`;

/** Una peritación por coche: si ya hay, no se abre otra. */
const ENSURE_UNICA = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_peritaciones_lead
    ON erp_peritaciones (lead_id) WHERE lead_id IS NOT NULL`;

let preparado = false;
async function prepara(): Promise<void> {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_UNICA, []).catch(() => {});
  await query(ENSURE_DANOS, []).catch(() => {});
  await query(ENSURE_DANOS_INDEX, []).catch(() => {});
  // Para las tablas que ya existían antes de que hubiera factura.
  await query(
    `ALTER TABLE erp_peritaciones
       ADD COLUMN IF NOT EXISTS factura_numero TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS factura_fecha  DATE,
       ADD COLUMN IF NOT EXISTS cita_avisada_at TIMESTAMPTZ,
       ADD COLUMN IF NOT EXISTS cita_avisada_a  TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS hora_prevista   TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS telefono        TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS quien_va        TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS quien_va_email  TEXT NOT NULL DEFAULT '',
       ADD COLUMN IF NOT EXISTS quien_va_tel    TEXT NOT NULL DEFAULT ''`,
    []
  ).catch(() => {});
  preparado = true;
}

interface DanoDeFila {
  id: string;
  peritacion_id: string;
  pieza: string;
  coste: string | null;
  notas: string;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, lead_id, vehiculo_titulo, estado, perito, donde, contacto,
                telefono, hora_prevista, quien_va, quien_va_email, quien_va_tel,
                TO_CHAR(fecha_prevista, 'YYYY-MM-DD') AS fecha_prevista,
                fecha_hecha, veredicto, notas, coste::numeric AS coste,
                factura_numero, cita_avisada_at, cita_avisada_a,
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
      const r = await query<{ id: string }>(
        `SELECT ${CAMPOS} FROM erp_peritaciones ORDER BY created_at DESC`, []);
      // Los daños van con su peritación y no en otra llamada: la pantalla
      // enseña el total al lado del veredicto, y dos llamadas se pintan en
      // dos momentos distintos.
      const danos = await query<DanoDeFila>(
        `SELECT id, peritacion_id, pieza, coste::numeric AS coste, notas
           FROM erp_peritacion_danos ORDER BY created_at`, []
      ).catch(() => ({ rows: [] as DanoDeFila[] }));
      const porPeritacion = new Map<string, DanoDeFila[]>();
      for (const d of danos.rows) {
        const suyos = porPeritacion.get(d.peritacion_id) ?? [];
        suyos.push(d);
        porPeritacion.set(d.peritacion_id, suyos);
      }
      res.json({
        ok: true,
        data: r.rows.map((p) => ({ ...p, danos: porPeritacion.get(p.id) ?? [] })),
      });
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

    for (const campo of [
      'perito', 'donde', 'contacto', 'telefono', 'hora_prevista',
      'quien_va', 'quien_va_email', 'quien_va_tel', 'notas',
    ] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.fecha_prevista !== undefined) {
      pon('fecha_prevista', nt(req.body.fecha_prevista) || null);
    }
    if (req.body?.coste !== undefined) {
      // En blanco es «todavía no lo ha dicho», no «cero euros»: `Number("")`
      // da 0, y así una peritación sin presupuesto salía costando 0,00 €.
      pon('coste', costeQueSeGuarda(req.body.coste));
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
        `SELECT p.*, o.url AS anuncio,
                TO_CHAR(p.fecha_prevista, 'DD/MM/YYYY') AS cuando
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
        telefono: nt(p.telefono),
        // La cita ya viene del vendedor: al perito le queda confirmarla.
        cuando: nt(p.cuando),
        hora: nt(p.hora_prevista),
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

// ── Avisar al vendedor del día ──────────────────────────────────────────────
/**
 * Decirle al vendedor qué día va el perito.
 *
 * Va desde el ERP y no por teléfono para que quede apuntado: quién dijo qué día
 * y a quién se le avisó. Dos que se llaman por su cuenta no dejan rastro, y el
 * día que el coche no esté preparado no hay dónde mirar.
 */
peritacionesRouter.post('/peritaciones/:id/cita', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT p.*, 
              TO_CHAR(p.fecha_prevista, 'DD/MM/YYYY') AS cuando,
              pe.proveedor, o.dealer_name
         FROM erp_peritaciones p
         LEFT JOIN moveadvisor_market_leads l ON l.id = p.lead_id
         LEFT JOIN erp_pedidos pe ON pe.lead_id = l.id
         LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
        WHERE p.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const p = r.rows[0];
    if (!p) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

    const nombre = nt(p.proveedor) || nt(p.dealer_name);
    if (!nombre) {
      res.status(409).json({ ok: false, error: 'sin_vendedor', detail: 'No se sabe a quién avisar.' });
      return;
    }
    const v = await query<{ email: string | null }>(
      `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
      [nombreComparable(nombre)]
    ).catch(() => ({ rows: [] as { email: string | null }[] }));
    const para = nt(v.rows[0]?.email);
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_vendedor',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    const soloVista = req.body?.soloVista === true;
    const datos = {
      vehiculo: nt(p.vehiculo_titulo),
      cuando: nt(p.cuando),
      hora: nt(p.hora_prevista),
      perito: nt(p.perito),
      // El nombre de quien va de verdad, si nos lo han dicho. Es lo que
      // pregunta el vendedor al contestar: con qué nombre va el perito.
      quienVa: nt(p.quien_va),
      // Su teléfono, para que el vendedor pueda llamarle el día de la visita
      // sin pasar por nosotros. Una nave que abre a las siete y un perito que
      // llega a las diez se arreglan con una llamada, no con tres correos.
      telefonoDeQuienVa: nt(p.quien_va_tel),
      nota: notaEnParrafos(req.body?.nota),
    };
    const falta = faltaParaAvisarDeLaCita(datos);
    if (falta.length) {
      res.status(409).json({
        ok: false, error: 'faltan_datos',
        detail: `Falta ${escritoEnLista(falta)}. La fecha se pone arriba, en «Cuándo va».`,
      });
      return;
    }

    const { subject, html } = correoDeLaCitaAlVendedor(datos);
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
      `UPDATE erp_peritaciones SET cita_avisada_at = NOW(), cita_avisada_a = $2, updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, aQuien]
    );

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    console.error('[peritaciones] cita:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'cita_failed' });
  }
});

// ── Los daños que vio ───────────────────────────────────────────────────────
/**
 * Apuntar una partida dañada, con lo que el perito estima que cuesta.
 *
 * El importe es opcional a propósito: un perito lista un golpe en la aleta y
 * no siempre le pone precio. Si esa partida no se pudiera apuntar sin importe,
 * o se quedaría fuera o alguien le pondría un cero — y un cero dice que
 * arreglarlo es gratis, que es peor que no saberlo.
 */
peritacionesRouter.post('/peritaciones/:id/danos', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const pieza = nt(req.body?.pieza);
    const falta = faltaParaApuntarUnDano({ pieza });
    if (falta.length) {
      res.status(400).json({ ok: false, error: 'faltan_datos', detail: `Falta ${escritoEnLista(falta)}.` });
      return;
    }
    const suya = await query<{ id: string }>(
      `SELECT id FROM erp_peritaciones WHERE id = $1`, [req.params.id]);
    if (!suya.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

    const r = await query<DanoDeFila>(
      `INSERT INTO erp_peritacion_danos (peritacion_id, pieza, coste, notas, creado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, peritacion_id, pieza, coste::numeric AS coste, notas`,
      [req.params.id, pieza, costeQueSeGuarda(req.body?.coste), nt(req.body?.notas),
       req.actor?.name ?? req.actor?.sub ?? '']
    );
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[peritaciones] apuntar daño:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'dano_failed' });
  }
});

/** Corregir una partida ya apuntada. */
peritacionesRouter.patch('/peritaciones/:id/danos/:danoId', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const sets: string[] = [];
    const valores: unknown[] = [req.params.danoId, req.params.id];
    const pon = (campo: string, valor: unknown) => {
      valores.push(valor);
      sets.push(`${campo} = $${valores.length}`);
    };
    if (req.body?.pieza !== undefined) pon('pieza', nt(req.body.pieza));
    if (req.body?.notas !== undefined) pon('notas', nt(req.body.notas));
    // `coste` se puede dejar en blanco a posta: es volver a «sin valorar».
    if (req.body?.coste !== undefined) pon('coste', costeQueSeGuarda(req.body.coste));
    if (!sets.length) { res.status(400).json({ ok: false, error: 'nada_que_cambiar' }); return; }

    const r = await query<DanoDeFila>(
      `UPDATE erp_peritacion_danos SET ${sets.join(', ')}
        WHERE id = $1 AND peritacion_id = $2
        RETURNING id, peritacion_id, pieza, coste::numeric AS coste, notas`,
      valores
    );
    if (!r.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[peritaciones] corregir daño:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'dano_failed' });
  }
});

/**
 * Quitar una partida.
 *
 * Se pide el número de la peritación además del de la partida: un borrado que
 * solo mira el identificador de la fila borra la de cualquier otro coche si el
 * identificador viene equivocado.
 */
peritacionesRouter.delete('/peritaciones/:id/danos/:danoId', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query(
      `DELETE FROM erp_peritacion_danos WHERE id = $1 AND peritacion_id = $2`,
      [req.params.danoId, req.params.id]
    );
    if (!r.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error('[peritaciones] quitar daño:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'dano_failed' });
  }
});

/**
 * Lo pegado de una hoja de cálculo, de una vez.
 *
 * Con `soloVista` no guarda nada: devuelve lo que ha entendido y lo que no,
 * para poder enseñarlo antes. Veinte partidas escritas mal en la base son
 * veinte borrados a mano; una vista previa es un vistazo.
 */
peritacionesRouter.post('/peritaciones/:id/danos/pegadas', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const { danos, malas } = leeLoPegado(req.body?.texto);
    if (req.body?.soloVista === true) {
      res.json({ ok: true, vista: true, danos, malas });
      return;
    }
    if (!danos.length) {
      res.status(400).json({
        ok: false, error: 'nada_que_apuntar',
        detail: 'No se ha entendido ninguna partida de lo pegado.',
      });
      return;
    }
    const suya = await query<{ id: string }>(
      `SELECT id FROM erp_peritaciones WHERE id = $1`, [req.params.id]);
    if (!suya.rowCount) { res.status(404).json({ ok: false, error: 'no_encontrada' }); return; }

    // De un golpe: si una fila falla, no se quedan quince dentro y cinco fuera.
    await query(
      `INSERT INTO erp_peritacion_danos (peritacion_id, pieza, coste, notas, creado_por)
       SELECT $1, pieza, coste, notas, $5
         FROM UNNEST($2::text[], $3::numeric[], $4::text[]) AS t(pieza, coste, notas)`,
      [
        req.params.id,
        danos.map((d) => d.pieza),
        danos.map((d) => d.coste),
        danos.map((d) => d.notas ?? ''),
        req.actor?.name ?? req.actor?.sub ?? 'pegado de una hoja',
      ]
    );
    res.json({ ok: true, cuantas: danos.length, malas });
  } catch (err) {
    console.error('[peritaciones] pegar daños:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'danos_failed' });
  }
});

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

    /**
     * A facturas recibidas, que es donde se paga.
     *
     * El gasto del pedido dice lo que cuesta el coche; esto dice lo que le
     * debemos a alguien. Son dos preguntas distintas y hasta ahora la segunda
     * no tenía respuesta: la factura estaba apuntada y no había nada que pagar
     * en ningún sitio.
     */
    let enFacturas: string | null = null;
    if (Number(coste)) {
      enFacturas = await apuntaFacturaRecibida({
        proveedor: perito,
        numero,
        importe: Number(coste),
        fecha,
        vehiculo: nt((await query<{ t: string }>(
          `SELECT vehiculo_titulo AS t FROM erp_peritaciones WHERE id = $1`, [req.params.id]
        ).catch(() => ({ rows: [] as { t: string }[] }))).rows[0]?.t),
        notas: 'Peritación en Alemania',
      }).catch(() => null);
    }

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

    res.json({ ok: true, enElPedido, enFacturas: Boolean(enFacturas) });
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
