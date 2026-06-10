import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const funnelRouter = Router();

funnelRouter.get('/funnel/stats', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  try {
    const [funnelCounts, utmSources, utmCampaigns, topOffers] = await Promise.all([
      // Events per type in the selected period
      query(
        `SELECT event_type, COUNT(*)::int AS total
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY event_type`,
        [days]
      ).catch(() => ({ rows: [] })),

      // UTM source breakdown
      query(
        `SELECT
           NULLIF(utm_source, '') AS source,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE event_type = 'register')::int AS registers,
           COUNT(*) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND utm_source <> ''
         GROUP BY utm_source
         ORDER BY sessions DESC
         LIMIT 20`,
        [days]
      ).catch(() => ({ rows: [] })),

      // Campaign breakdown
      query(
        `SELECT
           NULLIF(utm_campaign, '') AS campaign,
           NULLIF(utm_medium, '')   AS medium,
           NULLIF(utm_source, '')   AS source,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE event_type = 'register')::int AS registers,
           COUNT(*) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND utm_campaign <> ''
         GROUP BY utm_campaign, utm_medium, utm_source
         ORDER BY sessions DESC
         LIMIT 20`,
        [days]
      ).catch(() => ({ rows: [] })),

      // Top viewed offers
      query(
        `SELECT offer_id, offer_title,
           COUNT(*)::int AS views,
           COUNT(*) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND offer_id IS NOT NULL
           AND event_type IN ('offer_view', 'lead_request')
         GROUP BY offer_id, offer_title
         ORDER BY views DESC
         LIMIT 10`,
        [days]
      ).catch(() => ({ rows: [] })),
    ]);

    const countMap: Record<string, number> = {};
    for (const row of funnelCounts.rows as { event_type: string; total: number }[]) {
      countMap[row.event_type] = row.total;
    }

    const funnel = [
      { step: 'landing',          label: 'Visitas',            count: countMap['landing']          ?? 0 },
      { step: 'marketplace_view', label: 'Vieron Marketplace', count: countMap['marketplace_view'] ?? 0 },
      { step: 'offer_view',       label: 'Vieron Oferta',      count: countMap['offer_view']       ?? 0 },
      { step: 'register',         label: 'Registros',          count: countMap['register']         ?? 0 },
      { step: 'lead_request',     label: 'Solicitudes',        count: countMap['lead_request']     ?? 0 },
    ];

    res.json({
      ok: true,
      data: {
        days,
        funnel,
        utmSources:   utmSources.rows,
        utmCampaigns: utmCampaigns.rows,
        topOffers:    topOffers.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_stats_failed', detail: (err as Error).message });
  }
});

funnelRouter.get('/funnel/sessions', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const days   = Math.min(90, Math.max(7, Number(req.query.days) || 30));

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT
           anon_id,
           MAX(user_email) AS user_email,
           MIN(created_at) AS first_seen,
           MAX(created_at) AS last_seen,
           MAX(utm_source)   AS utm_source,
           MAX(utm_medium)   AS utm_medium,
           MAX(utm_campaign) AS utm_campaign,
           COUNT(*)::int AS event_count,
           array_agg(event_type ORDER BY created_at) AS events,
           BOOL_OR(event_type = 'register')     AS did_register,
           BOOL_OR(event_type = 'lead_request') AS did_lead
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY anon_id
         ORDER BY first_seen DESC
         LIMIT $2 OFFSET $3`,
        [days, limit, offset]
      ),
      query(
        `SELECT COUNT(DISTINCT anon_id)::int AS total
         FROM moveadvisor_funnel_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval`,
        [days]
      ),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: countResult.rows[0].total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_sessions_failed', detail: (err as Error).message });
  }
});

funnelRouter.get('/funnel/events', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const eventType = String(req.query.event_type || '').trim();
  const source    = String(req.query.source    || '').trim();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (eventType) {
    values.push(eventType);
    conditions.push(`event_type = $${values.length}`);
  }
  if (source) {
    values.push(source);
    conditions.push(`utm_source = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, anon_id, user_email, event_type,
                utm_source, utm_medium, utm_campaign,
                offer_title, landing_url, created_at
         FROM moveadvisor_funnel_events
         ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_funnel_events ${where}`,
        values
      ),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: countResult.rows[0].total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_events_failed', detail: (err as Error).message });
  }
});
