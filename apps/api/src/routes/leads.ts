import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { nextProviderInvoiceId } from './provider-billing.js';

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
                  'reschedule_proposals',  reschedule_proposals
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
        COUNT(*) FILTER (WHERE status IN ('Cita confirmada', 'Cerrado', 'Vendido'))::int    AS resolved,
        COUNT(*) FILTER (WHERE status = 'Descartado')::int                                  AS discarded,
        COUNT(*) FILTER (WHERE lead_type = 'info')::int                                     AS type_info,
        COUNT(*) FILTER (WHERE lead_type = 'visit')::int                                    AS type_visit,
        COUNT(*) FILTER (WHERE lead_type = 'question')::int                                 AS type_question,
        COUNT(*) FILTER (WHERE lead_type = 'renting')::int                                  AS type_renting,
        COUNT(*) FILTER (WHERE portal = 'marketplace-vo-renting')::int                      AS portal_renting,
        COUNT(*) FILTER (WHERE portal LIKE 'marketplace-vo%' AND portal <> 'marketplace-vo-renting')::int AS portal_compra,
        COUNT(*) FILTER (WHERE portal <> '' AND portal NOT LIKE 'marketplace-vo%')::int     AS portal_externo,
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

leadsRouter.patch('/leads/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const {
    status, notes,
    erp_response, appointment_date, appointment_time, appointment_address, appointment_contact,
    sale_price, sale_notes,
  } = req.body ?? {};
  const allowed = ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Reagendar solicitado', 'Cancelado', 'Cita confirmada', 'Visita realizada', 'Interesado', 'Vendido'];

  if (status && !allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
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
  // When operator assigns a date without manually changing status, auto-advance Pendiente → En proceso
  if (appointment_date && !status) { sets.push(`status = CASE WHEN status = 'Pendiente' THEN 'En proceso' ELSE status END`); }
  // When operator confirms a new appointment, clear any pending reschedule proposals
  if (appointment_date !== undefined && appointment_date) { sets.push(`reschedule_proposals = NULL`); }

  if (!sets.length) { res.status(400).json({ ok: false, error: 'no_fields_to_update' }); return; }

  values.push(req.params.id);
  try {
    // Fetch current values for history diff
    const before = await query(`SELECT status, erp_notes, erp_response, appointment_date FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
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
      ['appointment_date', prev.appointment_date,  appointment_date],
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
    const subject = isVisit
      ? `Confirmación de visita — ${lead.vehicle_title || 'PopCar'}`
      : isRentingNotify
      ? `Actualización de tu solicitud de renting — ${lead.vehicle_title || 'PopCar'}`
      : `Respuesta a tu consulta — ${lead.vehicle_title || 'PopCar'}`;
    const html = isVisit ? visitEmailHtml(lead) : isRentingNotify ? rentingNotifyEmailHtml(lead) : infoEmailHtml(lead);

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
