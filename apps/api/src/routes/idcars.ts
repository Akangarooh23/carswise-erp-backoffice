import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const idcarsRouter = Router();

idcarsRouter.get('/idcars', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const userId = String(req.query.user_id || '').trim();
  const q      = String(req.query.q      || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (userId) {
    values.push(userId);
    conditions.push(`v.user_id = $${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(v.brand,'')) LIKE $${values.length} OR lower(COALESCE(v.model,'')) LIKE $${values.length} OR lower(COALESCE(v.plate,'')) LIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT v.*, u.name AS owner_name, u.email AS owner_email
         FROM moveadvisor_user_vehicles v
         LEFT JOIN moveadvisor_users u ON u.id::text = v.user_id
         ${where}
         ORDER BY v.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_user_vehicles v ${where}`,
        values
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total as { rows: { total: number }[] }).rows[0]?.total ?? 0, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcars_list_failed', detail: (err as Error).message });
  }
});

idcarsRouter.get('/idcars/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT v.*, u.name AS owner_name, u.email AS owner_email, u.plan_type AS owner_plan
       FROM moveadvisor_user_vehicles v
       LEFT JOIN moveadvisor_users u ON u.id::text = v.user_id
       WHERE v.id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));

    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'idcar_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcar_get_failed', detail: (err as Error).message });
  }
});

idcarsRouter.get('/idcars/stats/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*)::int                                          AS total,
        COUNT(DISTINCT user_id)::int                          AS unique_owners,
        COUNT(*) FILTER (WHERE fuel_type = 'electric')::int   AS electric,
        COUNT(*) FILTER (WHERE fuel_type = 'hybrid')::int     AS hybrid,
        ROUND(AVG(EXTRACT(YEAR FROM NOW()) - year)::numeric, 1) AS avg_age_years
       FROM moveadvisor_user_vehicles`
    ).catch(() => ({ rows: [{ total: 0, unique_owners: 0, electric: 0, hybrid: 0, avg_age_years: 0 }] }));

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcars_stats_failed', detail: (err as Error).message });
  }
});
