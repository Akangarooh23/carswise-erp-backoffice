import { Pool } from "pg";

export type UserStatus = "active" | "at_risk" | "blocked";
export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketChannel = "web" | "phone" | "email";
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled";
export type AppointmentType = "inspection" | "delivery" | "follow_up";
export type LeadStatus = "new" | "qualified" | "contacted" | "won" | "lost";
export type InventoryStatus = "draft" | "available" | "published" | "reserved" | "sold";
export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  openTickets: number;
  nextAppointmentAt: string;
  lastSeenAt: string;
};

export type TicketEvent = {
  at: string;
  by: string;
  message: string;
};

export type TicketRecord = {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  timeline: TicketEvent[];
};

export type AppointmentRecord = {
  id: string;
  userId: string;
  type: AppointmentType;
  scheduledAt: string;
  status: AppointmentStatus;
  agent: string;
  notes: string;
};

export type LeadRecord = {
  id: string;
  lead: string;
  source: string;
  status: LeadStatus;
  owner: string;
  updatedAt: string;
};

export type InventoryRecord = {
  id: string;
  sku: string;
  model: string;
  status: InventoryStatus;
  priceEur: number;
  updatedAt: string;
};

export type InvoiceRecord = {
  id: string;
  invoice: string;
  customer: string;
  dueAt: string;
  status: InvoiceStatus;
  amountEur: number;
};

export type KpiRecord = {
  id: string;
  kpi: string;
  value: string;
  target: string;
  variation: string;
  updatedAt: string;
};

export type MarketVoOfferRecord = {
  id: string;
  sku: string;
  model: string;
  status: string;
  price: string;
};

export type MarketVoTableRow = Record<string, unknown>;

export type MarketVoTableResult = {
  columns: string[];
  rows: MarketVoTableRow[];
};

export type MarketOffersTableResult = {
  columns: string[];
  rows: MarketVoTableRow[];
};

export type MarketEditableTableKind = "vo" | "offers";

export type MarketImportResult = {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
};

let pool: Pool | null = null;

const memUsers: Omit<UserRecord, "openTickets" | "nextAppointmentAt">[] = [];
const memTickets: TicketRecord[] = [];
const memAppointments: AppointmentRecord[] = [];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

function cleanDisplayText(input: string) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\uFFFD]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeImportColumnName(column: string) {
  return String(column || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseImportNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseImportBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeDbUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function pgEnabled() {
  return Boolean(normalizeDbUrl());
}

async function ensureSchema(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS erp_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      channel TEXT NOT NULL,
      assignee TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES erp_users(id)
    );

    CREATE TABLE IF NOT EXISTS erp_ticket_events (
      id BIGSERIAL PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      event_at TIMESTAMPTZ NOT NULL,
      actor TEXT NOT NULL,
      message TEXT NOT NULL,
      CONSTRAINT fk_event_ticket FOREIGN KEY (ticket_id) REFERENCES erp_tickets(id)
    );

    CREATE TABLE IF NOT EXISTS erp_appointments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      agent TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT fk_appointment_user FOREIGN KEY (user_id) REFERENCES erp_users(id)
    );

    CREATE TABLE IF NOT EXISTS erp_user_status_overrides (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_leads (
      id TEXT PRIMARY KEY,
      lead TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_inventory (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      price_eur NUMERIC(12,2) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_invoices (
      id TEXT PRIMARY KEY,
      invoice TEXT NOT NULL,
      customer TEXT NOT NULL,
      due_at DATE NOT NULL,
      status TEXT NOT NULL,
      amount_eur NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_kpis (
      id TEXT PRIMARY KEY,
      kpi TEXT NOT NULL,
      value TEXT NOT NULL,
      target TEXT NOT NULL,
      variation TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
}

async function seedDb(db: Pool) {
  await db.query(`DELETE FROM erp_ticket_events WHERE ticket_id LIKE 't_%'`);
  await db.query(`DELETE FROM erp_tickets WHERE id LIKE 't_%'`);
  await db.query(`DELETE FROM erp_appointments WHERE id LIKE 'a_%'`);
  await db.query(`DELETE FROM erp_users WHERE id LIKE 'u_%'`);
  await db.query(`DELETE FROM erp_leads WHERE id LIKE 'l_%'`);
  await db.query(`DELETE FROM erp_inventory WHERE id LIKE 'i_%'`);
  await db.query(`DELETE FROM erp_invoices WHERE id LIKE 'f_%'`);
  await db.query(`DELETE FROM erp_kpis WHERE id LIKE 'k_%'`);
}

export async function initStore() {
  if (!pgEnabled()) {
    return;
  }

  pool = new Pool({ connectionString: normalizeDbUrl() });
  try {
    await ensureSchema(pool);
    await seedDb(pool);
  } catch (error) {
    console.warn("[store] Postgres unavailable, running with empty-data mode");
    console.warn(error instanceof Error ? error.message : String(error));
    await pool.end();
    pool = null;
  }
}

function mapUserWithComputed(base: Omit<UserRecord, "openTickets" | "nextAppointmentAt">): UserRecord {
  const openTickets = memTickets.filter((item) => item.userId === base.id && item.status !== "resolved").length;
  const nextAppointment = memAppointments
    .filter((item) => item.userId === base.id && (item.status === "scheduled" || item.status === "confirmed"))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

  return {
    ...base,
    openTickets,
    nextAppointmentAt: nextAppointment?.scheduledAt || "",
  };
}

export async function listUsers(params: { q?: string; status?: string }) {
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim().toLowerCase();

  if (!pool) {
    return [];
  }

  const { rows: realTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_users') IS NOT NULL AS exists`
  );
  if (realTableRows[0]?.exists) {
    const { rows: realRows } = await pool.query<{
      id: string;
      name: string;
      email: string;
      status: UserStatus;
      last_seen_at: string;
      open_tickets: string;
      next_appointment_at: string | null;
    }>(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        COALESCE(
          so.status,
          CASE
            WHEN u.last_login_at >= NOW() - INTERVAL '30 days' THEN 'active'
            WHEN u.last_login_at >= NOW() - INTERVAL '90 days' THEN 'at_risk'
            ELSE 'blocked'
          END
        ) AS status,
        u.last_login_at AS last_seen_at,
        COALESCE(t.open_tickets, 0)::text AS open_tickets,
        na.next_appointment_at
      FROM moveadvisor_users u
      LEFT JOIN erp_user_status_overrides so ON so.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS open_tickets
        FROM erp_tickets
        WHERE status <> 'resolved'
        GROUP BY user_id
      ) t ON t.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MIN(scheduled_at) AS next_appointment_at
        FROM erp_appointments
        WHERE status IN ('scheduled', 'confirmed')
        GROUP BY user_id
      ) na ON na.user_id = u.id
      WHERE ($1 = '' OR lower(u.id) LIKE '%' || $1 || '%' OR lower(u.name) LIKE '%' || $1 || '%' OR lower(u.email) LIKE '%' || $1 || '%')
        AND (
          $2 = '' OR
          COALESCE(
            so.status,
            CASE
              WHEN u.last_login_at >= NOW() - INTERVAL '30 days' THEN 'active'
              WHEN u.last_login_at >= NOW() - INTERVAL '90 days' THEN 'at_risk'
              ELSE 'blocked'
            END
          ) = $2
        )
      ORDER BY u.last_login_at DESC
      LIMIT 500
      `,
      [q, status]
    );

    if (realRows.length > 0) {
      return realRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: "",
        status: row.status,
        openTickets: Number(row.open_tickets || "0"),
        nextAppointmentAt: row.next_appointment_at ? new Date(row.next_appointment_at).toISOString() : "",
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
      }));
    }
  }

  const { rows } = await pool.query<{
    id: string;
    name: string;
    email: string;
    phone: string;
    status: UserStatus;
    last_seen_at: string;
    open_tickets: string;
    next_appointment_at: string | null;
  }>(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.status,
      u.last_seen_at,
      COALESCE(t.open_tickets, 0)::text AS open_tickets,
      na.next_appointment_at
    FROM erp_users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS open_tickets
      FROM erp_tickets
      WHERE status <> 'resolved'
      GROUP BY user_id
    ) t ON t.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MIN(scheduled_at) AS next_appointment_at
      FROM erp_appointments
      WHERE status IN ('scheduled', 'confirmed')
      GROUP BY user_id
    ) na ON na.user_id = u.id
    WHERE ($1 = '' OR lower(u.id) LIKE '%' || $1 || '%' OR lower(u.name) LIKE '%' || $1 || '%' OR lower(u.email) LIKE '%' || $1 || '%' OR lower(u.phone) LIKE '%' || $1 || '%')
      AND ($2 = '' OR u.status = $2)
    ORDER BY u.last_seen_at DESC
    `,
    [q, status]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    openTickets: Number(row.open_tickets || "0"),
    nextAppointmentAt: row.next_appointment_at ? new Date(row.next_appointment_at).toISOString() : "",
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
  }));
}

export async function getUserById(userId: string) {
  const list = await listUsers({ q: userId, status: "" });
  return list.find((item) => item.id === userId) || null;
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  if (!pool) {
    return null;
  }

  const { rows: realTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_users') IS NOT NULL AS exists`
  );

  if (realTableRows[0]?.exists) {
    const { rows: realUserRows } = await pool.query<{ id: string }>(`SELECT id FROM moveadvisor_users WHERE id = $1 LIMIT 1`, [userId]);
    if (realUserRows.length > 0) {
      await pool.query(
        `
        INSERT INTO erp_user_status_overrides (user_id, status, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
        `,
        [userId, status, nowIso()]
      );
      return getUserById(userId);
    }
  }

  const updateResult = await pool.query(`UPDATE erp_users SET status = $1 WHERE id = $2`, [status, userId]);
  if (!updateResult.rowCount) {
    return null;
  }

  return getUserById(userId);
}

async function ensureErpUserReference(userId: string) {
  if (!pool) {
    return;
  }

  const { rows: existingRows } = await pool.query<{ id: string }>(`SELECT id FROM erp_users WHERE id = $1 LIMIT 1`, [userId]);
  if (existingRows.length > 0) {
    return;
  }

  const { rows: realTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_users') IS NOT NULL AS exists`
  );

  if (realTableRows[0]?.exists) {
    const { rows: sourceRows } = await pool.query<{ id: string; name: string; email: string; last_login_at: string }>(
      `SELECT id, name, email, last_login_at FROM moveadvisor_users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (sourceRows.length > 0) {
      const source = sourceRows[0];
      await pool.query(
        `
        INSERT INTO erp_users (id, name, email, phone, status, last_seen_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
        `,
        [source.id, source.name, source.email, "", "active", new Date(source.last_login_at).toISOString()]
      );
      return;
    }
  }

  await pool.query(
    `
    INSERT INTO erp_users (id, name, email, phone, status, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
    `,
    [userId, userId, `${userId}@unknown.local`, "", "active", nowIso()]
  );
}

async function loadTicketEvents(ticketIds: string[]) {
  if (!ticketIds.length) {
    return new Map<string, TicketEvent[]>();
  }

  if (!pool) {
    return new Map();
  }

  const { rows } = await pool.query<{ ticket_id: string; event_at: string; actor: string; message: string }>(
    `
    SELECT ticket_id, event_at, actor, message
    FROM erp_ticket_events
    WHERE ticket_id = ANY($1)
    ORDER BY event_at DESC
    `,
    [ticketIds]
  );

  const map = new Map<string, TicketEvent[]>();
  for (const row of rows) {
    if (!map.has(row.ticket_id)) {
      map.set(row.ticket_id, []);
    }
    map.get(row.ticket_id)?.push({ at: new Date(row.event_at).toISOString(), by: row.actor, message: row.message });
  }

  return map;
}

export async function listTickets(params: { q?: string; status?: string }) {
  const q = String(params.q || "").trim().toLowerCase();
  const status = String(params.status || "").trim().toLowerCase();

  if (!pool) {
    return [];
  }

  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    channel: TicketChannel;
    assignee: string;
    created_at: string;
    updated_at: string;
  }>(
    `
    SELECT id, user_id, title, description, status, priority, channel, assignee, created_at, updated_at
    FROM erp_tickets
    WHERE ($1 = '' OR lower(id) LIKE '%' || $1 || '%' OR lower(title) LIKE '%' || $1 || '%' OR lower(description) LIKE '%' || $1 || '%' OR lower(user_id) LIKE '%' || $1 || '%')
      AND ($2 = '' OR status = $2)
    ORDER BY updated_at DESC
    `,
    [q, status]
  );

  const eventsByTicket = await loadTicketEvents(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    assignee: row.assignee,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    timeline: eventsByTicket.get(row.id) || [],
  }));
}

export async function createTicket(input: {
  userId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  channel: TicketChannel;
  actor: string;
}) {
  const createdAt = nowIso();
  const ticket: TicketRecord = {
    id: createId("t"),
    userId: input.userId,
    title: input.title,
    description: input.description,
    status: "open",
    priority: input.priority,
    channel: input.channel,
    assignee: "unassigned",
    createdAt,
    updatedAt: createdAt,
    timeline: [{ at: createdAt, by: input.actor, message: "Ticket creado desde backoffice" }],
  };

  if (!pool) {
    throw new Error("database_unavailable");
  }

  await ensureErpUserReference(ticket.userId);

  await pool.query(
    `INSERT INTO erp_tickets (id, user_id, title, description, status, priority, channel, assignee, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      ticket.id,
      ticket.userId,
      ticket.title,
      ticket.description,
      ticket.status,
      ticket.priority,
      ticket.channel,
      ticket.assignee,
      ticket.createdAt,
      ticket.updatedAt,
    ]
  );
  await pool.query(`INSERT INTO erp_ticket_events (ticket_id, event_at, actor, message) VALUES ($1, $2, $3, $4)`, [
    ticket.id,
    createdAt,
    input.actor,
    "Ticket creado desde backoffice",
  ]);

  return ticket;
}

export async function updateTicket(input: {
  ticketId: string;
  status?: TicketStatus;
  assignee?: string;
  note?: string;
  actor: string;
}) {
  if (!pool) {
    return null;
  }

  const { rows: foundRows } = await pool.query<{ id: string }>(`SELECT id FROM erp_tickets WHERE id = $1`, [input.ticketId]);
  if (!foundRows.length) {
    return null;
  }

  const sets: string[] = ["updated_at = $1"];
  const values: unknown[] = [nowIso()];

  if (input.status) {
    sets.push(`status = $${values.length + 1}`);
    values.push(input.status);
  }
  if (input.assignee) {
    sets.push(`assignee = $${values.length + 1}`);
    values.push(input.assignee);
  }

  values.push(input.ticketId);
  await pool.query(`UPDATE erp_tickets SET ${sets.join(", ")} WHERE id = $${values.length}`, values);

  if (input.note) {
    await pool.query(`INSERT INTO erp_ticket_events (ticket_id, event_at, actor, message) VALUES ($1, $2, $3, $4)`, [
      input.ticketId,
      nowIso(),
      input.actor,
      input.note,
    ]);
  }

  const all = await listTickets({ q: input.ticketId });
  return all.find((item) => item.id === input.ticketId) || null;
}

export async function listAppointments() {
  if (!pool) {
    return [];
  }

  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    type: AppointmentType;
    scheduled_at: string;
    status: AppointmentStatus;
    agent: string;
    notes: string;
  }>(
    `
    SELECT id, user_id, type, scheduled_at, status, agent, notes
    FROM erp_appointments
    ORDER BY scheduled_at ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    scheduledAt: new Date(row.scheduled_at).toISOString(),
    status: row.status,
    agent: row.agent,
    notes: row.notes,
  }));
}

export async function createAppointment(input: {
  userId: string;
  scheduledAt: string;
  type: AppointmentType;
  agent: string;
  notes: string;
}) {
  const appointment: AppointmentRecord = {
    id: createId("a"),
    userId: input.userId,
    scheduledAt: input.scheduledAt,
    type: input.type,
    status: "scheduled",
    agent: input.agent || "unassigned",
    notes: input.notes,
  };

  if (!pool) {
    throw new Error("database_unavailable");
  }

  await ensureErpUserReference(appointment.userId);

  await pool.query(
    `INSERT INTO erp_appointments (id, user_id, type, scheduled_at, status, agent, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      appointment.id,
      appointment.userId,
      appointment.type,
      appointment.scheduledAt,
      appointment.status,
      appointment.agent,
      appointment.notes,
      nowIso(),
    ]
  );

  return appointment;
}

export async function updateAppointment(input: {
  appointmentId: string;
  status?: AppointmentStatus;
  scheduledAt?: string;
  notes?: string;
}) {
  if (!pool) {
    return null;
  }

  const { rows: foundRows } = await pool.query<{ id: string }>(`SELECT id FROM erp_appointments WHERE id = $1`, [input.appointmentId]);
  if (!foundRows.length) {
    return null;
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.status) {
    sets.push(`status = $${values.length + 1}`);
    values.push(input.status);
  }
  if (input.scheduledAt) {
    sets.push(`scheduled_at = $${values.length + 1}`);
    values.push(input.scheduledAt);
  }
  if (typeof input.notes === "string") {
    sets.push(`notes = $${values.length + 1}`);
    values.push(input.notes);
  }

  if (sets.length) {
    values.push(input.appointmentId);
    await pool.query(`UPDATE erp_appointments SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  }

  const all = await listAppointments();
  return all.find((item) => item.id === input.appointmentId) || null;
}

export async function listMarketVoOffers(params: { q?: string; limit?: number }) {
  if (!pool) {
    return [] as MarketVoOfferRecord[];
  }

  const q = String(params.q || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(300, Number(params.limit || 80)));

  const { rows: hasTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
  );
  if (!hasTableRows[0]?.exists) {
    return [] as MarketVoOfferRecord[];
  }

  const { rows } = await pool.query<{
    id: string;
    title: string;
    brand: string;
    model: string;
    price: string | null;
    portal: string | null;
  }>(
    `
    SELECT id, title, brand, model, price::text AS price, portal
    FROM moveadvisor_marketplace_vo_offers
    WHERE ($1 = '' 
      OR normalize_alias_token(lower($1)) = normalize_alias_token(lower(brand))
      OR normalize_alias_token(lower($1)) = normalize_alias_token(lower(model))
      OR lower(id) LIKE '%' || $1 || '%' 
      OR lower(title) LIKE '%' || $1 || '%')
      AND is_active = TRUE
    ORDER BY portal_score DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT $2
    `,
    [q, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    sku: row.id,
    model:
      cleanDisplayText(row.title) ||
      cleanDisplayText([row.brand, row.model].filter(Boolean).join(" ")) ||
      cleanDisplayText(row.model || row.brand || row.id),
    status: cleanDisplayText(row.portal || "Marketplace"),
    price: row.price ? `${Number(row.price).toLocaleString("es-ES")} EUR` : "-",
  }));
}

export async function listMarketVoOffersTable(): Promise<MarketVoTableResult> {
  if (!pool) {
    return { columns: [], rows: [] };
  }

  const { rows: hasTableRows } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
  );
  if (!hasTableRows[0]?.exists) {
    return { columns: [], rows: [] };
  }

  const { rows } = await pool.query<MarketVoTableRow>(
    `
    SELECT *
    FROM moveadvisor_marketplace_vo_offers
    WHERE is_active = TRUE
    ORDER BY portal_score DESC NULLS LAST, updated_at DESC NULLS LAST
    `
  );

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}

async function resolveOffersTableName(): Promise<string | null> {
  if (!pool) {
    return null;
  }

  const { rows: rowsMarketOffers } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.market_offers') IS NOT NULL AS exists`
  );
  if (rowsMarketOffers[0]?.exists) {
    return "market_offers";
  }

  const { rows: rowsMoveAdvisorOffers } = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.moveadvisor_market_offers') IS NOT NULL AS exists`
  );
  if (rowsMoveAdvisorOffers[0]?.exists) {
    return "moveadvisor_market_offers";
  }

  return null;
}

async function resolveEditableMarketTableName(kind: MarketEditableTableKind): Promise<string | null> {
  if (kind === "vo") {
    if (!pool) {
      return null;
    }
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.moveadvisor_marketplace_vo_offers') IS NOT NULL AS exists`
    );
    return rows[0]?.exists ? "moveadvisor_marketplace_vo_offers" : null;
  }

  return resolveOffersTableName();
}

export async function updateMarketTableRow(input: {
  kind: MarketEditableTableKind;
  id: string;
  values: Record<string, unknown>;
}): Promise<MarketVoTableRow | null> {
  if (!pool) {
    return null;
  }

  const rowId = String(input.id || "").trim();
  if (!rowId) {
    return null;
  }

  const tableName = await resolveEditableMarketTableName(input.kind);
  if (!tableName) {
    return null;
  }

  const { rows: columnRows } = await pool.query<{ column_name: string; is_nullable: string }>(
    `
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );

  const tableColumns = new Set(columnRows.map((row) => row.column_name));
  const notNullColumns = new Set(columnRows.filter((row) => row.is_nullable === "NO").map((row) => row.column_name));
  if (!tableColumns.has("id")) {
    return null;
  }

  const protectedColumns = new Set(["id", "created_at", "first_seen_at", "scraped_at"]);
  const requestedEntries = Object.entries(input.values || {});
  const sanitizedEntries = requestedEntries
    .filter(([column]) => tableColumns.has(column) && !protectedColumns.has(column))
    .filter(([, value]) => typeof value !== "object" || value === null)
    .map(([column, value]) => [column, value === "" ? null : value] as const)
    // Nunca poner NULL en una columna NOT NULL → se omite el campo (mantiene el valor actual) en vez de romper el guardado
    .filter(([column, value]) => !(value === null && notNullColumns.has(column)));

  if (sanitizedEntries.length === 0) {
    const { rows } = await pool.query<MarketVoTableRow>(
      `SELECT * FROM ${quoteIdentifier(tableName)} WHERE id = $1 LIMIT 1`,
      [rowId]
    );
    return rows[0] || null;
  }

  const values: unknown[] = [];
  const setClauses = sanitizedEntries.map(([column, value], index) => {
    values.push(value);
    return `${quoteIdentifier(column)} = $${index + 1}`;
  });

  if (tableColumns.has("updated_at") && !sanitizedEntries.some(([column]) => column === "updated_at")) {
    setClauses.push(`${quoteIdentifier("updated_at")} = NOW()`);
  }

  values.push(rowId);

  const query = `
    UPDATE ${quoteIdentifier(tableName)}
    SET ${setClauses.join(", ")}
    WHERE id = $${values.length}
    RETURNING *
  `;

  const { rows } = await pool.query<MarketVoTableRow>(query, values);
  return rows[0] || null;
}

export async function importMarketVoOffersRows(inputRows: Array<Record<string, unknown>>): Promise<MarketImportResult> {
  if (!pool) {
    return { processed: 0, inserted: 0, updated: 0, skipped: 0 };
  }

  const tableName = await resolveEditableMarketTableName("vo");
  if (!tableName) {
    return { processed: 0, inserted: 0, updated: 0, skipped: inputRows.length };
  }

  const { rows: columnRows } = await pool.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );

  const tableColumns = new Set(columnRows.map((row) => row.column_name));
  const normalizedToColumn = new Map<string, string>();
  for (const column of tableColumns) {
    normalizedToColumn.set(normalizeImportColumnName(column), column);
  }

  const numberColumns = new Set([
    "price",
    "year",
    "mileage",
    "displacement",
    "portal_score",
    "warranty_months",
  ]);
  const booleanColumns = new Set(["has_guarantee_seal", "is_active"]);
  const readOnlyColumns = new Set(["created_at", "first_seen_at", "scraped_at"]);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let index = 0; index < inputRows.length; index += 1) {
    const sourceRow = inputRows[index];
    if (!sourceRow || typeof sourceRow !== "object") {
      skipped += 1;
      continue;
    }

    const mapped: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(sourceRow)) {
      const normalized = normalizeImportColumnName(rawKey);
      const column = normalizedToColumn.get(normalized);
      if (!column || readOnlyColumns.has(column)) {
        continue;
      }

      if (numberColumns.has(column)) {
        mapped[column] = parseImportNumber(rawValue);
        continue;
      }
      if (booleanColumns.has(column)) {
        mapped[column] = parseImportBoolean(rawValue);
        continue;
      }

      if (rawValue === "") {
        mapped[column] = null;
      } else {
        mapped[column] = rawValue;
      }
    }

    const idCandidate = String(mapped.id ?? "").trim();
    mapped.id = idCandidate || `vo_import_${Date.now()}_${index}`;

    if (mapped.is_active === null || mapped.is_active === undefined) {
      mapped.is_active = true;
    }

    const insertColumns = Object.keys(mapped).filter((column) => tableColumns.has(column));
    if (insertColumns.length === 0 || !insertColumns.includes("id")) {
      skipped += 1;
      continue;
    }

    const insertValues = insertColumns.map((column) => mapped[column]);
    const placeholders = insertColumns.map((_, placeholderIndex) => `$${placeholderIndex + 1}`);
    const updateColumns = insertColumns.filter((column) => column !== "id");
    const updateClauses = updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);
    if (tableColumns.has("updated_at")) {
      updateClauses.push(`${quoteIdentifier("updated_at")} = NOW()`);
    }

    if (updateClauses.length === 0) {
      skipped += 1;
      continue;
    }

    const query = `
      INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns.map((column) => quoteIdentifier(column)).join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (id)
      DO UPDATE SET ${updateClauses.join(", ")}
      RETURNING (xmax = 0) AS inserted
    `;

    const { rows } = await pool.query<{ inserted: boolean }>(query, insertValues);
    if (rows[0]?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }
    processed += 1;
  }

  return { processed, inserted, updated, skipped };
}

export async function listMarketOffersTable(): Promise<MarketOffersTableResult> {
  if (!pool) {
    return { columns: [], rows: [] };
  }

  const tableName = await resolveOffersTableName();
  if (!tableName) {
    return { columns: [], rows: [] };
  }

  const { rows } = await pool.query<MarketVoTableRow>(
    `
    SELECT *
    FROM ${tableName}
    ORDER BY last_seen_at DESC NULLS LAST
    `
  );

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows };
}
