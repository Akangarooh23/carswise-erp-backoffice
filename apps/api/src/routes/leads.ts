import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { nextProviderInvoiceId } from './provider-billing.js';

export const leadsRouter = Router();

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = config.RESEND_FROM_EMAIL || 'CarsWise <onboarding@resend.dev>';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  // In dev, Resend sandbox only allows sending to the account owner's email
  const recipient = config.RESEND_TEST_EMAIL || to;
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: recipient, subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Resend error ${res.status}`);
  }
}

// Always sends to the real client email — no RESEND_TEST_EMAIL override
async function sendClientEmail(to: string, subject: string, html: string): Promise<void> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Resend error ${res.status}`);
  }
}

function visitEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#2563eb">📅 Tu cita está lista — acción requerida</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>El equipo de CarsWise ha gestionado tu solicitud de visita para el vehículo <strong>${esc(lead.vehicle_title)}</strong>.</p>
      ${lead.appointment_date ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:4px 0">📅 <strong>Fecha:</strong> ${esc(lead.appointment_date)}</p>
        ${lead.appointment_time ? `<p style="margin:4px 0">⏰ <strong>Hora:</strong> ${esc(lead.appointment_time)}</p>` : ''}
        ${lead.appointment_address ? `<p style="margin:4px 0">📍 <strong>Dirección:</strong> ${esc(lead.appointment_address)}</p>` : ''}
        ${lead.appointment_contact ? `<p style="margin:4px 0">👤 <strong>Pregunta por:</strong> ${esc(lead.appointment_contact)}</p>` : ''}
      </div>` : ''}
      ${lead.erp_response ? `<p><strong>Mensaje de CarsWise:</strong><br>${esc(lead.erp_response)}</p>` : ''}

      <div style="background:#fefce8;border:2px solid #fbbf24;border-radius:12px;padding:18px 20px;margin:24px 0">
        <p style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:#92400e">⚠️ Confirma tu cita para asegurar el turno</p>
        <p style="margin:0 0 14px 0;font-size:13px;color:#78350f">
          Para que la visita quede registrada, confirma la cita desde tu panel. Si no la confirmas, el turno puede ser asignado a otro cliente.
        </p>
        <a href="https://carswiseai.com/panel/solicitudes"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
          ✅ Confirmar cita →
        </a>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#475569">
        ¿Necesitas cancelar o cambiar la fecha? También puedes gestionarlo desde tu panel:<br>
        <a href="https://carswiseai.com/panel/solicitudes" style="color:#2563eb;font-weight:600">carswiseai.com/panel/solicitudes</a>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function vendidoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#059669">🎉 ¡Enhorabuena por tu compra!</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>Nos alegra confirmar que la compra del vehículo <strong>${esc(lead.vehicle_title)}</strong> ha sido completada. ¡Esperamos que disfrutes mucho de tu nuevo coche!</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0;font-size:15px;font-weight:700;color:#065f46">🚗 ¡Que lo disfrutes!</p>
      </div>
      <p style="font-size:13px;color:#475569">Si tienes cualquier duda o necesitas ayuda con tu vehículo, no dudes en contactarnos. Estamos aquí para ayudarte.</p>
      <p style="font-size:13px"><a href="https://carswiseai.com/panel/solicitudes" style="color:#2563eb;font-weight:600">Ir a mi panel →</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function rentingCerradoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#059669">🎉 ¡Enhorabuena por tu renting!</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>Nos alegra confirmar que el contrato de renting para <strong>${esc(lead.vehicle_title)}</strong> ha sido procesado. ¡Disfruta de tu nuevo vehículo!</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0;font-size:15px;font-weight:700;color:#065f46">🔑 ¡Que lo disfrutes!</p>
      </div>
      <p style="font-size:13px;color:#475569">Si tienes cualquier duda sobre tu contrato o el vehículo, no dudes en contactarnos.</p>
      <p style="font-size:13px"><a href="https://carswiseai.com/panel/solicitudes" style="color:#2563eb;font-weight:600">Ver mi panel →</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function descartadoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#475569">Gracias por tu tiempo</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>Entendemos que el vehículo <strong>${esc(lead.vehicle_title)}</strong> finalmente no era lo que buscabas. No pasa nada, encontrar el coche perfecto lleva su tiempo.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#374151">¿Podemos ayudarte a encontrar otro vehículo?</p>
        <a href="https://carswiseai.com"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
          Ver más vehículos →
        </a>
      </div>
      <p style="font-size:13px;color:#475569">Nuestro equipo está disponible para ayudarte a encontrar el vehículo que mejor se adapte a tus necesidades y presupuesto.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function rentingDescartadoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#475569">Tu solicitud de renting no ha podido llevarse a cabo</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>Lamentamos informarte de que tu solicitud de renting para el vehículo <strong>${esc(lead.vehicle_title)}</strong> no ha podido procesarse en esta ocasión.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#374151">¿Exploramos otras opciones de renting?</p>
        <a href="https://carswiseai.com"
           style="display:inline-block;background:#059669;color:#ffffff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
          Ver ofertas de renting →
        </a>
      </div>
      <p style="font-size:13px;color:#475569">Nuestro equipo está disponible para ayudarte a encontrar la opción de renting que mejor se adapte a tus necesidades.</p>
      <p style="font-size:13px"><a href="https://carswiseai.com/panel/solicitudes" style="color:#059669;font-weight:600">Ver mi panel →</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function infoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#2563eb">💬 Respuesta a tu consulta</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>Hemos atendido tu solicitud sobre el vehículo <strong>${esc(lead.vehicle_title)}</strong>.</p>
      ${lead.erp_response ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0;white-space:pre-wrap">${esc(lead.erp_response)}</p>
      </div>` : ''}
      ${lead.vehicle_url ? `<p><a href="${lead.vehicle_url}" style="color:#2563eb">Ver el anuncio del vehículo →</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function rentingNotifyEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#059669">🔑 Actualización de tu solicitud de renting</h2>
      <p>Hola <strong>${esc(lead.contact_name) || 'cliente'}</strong>,</p>
      <p>El equipo de CarsWise ha procesado tu solicitud de renting para <strong>${esc(lead.vehicle_title)}</strong>.</p>
      ${lead.erp_response ? `
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#065f46">Mensaje de CarsWise:</p>
        <p style="margin:0;white-space:pre-wrap;color:#065f46">${esc(lead.erp_response)}</p>
      </div>` : ''}
      <p style="font-size:13px;color:#475569">Puedes consultar el estado de tu solicitud en tu panel:</p>
      <p style="font-size:13px"><a href="https://carswiseai.com/panel/solicitudes" style="color:#059669;font-weight:600">Ver mi panel →</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
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
    res.status(500).json({ ok: false, error: 'leads_list_failed', detail: (err as Error).message });
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
    res.status(500).json({ ok: false, error: 'leads_stats_failed', detail: (err as Error).message });
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
    res.status(500).json({ ok: false, error: 'history_fetch_failed', detail: (err as Error).message });
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
        sendClientEmail(updatedLead.user_email, `🎉 ¡Enhorabuena por tu renting! — ${updatedLead.vehicle_title || 'CarsWise'}`, rentingCerradoEmailHtml(updatedLead))
          .catch((e: Error) => console.error('[leads] renting cerrado email error:', e.message));
        // Do NOT call processSaleOutcome — renting offers can be contracted multiple times
      } else {
        sendClientEmail(updatedLead.user_email, `¡Enhorabuena! Tu compra — ${updatedLead.vehicle_title || 'CarsWise'}`, vendidoEmailHtml(updatedLead))
          .catch((e: Error) => console.error('[leads] vendido email error:', e.message));
        processSaleOutcome(updatedLead)
          .catch((e: Error) => console.error('[leads] sale outcome error:', e.message));
      }
    } else if (status === 'Descartado') {
      const isRentingDescartado = updatedLead.portal === 'marketplace-vo-renting';
      const descSubject = isRentingDescartado
        ? `Tu solicitud de renting — ${updatedLead.vehicle_title || 'CarsWise'}`
        : `¿Podemos ayudarte con otro vehículo? — CarsWise`;
      sendClientEmail(updatedLead.user_email, descSubject, isRentingDescartado ? rentingDescartadoEmailHtml(updatedLead) : descartadoEmailHtml(updatedLead))
        .catch((e: Error) => console.error('[leads] descartado email error:', e.message));
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: 'lead_update_failed', detail: (err as Error).message });
  }
});

async function sendIDCarReadyEmail(buyerEmail: string, contactName: string, vehicleTitle: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#2563eb">🚗 ¡Tu IDCar ya está en tu garaje!</h2>
      <p>Hola <strong>${esc(contactName) || 'cliente'}</strong>,</p>
      <p>Hemos creado automáticamente la ficha digital de tu nuevo vehículo <strong>${esc(vehicleTitle)}</strong> en tu garaje CarsWise.</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#1e40af">Desde tu IDCar podrás:</p>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#1e40af;line-height:1.9">
          <li>Guardar documentos (ficha técnica, permiso de circulación, ITV)</li>
          <li>Registrar el historial de mantenimiento y reparaciones</li>
          <li>Gestionar el seguro del vehículo</li>
          <li>Solicitar tasaciones en cualquier momento</li>
        </ul>
      </div>
      <p><a href="https://carswiseai.com/panel/vehiculos"
            style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
        Ver mi IDCar →
      </a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
  await sendClientEmail(buyerEmail, `Tu IDCar está listo — ${vehicleTitle}`, html);
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
      ? `Confirmación de visita — ${lead.vehicle_title || 'CarsWise'}`
      : isRentingNotify
      ? `Actualización de tu solicitud de renting — ${lead.vehicle_title || 'CarsWise'}`
      : `Respuesta a tu consulta — ${lead.vehicle_title || 'CarsWise'}`;
    const html = isVisit ? visitEmailHtml(lead) : isRentingNotify ? rentingNotifyEmailHtml(lead) : infoEmailHtml(lead);

    await sendEmail(lead.user_email, subject, html);

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
    res.status(500).json({ ok: false, error: 'notify_failed', detail: (err as Error).message });
  }
});
