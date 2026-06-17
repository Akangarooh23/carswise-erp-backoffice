import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const analyticsRouter = Router();

analyticsRouter.get('/analytics/marketing', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  try {
    const [summary, bySource, byCampaign, byMedium, timeline] = await Promise.all([

      query(
        `SELECT
           COUNT(*)::int                                                           AS total_users,
           COUNT(CASE WHEN utm_source != '' THEN 1 END)::int                      AS users_with_utm,
           COUNT(CASE WHEN consent_marketing_email_at IS NOT NULL THEN 1 END)::int AS mkt_email_consents,
           COUNT(CASE WHEN consent_marketing_sms_at IS NOT NULL THEN 1 END)::int   AS mkt_sms_consents,
           COUNT(CASE WHEN consent_legal_at IS NOT NULL THEN 1 END)::int           AS legal_consents
         FROM moveadvisor_users
         WHERE created_at > NOW() - INTERVAL '1 day' * $1`,
        [days]
      ),

      query(
        `SELECT
           utm_source                                                                AS source,
           COUNT(*)::int                                                             AS total,
           COUNT(CASE WHEN consent_marketing_email_at IS NOT NULL THEN 1 END)::int  AS mkt_email,
           COUNT(CASE WHEN consent_marketing_sms_at IS NOT NULL THEN 1 END)::int    AS mkt_sms,
           COUNT(CASE WHEN consent_legal_at IS NOT NULL THEN 1 END)::int            AS legal
         FROM moveadvisor_users
         WHERE utm_source != ''
           AND created_at > NOW() - INTERVAL '1 day' * $1
         GROUP BY utm_source
         ORDER BY total DESC
         LIMIT 20`,
        [days]
      ),

      query(
        `SELECT
           utm_campaign                                                              AS campaign,
           utm_source                                                                AS source,
           utm_medium                                                                AS medium,
           COUNT(*)::int                                                             AS total,
           COUNT(CASE WHEN consent_marketing_email_at IS NOT NULL THEN 1 END)::int  AS mkt_email,
           COUNT(CASE WHEN consent_legal_at IS NOT NULL THEN 1 END)::int            AS legal
         FROM moveadvisor_users
         WHERE utm_campaign != ''
           AND created_at > NOW() - INTERVAL '1 day' * $1
         GROUP BY utm_campaign, utm_source, utm_medium
         ORDER BY total DESC
         LIMIT 20`,
        [days]
      ),

      query(
        `SELECT
           NULLIF(utm_medium, '') AS medium,
           COUNT(*)::int          AS total
         FROM moveadvisor_users
         WHERE utm_medium != ''
           AND created_at > NOW() - INTERVAL '1 day' * $1
         GROUP BY utm_medium
         ORDER BY total DESC
         LIMIT 10`,
        [days]
      ),

      query(
        `SELECT
           DATE(created_at)::text                                                    AS date,
           COALESCE(NULLIF(utm_source, ''), '(directo)')                             AS source,
           COUNT(*)::int                                                             AS total
         FROM moveadvisor_users
         WHERE created_at > NOW() - INTERVAL '1 day' * $1
         GROUP BY DATE(created_at), utm_source
         ORDER BY date ASC`,
        [days]
      ),
    ]);

    res.json({
      ok: true,
      data: {
        summary: summary.rows[0],
        bySource: bySource.rows,
        byCampaign: byCampaign.rows,
        byMedium: byMedium.rows,
        timeline: timeline.rows,
      },
      meta: { days },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'analytics_failed', detail: (err as Error).message });
  }
});
