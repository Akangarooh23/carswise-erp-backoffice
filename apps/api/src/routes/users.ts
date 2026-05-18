import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/users', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q      = String(req.query.q      || '').trim();
  const status = String(req.query.status || '').trim();
  const plan   = String(req.query.plan   || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(u.email) LIKE $${values.length} OR lower(u.name) LIKE $${values.length} OR lower(u.id::text) LIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    conditions.push(`u.status = $${values.length}`);
  }
  if (plan) {
    values.push(plan);
    conditions.push(`u.plan_type = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.name, u.phone, u.status,
                u.plan_type, u.trial_start, u.trial_end, u.created_at, u.updated_at,
                COUNT(DISTINCT a.id)::int AS appointment_count,
                COUNT(DISTINCT t.id)::int AS ticket_count
         FROM moveadvisor_users u
         LEFT JOIN erp_appointments a ON a.user_id = u.id::text
         LEFT JOIN erp_tickets      t ON t.user_id = u.id::text
         ${where}
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_users u ${where}`, values),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: countResult.rows[0].total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'users_list_failed', detail: (err as Error).message });
  }
});

usersRouter.get('/users/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const [user, appointments, tickets] = await Promise.all([
      query(`SELECT * FROM moveadvisor_users WHERE id = $1`, [req.params.id]),
      query(
        `SELECT id, type, status, scheduled_at, workshop_name, agent, notes
         FROM erp_appointments WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT 20`,
        [req.params.id]
      ),
      query(
        `SELECT id, title, status, priority, channel, created_at
         FROM erp_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ),
    ]);

    if (!user.rows.length) {
      res.status(404).json({ ok: false, error: 'user_not_found' });
      return;
    }

    res.json({
      ok: true,
      data: { ...user.rows[0], appointments: appointments.rows, tickets: tickets.rows },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'user_get_failed', detail: (err as Error).message });
  }
});

const statusSchema = z.enum(['active', 'at_risk', 'blocked']);
const planSchema   = z.enum(['free', 'plus', 'premium']);

usersRouter.patch('/users/:id/status', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body?.status);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }
  try {
    const result = await query(
      `UPDATE moveadvisor_users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [parsed.data, req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'user_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'user_status_update_failed', detail: (err as Error).message });
  }
});

usersRouter.patch('/users/:id/plan', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = planSchema.safeParse(req.body?.plan);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_plan' });
    return;
  }
  try {
    const result = await query(
      `UPDATE moveadvisor_users SET plan_type = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [parsed.data, req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'user_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'user_plan_update_failed', detail: (err as Error).message });
  }
});
