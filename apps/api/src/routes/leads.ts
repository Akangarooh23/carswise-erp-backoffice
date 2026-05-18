import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const leadsRouter = Router();

// moveadvisor_market_leads:
//   id, user_email, lead_type, vehicle_id, vehicle_title, vehicle_url, portal,
//   contact_name, contact_phone, contact_when, status, erp_notes, created_at

leadsRouter.get('/leads', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const status  = String(req.query.status || '').trim();
  const q       = String(req.query.q      || '').trim();
  const type    = String(req.query.type   || '').trim();
  const page    = Math.max(1, Number(req.query.page) || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (type) {
    values.push(type);
    conditions.push(`lead_type = $${values.length}`);
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
                lead_type      AS appointment_type,
                vehicle_title  AS title,
                status, created_at,
                json_build_object(
                  'name',        contact_name,
                  'phone',       contact_phone,
                  'when',        contact_when,
                  'vehicle_url', vehicle_url,
                  'portal',      portal,
                  'erp_notes',   erp_notes
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
  const { status, notes } = req.body ?? {};
  const allowed = ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado'];

  if (status && !allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (status)           { values.push(status); sets.push(`status = $${values.length}`); }
  if (notes !== undefined) { values.push(notes ?? ''); sets.push(`erp_notes = $${values.length}`); }

  if (!sets.length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  values.push(req.params.id);
  try {
    const result = await query(
      `UPDATE moveadvisor_market_leads SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'lead_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'lead_update_failed', detail: (err as Error).message });
  }
});
