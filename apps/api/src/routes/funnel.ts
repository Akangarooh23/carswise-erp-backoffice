import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const funnelRouter = Router();

// Returns { condition, value } for time filtering.
// If `date` (YYYY-MM-DD) is given, filter that exact calendar day.
// Otherwise filter the last `days` days.
function timeFilter(date: string, days: number): { condition: string; value: unknown } {
  if (date) {
    return {
      condition: `DATE(created_at AT TIME ZONE 'Europe/Madrid') = $1`,
      value: date,
    };
  }
  return {
    condition: `created_at >= NOW() - ($1 || ' days')::interval`,
    value: days,
  };
}

funnelRouter.get('/funnel/stats', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const date = String(req.query.date || '').trim();
  const tf   = timeFilter(date, days);

  try {
    const [funnelCounts, utmSources, utmCampaigns, topOffers] = await Promise.all([
      query(
        `SELECT event_type, COUNT(*)::int AS total
         FROM moveadvisor_funnel_events
         WHERE ${tf.condition}
         GROUP BY event_type`,
        [tf.value]
      ).catch((e: Error) => { console.error('[funnel] funnelCounts error:', e.message); return { rows: [] }; }),

      query(
        `SELECT
           NULLIF(utm_source, '') AS source,
           COUNT(DISTINCT anon_id)::int AS sessions,
           COUNT(DISTINCT anon_id) FILTER (WHERE event_type = 'register')::int AS registers,
           COUNT(DISTINCT anon_id) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE ${tf.condition}
           AND utm_source <> ''
         GROUP BY utm_source
         ORDER BY sessions DESC
         LIMIT 20`,
        [tf.value]
      ).catch((e: Error) => { console.error('[funnel] utmSources error:', e.message); return { rows: [] }; }),

      query(
        `SELECT
           NULLIF(utm_campaign, '') AS campaign,
           NULLIF(utm_medium, '')   AS medium,
           NULLIF(utm_source, '')   AS source,
           COUNT(DISTINCT anon_id)::int AS sessions,
           COUNT(DISTINCT anon_id) FILTER (WHERE event_type = 'register')::int AS registers,
           COUNT(DISTINCT anon_id) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE ${tf.condition}
           AND utm_campaign <> ''
         GROUP BY utm_campaign, utm_medium, utm_source
         ORDER BY sessions DESC
         LIMIT 20`,
        [tf.value]
      ).catch((e: Error) => { console.error('[funnel] utmCampaigns error:', e.message); return { rows: [] }; }),

      query(
        `SELECT offer_id, offer_title,
           'https://www.carswiseai.com/marketplace-vo/' || offer_id AS offer_url,
           COUNT(*)::int AS views,
           COUNT(*) FILTER (WHERE event_type = 'lead_request')::int AS leads
         FROM moveadvisor_funnel_events
         WHERE ${tf.condition}
           AND offer_id IS NOT NULL
           AND event_type IN ('offer_view', 'lead_request')
         GROUP BY offer_id, offer_title
         ORDER BY views DESC
         LIMIT 10`,
        [tf.value]
      ).catch((e: Error) => { console.error('[funnel] topOffers error:', e.message); return { rows: [] }; }),
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

    res.json({ ok: true, data: { days, date, funnel, utmSources: utmSources.rows, utmCampaigns: utmCampaigns.rows, topOffers: topOffers.rows } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_stats_failed', detail: (err as Error).message });
  }
});

funnelRouter.get('/funnel/sessions', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const page      = Math.max(1, Number(req.query.page) || 1);
  const limit     = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset    = (page - 1) * limit;
  const days      = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const date      = String(req.query.date      || '').trim();
  const source    = String(req.query.source    || '').trim();
  const converted = String(req.query.converted || '').trim();
  const q         = String(req.query.q         || '').trim();
  const tf        = timeFilter(date, days);

  const whereConditions = [tf.condition];
  const values: unknown[] = [tf.value];

  if (source) {
    values.push(source);
    whereConditions.push(`utm_source = $${values.length}`);
  }

  const where = `WHERE ${whereConditions.join(' AND ')}`;

  const havingClauses: string[] = [];
  if (converted === 'register') havingClauses.push(`BOOL_OR(event_type = 'register') = true`);
  if (converted === 'lead')     havingClauses.push(`BOOL_OR(event_type = 'lead_request') = true`);
  if (converted === 'none')     havingClauses.push(`BOOL_OR(event_type = 'register') = false AND BOOL_OR(event_type = 'lead_request') = false`);
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    havingClauses.push(`LOWER(MAX(COALESCE(user_email, ''))) LIKE $${values.length}`);
  }

  const having = havingClauses.length ? `HAVING ${havingClauses.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT anon_id, MAX(user_email) AS user_email,
           MIN(created_at) AS first_seen, MAX(created_at) AS last_seen,
           MAX(utm_source) AS utm_source, MAX(utm_medium) AS utm_medium, MAX(utm_campaign) AS utm_campaign,
           COUNT(*)::int AS event_count,
           array_agg(event_type ORDER BY created_at) AS events,
           BOOL_OR(event_type = 'register') AS did_register,
           BOOL_OR(event_type = 'lead_request') AS did_lead
         FROM moveadvisor_funnel_events
         ${where} GROUP BY anon_id ${having}
         ORDER BY first_seen DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*) AS total FROM (
           SELECT anon_id FROM moveadvisor_funnel_events ${where} GROUP BY anon_id ${having}
         ) sub`,
        values
      ),
    ]);

    res.json({ ok: true, data: rows.rows, meta: { total: Number(countResult.rows[0].total), page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_sessions_failed', detail: (err as Error).message });
  }
});

funnelRouter.get('/funnel/events', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const page      = Math.max(1, Number(req.query.page) || 1);
  const limit     = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset    = (page - 1) * limit;
  const days      = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const date      = String(req.query.date      || '').trim();
  const eventType = String(req.query.event_type || '').trim();
  const source    = String(req.query.source    || '').trim();
  const anonId    = String(req.query.anon_id   || '').trim();
  const q         = String(req.query.q         || '').trim();
  const tf        = timeFilter(date, days);

  const conditions: string[] = [tf.condition];
  const values: unknown[]    = [tf.value];

  if (eventType) { values.push(eventType); conditions.push(`event_type = $${values.length}`); }
  if (source)    { values.push(source);    conditions.push(`utm_source = $${values.length}`); }
  if (anonId)    { values.push(anonId);    conditions.push(`anon_id = $${values.length}`); }
  if (q)         { values.push(`%${q.toLowerCase()}%`); conditions.push(`LOWER(COALESCE(user_email, '')) LIKE $${values.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, anon_id, user_email, event_type,
                utm_source, utm_medium, utm_campaign,
                offer_id, offer_title, landing_url, created_at
         FROM moveadvisor_funnel_events ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_funnel_events ${where}`, values),
    ]);

    res.json({ ok: true, data: rows.rows, meta: { total: countResult.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_events_failed', detail: (err as Error).message });
  }
});

funnelRouter.get('/funnel/daily', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const days      = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const date      = String(req.query.date || '').trim();
  const userEmail = String(req.query.user || '').trim().toLowerCase();
  const tf        = timeFilter(date, days);

  const conditions = [tf.condition];
  const values: unknown[] = [tf.value];

  if (userEmail) {
    values.push(`%${userEmail}%`);
    conditions.push(`LOWER(COALESCE(user_email, '')) LIKE $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const result = await query(
      `SELECT
         DATE(created_at AT TIME ZONE 'Europe/Madrid') AS day,
         COUNT(*) FILTER (WHERE event_type = 'landing')::int          AS landings,
         COUNT(*) FILTER (WHERE event_type = 'marketplace_view')::int AS marketplace_views,
         COUNT(*) FILTER (WHERE event_type = 'offer_view')::int       AS offer_views,
         COUNT(*) FILTER (WHERE event_type = 'register')::int         AS registers,
         COUNT(*) FILTER (WHERE event_type = 'lead_request')::int     AS leads,
         COUNT(*)::int                                                 AS total
       FROM moveadvisor_funnel_events
       ${where}
       GROUP BY day
       ORDER BY day DESC`,
      values
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'funnel_daily_failed', detail: (err as Error).message });
  }
});

const ENSURE_OUTREACH_TABLE = `
  CREATE TABLE IF NOT EXISTS funnel_outreach (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anon_id     TEXT NOT NULL UNIQUE,
    user_email  TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

funnelRouter.get('/funnel/callqueue', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));

  try {
    await query(ENSURE_OUTREACH_TABLE, []).catch(() => {});

    const result = await query(
      `SELECT
         fe.anon_id,
         MAX(fe.user_email)   AS user_email,
         MAX(fe.utm_source)   AS utm_source,
         MAX(fe.utm_campaign) AS utm_campaign,
         MIN(fe.created_at)   AS first_seen,
         MAX(fe.created_at)   AS last_seen,
         array_agg(DISTINCT jsonb_build_object('title', fe.offer_title, 'url', 'https://www.carswiseai.com/marketplace-vo/' || fe.offer_id))
           FILTER (WHERE fe.event_type = 'offer_view' AND fe.offer_title IS NOT NULL)
           AS offers_viewed,
         COUNT(*) FILTER (WHERE fe.event_type = 'offer_view')::int AS offer_view_count,
         COALESCE(fo.status, 'pending') AS outreach_status,
         fo.notes                       AS outreach_notes,
         fo.updated_at                  AS outreach_updated_at
       FROM moveadvisor_funnel_events fe
       LEFT JOIN funnel_outreach fo ON fo.anon_id = fe.anon_id
       WHERE fe.created_at >= NOW() - ($1 || ' days')::interval
       GROUP BY fe.anon_id, fo.status, fo.notes, fo.updated_at
       HAVING BOOL_OR(fe.event_type = 'offer_view')    = true
          AND BOOL_OR(fe.event_type = 'lead_request')  = false
       ORDER BY
         CASE COALESCE(fo.status, 'pending')
           WHEN 'pending'      THEN 0
           WHEN 'no_answer'    THEN 1
           WHEN 'called'       THEN 2
           WHEN 'not_interested' THEN 3
           ELSE 4
         END,
         MAX(fe.created_at) DESC
       LIMIT 500`,
      [days]
    );

    const rows = result.rows as { outreach_status: string }[];
    const stats = {
      pending:        rows.filter((r) => r.outreach_status === 'pending').length,
      no_answer:      rows.filter((r) => r.outreach_status === 'no_answer').length,
      resolved:       rows.filter((r) => ['called', 'not_interested'].includes(r.outreach_status)).length,
    };

    res.json({ ok: true, data: rows, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'callqueue_failed', detail: (err as Error).message });
  }
});

funnelRouter.post('/funnel/outreach', requireRole(['admin', 'sales', 'operations']), async (req, res) => {
  const { anon_id, user_email, status, notes } = req.body ?? {};
  const allowed = ['pending', 'called', 'no_answer', 'not_interested'];
  if (!anon_id || !allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_params' });
    return;
  }

  try {
    await query(ENSURE_OUTREACH_TABLE, []).catch(() => {});
    await query(
      `INSERT INTO funnel_outreach (anon_id, user_email, status, notes, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (anon_id) DO UPDATE
         SET status     = EXCLUDED.status,
             notes      = COALESCE(EXCLUDED.notes, funnel_outreach.notes),
             user_email = COALESCE(EXCLUDED.user_email, funnel_outreach.user_email),
             updated_at = NOW()`,
      [anon_id, user_email ?? null, status, notes ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'outreach_save_failed', detail: (err as Error).message });
  }
});
