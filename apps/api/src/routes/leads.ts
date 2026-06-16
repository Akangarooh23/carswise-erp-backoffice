import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

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
        COUNT(*) FILTER (WHERE status IN ('Cita confirmada', 'Cerrado'))::int               AS resolved,
        COUNT(*) FILTER (WHERE status = 'Descartado')::int                                  AS discarded,
        COUNT(*) FILTER (WHERE lead_type = 'info')::int                                     AS type_info,
        COUNT(*) FILTER (WHERE lead_type = 'visit')::int                                    AS type_visit,
        COUNT(*) FILTER (WHERE lead_type = 'question')::int                                 AS type_question,
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

    // Fire-and-forget client emails when operator closes the outcome
    if (status === 'Vendido' || status === 'Cerrado') {
      sendClientEmail(updatedLead.user_email, `¡Enhorabuena! Tu compra — ${updatedLead.vehicle_title || 'CarsWise'}`, vendidoEmailHtml(updatedLead))
        .catch((e: Error) => console.error('[leads] vendido email error:', e.message));
    } else if (status === 'Descartado') {
      sendClientEmail(updatedLead.user_email, `¿Podemos ayudarte con otro vehículo? — CarsWise`, descartadoEmailHtml(updatedLead))
        .catch((e: Error) => console.error('[leads] descartado email error:', e.message));
    }
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
