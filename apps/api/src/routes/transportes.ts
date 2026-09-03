/**
 * Los transportes: cada viaje que hace un coche.
 *
 * Un coche de Alemania hace uno, y a veces tres: del vendedor al almacén, del
 * almacén al taller, del taller al cliente. Cada uno es un **tramo** con su
 * transportista, sus fechas y su coste, y sumarlos es parte de lo que cuesta el
 * coche de verdad.
 *
 * Cuelgan de un pedido. Las fotos de la recogida y de la entrega se suben como
 * documentos del transporte: son lo único que distingue un golpe que ya venía de
 * uno que se hizo por el camino.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { apuntaFacturaEsperada } from './provider-billing.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import { enviar } from '../lib/correo.js';
import { nombreComparable } from '../lib/proveedores.js';
import { escritoEnLista } from '../lib/escrow.js';
import { correoDeOrdenDeRecogida, faltaParaLaOrden } from '../lib/orden-de-recogida.js';
import {
  correoDeAvisoDeRecogida, faltaParaAvisarDeLaRecogida,
} from '../lib/aviso-de-recogida-al-vendedor.js';
import {
  correoDePresupuestoAlTransportista, faltaParaPedirPresupuesto, type Idioma,
} from '../lib/presupuesto-al-transportista.js';

/**
 * En qué idioma sale un correo al transportista.
 *
 * Lo elige quien revisa, y por defecto castellano: los de la lista de
 * Proveedores son de aquí. Lo que llegue y no sea uno de los tres se trata
 * como castellano en vez de reventar — un correo no sale peor por eso, y
 * fallar aquí dejaría un coche sin recoger.
 */
const IDIOMAS: Idioma[] = ['es', 'de', 'en'];
function elIdioma(v: unknown): Idioma {
  const s = String(v ?? '').trim().toLowerCase();
  return (IDIOMAS as string[]).includes(s) ? (s as Idioma) : 'es';
}
import { correoDeDatosDeRecogida, faltaParaPedirLaRecogida } from '../lib/datos-de-recogida.js';
import { pareceUnCorreo, asuntoLimpio, notaEnParrafos } from '../lib/revision-de-correo.js';
import { papelesQueSePuedenAdjuntar, loQueSeAdjunta, NoSePuedenAdjuntar } from '../lib/adjuntos-del-correo.js';
import {
  INCIDENCIA, esEstadoTransporteValido, puedeContratarse, notaDelCambio, fotosQueFaltan,
  mueveElExpediente,
} from '../lib/transportes.js';

export const transportesRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_transportes (
    id            TEXT PRIMARY KEY,
    pedido_id     TEXT,
    lead_id       TEXT,
    tramo         INTEGER NOT NULL DEFAULT 1,
    estado        TEXT NOT NULL DEFAULT 'Por organizar',
    transportista TEXT NOT NULL DEFAULT '',
    desde         TEXT NOT NULL DEFAULT '',
    hasta         TEXT NOT NULL DEFAULT '',
    vehiculo_titulo TEXT NOT NULL DEFAULT '',
    matricula     TEXT NOT NULL DEFAULT '',
    coste         NUMERIC(12,2),
    recogida_prevista DATE,
    entrega_prevista  DATE,
    fecha_recogida    TIMESTAMPTZ,
    fecha_entrega     TIMESTAMPTZ,
    notas         TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_HISTORY = `
  CREATE TABLE IF NOT EXISTS erp_transporte_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transporte_id TEXT NOT NULL,
    operador      TEXT NOT NULL,
    campo         TEXT NOT NULL,
    antes         TEXT,
    despues       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

/** Cuándo se le mandó la orden de recogida, y a qué correo. */
const ENSURE_ORDEN = `
  ALTER TABLE erp_transportes
    ADD COLUMN IF NOT EXISTS orden_enviada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS orden_enviada_a  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS recogida_preguntada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recogida_preguntada_a  TEXT NOT NULL DEFAULT '',
    -- Lo que contesta el vendedor y no cabía en ningún sitio. Sin nombre y
    -- teléfono en la punta de salida, el conductor llega a una nave con
    -- ochenta coches y llama aquí; y sin el horario, llega a las ocho.
    ADD COLUMN IF NOT EXISTS contacto_origen  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS telefono_origen  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS horario_origen   TEXT NOT NULL DEFAULT '',
    -- Si cabe un portacoches hasta el coche. Nulo mientras no se sepa: uno
    -- lleva ocho y sale a un tercio por coche, así que decidirlo a ciegas
    -- cambia el precio del viaje.
    ADD COLUMN IF NOT EXISTS portacoches BOOLEAN,
    ADD COLUMN IF NOT EXISTS presupuesto_pedido_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS presupuesto_pedido_a  TEXT NOT NULL DEFAULT '',
    -- Y cuándo se le dijo al vendedor quién va a por el coche y qué día.
    ADD COLUMN IF NOT EXISTS aviso_recogida_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS aviso_recogida_a  TEXT NOT NULL DEFAULT '',
    -- Quién lleva este viaje por parte del transportista. Va en el tramo y no
    -- en su ficha: la ficha tiene la centralita, y el que contesta el
    -- presupuesto es el de tráfico, que cambia de un coche a otro.
    ADD COLUMN IF NOT EXISTS contacto_transportista TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS telefono_transportista TEXT NOT NULL DEFAULT ''`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_transportes_estado
    ON erp_transportes (estado, created_at DESC)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_HISTORY, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  await query(ENSURE_ORDEN, []).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, pedido_id, lead_id, tramo, estado, transportista, desde, hasta,
                vehiculo_titulo, matricula, coste::numeric AS coste,
                TO_CHAR(recogida_prevista, 'YYYY-MM-DD') AS recogida_prevista,
                TO_CHAR(entrega_prevista, 'YYYY-MM-DD')  AS entrega_prevista,
                fecha_recogida, fecha_entrega, notas, creado_por, created_at, updated_at,
                orden_enviada_at, orden_enviada_a,
                recogida_preguntada_at, recogida_preguntada_a,
                contacto_origen, telefono_origen, horario_origen,
                portacoches, presupuesto_pedido_at, presupuesto_pedido_a,
                aviso_recogida_at, aviso_recogida_a,
                contacto_transportista, telefono_transportista`;

// ── Listar ──────────────────────────────────────────────────────────────────
transportesRouter.get('/transportes', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  // Los tramos que falten, antes de enseñarlos: un coche pagado sin tramo es
  // trabajo que no aparece en ninguna pantalla.
  await abreLosTramosQueFalten().catch(() => 0);
  const estado = nt(req.query.estado);
  const pedido = nt(req.query.pedido_id);
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (estado) { valores.push(estado); condiciones.push(`estado = $${valores.length}`); }
  if (pedido) { valores.push(pedido); condiciones.push(`pedido_id = $${valores.length}`); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  try {
    await prepara();
    const r = await query(
      `SELECT ${CAMPOS} FROM erp_transportes ${where} ORDER BY created_at DESC, tramo ASC LIMIT 200`,
      valores
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[transportes] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

// ── Crear un tramo ──────────────────────────────────────────────────────────
transportesRouter.post('/transportes', requireRole(['admin', 'operations']), async (req, res) => {
  const desde = nt(req.body?.desde);
  const hasta = nt(req.body?.hasta);
  if (!desde || !hasta) {
    res.status(400).json({ ok: false, error: 'falta_recorrido', detail: 'Un tramo va de un sitio a otro.' });
    return;
  }

  try {
    await prepara();
    const pedidoId = nt(req.body?.pedido_id) || null;
    // El número de tramo: el siguiente de ese pedido. Sirve para leerlos en
    // orden aunque se creen desordenados.
    let tramo = 1;
    if (pedidoId) {
      const previos = await query(
        `SELECT COALESCE(MAX(tramo), 0) + 1 AS siguiente FROM erp_transportes WHERE pedido_id = $1`,
        [pedidoId]
      );
      tramo = Number((previos.rows[0] as { siguiente: number }).siguiente) || 1;
    }

    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_transportes', prefijoAnual('TRP')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_transportes
             (id, pedido_id, lead_id, tramo, transportista, desde, hasta,
              vehiculo_titulo, matricula, coste, recogida_prevista, entrega_prevista, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            nuevoId, pedidoId, nt(req.body?.lead_id) || null, tramo,
            nt(req.body?.transportista), desde, hasta,
            nt(req.body?.vehiculo_titulo), nt(req.body?.matricula),
            req.body?.coste != null && req.body?.coste !== '' ? Number(req.body.coste) : null,
            nt(req.body?.recogida_prevista) || null, nt(req.body?.entrega_prevista) || null,
            nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
          ]
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM erp_transportes WHERE id = $1`, [id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[transportes] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
/**
 * Mandarle al transportista la orden de recogida.
 *
 * Hoy esto se escribe a mano copiando de tres pantallas. Copiar una dirección a
 * mano es donde se cuelan los errores, y en un transporte el error no se ve
 * hasta que el camión está en la puerta equivocada.
 *
 * Va con botón, como la petición de factura al vendedor y por lo mismo: con
 * este volumen, un correo revisado vale igual que uno automático y no se
 * arriesga a salir con un dato mal puesto.
 */
/**
 * Preguntarle al vendedor dónde y cuándo se recoge el coche.
 *
 * El tramo dice «München → Zaragoza» porque la ciudad es lo único que trae el
 * anuncio, y un transportista no va a una ciudad: va a una calle, un día, a una
 * hora y preguntando por alguien.
 *
 * Va antes que la orden al transportista a propósito: la respuesta a esto es lo
 * que se escribe en «Desde» y en «Recogida prevista», y sin eso la orden sale
 * con media dirección.
 */
transportesRouter.post('/transportes/:id/datos-recogida', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT t.*, pe.proveedor, pe.id AS pedido
         FROM erp_transportes t
         LEFT JOIN erp_pedidos pe ON pe.id = t.pedido_id
        WHERE t.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const t = r.rows[0];
    if (!t) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    const nombre = String(t.proveedor ?? '').trim();
    if (!nombre) {
      res.status(409).json({
        ok: false, error: 'sin_vendedor',
        detail: 'Este tramo no viene de un pedido, así que no se sabe a quién preguntarle.',
      });
      return;
    }
    const v = await query<{ email: string | null }>(
      `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
      [nombreComparable(nombre)]
    ).catch(() => ({ rows: [] as { email: string | null }[] }));
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_vendedor',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    const soloVista = req.body?.soloVista === true;
    const nota = notaEnParrafos(req.body?.nota);
    const datos = {
      vehiculo: String(t.vehiculo_titulo ?? ''),
      matricula: t.matricula as string | null,
      pedido: t.pedido as string | null,
      ciudad: t.desde as string | null,
      nota,
    };
    const falta = faltaParaPedirLaRecogida(datos);
    if (falta.length) {
      res.status(409).json({ ok: false, error: 'faltan_datos', detail: `Falta ${escritoEnLista(falta)}.` });
      return;
    }

    const { subject, html } = correoDeDatosDeRecogida(datos);
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);
    const cajones = [
      { ambito: 'lead', id: t.lead_id as string | null },
      { ambito: 'pedido', id: t.pedido_id as string | null },
      { ambito: 'transporte', id: req.params.id },
    ];
    const papeles = await papelesQueSePuedenAdjuntar(cajones);

    if (soloVista) {
      res.json({ ok: true, vista: true, para: aQuien, subject: elAsunto, html, papeles, idioma: 'de' });
      return;
    }

    let adjuntos: { filename: string; content: string }[] = [];
    // Lo que va, y la frase que lo dice: un adjunto que el cuerpo no
    // menciona es un adjunto que no se abre.
    let dicho = '';
    try {
      const va = await loQueSeAdjunta(cajones, req.body?.adjuntos, 'de');
      adjuntos = va.attachments;
      dicho = va.linea;
    } catch (e) {
      if (e instanceof NoSePuedenAdjuntar) {
        res.status(409).json({ ok: false, error: 'adjuntos', detail: e.message });
        return;
      }
      throw e;
    }

    await enviar({ to: aQuien, subject: elAsunto, html: html + dicho, attachments: adjuntos, alClienteSiempre: true });

    await query(
      `UPDATE erp_transportes
          SET recogida_preguntada_at = NOW(), recogida_preguntada_a = $2, updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, aQuien]
    );

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    console.error('[transportes] datos de recogida:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'datos_recogida_failed' });
  }
});
transportesRouter.post('/transportes/:id/orden', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT t.*, 
              pe.proveedor AS vendedor,
              l.entrega_direccion, l.entrega_cp, l.entrega_ciudad, l.entrega_provincia,
              l.contact_name, l.contact_phone
         FROM erp_transportes t
         LEFT JOIN erp_pedidos pe ON pe.id = t.pedido_id
         LEFT JOIN moveadvisor_market_leads l ON l.id = t.lead_id
        WHERE t.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const t = r.rows[0];
    if (!t) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    // A quién: el correo de su ficha, buscada por el nombre normalizado.
    const nombre = String(t.transportista ?? '').trim();
    if (!nombre) {
      res.status(409).json({
        ok: false, error: 'sin_transportista',
        detail: 'Elige antes quién lo trae.',
      });
      return;
    }
    const v = await query<{ email: string | null }>(
      `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
      [nombreComparable(nombre)]
    ).catch(() => ({ rows: [] as { email: string | null }[] }));
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_transportista',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    /**
     * A quién pregunta al llegar, según el tramo.
     *
     * En el primero recoge en el concesionario alemán; en el segundo sale de
     * nuestra parada y lo entrega en casa del cliente. Sin un nombre y un
     * teléfono en cada punta, el conductor llega y llama aquí.
     */
    const esElPrimero = Number(t.tramo ?? 1) <= 1;
    const enCasaDelCliente = {
      donde: [t.entrega_direccion, t.entrega_cp, t.entrega_ciudad, t.entrega_provincia]
        .map((x) => String(x ?? '').trim()).filter(Boolean).join(', '),
      quien: t.contact_name as string | null,
      telefono: t.contact_phone as string | null,
    };
    /*
     * En el primero, lo que contestó el vendedor manda sobre lo que tenemos.
     *
     * «AutoCheck Deutschland» es a quién le compramos; «Daniel Weber» es por
     * quien pregunta el conductor al llegar. No son lo mismo, y el que sirve
     * en la puerta es el segundo.
     */
    const origen = esElPrimero
      ? {
          donde: String(t.desde ?? ''),
          quien: String(t.contacto_origen ?? '').trim() || (t.vendedor as string | null),
          telefono: String(t.telefono_origen ?? '').trim() || null,
        }
      : { donde: String(t.desde ?? '') };
    const destino = esElPrimero
      ? { donde: String(t.hasta ?? '') }
      : (enCasaDelCliente.donde ? enCasaDelCliente : { donde: String(t.hasta ?? '') });

    const datos = {
      referencia: String(t.id),
      vehiculo: String(t.vehiculo_titulo ?? ''),
      matricula: t.matricula as string | null,
      origen, destino,
      recogidaPrevista: t.recogida_prevista as string | null,
      contactoSuyo: String(t.contacto_transportista ?? '').trim() || null,
      horarioOrigen: String(t.horario_origen ?? '').trim() || null,
      coste: t.coste != null ? Number(t.coste) : null,
    };
    const falta = faltaParaLaOrden(datos);
    // Y que el vendedor sepa quién va. La pantalla apaga el botón, pero entre
    // lo que se cargó y el clic caben unos minutos y otra persona.
    if (esElPrimero && t.recogida_preguntada_at && !t.aviso_recogida_at) {
      falta.push('avisarle antes al vendedor de quién va y qué día');
    }
    if (falta.length) {
      res.status(409).json({
        ok: false, error: 'faltan_datos_del_tramo',
        detail: `Falta ${escritoEnLista(falta)}.`,
      });
      return;
    }

    /**
     * Lo que trae quien revisa: a quién, el asunto y lo que quiera añadir.
     *
     * `soloVista` devuelve el correo sin mandarlo. Es lo que pinta el cuadro de
     * revisión: enseñar el que se va a enviar y no una aproximación, porque una
     * aproximación revisada no es una revisión.
     */
    const soloVista = req.body?.soloVista === true;
    const nota = notaEnParrafos(req.body?.nota);

    const idioma = elIdioma(req.body?.idioma);
    const { subject, html } = correoDeOrdenDeRecogida({ ...datos, nota }, idioma);
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);

    // Los tres cajones del coche: el expediente, el pedido y este tramo. La
    // ficha y el COC se suben en el pedido; mirando solo uno, la lista sale
    // vacía justo cuando los papeles existen.
    const cajones = [
      { ambito: 'lead', id: t.lead_id as string | null },
      { ambito: 'pedido', id: t.pedido_id as string | null },
      { ambito: 'transporte', id: req.params.id },
    ];
    const papeles = await papelesQueSePuedenAdjuntar(cajones);

    if (soloVista) {
      res.json({ ok: true, vista: true, para: aQuien, subject: elAsunto, html, papeles, idioma, idiomas: IDIOMAS });
      return;
    }

    let adjuntos: { filename: string; content: string }[] = [];
    // Lo que va, y la frase que lo dice: un adjunto que el cuerpo no
    // menciona es un adjunto que no se abre.
    let dicho = '';
    try {
      const va = await loQueSeAdjunta(cajones, req.body?.adjuntos, idioma);
      adjuntos = va.attachments;
      dicho = va.linea;
    } catch (e) {
      if (e instanceof NoSePuedenAdjuntar) {
        res.status(409).json({ ok: false, error: 'adjuntos', detail: e.message });
        return;
      }
      throw e;
    }

    // Salta el desvío de pruebas: si no sale, nadie recoge el coche.
    await enviar({ to: aQuien, subject: elAsunto, html: html + dicho, attachments: adjuntos, alClienteSiempre: true });

    /*
     * Y con la orden fuera, el tramo queda contratado.
     *
     * Mandarla **es** contratar: se acordó por correo y esto lo confirma. Que
     * hubiera que marcarlo antes a mano obligaba a declarar cerrado algo que se
     * cierra con el correo que todavía no había salido, y dejaba tramos con la
     * orden mandada y el estado sin mover: en la pantalla, coches que nadie ha
     * quedado en recoger cuando sí.
     *
     * Solo desde «Por organizar», y solo si hay con quién y por cuánto —que es
     * lo mismo que exige el cambio a mano—. Un tramo que ya está más adelante
     * no retrocede porque se vuelva a mandar la orden.
     */
    const contrata = String(t.estado ?? '') === 'Por organizar' && puedeContratarse({
      transportista: String(t.transportista ?? ''),
      coste: t.coste,
    });

    await query(
      `UPDATE erp_transportes
          SET orden_enviada_at = NOW(), orden_enviada_a = $2,
              estado = CASE WHEN $3::boolean THEN 'Contratado' ELSE estado END,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, aQuien, contrata]
    ).catch((e: Error) => console.error('[transportes] no se ha podido anotar la orden:', e.message));

    res.json({ ok: true, para: aQuien, contratado: contrata });
  } catch (err) {
    console.error('[transportes] orden:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'orden_failed' });
  }
});
/**
 * Pedirle precio y fecha al transportista.
 *
 * Va **antes** de la orden y es otra cosa. La orden se manda cuando ya se ha
 * quedado con alguien por un precio; esto es la pregunta que lleva a ese
 * precio, y se le hace a más de uno: un tramo Múnich → Zaragoza se mueve
 * varios cientos de euros entre el primero y el tercero.
 *
 * Se puede mandar sin haber contratado a nadie —esa es la gracia— pero no sin
 * la respuesta del vendedor: un presupuesto pedido con «un coche en Múnich»
 * vuelve con un precio de mentira, y luego se discute con el camión cargado.
 */
transportesRouter.post('/transportes/:id/presupuesto', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT t.*, pe.proveedor AS vendedor
         FROM erp_transportes t
         LEFT JOIN erp_pedidos pe ON pe.id = t.pedido_id
        WHERE t.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const t = r.rows[0];
    if (!t) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    // A quién se le pide: el correo de su ficha de Proveedores.
    const nombre = String(t.transportista ?? '').trim();
    if (!nombre) {
      res.status(409).json({
        ok: false, error: 'sin_transportista',
        detail: 'Elige a quién le pides precio. Si quieres comparar, se lo pides a uno, apuntas lo que diga y cambias de nombre.',
      });
      return;
    }
    const v = await query<{ email: string | null }>(
      `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
      [nombreComparable(nombre)]
    ).catch(() => ({ rows: [] as { email: string | null }[] }));
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_transportista',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    const datos = {
      referencia: String(t.id),
      vehiculo: String(t.vehiculo_titulo ?? ''),
      matricula: t.matricula as string | null,
      desde: String(t.desde ?? ''),
      hasta: String(t.hasta ?? ''),
      // Lo que contestó el vendedor manda sobre el nombre de la empresa: por
      // quien pregunta el conductor no es a quién le compramos el coche.
      contacto: String(t.contacto_origen ?? '').trim() || (t.vendedor as string | null),
      telefono: String(t.telefono_origen ?? '').trim() || null,
      disponibleDesde: t.recogida_prevista as string | null,
      horario: String(t.horario_origen ?? '').trim() || null,
      entraPortacoches: t.portacoches === null || t.portacoches === undefined
        ? null
        : Boolean(t.portacoches),
    };
    const falta = faltaParaPedirPresupuesto(datos);
    if (falta.length) {
      res.status(409).json({
        ok: false, error: 'faltan_datos_del_tramo',
        detail: `Falta ${escritoEnLista(falta)}.`,
      });
      return;
    }

    const soloVista = req.body?.soloVista === true;
    const nota = notaEnParrafos(req.body?.nota);

    const idioma = elIdioma(req.body?.idioma);
    const { subject, html } = correoDePresupuestoAlTransportista({ ...datos, nota }, idioma);
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);

    const cajones = [
      { ambito: 'lead', id: t.lead_id as string | null },
      { ambito: 'pedido', id: t.pedido_id as string | null },
      { ambito: 'transporte', id: req.params.id },
    ];
    const papeles = await papelesQueSePuedenAdjuntar(cajones);

    if (soloVista) {
      res.json({ ok: true, vista: true, para: aQuien, subject: elAsunto, html, papeles, idioma, idiomas: IDIOMAS });
      return;
    }

    let adjuntos: { filename: string; content: string }[] = [];
    // Lo que va, y la frase que lo dice: un adjunto que el cuerpo no
    // menciona es un adjunto que no se abre.
    let dicho = '';
    try {
      const va = await loQueSeAdjunta(cajones, req.body?.adjuntos, idioma);
      adjuntos = va.attachments;
      dicho = va.linea;
    } catch (e) {
      if (e instanceof NoSePuedenAdjuntar) {
        res.status(409).json({ ok: false, error: 'adjuntos', detail: e.message });
        return;
      }
      throw e;
    }

    await enviar({ to: aQuien, subject: elAsunto, html: html + dicho, attachments: adjuntos, alClienteSiempre: true });

    await query(
      `UPDATE erp_transportes
          SET presupuesto_pedido_at = NOW(), presupuesto_pedido_a = $2, updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, aQuien]
    ).catch((e: Error) => console.error('[transportes] no se ha podido anotar el presupuesto:', e.message));

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    console.error('[transportes] presupuesto:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'presupuesto_failed' });
  }
});
/**
 * Decirle al vendedor quién va a por el coche y qué día.
 *
 * Va **antes** de confirmarle nada al transportista, y no es un detalle de
 * orden: quien tiene que preparar el coche y sacar los papeles del cajón es el
 * vendedor. Un conductor que llega a una nave donde nadie le espera se va
 * vacío, y ese viaje se paga igual.
 *
 * El correo es al vendedor, así que el botón vive en el expediente —cada
 * pantalla manda los correos de su interlocutor— pero los datos salen del
 * tramo, que es donde están el transportista y el día. Preguntar y guardar no
 * tienen por qué pasar en la misma pantalla.
 */
transportesRouter.post('/transportes/:id/aviso-recogida', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT t.*, pe.proveedor, pe.id AS pedido
         FROM erp_transportes t
         LEFT JOIN erp_pedidos pe ON pe.id = t.pedido_id
        WHERE t.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const t = r.rows[0];
    if (!t) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    const nombre = String(t.proveedor ?? '').trim();
    if (!nombre) {
      res.status(409).json({
        ok: false, error: 'sin_vendedor',
        detail: 'Este tramo no viene de un pedido, así que no se sabe a quién avisar.',
      });
      return;
    }
    const v = await query<{ email: string | null }>(
      `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
      [nombreComparable(nombre)]
    ).catch(() => ({ rows: [] as { email: string | null }[] }));
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_vendedor',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    /*
     * Quién llama, y por quién pregunta.
     *
     * Son dos personas distintas y las dos van en el correo: el de la empresa
     * de transporte que llama antes de ir, y el del vendedor por el que
     * pregunta el conductor al llegar. Mezclarlas es como el vendedor acaba
     * esperando la llamada de su propio empleado.
     */
    const datos = {
      vehiculo: String(t.vehiculo_titulo ?? ''),
      referencia: String(t.id),
      pedido: t.pedido as string | null,
      cuando: String(t.recogida_prevista ?? ''),
      transportista: String(t.transportista ?? ''),
      contacto: String(t.contacto_transportista ?? '').trim() || null,
      telefono: String(t.telefono_transportista ?? '').trim() || null,
      preguntarPor: String(t.contacto_origen ?? '').trim() || null,
    };
    const falta = faltaParaAvisarDeLaRecogida(datos);
    if (falta.length) {
      res.status(409).json({
        ok: false, error: 'faltan_datos_del_tramo',
        detail: `Falta ${escritoEnLista(falta)}. Se apunta en el tramo, en Transportes.`,
      });
      return;
    }

    const soloVista = req.body?.soloVista === true;
    const nota = notaEnParrafos(req.body?.nota);

    const { subject, html } = correoDeAvisoDeRecogida({ ...datos, nota });
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);

    const cajones = [
      { ambito: 'lead', id: t.lead_id as string | null },
      { ambito: 'pedido', id: t.pedido_id as string | null },
      { ambito: 'transporte', id: req.params.id },
    ];
    const papeles = await papelesQueSePuedenAdjuntar(cajones);

    if (soloVista) {
      res.json({ ok: true, vista: true, para: aQuien, subject: elAsunto, html, papeles, idioma: 'de' });
      return;
    }

    let adjuntos: { filename: string; content: string }[] = [];
    // Lo que va, y la frase que lo dice: un adjunto que el cuerpo no
    // menciona es un adjunto que no se abre.
    let dicho = '';
    try {
      const va = await loQueSeAdjunta(cajones, req.body?.adjuntos, 'de');
      adjuntos = va.attachments;
      dicho = va.linea;
    } catch (e) {
      if (e instanceof NoSePuedenAdjuntar) {
        res.status(409).json({ ok: false, error: 'adjuntos', detail: e.message });
        return;
      }
      throw e;
    }

    await enviar({ to: aQuien, subject: elAsunto, html: html + dicho, attachments: adjuntos, alClienteSiempre: true });

    await query(
      `UPDATE erp_transportes
          SET aviso_recogida_at = NOW(), aviso_recogida_a = $2, updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, aQuien]
    ).catch((e: Error) => console.error('[transportes] no se ha podido anotar el aviso:', e.message));

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    console.error('[transportes] aviso de recogida:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'aviso_recogida_failed' });
  }
});
transportesRouter.patch('/transportes/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const estado = nt(req.body?.estado);
  if (estado && !esEstadoTransporteValido(estado)) {
    res.status(400).json({ ok: false, error: 'estado_no_valido' });
    return;
  }

  try {
    await prepara();
    const antes = await query(`SELECT ${CAMPOS} FROM erp_transportes WHERE id = $1`, [req.params.id]);
    const previo = antes.rows[0] as Record<string, unknown> | undefined;
    if (!previo) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    // Contratarlo exige saber a quién y por cuánto.
    if (estado && estado !== 'Por organizar' && estado !== INCIDENCIA && !puedeContratarse({
      transportista: nt(req.body?.transportista) || String(previo.transportista ?? ''),
      coste: req.body?.coste ?? previo.coste,
    })) {
      res.status(409).json({
        ok: false, error: 'sin_transportista_o_precio',
        detail: 'Di quién lo trae y por cuánto: sin eso, nadie ha quedado en recogerlo y la factura será la que quieran.',
      });
      return;
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (columna: string, valor: unknown) => { valores.push(valor); sets.push(`${columna} = $${valores.length}`); };

    for (const campo of [
      'transportista', 'desde', 'hasta', 'vehiculo_titulo', 'matricula',
      'contacto_origen', 'telefono_origen', 'horario_origen',
      'contacto_transportista', 'telefono_transportista',
    ] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.coste !== undefined) pon('coste', req.body.coste === '' || req.body.coste === null ? null : Number(req.body.coste));
    // Tres valores, no dos: sí, no y todavía no se sabe. Un booleano a secas
    // convierte «no lo he preguntado» en «no entra».
    if (req.body?.portacoches !== undefined) {
      const v = String(req.body.portacoches ?? '').trim();
      pon('portacoches', v === 'si' ? true : v === 'no' ? false : null);
    }
    for (const fecha of ['recogida_prevista', 'entrega_prevista'] as const) {
      if (req.body?.[fecha] !== undefined) pon(fecha, nt(req.body[fecha]) || null);
    }

    const notasNuevas = estado && estado !== previo.estado
      ? notaDelCambio(String(previo.notas ?? ''), String(previo.estado ?? ''), estado, nt(req.body?.nota))
      : (req.body?.notas !== undefined ? nt(req.body.notas) : null);
    if (notasNuevas !== null) pon('notas', notasNuevas);

    if (estado) {
      pon('estado', estado);
      // Las fechas de verdad, que son las que luego dicen cuánto tardó.
      if (estado === 'Recogido' && !previo.fecha_recogida) sets.push('fecha_recogida = NOW()');
      if (estado === 'Entregado' && !previo.fecha_entrega) sets.push('fecha_entrega = NOW()');
    }

    if (!sets.length) { res.json({ ok: true, data: previo }); return; }
    sets.push('updated_at = NOW()');
    valores.push(req.params.id);

    const r = await query(
      `UPDATE erp_transportes SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );

    /*
     * Y si el coche ya ha salido, el expediente pasa a «En transporte».
     *
     * Marcar el tramo recogido es el mismo hecho: tenerlo que repetir en
     * Importaciones es como se llega a un cliente que ve «verificado y pagado»
     * en su panel con el coche cruzando Francia.
     *
     * El `WHERE` sobre la etapa anterior lo hace idempotente y a prueba de
     * retrocesos: si el expediente ya está en trámites o entregado, no lo toca.
     * Y queda escrito en las notas internas, porque un cambio de etapa que
     * nadie ha pulsado tiene que poder explicarse después.
     */
    if (estado && mueveElExpediente(previo, estado)) {
      const cuando = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      const linea = `[${cuando} · Verificado y pagado → En transporte] El transporte ${req.params.id} pasó a «${estado}».`;
      await query(
        `UPDATE moveadvisor_market_leads
            SET status = 'En transporte',
                erp_notes = CASE WHEN COALESCE(erp_notes, '') = '' THEN $2
                                 ELSE erp_notes || E'\n' || $2 END
          WHERE id = $1 AND status = 'Verificado y pagado'`,
        [String(previo.lead_id), linea]
      ).catch((e: Error) => console.error('[transportes] no se ha podido mover el expediente:', e.message));
    }

    /*
     * Entregado: el transportista ya puede facturar este tramo.
     *
     * Se apunta que esperamos su factura, con lo que se acordó. Un tramo
     * entregado y sin facturar es dinero que debemos y no aparece en ningún
     * sitio hasta que a alguien le llega el papel.
     */
    if (estado === 'Entregado') {
      const t = r.rows[0] as Record<string, unknown>;
      await apuntaFacturaEsperada({
        proveedor: String(t.transportista ?? ''),
        concepto: `Transporte · tramo ${t.tramo ?? ''}`,
        importe: t.coste as string | null,
        vehiculo: String(t.vehiculo_titulo ?? ''),
      }).catch(() => null);
    }

    if (estado && estado !== previo.estado) {
      await query(
        `INSERT INTO erp_transporte_history (transporte_id, operador, campo, antes, despues) VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.actor?.name ?? req.actor?.sub ?? 'desconocido', 'estado', String(previo.estado ?? ''), estado]
      ).catch(() => {});
    }

    // Qué fotos faltan. No bloquea —un coche que ha llegado ha llegado— pero se
    // dice, porque el día de la reclamación no habrá manera de conseguirlas.
    const fila = (r.rows[0] ?? previo) as Record<string, unknown>;
    const papeles = await query(
      `SELECT papel FROM erp_documentos WHERE ambito = 'transporte' AND ambito_id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] as { papel?: string }[] }));

    res.json({
      ok: true,
      data: fila,
      faltanFotos: fotosQueFaltan(String(fila.estado ?? ''), papeles.rows.map((x) => String((x as { papel?: string }).papel ?? ''))),
    });
  } catch (err) {
    console.error('[transportes] cambiar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

/**
 * El primer tramo de un pedido que hay que traer.
 *
 * Se abre al confirmar el pedido, que es cuando ya se sabe que el coche existe y
 * hay que organizar cómo llega. Solo uno: los demás tramos los añade quien los
 * necesite, porque cuántos hacen falta no lo sabe el sistema.
 */
/**
 * Los primeros tramos que falten, abiertos de golpe.
 *
 * El tramo nace con el pedido, pero los pedidos de antes de esa regla se
 * quedaron sin él — y sin tramo no hay dónde preguntarle al vendedor por la
 * recogida, que es justo lo que el expediente pide. Un coche pagado sin tramo
 * es trabajo que no aparece en ninguna pantalla.
 *
 * Se mira lo que hay en vez de confiar en que se creó en su día: es
 * idempotente —`abreTransporteDePedido` no abre dos veces el mismo tramo— y se
 * ejecuta al abrir las pantallas que los enseñan.
 */
export async function abreLosTramosQueFalten(): Promise<number> {
  await prepara();
  const faltan = await query<{
    id: string; vehiculo_titulo: string; proveedor: string; matricula: string;
  }>(
    `SELECT pe.id, pe.vehiculo_titulo, pe.proveedor, pe.matricula
       FROM erp_pedidos pe
       LEFT JOIN erp_transportes t ON t.pedido_id = pe.id AND t.tramo = 1
      WHERE pe.origen = 'importacion'
        AND pe.estado <> 'Cancelado'
        AND t.id IS NULL
      LIMIT 50`
  ).catch(() => ({ rows: [] as { id: string; vehiculo_titulo: string; proveedor: string; matricula: string }[] }));

  let abiertos = 0;
  for (const p of faltan.rows) {
    const id = await abreTransporteDePedido({
      pedidoId: p.id,
      vehiculoTitulo: p.vehiculo_titulo ?? '',
      matricula: p.matricula ?? '',
      desde: p.proveedor || 'El vendedor',
      hasta: 'Zaragoza',
      creadoPor: 'al mirar los transportes',
    }).catch(() => null);
    if (id) abiertos += 1;
  }
  return abiertos;
}

export async function abreTransporteDePedido(datos: {
  pedidoId: string;
  vehiculoTitulo: string;
  matricula?: string;
  desde: string;
  hasta: string;
  creadoPor: string;
  /**
   * Qué viaje de los suyos es. El primero por defecto.
   *
   * Un coche de fuera hace dos: de Alemania a nuestras instalaciones, y de aquí
   * a casa del cliente. Antes esto se saltaba en cuanto el pedido tenía **algún**
   * tramo, así que el segundo no llegaba a abrirse nunca.
   */
  tramo?: number;
}): Promise<string | null> {
  await prepara();
  const tramo = Math.max(1, Math.floor(Number(datos.tramo) || 1));

  /**
   * De qué expediente es, no solo de qué pedido.
   *
   * Faltaba, y el tramo se quedaba con `lead_id` a nulo. Eso rompe dos cosas
   * que no se ven hasta que hacen falta: **el segundo tramo se queda sin la
   * dirección del cliente** —sale del expediente, no del pedido— y la orden de
   * recogida no encuentra ningún papel que adjuntar, porque cuelgan del
   * expediente también.
   *
   * Sale del pedido y no de quien llama: quien llama ya lo sabe, pero uno de
   * los dos sitios acabaría olvidándoselo.
   */
  const delPedido = await query<{ lead_id: string | null }>(
    `SELECT lead_id FROM erp_pedidos WHERE id = $1`,
    [datos.pedidoId]
  ).catch(() => ({ rows: [] as { lead_id: string | null }[] }));
  const leadId = delPedido.rows[0]?.lead_id ?? null;
  // Se mira ese tramo, no si hay alguno: si no, el segundo viaje no cabría.
  const yaHay = await query(
    `SELECT id FROM erp_transportes WHERE pedido_id = $1 AND tramo = $2`,
    [datos.pedidoId, tramo]
  );
  if (yaHay.rows.length) return String((yaHay.rows[0] as { id: string }).id);

  try {
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_transportes', prefijoAnual('TRP')),
      async (nuevoId) => {
        await query(
          // En orden: un $8 metido en medio se lee mal y se copia peor.
          `INSERT INTO erp_transportes (id, pedido_id, lead_id, tramo, vehiculo_titulo, matricula, desde, hasta, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [nuevoId, datos.pedidoId, leadId, tramo, datos.vehiculoTitulo, datos.matricula ?? '',
           datos.desde, datos.hasta, datos.creadoPor]
        );
      }
    );
    return id;
  } catch (e) {
    console.error('[transportes] no se ha podido abrir el tramo:', (e as Error).message);
    return null;
  }
}
