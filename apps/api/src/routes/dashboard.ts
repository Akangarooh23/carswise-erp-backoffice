import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard/stats', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const [users, tickets, appointments, marketplace, leads, recentTickets, recentAppointments] = await Promise.all([
      // User stats — base from moveadvisor_users, status from erp_users
      query(`
        SELECT
          COUNT(mu.id)::int                                                          AS total,
          COUNT(*) FILTER (WHERE COALESCE(eu.status,'active') = 'active')::int      AS active,
          COUNT(*) FILTER (WHERE eu.status = 'at_risk')::int                        AS at_risk,
          COUNT(*) FILTER (WHERE eu.status = 'blocked')::int                        AS blocked,
          COUNT(*) FILTER (WHERE mu.created_at >= NOW() - INTERVAL '30 days')::int  AS new_30d
        FROM moveadvisor_users mu
        LEFT JOIN erp_users eu ON eu.email = mu.email
      `).catch(() => ({ rows: [{ total: 0, active: 0, at_risk: 0, blocked: 0, new_30d: 0 }] })),

      // Ticket stats
      query(`
        SELECT
          COUNT(*)::int                                                              AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int                              AS open,
          COUNT(*) FILTER (WHERE status = 'in_progress')::int                       AS in_progress,
          COUNT(*) FILTER (WHERE status = 'waiting_customer')::int                  AS waiting_customer,
          COUNT(*) FILTER (WHERE status = 'resolved')::int                          AS resolved,
          COUNT(*) FILTER (WHERE priority = 'urgent')::int                          AS urgent,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int      AS new_7d
        FROM erp_tickets
      `).catch(() => ({ rows: [{ total: 0, open: 0, in_progress: 0, waiting_customer: 0, resolved: 0, urgent: 0, new_7d: 0 }] })),

      // Appointment stats
      query(`
        SELECT
          COUNT(*)::int                                                              AS total,
          COUNT(*) FILTER (WHERE status = 'scheduled')::int                         AS scheduled,
          COUNT(*) FILTER (WHERE status = 'confirmed')::int                         AS confirmed,
          COUNT(*) FILTER (WHERE status = 'completed')::int                         AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int                         AS cancelled,
          COUNT(*) FILTER (WHERE scheduled_at >= NOW() AND scheduled_at < NOW() + INTERVAL '7 days')::int AS upcoming_7d
        FROM erp_appointments
      `).catch(() => ({ rows: [{ total: 0, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, upcoming_7d: 0 }] })),

      // Marketplace stats
      query(`
        SELECT
          COUNT(*)::int                                                              AS total,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int                             AS active,
          ROUND(AVG(price)::numeric, 0)::int                                        AS avg_price,
          MIN(price)::int                                                            AS min_price,
          MAX(price)::int                                                            AS max_price
        FROM moveadvisor_marketplace_vo_offers
      `).catch(() => ({ rows: [{ total: 0, active: 0, avg_price: 0, min_price: 0, max_price: 0 }] })),

      // Leads stats
      query(`
        SELECT
          COUNT(*)::int                                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'Pendiente')::int                                     AS pending,
          COUNT(*) FILTER (WHERE status = 'Contactado')::int                                    AS contacted,
          COUNT(*) FILTER (WHERE status IN ('Cita confirmada', 'Cerrado'))::int                 AS resolved,
          COUNT(*) FILTER (WHERE status IN ('Reagendar solicitado'))::int                       AS reschedule,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int                 AS new_7d
        FROM moveadvisor_market_leads
      `).catch(() => ({ rows: [{ total: 0, pending: 0, contacted: 0, resolved: 0, reschedule: 0, new_7d: 0 }] })),

      // Recent tickets
      query(`
        SELECT id, title, status, priority, user_id, created_at
        FROM erp_tickets
        ORDER BY created_at DESC
        LIMIT 5
      `).catch(() => ({ rows: [] })),

      // Upcoming appointments
      query(`
        SELECT a.id, a.user_id, a.type, a.status, a.scheduled_at,
               mu.name AS user_name, mu.email AS user_email
        FROM erp_appointments a
        LEFT JOIN moveadvisor_users mu ON mu.id = a.user_id
        WHERE a.scheduled_at >= NOW()
        ORDER BY a.scheduled_at ASC
        LIMIT 5
      `).catch(() => ({ rows: [] })),
    ]);

    res.json({
      ok: true,
      data: {
        users: users.rows[0],
        tickets: tickets.rows[0],
        appointments: appointments.rows[0],
        marketplace: marketplace.rows[0],
        leads: leads.rows[0],
        recentTickets: recentTickets.rows,
        upcomingAppointments: recentAppointments.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'dashboard_stats_failed', detail: (err as Error).message });
  }
});
