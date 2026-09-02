import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { nextProviderInvoiceId } from './provider-billing.js';
import { creaPedidoDeImportacion } from './pedidos.js';
import { abrePeritacionDeImportacion, abreLasQueFalten } from './peritaciones.js';
import { abreTramitesDeImportacion, abreTramitesDeVenta } from './tramites.js';
import {
  queSeEntrega, faltaPorEntregar, puedeCerrarseLaEntrega, faltaParaCerrar,
  garantiaHasta, garantiaDeUnaImportacion, type Entrega,
} from '../lib/entrega.js';

export const leadsRouter = Router();

import { enviar, plantilla, parrafo, datos, aviso, boton, enlace, esc, MARCA } from '../lib/correo.js';
import { falloInterno } from '../lib/fallos.js';
import { enlaceAlAnuncio } from '../lib/enlace-al-anuncio.js';
import { sePuedeLiberar, escritoEnLista, PORQUE_NO_SE_LIBERA, liquidacionDelImpuesto } from '../lib/escrow.js';
import { nombreComparable } from '../lib/proveedores.js';
import { correoDeFacturaAlVendedor, faltaParaPedirLaFactura } from '../lib/factura-al-vendedor.js';
import { correoDeEncargoALaGestoria, faltaParaElEncargo } from '../lib/encargo-a-la-gestoria.js';
import { correoDeReservaAlVendedor, faltaParaLaReserva } from '../lib/reserva-al-vendedor.js';
import { pareceUnCorreo, asuntoLimpio, notaEnParrafos } from '../lib/revision-de-correo.js';
import { papelesQueSePuedenAdjuntar, traeLosAdjuntos, NoSePuedenAdjuntar } from '../lib/adjuntos-del-correo.js';

/** Si esa solicitud es de importación. La entrega no dice de qué tipo es. */
async function esDeImportacion(leadId: string): Promise<boolean> {
  const r = await query<{ lead_type: string }>(
    `SELECT lead_type FROM moveadvisor_market_leads WHERE id = $1`,
    [leadId]
  ).catch(() => ({ rows: [] as { lead_type: string }[] }));
  return r.rows[0]?.lead_type === 'import';
}

/** El panel del cliente, a donde apuntan casi todos los correos. */
const PANEL = () => `${MARCA.sitioUrl}/panel/solicitudes`;

/**
 * Aviso interno: respeta RESEND_TEST_EMAIL, asi que en pruebas se desvia.
 * Es para lo que puede esperar. Lo que el cliente necesita saber va por
 * `alCliente`, que nunca se desvia.
 */
type Lead = Record<string, string>;

const alEquipo = (to: string, subject: string, html: string) => enviar({ to, subject, html });
const alCliente = (to: string, subject: string, html: string) => enviar({ to, subject, html, alClienteSiempre: true });

function visitEmailHtml(lead: Lead): string {
  const cita: [string, string][] = [];
  if (lead.appointment_date)    cita.push(['Fecha', esc(lead.appointment_date)]);
  if (lead.appointment_time)    cita.push(['Hora', esc(lead.appointment_time)]);
  if (lead.appointment_address) cita.push(['Dirección', esc(lead.appointment_address)]);
  if (lead.appointment_contact) cita.push(['Pregunta por', esc(lead.appointment_contact)]);

  return plantilla({
    titulo: 'Tu cita está lista',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Hemos gestionado tu solicitud de visita para el vehículo <strong>${esc(lead.vehicle_title)}</strong>.`) +
      (cita.length ? datos(cita) : '') +
      (lead.erp_response ? parrafo(`<strong>Mensaje del equipo:</strong><br>${esc(lead.erp_response)}`) : '') +
      aviso(
        'Confirma la cita para asegurar el turno',
        'Si no la confirmas, el turno puede asignarse a otro cliente.'
      ) +
      boton('Confirmar la cita', PANEL()) +
      parrafo(`Si necesitas cancelar o cambiar la fecha, también se hace desde ahí.`, 14),
  });
}

function vendidoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Tu compra está confirmada',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`La compra del vehículo <strong>${esc(lead.vehicle_title)}</strong> ha quedado completada. Que lo disfrutes.`) +
      parrafo('Si te surge cualquier duda con el vehículo, escríbenos respondiendo a este correo.', 14) +
      enlace('Ir a mi panel', PANEL()),
  });
}

function rentingCerradoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Tu renting está confirmado',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`El contrato de renting de <strong>${esc(lead.vehicle_title)}</strong> ha quedado procesado.`) +
      parrafo('Si te surge cualquier duda sobre el contrato o el vehículo, escríbenos respondiendo a este correo.', 14) +
      enlace('Ver mi panel', PANEL()),
  });
}

function descartadoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Gracias por tu tiempo',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Entendemos que <strong>${esc(lead.vehicle_title)}</strong> no era lo que buscabas. Encontrar el coche adecuado lleva su tiempo.`) +
      boton('Ver más vehículos', MARCA.sitioUrl) +
      parrafo('Si nos cuentas qué necesitas, te ayudamos a acotar la búsqueda.', 14),
  });
}

function rentingDescartadoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Tu solicitud de renting no ha salido adelante',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`La solicitud de renting para <strong>${esc(lead.vehicle_title)}</strong> no ha podido procesarse en esta ocasión.`) +
      boton('Ver ofertas de renting', MARCA.sitioUrl) +
      enlace('Ver mi panel', PANEL()),
  });
}

function infoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Respuesta a tu consulta',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Hemos atendido tu solicitud sobre <strong>${esc(lead.vehicle_title)}</strong>.`) +
      (lead.erp_response
        ? datos([['Respuesta', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.erp_response)}</span>`]])
        : '') +
      (enlaceAlAnuncio(lead.vehicle_url) ? enlace('Ver el anuncio del vehículo', enlaceAlAnuncio(lead.vehicle_url)!) : ''),
  });
}

/**
 * El correo de cuando se atiende una solicitud de importación.
 *
 * Antes le llegaba el genérico, «Respuesta a tu consulta», que no dice nada de
 * lo único que el cliente tiene en la cabeza: cuánto hay que poner por delante
 * y qué pasa ahora. La fianza que sale es **la que se le dijo al pedirlo**, la
 * que quedó guardada: si el precio de la oferta ha cambiado, la suya no.
 */
function importEmailHtml(lead: Lead): string {
  const fianza = lead.deposit_quoted != null && Number(lead.deposit_quoted) > 0
    ? Number(lead.deposit_quoted).toLocaleString('es-ES')
    : '';
  return plantilla({
    titulo: 'Tu solicitud de importación',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Hemos revisado tu solicitud para importar <strong>${esc(lead.vehicle_title)}</strong>.`) +
      (lead.erp_response
        ? datos([['Mensaje del equipo', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.erp_response)}</span>`]])
        : '') +
      (fianza
        ? datos([['Fianza para reservarlo', `${fianza} €`]]) +
          parrafo('Es la que te dimos al pedirlo, y no cambia aunque cambie el precio del anuncio.', 14)
        : '') +
      enlace('Ver mi panel', PANEL()),
  });
}

/**
 * El correo de cuando cambia la fecha en la que le hemos dicho que lo tendrá.
 *
 * Se manda solo cuando cambia, no cuando se pone la primera vez: la primera se
 * la cuenta quien le llama. Lleva las dos fechas —la que era y la que es—
 * porque quien lo lee tiene la primera en la cabeza, y un correo que solo dice
 * la nueva se lee como si acabáramos de decidirla.
 *
 * Un coche que viene de Alemania se retrasa: lo que no puede pasar es que se
 * entere llamando.
 */
function entregaEmailHtml(lead: Lead, antes: string): string {
  const dia = (f: string) => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  return plantilla({
    titulo: 'Cambia la fecha de tu coche',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Te escribimos por <strong>${esc(lead.vehicle_title)}</strong>, que estamos trayendo para ti.`) +
      datos([
        ['Ahora lo esperamos para', dia(lead.delivery_estimate)],
        ['Antes te dijimos', dia(antes)],
      ]) +
      (lead.erp_response
        ? datos([['Mensaje del equipo', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.erp_response)}</span>`]])
        : parrafo('Es una estimación: los plazos de un coche que viene de Alemania se mueven. Te avisamos de cualquier cambio.', 14)) +
      enlace('Ver mi panel', PANEL()),
  });
}

/**
 * Ya lo tiene.
 *
 * Era el único paso del recorrido de una importación que no avisaba de nada, y
 * justamente el que más se agradece saber: han pasado semanas desde que pagó la
 * fianza. Que se entere porque entre en su panel es dejarlo al azar.
 *
 * No se promete nada que no haya pasado: se dice que se le ha entregado y dónde
 * están sus facturas. Lo que haya que contarle además —dónde recogerlo, qué
 * papeles lleva— se escribe en la respuesta y sale aquí dentro.
 */
function entregadoEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Tu coche ya es tuyo',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Te hemos entregado <strong>${esc(lead.vehicle_title)}</strong>, matriculado y listo para circular.`) +
      (lead.erp_response
        ? datos([['Mensaje del equipo', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.erp_response)}</span>`]])
        : '') +
      parrafo('Tienes las facturas de esta compra en tu panel, en Facturación.', 14) +
      enlace('Ver mi panel', PANEL()),
  });
}

function rentingNotifyEmailHtml(lead: Lead): string {
  return plantilla({
    titulo: 'Actualización de tu solicitud de renting',
    cuerpo:
      parrafo(`Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`Hemos procesado tu solicitud de renting para <strong>${esc(lead.vehicle_title)}</strong>.`) +
      (lead.erp_response
        ? datos([['Mensaje del equipo', `<span style="white-space:pre-wrap;font-weight:400">${esc(lead.erp_response)}</span>`]])
        : '') +
      enlace('Ver mi panel', PANEL()),
  });
}


leadsRouter.get('/leads', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  // Las peritaciones que falten, para que el expediente las enseñe sin tener
  // que pasar antes por su pantalla.
  await abreLasQueFalten().catch(() => 0);
  const status  = String(req.query.status || '').trim();
  const q       = String(req.query.q      || '').trim();
  const type    = String(req.query.type   || '').trim();
  const origin  = String(req.query.origin || '').trim(); // 'marketplace-vo-compra', 'marketplace-vo-renting', 'portales'
  const page    = Math.max(1, Number(req.query.page) || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
  if (type)   { values.push(type);   conditions.push(`lead_type = $${values.length}`); }
  if (origin === 'portales') {
    conditions.push(`lower(portal) NOT LIKE 'marketplace-vo%' AND portal <> ''`);
  } else if (origin) {
    values.push(origin); conditions.push(`portal = $${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(user_email) LIKE $${values.length} OR lower(vehicle_title) LIKE $${values.length} OR lower(contact_name) LIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, user_email, vehicle_id,
                lead_type           AS appointment_type,
                vehicle_title       AS title,
                status, created_at, notified_at,
                json_build_object(
                  'name',                 contact_name,
                  'phone',                contact_phone,
                  'when',                 contact_when,
                  'vehicle_url',          vehicle_url,
                  'portal',               portal,
                  'erp_notes',            erp_notes,
                  'erp_response',         erp_response,
                  'appointment_date',     TO_CHAR(appointment_date, 'YYYY-MM-DD'),
                  'appointment_time',     appointment_time,
                  'appointment_address',  appointment_address,
                  'appointment_contact',   appointment_contact,
                  'reschedule_proposals',  reschedule_proposals,
                  -- La fianza que se le dijo al pedir una importación. Historica:
                  -- es lo que se le prometio, no lo que saldria hoy.
                  'deposit_quoted',        deposit_quoted,
                  'deposit_paid_at',       deposit_paid_at,
                  'delivery_estimate',     TO_CHAR(delivery_estimate, 'YYYY-MM-DD'),
                  'deposit_refunded_at',   deposit_refunded_at,
                  -- El depósito, partido. El impuesto va a cuenta y se liquida.
                  'escrow_coche',          escrow_coche,
                  'escrow_fee',            escrow_fee,
                  'escrow_garantia',       escrow_garantia,
                  'escrow_impuesto',       escrow_impuesto,
                  'escrow_estado',         escrow_estado,
                  'escrow_liberado_at',    escrow_liberado_at,
                  'verificado_alemania_at', verificado_alemania_at,
                  -- La peritación de este coche, si la hay.
                  --
                  -- El expediente no puede ofrecer un botón de «lo hemos visto»
                  -- cuando hay una peritación abierta: serían dos puertas al
                  -- mismo hecho, y la que manda es la del perito.
                  'peritacion', (
                    SELECT json_build_object(
                      'id', pr.id, 'estado', pr.estado, 'veredicto', pr.veredicto,
                      'perito', pr.perito, 'fecha_hecha', pr.fecha_hecha,
                      -- Lo que vio roto y lo que estima que cuesta. Va aquí
                      -- porque quien da el precio de reacondicionamiento al
                      -- cliente está mirando el expediente, no la peritación.
                      'danos', (
                        SELECT json_build_object(
                          'cuantas',    COUNT(*),
                          'total',      COALESCE(SUM(d.coste), 0),
                          'sinValorar', COUNT(*) FILTER (WHERE d.coste IS NULL))
                          FROM erp_peritacion_danos d
                         WHERE d.peritacion_id = pr.id
                      ))
                      FROM erp_peritaciones pr
                     WHERE pr.lead_id = moveadvisor_market_leads.id
                     LIMIT 1
                  ),
                  -- Los avisos a proveedores, para poder decir si ya salieron.
                  'reserva_preguntada_at',       reserva_preguntada_at,
                  'reserva_preguntada_a',        reserva_preguntada_a,
                  'factura_vendedor_pedida_at',  factura_vendedor_pedida_at,
                  'factura_vendedor_pedida_a',   factura_vendedor_pedida_a,
                  'encargo_gestoria_enviado_at', encargo_gestoria_enviado_at,
                  'encargo_gestoria_enviado_a',  encargo_gestoria_enviado_a,
                  'liquidacion_at',        liquidacion_at,
                  -- Lo que costó de verdad: sale del trámite, no de un campo
                  -- aparte. Un dato en dos sitios acaba diciendo dos cosas.
                  'impuesto_real', (
                    SELECT t.coste FROM erp_tramites t
                     WHERE t.lead_id = moveadvisor_market_leads.id
                       AND t.tipo = 'Impuesto de matriculación'
                     ORDER BY t.created_at DESC LIMIT 1
                  )
                ) AS meta
         FROM moveadvisor_market_leads
         ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_market_leads ${where}`, values),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    falloInterno(res, 'leads_list_failed', err);
  }
});

leadsRouter.get('/leads/stats', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int                                                                        AS total,
        COUNT(*) FILTER (WHERE status = 'Pendiente')::int                                   AS pending,
        COUNT(*) FILTER (WHERE status = 'Contactado')::int                                  AS contacted,
        COUNT(*) FILTER (WHERE status IN ('Cita confirmada', 'Cerrado', 'Vendido', 'Entregado'))::int AS resolved,
        COUNT(*) FILTER (WHERE status = 'Descartado')::int                                  AS discarded,
        COUNT(*) FILTER (WHERE lead_type = 'info')::int                                     AS type_info,
        COUNT(*) FILTER (WHERE lead_type = 'visit')::int                                    AS type_visit,
        COUNT(*) FILTER (WHERE lead_type = 'question')::int                                 AS type_question,
        COUNT(*) FILTER (WHERE lead_type = 'renting')::int                                  AS type_renting,
        COUNT(*) FILTER (WHERE lead_type = 'import')::int                                   AS type_import,
        COUNT(*) FILTER (WHERE portal = 'marketplace-vo-renting')::int                      AS portal_renting,
        COUNT(*) FILTER (WHERE portal LIKE 'marketplace-vo%' AND portal <> 'marketplace-vo-renting')::int AS portal_compra,
        COUNT(*) FILTER (WHERE portal = 'importacion')::int                                 AS portal_importacion,
        -- La importación es sección nuestra, no un portal de fuera: se descuenta.
        COUNT(*) FILTER (WHERE portal <> '' AND portal NOT LIKE 'marketplace-vo%'
                           AND portal <> 'importacion')::int                                AS portal_externo,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int               AS new_7d
      FROM moveadvisor_market_leads
    `);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    falloInterno(res, 'leads_stats_failed', err);
  }
});

const ENSURE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_lead_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     TEXT NOT NULL,
    operator    TEXT NOT NULL,
    field       TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

leadsRouter.get('/leads/:id/history', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  try {
    await query(ENSURE_HISTORY_TABLE, []).catch(() => {});
    const result = await query(
      `SELECT id, operator, field, old_value, new_value, created_at
       FROM erp_lead_history WHERE lead_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    falloInterno(res, 'history_fetch_failed', err);
  }
});


/**
 * Devolver la fianza de una importación.
 *
 * El cobro está en Stripe y la clave de Stripe vive en PopCar, no aquí: el ERP
 * no la tiene ni debe tenerla. Así que esta ruta no devuelve nada por su cuenta,
 * se lo pide a quien puede, con un secreto compartido.
 *
 * Lo que contesta se pasa tal cual a la pantalla: si Stripe no acepta la
 * devolución, quien la pidió tiene que enterarse en el momento, no cuando el
 * cliente llame preguntando por su dinero.
 */
leadsRouter.post('/leads/:id/devolver-fianza', requireRole(['admin', 'operations']), async (req, res) => {
  const secreto = (process.env.INTERNAL_API_SECRET ?? '').trim();
  if (!secreto) {
    res.status(503).json({ ok: false, error: 'sin_configurar', detail: 'Falta INTERNAL_API_SECRET para poder pedir devoluciones.' });
    return;
  }
  const motivo = String(req.body?.motivo ?? '').trim().slice(0, 300);
  const sitio = config.PUBLIC_SITE_URL.replace(/\/$/, '');
  try {
    const r = await fetch(`${sitio}/api/fianza-devolucion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secreto}` },
      body: JSON.stringify({ leadId: req.params.id, motivo }),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string; importe?: number; rectificativa?: string };
    if (!r.ok || !cuerpo.ok) {
      res.status(r.status === 200 ? 502 : r.status).json({ ok: false, error: cuerpo.error ?? 'no_devuelta', detail: cuerpo.detail });
      return;
    }

    // Queda en el historial del lead, como todo lo demás.
    await query(ENSURE_HISTORY_TABLE, []).catch(() => {});
    await query(
      `INSERT INTO erp_lead_history (lead_id, operator, field, old_value, new_value) VALUES ($1,$2,'fianza','cobrada',$3)`,
      [req.params.id, req.actor?.name ?? req.actor?.sub ?? 'desconocido', `devuelta${motivo ? `: ${motivo}` : ''}`]
    ).catch(() => {});

    res.json({ ok: true, data: { importe: cuerpo.importe, rectificativa: cuerpo.rectificativa } });
  } catch (err) {
    falloInterno(res, 'devolucion_fianza', err);
  }
});

leadsRouter.patch('/leads/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const {
    status, notes,
    erp_response, appointment_date, appointment_time, appointment_address, appointment_contact,
    sale_price, sale_notes,
    // De un expediente de importación: si el depósito está en la cuenta y
    // cuándo le hemos dicho que lo tendrá.
    deposit_paid, delivery_estimate,
    // Y los dos pasos que mueven su dinero: haber visto el coche, y soltarlo.
    verificado_alemania, libera_deposito,
    // Y el ajuste del impuesto, cuando ya se sabe lo que costó de verdad.
    liquidacion_hecha,
  } = req.body ?? {};
  // Los estados de una importación son los pasos de su expediente, no los de
  // una gestión cualquiera: el coche está en Alemania y tarda semanas en
  // llegar. «En proceso» puede querer decir seis cosas distintas, y quien coge
  // el teléfono necesita saber cuál.
  const ESTADOS_IMPORTACION = ['Depósito retenido', 'Verificado y pagado', 'En transporte', 'En trámites', 'Entregado'];
  const allowed = ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Reagendar solicitado', 'Cancelado', 'Cita confirmada', 'Visita realizada', 'Interesado', 'Vendido', ...ESTADOS_IMPORTACION];

  if (status && !allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }

  // La fecha de entrega no existe hasta que hay pedido.
  //
  // Nadie la sabe antes: la dan en Alemania al pedir el coche. Guardarla antes es
  // inventarse un plazo, y de aquí sale un correo al cliente con esa fecha. La
  // pantalla ya no la deja poner, pero la regla tiene que estar aquí.
  if (delivery_estimate) {
    const YA_PEDIDO = ['Verificado y pagado', 'En transporte', 'En trámites', 'Entregado'];
    const ahora = await query(`SELECT status FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
    const paso = String((ahora.rows[0] as { status?: string })?.status ?? '');
    if (!YA_PEDIDO.includes(paso) && !YA_PEDIDO.includes(String(status ?? ''))) {
      res.status(409).json({
        ok: false,
        error: 'sin_pedido',
        detail: 'La fecha de entrega la dan al hacer el pedido a Alemania: hasta entonces no hay ninguna que dar.',
      });
      return;
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (status)                          { values.push(status);               sets.push(`status = $${values.length}`); }
  if (notes !== undefined)             { values.push(notes ?? '');           sets.push(`erp_notes = $${values.length}`); }
  if (erp_response !== undefined)      { values.push(erp_response ?? '');    sets.push(`erp_response = $${values.length}`); }
  if (appointment_date !== undefined)  { values.push(appointment_date || null); sets.push(`appointment_date = $${values.length}`); }
  if (appointment_time !== undefined)  { values.push(appointment_time ?? '');  sets.push(`appointment_time = $${values.length}`); }
  if (appointment_address !== undefined) { values.push(appointment_address ?? ''); sets.push(`appointment_address = $${values.length}`); }
  if (appointment_contact !== undefined) { values.push(appointment_contact ?? ''); sets.push(`appointment_contact = $${values.length}`); }
  if (sale_price  !== undefined)         { values.push(sale_price  || null);        sets.push(`sale_price  = $${values.length}`); }
  if (sale_notes  !== undefined)         { values.push(sale_notes  || null);        sets.push(`sale_notes  = $${values.length}`); }
  /**
   * El depósito se marca recibido con la fecha de hoy, y se puede desmarcar si
   * fue un error: quitarlo es tan importante como ponerlo, porque de ahí depende
   * que alguien coja un avión para ir a ver un coche.
   *
   * Marca las dos cosas a la vez —la fecha y el estado del depósito— porque son
   * la misma: el dinero está en la cuenta y nadie lo ha tocado.
   */
  if (deposit_paid !== undefined) {
    sets.push(`deposit_paid_at = ${deposit_paid ? "NOW()" : "NULL"}`);
    sets.push(`escrow_pagado_at = ${deposit_paid ? "NOW()" : "NULL"}`);
    sets.push(`escrow_estado = '${deposit_paid ? 'retenido' : 'pendiente'}'`);
  }
  /**
   * Que alguien nuestro ha visto el coche.
   *
   * Es la única llave que abre la liberación del dinero, así que se guarda con
   * su fecha y se puede quitar: si se marcó por error, hay veinte mil euros de
   * un cliente esperando detrás de esa casilla.
   */
  if (verificado_alemania !== undefined) {
    sets.push(`verificado_alemania_at = ${verificado_alemania ? "NOW()" : "NULL"}`);
  }
  /**
   * Que el ajuste del impuesto ya se ha hecho.
   *
   * El botón **no mueve dinero**: cobrar o devolver la diferencia se hace por el
   * mismo sitio que el depósito, y hasta que haya escrow eso es una
   * transferencia a mano. Esto deja constancia de que se hizo, con su fecha.
   *
   * Se puede quitar: si se marcó por error, hay una diferencia sin cobrar o sin
   * devolver detrás de esa casilla.
   */
  if (liquidacion_hecha !== undefined) {
    sets.push(`liquidacion_at = ${liquidacion_hecha ? "NOW()" : "NULL"}`);
  }
  if (delivery_estimate !== undefined) { values.push(delivery_estimate || null); sets.push(`delivery_estimate = $${values.length}`); }
  // Cobrar la fianza mueve el expediente solo: es el paso que separa a alguien
  // interesado de un coche que vamos a comprar.
  if (deposit_paid && !status) { sets.push(`status = CASE WHEN status IN ('Pendiente','Contactado') THEN 'Depósito retenido' ELSE status END`); }
  /**
   * Poner fecha adelanta el estado… salvo en una importación.
   *
   * En una visita, dar fecha es empezar a trabajarla: de Pendiente pasa a En
   * proceso. En una importación, «En proceso» no es ninguna de sus etapas: el
   * expediente se saldría del tablero y aparecería entre los descartados. Y
   * quedar para entregar el coche no cambia en qué punto está: sigue en
   * trámites hasta que se entrega.
   */
  if (appointment_date && !status) { sets.push(`status = CASE WHEN status = 'Pendiente' AND lead_type <> 'import' THEN 'En proceso' ELSE status END`); }
  // When operator confirms a new appointment, clear any pending reschedule proposals
  if (appointment_date !== undefined && appointment_date) { sets.push(`reschedule_proposals = NULL`); }

  /**
   * Soltar el dinero: el único sitio del sistema donde se mueve dinero ajeno.
   *
   * Se mira contra lo que hay guardado, no contra lo que venga en la petición:
   * quien pulsa el botón no puede traer consigo el permiso para pulsarlo.
   *
   * Y se contesta con el motivo, no con un 400 a secas. Quien lo intenta tiene
   * que saber qué le falta —normalmente que nadie ha ido a ver el coche— para
   * poder hacerlo, en vez de quedarse mirando un error.
   */
  if (libera_deposito) {
    const ahora = await query<{ escrow_estado: string | null; verificado_alemania_at: string | null; vehicle_id: string | null }>(
      `SELECT escrow_estado, verificado_alemania_at, vehicle_id FROM moveadvisor_market_leads WHERE id = $1`,
      [req.params.id]
    );
    if (!ahora.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    const fila = ahora.rows[0];

    /**
     * A quién se le manda el dinero, con sus datos.
     *
     * El vendedor sale del anuncio del que nació el expediente y su ficha está
     * en Proveedores. Si no se encuentra —un expediente sin oferta detrás— se
     * pasa `undefined` y la comprobación no se hace: bloquear un pago por no
     * haber sabido buscar sería peor que no comprobarlo.
     */
    let vendedor: Record<string, unknown> | undefined;
    {
      /**
       * Su nombre: el del pedido si ya hay, y si no el del anuncio.
       *
       * El del pedido manda porque se puede haber corregido a mano —un pedido
       * creado sin oferta detrás, o un vendedor que cambió de razón social— y
       * es el que va a salir en los papeles.
       */
      const n = await query<{ nombre: string | null }>(
        `SELECT COALESCE(NULLIF(TRIM(pe.proveedor), ''), o.dealer_name) AS nombre
           FROM moveadvisor_market_leads l
           LEFT JOIN erp_pedidos pe ON pe.lead_id = l.id
           LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
          WHERE l.id = $1
          LIMIT 1`,
        [req.params.id]
      ).catch(() => ({ rows: [] as { nombre: string | null }[] }));
      const nombreDelVendedor = String(n.rows[0]?.nombre ?? '').trim();

      /**
       * Y su ficha, buscada por el nombre normalizado **en JavaScript**.
       *
       * `clave` se guarda pasada por `nombreComparable`, que quita los acentos
       * y junta los espacios de más. Comparando con un `lower(trim(...))` de
       * SQL, un vendedor con acento o con dos espacios seguidos no casaba con su
       * propia ficha: el portero no encontraba a nadie y **dejaba pasar el pago**
       * sin comprobar nada. Un portero que falla abriendo es peor que no tenerlo.
       */
      if (nombreDelVendedor) {
        const v = await query(
          `SELECT iban, nif, email, nombre FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
          [nombreComparable(nombreDelVendedor)]
        ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
        // Sin ficha, se comprueba igual: faltan los tres y hay que crearla.
        vendedor = (v.rows[0] as Record<string, unknown> | undefined)
          ?? { nombre: nombreDelVendedor };
      }
    }

    const veredicto = sePuedeLiberar({
      estado: fila.escrow_estado,
      // La verificación puede haber llegado en esta misma petición: marcar que
      // has visto el coche y soltar el dinero es un solo gesto.
      verificadoEnAlemania: Boolean(fila.verificado_alemania_at) || verificado_alemania === true,
      vendedor,
    });
    if (!veredicto.puede) {
      // Con lo que falta escrito, no solo con que falta algo: quien lo lee
      // tiene que poder ir a rellenarlo sin adivinar el qué.
      const base = veredicto.motivo ? PORQUE_NO_SE_LIBERA[veredicto.motivo] : undefined;
      const detail = veredicto.faltan?.length
        ? `Falta ${escritoEnLista(veredicto.faltan)} de ${String(vendedor?.nombre ?? 'el vendedor')}. Se rellena en Proveedores.`
        : base;
      res.status(409).json({ ok: false, error: veredicto.motivo, detail });
      return;
    }
    sets.push(`escrow_liberado_at = NOW()`);
    sets.push(`escrow_estado = 'liberado'`);
    // Con el dinero soltado, el coche es suyo: el expediente avanza solo.
    if (!status) sets.push(`status = 'Verificado y pagado'`);
  }

  if (!sets.length) { res.status(400).json({ ok: false, error: 'no_fields_to_update' }); return; }

  values.push(req.params.id);
  try {
    // Fetch current values for history diff
    const before = await query(`SELECT status, erp_notes, erp_response, appointment_date, deposit_paid_at, delivery_estimate,
                                       escrow_estado, verificado_alemania_at, escrow_liberado_at
                                  FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
    if (!before.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    const prev = before.rows[0] as Record<string, unknown>;

    const result = await query(
      `UPDATE moveadvisor_market_leads SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    // Write history entries for changed fields
    const operator = req.actor?.name ?? req.actor?.sub ?? 'unknown';
    const finalStatus = result.rows[0].status as string;
    const tracked: Array<[string, unknown, unknown]> = [
      ['status',           prev.status,           status ?? (finalStatus !== prev.status ? finalStatus : undefined)],
      ['erp_response',     prev.erp_response,      erp_response],
      // Las notas internas también dejan rastro. Son el cuaderno del
      // expediente y se van llenando solas al cambiar de etapa: sin esto, se ve
      // lo que pone hoy pero no cuándo lo escribió nadie, y una nota sin fecha
      // vale la mitad.
      ['erp_notes',        prev.erp_notes,         notes],
      ['appointment_date', prev.appointment_date,  appointment_date],
      ['deposit_paid_at',  prev.deposit_paid_at,   deposit_paid === undefined ? undefined : (deposit_paid ? 'cobrada' : 'sin cobrar')],
      ['delivery_estimate', prev.delivery_estimate, delivery_estimate],
    ];
    await query(ENSURE_HISTORY_TABLE, []).catch(() => {});
    for (const [field, oldVal, newVal] of tracked) {
      if (newVal !== undefined && String(newVal ?? '') !== String(oldVal ?? '')) {
        await query(
          `INSERT INTO erp_lead_history (lead_id, operator, field, old_value, new_value) VALUES ($1,$2,$3,$4,$5)`,
          [req.params.id, operator, field, String(oldVal ?? ''), String(newVal ?? '')]
        ).catch(() => {});
      }
    }

    const updatedLead = result.rows[0] as Record<string, string>;
    res.json({ ok: true, data: updatedLead });

    // Si la fecha de entrega ha cambiado, se le cuenta. No la primera vez: esa
    // se la dice quien le llama, y un correo automático ahí sobra.
    const fechaAntes = prev.delivery_estimate ? String(prev.delivery_estimate).slice(0, 10) : '';
    const fechaAhora = updatedLead.delivery_estimate ? String(updatedLead.delivery_estimate).slice(0, 10) : '';
    if (fechaAntes && fechaAhora && fechaAntes !== fechaAhora && updatedLead.user_email) {
      alCliente(
        updatedLead.user_email,
        `Cambia la fecha de tu coche — ${updatedLead.vehicle_title || 'PopCar'}`,
        entregaEmailHtml(updatedLead, fechaAntes)
      ).catch((e: Error) => console.error('[leads] aviso de entrega:', e.message));
    }

    /**
     * Al liberar el pago, nace su pedido.
     *
     * El expediente sigue teniendo sus etapas, que son las que ve el cliente. El
     * pedido es el registro interno: a quién se le encarga, cuánto cuesta y las
     * fechas de verdad. Si ya existe uno de esta solicitud no se crea otro.
     *
     * Se mira `finalStatus`, que es **lo que ha quedado escrito**, y no el que
     * venía en la petición. Liberar el pago pone la etapa desde el servidor, sin
     * que nadie mande un `status`: mirando el de la petición se liberaba el
     * dinero y no nacía ningún pedido.
     */
    /**
     * Con el dinero dentro, se abre la peritación.
     *
     * Ese es el momento: hay que mandar a alguien a ver el coche antes de
     * soltarle el dinero al vendedor. Esperar a que alguien se acuerde de
     * crearla a mano es esperar a que un día no se acuerde, y ese día el coche
     * se paga sin que nadie lo haya visto.
     */
    if (finalStatus === 'Depósito retenido' && prev.status !== 'Depósito retenido'
        && updatedLead.lead_type === 'import') {
      abrePeritacionDeImportacion({
        leadId: req.params.id,
        vehiculoTitulo: updatedLead.vehicle_title ?? '',
        creadoPor: operator,
      }).catch((e: Error) => console.error('[leads] peritación:', e.message));
    }

    if (finalStatus === 'Verificado y pagado' && prev.status !== 'Verificado y pagado'
        && updatedLead.lead_type === 'import') {
      creaPedidoDeImportacion({
        leadId: req.params.id,
        vehiculoTitulo: updatedLead.vehicle_title ?? "",
        vehiculoId: updatedLead.vehicle_id ?? "",
        clienteEmail: updatedLead.user_email ?? "",
        creadoPor: operator,
      }).catch((e: Error) => console.error('[leads] pedido de importación:', e.message));
    }

    // Al entrar en trámites, se abren los que un coche de fuera necesita siempre.
    //
    // Impuesto, ITV de homologación y matrícula española. Son tres papeleos
    // distintos, con su gestoría y sus fechas cada uno: en una sola casilla no se
    // puede saber cuál es el que lleva tres semanas parado.
    if (status === 'En trámites' && prev.status !== 'En trámites'
        && updatedLead.lead_type === 'import') {
      abreTramitesDeImportacion({
        leadId: req.params.id,
        vehiculoTitulo: updatedLead.vehicle_title ?? '',
        clienteEmail: updatedLead.user_email ?? '',
        creadoPor: operator,
      }).catch((e: Error) => console.error('[leads] trámites de importación:', e.message));
    }

    // Entregado: el final del recorrido de una importación.
    //
    // Solo cuando de verdad acaba de pasar. Volver a guardar un expediente ya
    // entregado no puede mandarle otra vez el mismo correo.
    if (status === 'Entregado' && prev.status !== 'Entregado'
        && updatedLead.lead_type === 'import' && updatedLead.user_email) {
      alCliente(
        updatedLead.user_email,
        `Tu coche ya es tuyo — ${updatedLead.vehicle_title || 'PopCar'}`,
        entregadoEmailHtml(updatedLead)
      ).catch((e: Error) => console.error('[leads] aviso de entrega final:', e.message));
    }

    // Vender es cambiar de dueño: sale su transferencia.
    //
    // Un coche que era nuestro y pasa a un cliente cambia de nombre otra vez. Si
    // se compró para stock, son dos transferencias en la vida del mismo coche,
    // cada una con su coste. Las importaciones se quedan fuera: ese coche se
    // matricula a nombre del cliente y no hay transferencia que hacer.
    if (status === 'Vendido' && prev.status !== 'Vendido'
        && updatedLead.lead_type !== 'import' && updatedLead.user_email) {
      abreTramitesDeVenta({
        leadId: req.params.id,
        vehiculoTitulo: updatedLead.vehicle_title ?? '',
        clienteEmail: updatedLead.user_email,
        creadoPor: operator,
      }).catch((e: Error) => console.error('[leads] transferencia de la venta:', e.message));
    }

    // Fire-and-forget emails + sale outcome processing
    if (status === 'Vendido' || status === 'Cerrado') {
      const isRentingLead = updatedLead.portal === 'marketplace-vo-renting';
      if (isRentingLead) {
        alCliente(updatedLead.user_email, `Tu renting está confirmado — ${updatedLead.vehicle_title || 'PopCar'}`, rentingCerradoEmailHtml(updatedLead))
          .catch((e: Error) => console.error('[leads] renting cerrado email error:', e.message));
        // Do NOT call processSaleOutcome — renting offers can be contracted multiple times
      } else {
        alCliente(updatedLead.user_email, `Tu compra está confirmada — ${updatedLead.vehicle_title || 'PopCar'}`, vendidoEmailHtml(updatedLead))
          .catch((e: Error) => console.error('[leads] vendido email error:', e.message));
        processSaleOutcome(updatedLead)
          .catch((e: Error) => console.error('[leads] sale outcome error:', e.message));
      }
    } else if (status === 'Descartado') {
      const isRentingDescartado = updatedLead.portal === 'marketplace-vo-renting';
      const descSubject = isRentingDescartado
        ? `Tu solicitud de renting — ${updatedLead.vehicle_title || 'PopCar'}`
        : `¿Podemos ayudarte con otro vehículo? — PopCar`;
      alCliente(updatedLead.user_email, descSubject, isRentingDescartado ? rentingDescartadoEmailHtml(updatedLead) : descartadoEmailHtml(updatedLead))
        .catch((e: Error) => console.error('[leads] descartado email error:', e.message));
    }
  } catch (err) {
    falloInterno(res, 'lead_update_failed', err);
  }
});

async function sendIDCarReadyEmail(buyerEmail: string, contactName: string, vehicleTitle: string): Promise<void> {
  const html = plantilla({
    titulo: 'Tu IDCar ya está en tu garaje',
    cuerpo:
      parrafo(`Hola <strong>${esc(contactName) || 'cliente'}</strong>,`) +
      parrafo(`Hemos creado la ficha digital de <strong>${esc(vehicleTitle)}</strong> en tu garaje.`) +
      parrafo('Desde el IDCar puedes:') +
      `<ul style="margin:0 0 18px 0;padding-left:20px;font-size:14px;line-height:1.8;color:#2A2A28">` +
        `<li>Guardar documentos: ficha técnica, permiso de circulación, ITV</li>` +
        `<li>Registrar el mantenimiento y las reparaciones</li>` +
        `<li>Gestionar el seguro del vehículo</li>` +
      `</ul>` +
      boton('Ver mi IDCar', `${MARCA.sitioUrl}/panel/vehiculos`),
  });
  await alCliente(buyerEmail, `Tu IDCar está listo — ${vehicleTitle}`, html);
}

async function processSaleOutcome(lead: Record<string, string>): Promise<void> {
  const vehicleId  = lead.vehicle_id  || '';
  const buyerEmail = lead.user_email  || '';
  const leadId     = lead.id          || '';
  const contactName = lead.contact_name || '';
  const vehicleTitle = lead.vehicle_title || '';

  // 1. Mark marketplace offer as sold + unpublish
  if (vehicleId) {
    await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET is_active = FALSE, sold_at = NOW() WHERE id = $1`,
      [vehicleId]
    ).catch(() => {});
  }

  // Guard: don't create duplicate IDCar for the same lead
  const existing = await query(
    `SELECT id FROM moveadvisor_user_vehicles WHERE source_lead_id = $1 AND user_email = $2 LIMIT 1`,
    [leadId, buyerEmail]
  ).catch(() => ({ rows: [] }));
  if ((existing as { rows: unknown[] }).rows.length) return;

  let vehicleData: Record<string, string> = {};

  if (vehicleId.startsWith('idcar-')) {
    // 2a. IDCar vehicle — mark seller's IDCar as sold
    const sourceVehicleId = vehicleId.replace('idcar-', '');

    await query(
      `UPDATE moveadvisor_user_vehicles SET sold_at = NOW() WHERE id = $1`,
      [sourceVehicleId]
    ).catch(() => {});

    await query(
      `INSERT INTO moveadvisor_user_vehicle_states (user_email, vehicle_id, state, notes, updated_at)
       SELECT user_email, id, 'sold', 'Vendido en CarsWise Marketplace', NOW()
       FROM moveadvisor_user_vehicles WHERE id = $1
       ON CONFLICT (user_email, vehicle_id) DO UPDATE SET state = 'sold', notes = 'Vendido en CarsWise Marketplace', updated_at = NOW()`,
      [sourceVehicleId]
    ).catch(() => {});

    // Copy vehicle data for buyer IDCar
    const src = await query(
      `SELECT * FROM moveadvisor_user_vehicles WHERE id = $1`,
      [sourceVehicleId]
    ).catch(() => ({ rows: [] }));
    if ((src as { rows: unknown[] }).rows.length) {
      vehicleData = (src as { rows: Record<string, string>[] }).rows[0];
    }
  } else if (vehicleId) {
    // 2b. External portal offer — fetch available data from marketplace offer
    const offer = await query(
      `SELECT title, brand, model, year, mileage, fuel, color FROM moveadvisor_marketplace_vo_offers WHERE id = $1`,
      [vehicleId]
    ).catch(() => ({ rows: [] }));
    if ((offer as { rows: unknown[] }).rows.length) {
      vehicleData = (offer as { rows: Record<string, string>[] }).rows[0];
    }
  }

  // 3. Create buyer IDCar
  const fromMarketplace = lead.portal === 'marketplace-vo-compra';
  const idcarNotes      = fromMarketplace ? 'Adquirido en CarsWise Marketplace' : 'Adquirido con CarsWise';
  const purchasedFrom   = fromMarketplace ? 'carswise-marketplace' : 'carswise';
  const newId = `v-cw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await query(
    `INSERT INTO moveadvisor_user_vehicles
       (id, user_email, title, brand, model, version, year, mileage, fuel, color,
        cv, horsepower, body_type, transmission_type, environmental_label, co2,
        notes, purchased_from, source_lead_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             $18,$19,$17,NOW(),NOW())`,
    [
      newId, buyerEmail,
      vehicleData.title || vehicleTitle,
      vehicleData.brand  || '',
      vehicleData.model  || '',
      vehicleData.version || '',
      String(vehicleData.year    || ''),
      String(vehicleData.mileage || ''),
      vehicleData.fuel   || '',
      vehicleData.color  || '',
      vehicleData.cv     || '',
      vehicleData.horsepower || '',
      vehicleData.body_type  || '',
      vehicleData.transmission_type || '',
      vehicleData.environmental_label || '',
      vehicleData.co2    || '',
      leadId,
      idcarNotes,
      purchasedFrom,
    ]
  ).catch((e: Error) => { throw new Error(`IDCar insert failed: ${e.message}`); });

  // 4. Set buyer vehicle state to 'owned'
  await query(
    `INSERT INTO moveadvisor_user_vehicle_states (user_email, vehicle_id, state, notes, updated_at)
     VALUES ($1, $2, 'owned', 'Adquirido en CarsWise Marketplace', NOW())
     ON CONFLICT (user_email, vehicle_id) DO NOTHING`,
    [buyerEmail, newId]
  ).catch(() => {});

  // 5. Email buyer
  await sendIDCarReadyEmail(buyerEmail, contactName, vehicleData.title || vehicleTitle)
    .catch((e: Error) => console.error('[leads] IDCar email error:', e.message));

  // 6. Auto-create pending received invoice (provider → CarsWise) for marketplace VO purchases
  if (lead.portal === 'marketplace-vo-compra' && vehicleId) {
    try {
      const existing = await query(
        `SELECT id FROM moveadvisor_provider_invoices WHERE contract_id = $1 AND direction = 'received' LIMIT 1`,
        [leadId]
      );
      if (!existing.rows.length) {
        const offerRow = await query(
          `SELECT price, seller FROM moveadvisor_marketplace_vo_offers WHERE id = $1`,
          [vehicleId]
        );
        if (offerRow.rows.length) {
          const offer = offerRow.rows[0] as Record<string, string>;
          const invId = await nextProviderInvoiceId();
          await query(
            `INSERT INTO moveadvisor_provider_invoices
               (id, type, direction, provider_name, contract_id, vehicle_title, invoice_amount, status)
             VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, 'pending')`,
            [invId, offer.seller || 'Proveedor', leadId, vehicleData.title || vehicleTitle, Number(offer.price) || 0]
          );
        }
      }
    } catch (e) {
      console.error('[leads] received invoice auto-create failed:', (e as Error).message);
    }
  }
}

/**
 * Pedirle al vendedor alemán la factura del coche, a nombre del cliente.
 *
 * Es el papel del que depende que los 16.890 € sean un suplido y no ingreso
 * nuestro. Y no sale solo: **se manda pulsando un botón**, a propósito.
 *
 * Con cuatro coches al mes, un correo preparado que alguien revisa y manda vale
 * lo mismo que uno automático y no se arriesga a lo que un automático sí: salir
 * a un concesionario alemán con un dato mal puesto. Un correo no se desenvía.
 * Cuando el volumen crezca y este texto haya salido igual cien veces, se
 * automatiza; hoy no.
 *
 * Lleva los datos del cliente —nombre, NIF y dirección— porque la factura tiene
 * que ir a su nombre y el vendedor los necesita para emitirla. Es lo mínimo para
 * que la compra exista, y no se manda nada más.
 */
/**
 * Preguntarle al vendedor si el coche sigue ahí, y cuándo podemos verlo.
 *
 * Es el primer correo del expediente y el que puede pararlo todo. Un anuncio
 * de AutoScout24 sigue publicado días después de que el coche se venda —454 de
 * 484 de los nuestros estaban vendidos desde julio y seguían en pie—, así que
 * que el anuncio esté vivo no dice nada, y el cliente ya ha transferido
 * veintiún mil euros.
 */
/**
 * Los cajones donde pueden estar los papeles de un coche.
 *
 * Son dos y no uno. La ficha del vehículo, el COC y la factura del vendedor se
 * suben en el **pedido**, que es donde la pantalla los pide; el DNI del cliente
 * y lo suyo, en el **expediente**. Mirando solo el expediente, la lista de
 * adjuntos sale vacía justo cuando los papeles existen, y quien la ve piensa que
 * no ha subido nada.
 */
async function cajonesDelCoche(leadId: string): Promise<{ ambito: string; id: string | null }[]> {
  const r = await query<{ id: string }>(
    `SELECT id FROM erp_pedidos WHERE lead_id = $1 ORDER BY created_at LIMIT 1`,
    [leadId]
  ).catch(() => ({ rows: [] as { id: string }[] }));
  return [
    { ambito: 'lead', id: leadId },
    { ambito: 'pedido', id: r.rows[0]?.id ?? null },
  ];
}
leadsRouter.post('/leads/:id/reserva-vendedor', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT l.id, l.vehicle_title, l.lead_type,
              pe.proveedor, pe.importe::numeric AS importe,
              o.dealer_name, o.url AS anuncio, o.price::numeric AS precio
         FROM moveadvisor_market_leads l
         LEFT JOIN erp_pedidos pe ON pe.lead_id = l.id
         LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
        WHERE l.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const f = r.rows[0];
    if (!f) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    const nombreDelVendedor = String(f.proveedor ?? f.dealer_name ?? '').trim();
    const v = nombreDelVendedor
      ? await query<{ email: string | null }>(
          `SELECT email FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
          [nombreComparable(nombreDelVendedor)]
        ).catch(() => ({ rows: [] as { email: string | null }[] }))
      : { rows: [] as { email: string | null }[] };
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_vendedor',
        detail: `No hay correo de ${nombreDelVendedor || 'el vendedor'}. Se rellena en Proveedores.`,
      });
      return;
    }

    const soloVista = req.body?.soloVista === true;
    const nota = notaEnParrafos(req.body?.nota);
    const datos = {
      vehiculo: String(f.vehicle_title ?? ''),
      anuncio: f.anuncio as string | null,
      importe: f.precio != null ? Number(f.precio) : (f.importe != null ? Number(f.importe) : null),
      nota,
    };
    const falta = faltaParaLaReserva(datos);
    if (falta.length) {
      res.status(409).json({ ok: false, error: 'faltan_datos', detail: `Falta ${escritoEnLista(falta)}.` });
      return;
    }

    const { subject, html } = correoDeReservaAlVendedor(datos);
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);
    // Los papeles de este coche, estén en el cajón que estén.
    const cajones = await cajonesDelCoche(req.params.id);
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
      `UPDATE moveadvisor_market_leads
          SET reserva_preguntada_at = NOW(),
              reserva_preguntada_a  = $2
        WHERE id = $1`,
      [req.params.id, aQuien]
    );

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    falloInterno(res, 'reserva_vendedor_failed', err);
  }
});
leadsRouter.post('/leads/:id/factura-vendedor', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT l.id, l.vehicle_title, l.vehicle_id, l.user_email, l.lead_type,
              TO_CHAR(l.escrow_liberado_at, 'DD.MM.YYYY') AS pagado_el,
              pe.id AS pedido, pe.proveedor, pe.importe::numeric AS importe,
              o.dealer_name, o.url AS anuncio, o.price::numeric AS precio,
              u.name, u.apellidos, u.tax_id, u.company_name,
              u.billing_street, u.billing_postal_code, u.billing_province
         FROM moveadvisor_market_leads l
         LEFT JOIN erp_pedidos pe ON pe.lead_id = l.id
         LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
         LEFT JOIN moveadvisor_users u ON lower(u.email) = lower(l.user_email)
        WHERE l.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const f = r.rows[0];
    if (!f) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    if (f.lead_type !== 'import') {
      res.status(409).json({ ok: false, error: 'no_es_importacion', detail: 'Esto solo es de una importación.' });
      return;
    }

    // A quién: el correo de su ficha de Proveedores, buscada como la busca el
    // portero de la liberación — por el nombre normalizado, no a pelo.
    const nombreDelVendedor = String(f.proveedor ?? f.dealer_name ?? '').trim();
    const v = nombreDelVendedor
      ? await query<{ email: string | null; nombre: string }>(
          `SELECT email, nombre FROM erp_proveedores WHERE clave = $1 LIMIT 1`,
          [nombreComparable(nombreDelVendedor)]
        ).catch(() => ({ rows: [] as { email: string | null; nombre: string }[] }))
      : { rows: [] as { email: string | null; nombre: string }[] };
    const para = String(v.rows[0]?.email ?? '').trim();
    if (!para) {
      res.status(409).json({
        ok: false, error: 'sin_correo_del_vendedor',
        detail: `No hay correo de ${nombreDelVendedor || 'el vendedor'}. Se rellena en Proveedores.`,
      });
      return;
    }

    const cliente = {
      nombre: String(f.company_name ?? '').trim()
        || [f.name, f.apellidos].map((x) => String(x ?? '').trim()).filter(Boolean).join(' '),
      nif: f.tax_id as string | null,
      direccion: f.billing_street as string | null,
      cp: f.billing_postal_code as string | null,
      provincia: f.billing_province as string | null,
    };
    const falta = faltaParaPedirLaFactura({ vehiculo: String(f.vehicle_title ?? ''), cliente });
    if (falta.length) {
      // Sin sus datos, la factura vuelve mal hecha y hay que pedirla otra vez.
      res.status(409).json({
        ok: false, error: 'faltan_datos_del_cliente',
        detail: `Falta ${escritoEnLista(falta)}. Lo rellena él en su perfil de PopCar.`,
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

    const { subject, html } = correoDeFacturaAlVendedor({
      vehiculo: String(f.vehicle_title ?? ''),
      anuncio: f.anuncio as string | null,
      pedido: f.pedido as string | null,
      importe: f.importe != null ? Number(f.importe) : (f.precio != null ? Number(f.precio) : null),
      // En formato alemán, que es quien lo lee.
      pagadoEl: f.pagado_el as string | null,
      cliente, nota,
    });
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);

    // Los papeles de este coche, estén en el cajón que estén.
    const cajones = await cajonesDelCoche(req.params.id);
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

    // `alClienteSiempre` porque el desvío de pruebas no puede tragarse esto: si
    // no sale, no hay factura, y quien pulsa tiene que enterarse de que no salió.
    await enviar({ to: aQuien, subject: elAsunto, html, attachments: adjuntos, alClienteSiempre: true });

    await query(
      `UPDATE moveadvisor_market_leads
          SET factura_vendedor_pedida_at = NOW(),
              factura_vendedor_pedida_a  = $2
        WHERE id = $1`,
      [req.params.id, aQuien]
    // Sin `catch`: si esto falla, el correo salió y la pantalla diría que no.
    // Enterarse tarde de eso es mandarlo dos veces.
    );

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    falloInterno(res, 'factura_vendedor_failed', err);
  }
});
/**
 * Mandarle a la gestoría el encargo de matricular el coche.
 *
 * **Un correo por coche, no uno por trámite.** Son tres papeleos pero es el
 * mismo coche y la misma persona quien los hace; tres correos seguidos del
 * mismo Kia se contestan una vez y preguntando cuál es cuál.
 *
 * La gestoría sale de los propios trámites: si están repartidos entre dos
 * —que no debería, pero puede—, manda a la del primero y lo dice.
 */
/**
 * Lo que ha contestado el vendedor, apuntado una sola vez.
 *
 * Su respuesta al primer correo trae cuatro cosas que hacen falta en tres
 * pantallas distintas: si el coche sigue ahí, **dónde se ve** y **por quién
 * preguntar** —que es lo que necesita el perito para ir— y **su IBAN**, que es
 * lo que el ERP exige para dejar soltar el pago.
 *
 * Copiarlo a mano de un correo a tres sitios es donde se cuelan los errores, y
 * uno de esos sitios es un número de cuenta. Así que se teclea aquí y cae donde
 * tiene que caer: la dirección y el contacto en la peritación, el IBAN en la
 * ficha del vendedor.
 */
leadsRouter.post('/leads/:id/respuesta-vendedor', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT l.id, l.vehicle_title, pe.proveedor, o.dealer_name
         FROM moveadvisor_market_leads l
         LEFT JOIN erp_pedidos pe ON pe.lead_id = l.id
         LEFT JOIN moveadvisor_market_offers o ON o.id = l.vehicle_id
        WHERE l.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const f = r.rows[0];
    if (!f) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    const donde = String(req.body?.donde ?? '').trim();
    const contacto = String(req.body?.contacto ?? '').trim();
    const iban = String(req.body?.iban ?? '').replace(/[\s-]/g, '').toUpperCase();
    const titular = String(req.body?.titular ?? '').trim();

    /**
     * Dónde y con quién: a la peritación, que es quien va a ir.
     *
     * Con `COALESCE(NULLIF(...))` para no borrar lo que ya hubiera escrito
     * alguien: un campo vacío aquí no es una corrección, es que no se rellenó.
     */
    if (donde || contacto) {
      await query(
        `UPDATE erp_peritaciones
            SET donde = COALESCE(NULLIF($2, ''), donde),
                contacto = COALESCE(NULLIF($3, ''), contacto),
                updated_at = NOW()
          WHERE lead_id = $1`,
        [req.params.id, donde, contacto]
      ).catch((e: Error) => console.error('[leads] peritación:', e.message));
    }

    // El IBAN y el titular, a la ficha del vendedor: es de donde los lee el
    // portero que deja soltar el pago.
    const nombre = String(f.proveedor ?? f.dealer_name ?? '').trim();
    let enElVendedor = false;
    if (nombre && (iban || titular)) {
      const u = await query(
        `UPDATE erp_proveedores
            SET iban = COALESCE(NULLIF($2, ''), iban),
                notas = CASE WHEN $3 <> '' AND notas NOT LIKE '%' || $3 || '%'
                             THEN TRIM(BOTH E'\n' FROM COALESCE(notas, '') || E'\nTitular de la cuenta: ' || $3)
                             ELSE notas END,
                updated_at = NOW()
          WHERE clave = $1`,
        [nombreComparable(nombre), iban, titular]
      ).catch(() => ({ rowCount: 0 }));
      enElVendedor = Boolean(u.rowCount);
    }

    res.json({ ok: true, enLaPeritacion: Boolean(donde || contacto), enElVendedor });
  } catch (err) {
    falloInterno(res, 'respuesta_vendedor_failed', err);
  }
});
leadsRouter.post('/leads/:id/encargo-gestoria', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const r = await query<Record<string, unknown>>(
      `SELECT l.id, l.vehicle_title, l.lead_type, l.user_email,
              u.name, u.apellidos, u.tax_id, u.company_name,
              u.billing_street, u.billing_postal_code, u.billing_province
         FROM moveadvisor_market_leads l
         LEFT JOIN moveadvisor_users u ON lower(u.email) = lower(l.user_email)
        WHERE l.id = $1 LIMIT 1`,
      [req.params.id]
    );
    const f = r.rows[0];
    if (!f) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    const t = await query<{ id: string; tipo: string; gestoria: string; bastidor: string; matricula: string }>(
      `SELECT id, tipo, gestoria, bastidor, matricula FROM erp_tramites
        WHERE lead_id = $1 ORDER BY created_at`,
      [req.params.id]
    ).catch(() => ({ rows: [] as { id: string; tipo: string; gestoria: string; bastidor: string; matricula: string }[] }));
    if (!t.rows.length) {
      res.status(409).json({
        ok: false, error: 'sin_tramites',
        detail: 'Todavía no hay trámites abiertos. Se abren al pasar el expediente a «En trámites».',
      });
      return;
    }

    // A quién: la gestoría de los trámites, y su correo de Proveedores.
    const nombre = t.rows.map((x) => String(x.gestoria ?? '').trim()).find(Boolean) ?? '';
    if (!nombre) {
      res.status(409).json({
        ok: false, error: 'sin_gestoria',
        detail: 'Elige antes qué gestoría los lleva, en Gestoría.',
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
        ok: false, error: 'sin_correo_de_la_gestoria',
        detail: `No hay correo de ${nombre}. Se rellena en Proveedores.`,
      });
      return;
    }

    const datos = {
      vehiculo: String(f.vehicle_title ?? ''),
      bastidor: t.rows.map((x) => String(x.bastidor ?? '').trim()).find(Boolean) ?? null,
      matricula: t.rows.map((x) => String(x.matricula ?? '').trim()).find(Boolean) ?? null,
      tramites: t.rows.map((x) => ({ id: String(x.id), tipo: String(x.tipo) })),
      titular: {
        nombre: String(f.company_name ?? '').trim()
          || [f.name, f.apellidos].map((x) => String(x ?? '').trim()).filter(Boolean).join(' '),
        nif: f.tax_id as string | null,
        direccion: f.billing_street as string | null,
        cp: f.billing_postal_code as string | null,
        provincia: f.billing_province as string | null,
      },
    };
    const falta = faltaParaElEncargo(datos);
    if (falta.length) {
      res.status(409).json({
        ok: false, error: 'faltan_datos_del_encargo',
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

    const { subject, html } = correoDeEncargoALaGestoria({ ...datos, nota });
    const aQuien = pareceUnCorreo(req.body?.para) ? String(req.body.para).trim() : para;
    const elAsunto = asuntoLimpio(req.body?.asunto, subject);

    // Los papeles de este coche, estén en el cajón que estén.
    const cajones = await cajonesDelCoche(req.params.id);
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

    // Salta el desvío de pruebas: si no sale, el coche no se matricula.
    await enviar({ to: aQuien, subject: elAsunto, html, attachments: adjuntos, alClienteSiempre: true });

    await query(
      `UPDATE moveadvisor_market_leads
          SET encargo_gestoria_enviado_at = NOW(),
              encargo_gestoria_enviado_a  = $2
        WHERE id = $1`,
      [req.params.id, aQuien]
    );

    res.json({ ok: true, para: aQuien });
  } catch (err) {
    falloInterno(res, 'encargo_gestoria_failed', err);
  }
});
leadsRouter.post('/leads/:id/notify', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  try {
    const leadResult = await query(
      `SELECT * FROM moveadvisor_market_leads WHERE id = $1`,
      [req.params.id]
    );
    if (!leadResult.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    const lead = leadResult.rows[0] as Record<string, string>;
    const isVisit = lead.lead_type === 'visit';
    const isRentingNotify = lead.lead_type === 'renting' || lead.portal === 'marketplace-vo-renting';
    // Una importación tiene su propio correo: el genérico no dice nada de la
    // fianza, que es lo único que el cliente tiene en la cabeza.
    const isImport = lead.lead_type === 'import' || lead.portal === 'importacion';
    const subject = isVisit
      ? `Confirmación de visita — ${lead.vehicle_title || 'PopCar'}`
      : isImport
      ? `Tu solicitud de importación — ${lead.vehicle_title || 'PopCar'}`
      : isRentingNotify
      ? `Actualización de tu solicitud de renting — ${lead.vehicle_title || 'PopCar'}`
      : `Respuesta a tu consulta — ${lead.vehicle_title || 'PopCar'}`;
    const html = isVisit
      ? visitEmailHtml(lead)
      : isImport
      ? importEmailHtml(lead)
      : isRentingNotify
      ? rentingNotifyEmailHtml(lead)
      : infoEmailHtml(lead);

    await alEquipo(lead.user_email, subject, html);

    const updated = await query(
      `UPDATE moveadvisor_market_leads
       SET notified_at = NOW(),
           status = CASE WHEN status IN ('Pendiente', 'Reagendar solicitado', 'En proceso') THEN 'Contactado' ELSE status END,
           reschedule_proposals = NULL
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    res.json({ ok: true, data: updated.rows[0] });
  } catch (err) {
    falloInterno(res, 'notify_failed', err);
  }
});

/**
 * La entrega: el acto de darle el coche a alguien.
 *
 * No es un estado. Alguien está delante, recibe unas llaves y unos papeles, y
 * firma. Lo que no se le dé ese día se convierte en una llamada la semana
 * siguiente, y lo que no quede escrito se convierte en su palabra contra la
 * nuestra.
 *
 * Y ahí empieza la garantía, que hasta ahora no llevaba nadie: se calcula al
 * entregar y se guarda. Si mañana la política pasa a veinticuatro meses, los ya
 * entregados siguen teniendo lo que se les prometió.
 */
const ENSURE_ENTREGA = `
  ALTER TABLE moveadvisor_market_leads ADD COLUMN IF NOT EXISTS entrega JSONB NOT NULL DEFAULT '{}'::jsonb`;

leadsRouter.get('/leads/:id/entrega', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    await query(ENSURE_ENTREGA, []).catch(() => {});
    const r = await query(`SELECT entrega, lead_type FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    const fila0 = r.rows[0] as { entrega?: Entrega; lead_type?: string };
    const entrega = (fila0.entrega ?? {}) as Entrega;
    // De dónde viene decide qué papeles se le entregan: en importación no hay
    // factura nuestra del coche ni contrato de compraventa nuestro.
    const tipo = fila0.lead_type ?? '';
    res.json({
      ok: true,
      data: entrega,
      lista: queSeEntrega(tipo),
      falta: faltaPorEntregar(entrega, tipo),
      faltaParaCerrar: faltaParaCerrar(entrega),
    });
  } catch (err) {
    console.error('[leads] entrega:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'entrega_failed' });
  }
});

leadsRouter.patch('/leads/:id/entrega', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  try {
    await query(ENSURE_ENTREGA, []).catch(() => {});
    const antes = await query(`SELECT entrega, user_email, vehicle_title FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
    const fila = antes.rows[0] as { entrega?: Entrega; user_email?: string; vehicle_title?: string } | undefined;
    if (!fila) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }

    const previa = (fila.entrega ?? {}) as Entrega;
    const cambios = (req.body ?? {}) as Entrega & { cerrar?: boolean };
    const nueva: Entrega = {
      ...previa,
      ...cambios,
      entregado: { ...(previa.entregado ?? {}), ...(cambios.entregado ?? {}) },
      entregado_por: req.actor?.name ?? req.actor?.sub ?? previa.entregado_por,
    };

    // Cerrarla es el acto: hacen falta los kilómetros y la firma.
    if (cambios.cerrar) {
      /**
       * Y que el impuesto esté liquidado.
       *
       * Si salió más caro que la provisión y se entrega sin cobrar la
       * diferencia, ese dinero no se recupera: el cliente ya tiene su coche y la
       * conversación es mucho más difícil. Y si hay que devolvérsela, dejarlo
       * para después es no hacerlo.
       *
       * Solo aplica cuando ya se sabe el importe real. Mientras la gestoría no
       * lo haya escrito en su trámite no hay nada que liquidar y esto no estorba.
       */
      const liq = await query<{ provision: string | null; real: string | null; hecha: string | null }>(
        `SELECT l.escrow_impuesto AS provision, l.liquidacion_at AS hecha,
                (SELECT t.coste FROM erp_tramites t
                  WHERE t.lead_id = l.id AND t.tipo = 'Impuesto de matriculación'
                  ORDER BY t.created_at DESC LIMIT 1) AS real
           FROM moveadvisor_market_leads l WHERE l.id = $1`,
        [req.params.id]
      ).catch(() => ({ rows: [] as { provision: string | null; real: string | null; hecha: string | null }[] }));
      const f = liq.rows[0];
      if (f && f.real != null && !f.hecha) {
        const cuenta = liquidacionDelImpuesto({ provision: f.provision, real: f.real });
        const que = cuenta.quien === 'cobrar' ? `Hay que cobrarle ${Math.abs(cuenta.diferencia)} €`
          : cuenta.quien === 'devolver' ? `Hay que devolverle ${Math.abs(cuenta.diferencia)} €`
          : 'Cuadra, pero hay que darlo por liquidado';
        res.status(409).json({
          ok: false, error: 'falta_liquidar_impuesto',
          detail: `El impuesto de matriculación está sin liquidar. ${que}.`,
        });
        return;
      }
      if (!puedeCerrarseLaEntrega(nueva)) {
        res.status(409).json({
          ok: false, error: 'falta_para_cerrar',
          detail: 'Sin kilómetros de salida no hay punto de partida para la garantía, y sin firma no hay entrega.',
          faltan: faltaParaCerrar(nueva),
        });
        return;
      }
      nueva.fecha = nueva.fecha ?? new Date().toISOString();
      /**
       * La garantía se calcula aquí y se queda quieta.
       *
       * **En importación no la damos nosotros.** No le vendemos el coche: se lo
       * vende el concesionario alemán, y es él quien le debe la garantía legal
       * europea. Poner doce meses nuestros por defecto era del modelo anterior, y
       * escribirlo en el documento de entrega sería prometer algo que no damos.
       *
       * Lo que se escribe es lo que hay: la garantía que contrató, si contrató
       * una, y **que reclamamos nosotros** —que es lo que de verdad se compra.
       */
      const esImportacion = await esDeImportacion(req.params.id);
      if (esImportacion) {
        const g = await query<{ nombre: string | null; meses: number | null }>(
          `SELECT g.nombre, g.meses
             FROM moveadvisor_market_leads l
             LEFT JOIN market_garantias g ON g.id = l.garantia_id
            WHERE l.id = $1`,
          [req.params.id]
        ).catch(() => ({ rows: [] as { nombre: string | null; meses: number | null }[] }));
        const cuenta = garantiaDeUnaImportacion(g.rows[0]);
        nueva.garantia_de = cuenta.de;
        nueva.garantia_producto = cuenta.producto;
        nueva.garantia_meses = cuenta.meses;
        nueva.garantia_hasta = cuenta.meses
          ? garantiaHasta(new Date(nueva.fecha), cuenta.meses)
          : null;
      } else {
        // En los demás caminos sí vendemos nosotros, y la garantía es nuestra.
        const meses = Number(nueva.garantia_meses ?? 12) || 12;
        nueva.garantia_de = 'popcar';
        nueva.garantia_meses = meses;
        nueva.garantia_hasta = garantiaHasta(new Date(nueva.fecha), meses);
      }
    }

    const r = await query(
      `UPDATE moveadvisor_market_leads SET entrega = $2 WHERE id = $1 RETURNING entrega`,
      [req.params.id, JSON.stringify(nueva)]
    );
    res.json({
      ok: true,
      data: (r.rows[0] as { entrega: Entrega }).entrega,
      falta: faltaPorEntregar(nueva, await esDeImportacion(req.params.id) ? 'import' : ''),
    });
  } catch (err) {
    console.error('[leads] guardar entrega:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'entrega_failed' });
  }
});
