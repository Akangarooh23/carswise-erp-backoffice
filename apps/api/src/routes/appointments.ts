import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const appointmentsRouter = Router();

appointmentsRouter.get('/appointments', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const status     = String(req.query.status      || '').trim();
  const q          = String(req.query.q           || '').trim();
  const workshopId = String(req.query.workshop_id || '').trim();
  const upcoming   = req.query.upcoming === 'true';
  const page       = Math.max(1, Number(req.query.page) || 1);
  const limit      = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset     = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (status) {
    values.push(status);
    conditions.push(`a.status = $${values.length}`);
  }
  if (workshopId) {
    values.push(workshopId);
    conditions.push(`a.workshop_id = $${values.length}`);
  }
  if (upcoming) {
    conditions.push(`a.scheduled_at >= NOW()`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(a.user_id) LIKE $${values.length} OR lower(a.type) LIKE $${values.length} OR lower(COALESCE(a.workshop_name,'')) LIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT a.*, w.name AS workshop_name_resolved
         FROM erp_appointments a
         LEFT JOIN erp_workshops w ON w.id = a.workshop_id
         ${where}
         ORDER BY a.scheduled_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM erp_appointments a ${where}`, values),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'appointments_list_failed', detail: (err as Error).message });
  }
});

appointmentsRouter.get('/appointments/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, w.name AS workshop_name_resolved, w.address AS workshop_address, w.phone AS workshop_phone
       FROM erp_appointments a
       LEFT JOIN erp_workshops w ON w.id = a.workshop_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'appointment_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'appointment_get_failed', detail: (err as Error).message });
  }
});

const createSchema = z.object({
  user_id:      z.string().min(1),
  scheduled_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  type:         z.enum(['oil_change', 'brakes', 'tires', 'inspection', 'itv', 'general', 'other']),
  workshop_id:  z.string().uuid().optional(),
  workshop_name:z.string().optional(),
  agent:        z.string().optional(),
  notes:        z.string().optional(),
});

appointmentsRouter.post('/appointments', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO erp_appointments (user_id, scheduled_at, type, workshop_id, workshop_name, agent, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
       RETURNING *`,
      [d.user_id, d.scheduled_at, d.type, d.workshop_id ?? null, d.workshop_name ?? null, d.agent ?? null, d.notes ?? null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'appointment_create_failed', detail: (err as Error).message });
  }
});

const updateSchema = z.object({
  status:       z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  scheduled_at: z.string().optional(),
  agent:        z.string().optional(),
  notes:        z.string().optional(),
  workshop_id:  z.string().uuid().optional(),
  workshop_name:z.string().optional(),
});

appointmentsRouter.patch('/appointments/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const fields = parsed.data;
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values     = [...keys.map((k) => fields[k]), req.params.id];

  try {
    const result = await query(
      `UPDATE erp_appointments SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'appointment_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'appointment_update_failed', detail: (err as Error).message });
  }
});
