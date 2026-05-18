import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

export const leadsRouter = Router();

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = config.RESEND_FROM_EMAIL || 'CarsWise <onboarding@resend.dev>';

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

function visitEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#2563eb">✅ Tu visita ha sido confirmada</h2>
      <p>Hola <strong>${lead.contact_name || 'cliente'}</strong>,</p>
      <p>Tu solicitud de visita para el vehículo <strong>${lead.vehicle_title}</strong> ha sido gestionada por el equipo de CarsWise.</p>
      ${lead.appointment_date ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:4px 0">📅 <strong>Fecha:</strong> ${lead.appointment_date}</p>
        ${lead.appointment_time ? `<p style="margin:4px 0">⏰ <strong>Hora:</strong> ${lead.appointment_time}</p>` : ''}
        ${lead.appointment_address ? `<p style="margin:4px 0">📍 <strong>Dirección:</strong> ${lead.appointment_address}</p>` : ''}
        ${lead.appointment_contact ? `<p style="margin:4px 0">👤 <strong>Pregunta por:</strong> ${lead.appointment_contact}</p>` : ''}
      </div>` : ''}
      ${lead.erp_response ? `<p><strong>Mensaje de CarsWise:</strong><br>${lead.erp_response}</p>` : ''}
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#475569">
        ¿Necesitas cancelar o cambiar la fecha? Puedes gestionarlo desde tu panel:<br>
        <a href="https://carswiseai.com/panel/solicitudes" style="color:#2563eb;font-weight:600">carswiseai.com/panel/solicitudes</a>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

function infoEmailHtml(lead: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <h2 style="color:#2563eb">💬 Respuesta a tu consulta</h2>
      <p>Hola <strong>${lead.contact_name || 'cliente'}</strong>,</p>
      <p>Hemos atendido tu solicitud sobre el vehículo <strong>${lead.vehicle_title}</strong>.</p>
      ${lead.erp_response ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0;white-space:pre-wrap">${lead.erp_response}</p>
      </div>` : ''}
      ${lead.vehicle_url ? `<p><a href="${lead.vehicle_url}" style="color:#2563eb">Ver el anuncio del vehículo →</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">El equipo de CarsWise — <a href="https://carswiseai.com">carswiseai.com</a></p>
    </div>`;
}

leadsRouter.get('/leads', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const status  = String(req.query.status || '').trim();
  const q       = String(req.query.q      || '').trim();
  const type    = String(req.query.type   || '').trim();
  const page    = Math.max(1, Number(req.query.page) || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
  if (type)   { values.push(type);   conditions.push(`lead_type = $${values.length}`); }
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

leadsRouter.get('/leads/stats', requireRole(['admin', 'support', 'operations']), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (WHERE status = 'Pendiente')::int                    AS pending,
        COUNT(*) FILTER (WHERE status = 'Contactado')::int                   AS contacted,
        COUNT(*) FILTER (WHERE status = 'Descartado')::int                   AS discarded,
        COUNT(*) FILTER (WHERE lead_type = 'info')::int                      AS type_info,
        COUNT(*) FILTER (WHERE lead_type = 'visit')::int                     AS type_visit,
        COUNT(*) FILTER (WHERE lead_type = 'question')::int                  AS type_question,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d
      FROM moveadvisor_market_leads
    `);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'leads_stats_failed', detail: (err as Error).message });
  }
});

leadsRouter.patch('/leads/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const {
    status, notes,
    erp_response, appointment_date, appointment_time, appointment_address, appointment_contact,
  } = req.body ?? {};
  const allowed = ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Reagendar solicitado', 'Cancelado', 'Cita confirmada'];

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
  // When operator confirms a new appointment, clear any pending reschedule proposals
  if (appointment_date !== undefined && appointment_date) { sets.push(`reschedule_proposals = NULL`); }

  if (!sets.length) { res.status(400).json({ ok: false, error: 'no_fields_to_update' }); return; }

  values.push(req.params.id);
  try {
    const result = await query(
      `UPDATE moveadvisor_market_leads SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'lead_update_failed', detail: (err as Error).message });
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
    const subject = isVisit
      ? `Confirmación de visita — ${lead.vehicle_title || 'CarsWise'}`
      : `Respuesta a tu consulta — ${lead.vehicle_title || 'CarsWise'}`;
    const html = isVisit ? visitEmailHtml(lead) : infoEmailHtml(lead);

    await sendEmail(lead.user_email, subject, html);

    const newStatus = isVisit ? 'Cita confirmada' : 'Contactado';
    const updated = await query(
      `UPDATE moveadvisor_market_leads
       SET notified_at = NOW(),
           status = CASE WHEN status IN ('Pendiente', 'Reagendar solicitado', 'En proceso', 'Cita confirmada') THEN $2 ELSE status END,
           reschedule_proposals = NULL
       WHERE id = $1 RETURNING *`,
      [req.params.id, newStatus]
    );

    res.json({ ok: true, data: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'notify_failed', detail: (err as Error).message });
  }
});
