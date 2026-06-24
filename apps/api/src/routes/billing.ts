import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

// Columns: plan_id ('free'|'plus'|'premium'), plan_status ('activa'|'inactivo'), next_billing_date
billingRouter.get('/billing/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE plan_id = 'free')::int                                    AS free_count,
        COUNT(*) FILTER (WHERE plan_id = 'plus')::int                                    AS plus_count,
        COUNT(*) FILTER (WHERE plan_id = 'premium')::int                                 AS premium_count,
        0::int                                                                            AS active_trials,
        0::int                                                                            AS expired_trials,
        COUNT(*) FILTER (WHERE plan_id IN ('plus','premium') AND plan_updated_at >= NOW() - INTERVAL '30 days')::int AS new_paid_30d
      FROM moveadvisor_users
    `);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_summary_failed', detail: (err as Error).message });
  }
});

billingRouter.get('/billing/subscribers', requireRole(['admin', 'operations']), async (req, res) => {
  const plan   = String(req.query.plan   || '').trim();
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const values: unknown[]    = [];
  const conditions: string[] = ["plan_id IN ('plus','premium')"];

  if (plan === 'plus' || plan === 'premium') {
    values.push(plan);
    conditions.push(`plan_id = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, email, name, apellidos,
                plan_id     AS plan_type,
                plan_status AS status,
                plan_updated_at, next_billing_date, stripe_subscription_id,
                created_at
         FROM moveadvisor_users ${where}
         ORDER BY plan_updated_at DESC NULLS LAST
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_users ${where}`,
        values
      ),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total.rows[0] as { total: number }).total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_subscribers_failed', detail: (err as Error).message });
  }
});

billingRouter.get('/billing/trials', requireRole(['admin', 'operations']), async (req, res) => {
  const filter = req.query.filter === 'expiring' ? 'expiring' : 'all';
  try {
    // No trial columns — show free users who registered recently as potential trial candidates
    const result = await query(
      `SELECT id, email, name, apellidos,
              plan_id     AS plan_type,
              plan_status AS status,
              created_at
       FROM moveadvisor_users
       WHERE plan_id = 'free'
         ${filter === 'expiring' ? "AND created_at >= NOW() - INTERVAL '7 days'" : ''}
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_trials_failed', detail: (err as Error).message });
  }
});
