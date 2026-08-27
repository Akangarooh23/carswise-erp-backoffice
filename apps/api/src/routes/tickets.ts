import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { falloInterno } from '../lib/fallos.js';

export const ticketsRouter = Router();

ticketsRouter.get('/tickets', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q          = String(req.query.q          || '').trim();
  const status     = String(req.query.status     || '').trim();
  const priority   = String(req.query.priority   || '').trim();
  const assignedTo = String(req.query.assignee || '').trim();
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
    conditions.push(`t.assignee = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT t.id, t.user_id, t.title, t.description, t.channel, t.status,
                t.priority, t.assignee, t.created_at, t.updated_at,
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
    falloInterno(res, 'tickets_list_failed', err);
  }
});

ticketsRouter.get('/tickets/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const [ticket, events] = await Promise.all([
      query(
        `SELECT t.*, u.name AS user_name, u.email AS user_email, u.plan_id AS user_plan
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
    falloInterno(res, 'ticket_get_failed', err);
  }
});

/**
 * Copia el cliente a la tabla espejo del ERP si no estaba.
 *
 * Los tickets apuntan a `erp_users`, no a la tabla de clientes, y esa tabla
 * está vacía: sin esto, crear un ticket falla siempre por la clave foránea, con
 * el mensaje crudo de Postgres en la cara de quien lo intentaba.
 *
 * Devuelve false si el cliente no existe: eso no es un error del servidor, es
 * que se ha pedido un ticket para alguien que no está.
 */
async function aseguraCliente(userId: string): Promise<boolean> {
  const ya = await query(`SELECT id FROM erp_users WHERE id = $1`, [userId]);
  if (ya.rows.length) return true;

  const cliente = await query(
    `SELECT id, name, email, phone, last_login_at FROM moveadvisor_users WHERE id::text = $1 LIMIT 1`,
    [userId]
  );
  if (!cliente.rows.length) return false;

  const c = cliente.rows[0] as Record<string, string | null>;
  await query(
    `INSERT INTO erp_users (id, name, email, phone, status, last_seen_at)
     VALUES ($1, $2, $3, $4, 'active', COALESCE($5::timestamptz, NOW()))
     ON CONFLICT (id) DO NOTHING`,
    [userId, c.name || c.email || 'Sin nombre', c.email || '', c.phone || '', c.last_login_at]
  );
  return true;
}

const createSchema = z.object({
  user_id:     z.string().min(1),
  title:       z.string().min(3).max(200),
  description: z.string().min(5),
  channel:     z.enum(['web', 'phone', 'email', 'whatsapp']).default('web'),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignee: z.string().optional(),
});

ticketsRouter.post('/tickets', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  try {
    // La tabla no pone nada por defecto: id, quién lo lleva y las dos fechas
    // tienen que venir de aquí. Sin esto, crear un ticket fallaba siempre.
    if (!(await aseguraCliente(d.user_id))) {
      res.status(400).json({ ok: false, error: 'cliente_no_encontrado',
        detail: 'No hay ningún cliente con ese identificador.' });
      return;
    }

    const id = `t_${Date.now()}`;
    const result = await query(
      `INSERT INTO erp_tickets
         (id, user_id, title, description, channel, priority, assignee, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW()) RETURNING *`,
      [id, d.user_id, d.title, d.description, d.channel, d.priority, d.assignee ?? 'unassigned']
    );
    const actor = (req as { actor?: { sub: string } }).actor?.sub ?? 'system';
    await query(
      `INSERT INTO erp_ticket_events (ticket_id, event_at, actor, message) VALUES ($1, NOW(), $2, $3)`,
      [result.rows[0].id, actor, `Ticket creado por ${actor}`]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    falloInterno(res, 'ticket_create_failed', err);
  }
});

const updateSchema = z.object({
  status:      z.enum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']).optional(),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignee: z.string().optional(),
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
    if (fields.assignee !== undefined) eventParts.push(`Asignado → ${fields.assignee || 'sin asignar'}`);
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
    falloInterno(res, 'ticket_update_failed', err);
  }
});
