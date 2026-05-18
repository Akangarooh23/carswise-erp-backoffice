import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const workshopsRouter = Router();

workshopsRouter.get('/workshops', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q        = String(req.query.q || '').trim();
  const province = String(req.query.province || '').trim();
  const active   = req.query.active;
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(name) LIKE $${values.length} OR lower(COALESCE(city,'')) LIKE $${values.length})`);
  }
  if (province) {
    values.push(province.toLowerCase());
    conditions.push(`lower(COALESCE(province,'')) = $${values.length}`);
  }
  if (active === 'true' || active === 'false') {
    values.push(active === 'true');
    conditions.push(`is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await query(
      `SELECT w.*,
              COUNT(a.id)::int AS appointment_count,
              COUNT(a.id) FILTER (WHERE a.status = 'scheduled')::int AS pending_count
       FROM erp_workshops w
       LEFT JOIN erp_appointments a ON a.workshop_id = w.id
       ${where}
       GROUP BY w.id
       ORDER BY w.name`,
      values
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshops_list_failed', detail: (err as Error).message });
  }
});

workshopsRouter.get('/workshops/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const [workshop, appointments] = await Promise.all([
      query(`SELECT * FROM erp_workshops WHERE id = $1`, [req.params.id]),
      query(
        `SELECT id, user_id, type, status, scheduled_at, notes
         FROM erp_appointments WHERE workshop_id = $1 ORDER BY scheduled_at DESC LIMIT 20`,
        [req.params.id]
      ),
    ]);
    if (!workshop.rows.length) {
      res.status(404).json({ ok: false, error: 'workshop_not_found' });
      return;
    }
    res.json({ ok: true, data: { ...workshop.rows[0], recent_appointments: appointments.rows } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_get_failed', detail: (err as Error).message });
  }
});

const workshopSchema = z.object({
  name:        z.string().min(2).max(100),
  address:     z.string().optional(),
  city:        z.string().optional(),
  province:    z.string().optional(),
  postal_code: z.string().regex(/^\d{5}$/).optional(),
  phone:       z.string().optional(),
  email:       z.string().email().optional(),
  notes:       z.string().optional(),
  is_active:   z.boolean().default(true),
});

workshopsRouter.post('/workshops', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = workshopSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO erp_workshops (name, address, city, province, postal_code, phone, email, notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.name, d.address ?? null, d.city ?? null, d.province ?? null, d.postal_code ?? null,
       d.phone ?? null, d.email ?? null, d.notes ?? null, d.is_active]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_create_failed', detail: (err as Error).message });
  }
});

workshopsRouter.patch('/workshops/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = workshopSchema.partial().safeParse(req.body);
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
      `UPDATE erp_workshops SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'workshop_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_update_failed', detail: (err as Error).message });
  }
});

workshopsRouter.delete('/workshops/:id', requireRole(['admin']), async (req, res) => {
  try {
    await query(`UPDATE erp_workshops SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_delete_failed', detail: (err as Error).message });
  }
});
