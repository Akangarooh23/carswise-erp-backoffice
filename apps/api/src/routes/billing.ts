import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

billingRouter.get('/billing/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE plan_type = 'free')::int      AS free_count,
        COUNT(*) FILTER (WHERE plan_type = 'plus')::int      AS plus_count,
        COUNT(*) FILTER (WHERE plan_type = 'premium')::int   AS premium_count,
        COUNT(*) FILTER (WHERE trial_end IS NOT NULL AND trial_end > NOW())::int AS active_trials,
        COUNT(*) FILTER (WHERE trial_end IS NOT NULL AND trial_end < NOW() AND plan_type = 'free')::int AS expired_trials,
        COUNT(*) FILTER (WHERE plan_type IN ('plus','premium') AND created_at >= NOW() - INTERVAL '30 days')::int AS new_paid_30d
      FROM moveadvisor_users
    `).catch(() => ({
      rows: [{ free_count: 0, plus_count: 0, premium_count: 0, active_trials: 0, expired_trials: 0, new_paid_30d: 0 }]
    }));

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_summary_failed', detail: (err as Error).message });
  }
});

billingRouter.get('/billing/subscribers', requireRole(['admin', 'operations']), async (req, res) => {
  const plan   = String(req.query.plan   || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const values: unknown[]    = [];
  const conditions: string[] = ["plan_type IN ('plus','premium')"];

  if (plan === 'plus' || plan === 'premium') {
    values.push(plan);
    conditions.push(`plan_type = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, email, name, plan_type, trial_start, trial_end, created_at, updated_at, status
         FROM moveadvisor_users ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_users ${where}`,
        values
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total as { rows: { total: number }[] }).rows[0]?.total ?? 0, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_subscribers_failed', detail: (err as Error).message });
  }
});

billingRouter.get('/billing/trials', requireRole(['admin', 'operations']), async (req, res) => {
  const filter = req.query.filter === 'expiring' ? 'expiring' : 'all';
  try {
    const result = await query(
      `SELECT id, email, name, plan_type, trial_start, trial_end, status
       FROM moveadvisor_users
       WHERE trial_end IS NOT NULL
         ${filter === 'expiring' ? "AND trial_end > NOW() AND trial_end < NOW() + INTERVAL '7 days'" : ''}
       ORDER BY trial_end ASC
       LIMIT 100`
    ).catch(() => ({ rows: [] }));

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_trials_failed', detail: (err as Error).message });
  }
});
