import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { nextProviderInvoiceId } from './provider-billing.js';
import { creaPedidoDeImportacion } from './pedidos.js';

export const leadsRouter = Router();

import { enviar, plantilla, parrafo, datos, aviso, boton, enlace, esc, MARCA } from '../lib/correo.js';
import { falloInterno } from '../lib/fallos.js';

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
      (lead.vehicle_url ? enlace('Ver el anuncio del vehículo', lead.vehicle_url) : ''),
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
                  'deposit_refunded_at',   deposit_refunded_at
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
    // De un expediente de importación: si la fianza está cobrada y cuándo le
    // hemos dicho que lo tendrá.
    deposit_paid, delivery_estimate,
  } = req.body ?? {};
  // Los estados de una importación son los pasos de su expediente, no los de
  // una gestión cualquiera: el coche está en Alemania y tarda semanas en
  // llegar. «En proceso» puede querer decir seis cosas distintas, y quien coge
  // el teléfono necesita saber cuál.
  const ESTADOS_IMPORTACION = ['Fianza pagada', 'Pedido a Alemania', 'En transporte', 'En trámites', 'Entregado'];
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
    const YA_PEDIDO = ['Pedido a Alemania', 'En transporte', 'En trámites', 'Entregado'];
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
  // La fianza se marca cobrada con la fecha de hoy, y se puede desmarcar si fue
  // un error: quitarla es tan importante como ponerla, porque de ella depende
  // que se compre un coche en Alemania.
  if (deposit_paid !== undefined)      { sets.push(`deposit_paid_at = ${deposit_paid ? "NOW()" : "NULL"}`); }
  if (delivery_estimate !== undefined) { values.push(delivery_estimate || null); sets.push(`delivery_estimate = $${values.length}`); }
  // Cobrar la fianza mueve el expediente solo: es el paso que separa a alguien
  // interesado de un coche que vamos a comprar.
  if (deposit_paid && !status) { sets.push(`status = CASE WHEN status IN ('Pendiente','Contactado') THEN 'Fianza pagada' ELSE status END`); }
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

  if (!sets.length) { res.status(400).json({ ok: false, error: 'no_fields_to_update' }); return; }

  values.push(req.params.id);
  try {
    // Fetch current values for history diff
    const before = await query(`SELECT status, erp_notes, erp_response, appointment_date, deposit_paid_at, delivery_estimate FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
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

    // Al hacer el pedido a Alemania, nace su pedido.
    //
    // El expediente sigue teniendo sus etapas, que son las que ve el cliente. El
    // pedido es el registro interno: a quién se le encarga, cuánto cuesta y las
    // fechas de verdad. Si ya existe uno de esta solicitud no se crea otro.
    if (status === 'Pedido a Alemania' && prev.status !== 'Pedido a Alemania'
        && updatedLead.lead_type === 'import') {
      creaPedidoDeImportacion({
        leadId: req.params.id,
        vehiculoTitulo: updatedLead.vehicle_title ?? "",
        vehiculoId: updatedLead.vehicle_id ?? "",
        clienteEmail: updatedLead.user_email ?? "",
        creadoPor: operator,
      }).catch((e: Error) => console.error('[leads] pedido de importación:', e.message));
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
