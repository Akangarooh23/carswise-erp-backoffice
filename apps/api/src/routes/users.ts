import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

// moveadvisor_users: id, name, email, created_at, last_login_at
// erp_users:        id, name, email, phone, status, last_seen_at

usersRouter.get('/users', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q      = String(req.query.q      || '').trim();
  const status = String(req.query.status || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(mu.email) LIKE $${values.length} OR lower(mu.name) LIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    conditions.push(`COALESCE(eu.status, 'active') = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT mu.id, mu.email, mu.name,
                COALESCE(NULLIF(mu.apellidos, ''), '') AS apellidos,
                COALESCE(NULLIF(mu.phone, ''), eu.phone, '') AS phone,
                mu.created_at, mu.last_login_at,
                eu.status, eu.last_seen_at,
                COUNT(DISTINCT a.id)::int AS appointment_count,
                COUNT(DISTINCT t.id)::int AS ticket_count
         FROM moveadvisor_users mu
         LEFT JOIN erp_users eu ON eu.email = mu.email
         LEFT JOIN erp_appointments a ON a.user_id = mu.id
         LEFT JOIN erp_tickets      t ON t.user_id = mu.id
         ${where}
         GROUP BY mu.id, mu.email, mu.name, mu.created_at, mu.last_login_at,
                  eu.phone, eu.status, eu.last_seen_at
         ORDER BY mu.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM moveadvisor_users mu
         LEFT JOIN erp_users eu ON eu.email = mu.email
         ${where}`,
        values
      ),
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
    const [user, appointments, tickets, leads, funnelEvents] = await Promise.all([
      query(
        `SELECT mu.id, mu.email, mu.name,
                COALESCE(NULLIF(mu.apellidos, ''), '') AS apellidos,
                COALESCE(NULLIF(mu.phone, ''), eu.phone, '') AS phone,
                mu.created_at, mu.last_login_at,
                eu.status, eu.last_seen_at,
                mu.consent_legal_at, mu.consent_marketing_at, mu.consent_experian_at,
                mu.registration_ip, mu.registration_ua,
                mu.utm_source, mu.utm_medium, mu.utm_campaign, mu.utm_content,
                mu.affiliate_data, mu.referer, mu.landing_url, mu.language
         FROM moveadvisor_users mu
         LEFT JOIN erp_users eu ON eu.email = mu.email
         WHERE mu.id = $1`,
        [req.params.id]
      ),
      query(
        `SELECT id, type, status, scheduled_at, agent, notes, created_at
         FROM erp_appointments WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT 20`,
        [req.params.id]
      ),
      query(
        `SELECT id, title, status, priority, channel, created_at
         FROM erp_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ),
      query(
        `SELECT id, lead_type, vehicle_title, vehicle_url, status,
                TO_CHAR(appointment_date, 'YYYY-MM-DD') AS appointment_date,
                appointment_time, appointment_address, appointment_contact, created_at
         FROM moveadvisor_market_leads
         WHERE user_email = (SELECT email FROM moveadvisor_users WHERE id = $1)
         ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT id, event_type, utm_source, utm_medium, utm_campaign,
                offer_title, landing_url, created_at
         FROM moveadvisor_funnel_events
         WHERE user_email = (SELECT email FROM moveadvisor_users WHERE id = $1)
         ORDER BY created_at DESC LIMIT 30`,
        [req.params.id]
      ).catch(() => ({ rows: [] })),
    ]);

    if (!user.rows.length) {
      res.status(404).json({ ok: false, error: 'user_not_found' });
      return;
    }

    res.json({
      ok: true,
      data: { ...user.rows[0], appointments: appointments.rows, tickets: tickets.rows, leads: leads.rows, funnelEvents: funnelEvents.rows },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'user_get_failed', detail: (err as Error).message });
  }
});

usersRouter.get('/consentimientos', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const q       = String(req.query.q       || '').trim();
  const consent = String(req.query.consent || '').trim(); // 'legal' | 'marketing' | 'experian'
  const page    = Math.max(1, Number(req.query.page)  || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(mu.email) LIKE $${values.length} OR lower(mu.name) LIKE $${values.length})`);
  }
  if (consent === 'legal')     conditions.push('mu.consent_legal_at IS NOT NULL');
  if (consent === 'marketing') conditions.push('mu.consent_marketing_at IS NOT NULL');
  if (consent === 'experian')  conditions.push('mu.consent_experian_at IS NOT NULL');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT mu.id, mu.name, COALESCE(NULLIF(mu.apellidos,''),'') AS apellidos, mu.email,
                mu.created_at,
                mu.consent_legal_at, mu.consent_marketing_at, mu.consent_experian_at,
                mu.registration_ip, mu.utm_source, mu.utm_medium, mu.utm_campaign
         FROM moveadvisor_users mu
         ${where}
         ORDER BY mu.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_users mu ${where}`,
        values
      ),
    ]);

    res.json({ ok: true, data: rows.rows, meta: { total: countResult.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'consentimientos_list_failed', detail: (err as Error).message });
  }
});

const statusSchema = z.enum(['active', 'at_risk', 'blocked']);

usersRouter.patch('/users/:id/status', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body?.status);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }
  try {
    // Upsert into erp_users
    const mu = await query(`SELECT id, name, email FROM moveadvisor_users WHERE id = $1`, [req.params.id]);
    if (!mu.rows.length) {
      res.status(404).json({ ok: false, error: 'user_not_found' });
      return;
    }
    const u = mu.rows[0] as { id: string; name: string; email: string };
    await query(
      `INSERT INTO erp_users (id, name, email, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [u.id, u.name, u.email, parsed.data]
    );
    res.json({ ok: true, data: { id: u.id, status: parsed.data } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'user_status_update_failed', detail: (err as Error).message });
  }
});
