import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const ticketsRouter = Router();

ticketsRouter.get('/tickets', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q          = String(req.query.q          || '').trim();
  const status     = String(req.query.status     || '').trim();
  const priority   = String(req.query.priority   || '').trim();
  const assignedTo = String(req.query.assigned_to || '').trim();
  const page       = Math.max(1, Number(req.query.page) || 1);
  const limit      = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset     = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(t.title) LIKE $${values.length} OR lower(t.user_id) LIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (priority) {
    values.push(priority);
    conditions.push(`t.priority = $${values.length}`);
  }
  if (assignedTo) {
    values.push(assignedTo);
    conditions.push(`t.assigned_to = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT t.id, t.user_id, t.title, t.description, t.channel, t.status,
                t.priority, t.assigned_to, t.created_at, t.updated_at,
                u.name AS user_name, u.email AS user_email
         FROM erp_tickets t
         LEFT JOIN moveadvisor_users u ON u.id::text = t.user_id
         ${where}
         ORDER BY
           CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           t.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM erp_tickets t ${where}`, values),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'tickets_list_failed', detail: (err as Error).message });
  }
});

ticketsRouter.get('/tickets/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const [ticket, events] = await Promise.all([
      query(
        `SELECT t.*, u.name AS user_name, u.email AS user_email, u.plan_type AS user_plan
         FROM erp_tickets t
         LEFT JOIN moveadvisor_users u ON u.id::text = t.user_id
         WHERE t.id = $1`,
        [req.params.id]
      ),
      query(
        `SELECT id, actor, message, event_at FROM erp_ticket_events WHERE ticket_id = $1 ORDER BY event_at ASC`,
        [req.params.id]
      ),
    ]);
    if (!ticket.rows.length) {
      res.status(404).json({ ok: false, error: 'ticket_not_found' });
      return;
    }
    res.json({ ok: true, data: { ...ticket.rows[0], events: events.rows } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'ticket_get_failed', detail: (err as Error).message });
  }
});

const createSchema = z.object({
  user_id:     z.string().min(1),
  title:       z.string().min(3).max(200),
  description: z.string().min(5),
  channel:     z.enum(['web', 'phone', 'email', 'whatsapp']).default('web'),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigned_to: z.string().optional(),
});

ticketsRouter.post('/tickets', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    const result = await query(
      `INSERT INTO erp_tickets (user_id, title, description, channel, priority, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *`,
      [d.user_id, d.title, d.description, d.channel, d.priority, d.assigned_to ?? null]
    );
    const actor = (req as { actor?: { sub: string } }).actor?.sub ?? 'system';
    await query(
      `INSERT INTO erp_ticket_events (ticket_id, actor, message) VALUES ($1, $2, $3)`,
      [result.rows[0].id, actor, `Ticket creado por ${actor}`]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'ticket_create_failed', detail: (err as Error).message });
  }
});

const updateSchema = z.object({
  status:      z.enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']).optional(),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to: z.string().nullable().optional(),
  note:        z.string().min(1).optional(),
});

ticketsRouter.patch('/tickets/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const { note, ...fields } = parsed.data;
  const actor = (req as { actor?: { sub: string } }).actor?.sub ?? 'system';

  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length && !note) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  try {
    if (keys.length) {
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values     = [...keys.map((k) => fields[k]), req.params.id];
      const result = await query(
        `UPDATE erp_tickets SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!result.rows.length) {
        res.status(404).json({ ok: false, error: 'ticket_not_found' });
        return;
      }
    }

    const eventParts: string[] = [];
    if (fields.status)      eventParts.push(`Estado → ${fields.status}`);
    if (fields.priority)    eventParts.push(`Prioridad → ${fields.priority}`);
    if (fields.assigned_to !== undefined) eventParts.push(`Asignado → ${fields.assigned_to ?? 'sin asignar'}`);
    if (note)               eventParts.push(note);

    if (eventParts.length) {
      await query(
        `INSERT INTO erp_ticket_events (ticket_id, actor, message) VALUES ($1, $2, $3)`,
        [req.params.id, actor, eventParts.join(' | ')]
      );
    }

    const updated = await query(`SELECT * FROM erp_tickets WHERE id = $1`, [req.params.id]);
    const events  = await query(`SELECT * FROM erp_ticket_events WHERE ticket_id = $1 ORDER BY event_at`, [req.params.id]);
    res.json({ ok: true, data: { ...updated.rows[0], events: events.rows } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'ticket_update_failed', detail: (err as Error).message });
  }
});
