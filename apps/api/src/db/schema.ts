import { query } from './pool.js';

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS erp_tickets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      channel     TEXT NOT NULL DEFAULT 'web',
      status      TEXT NOT NULL DEFAULT 'open',
      priority    TEXT NOT NULL DEFAULT 'normal',
      assigned_to TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_ticket_events (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES erp_tickets(id) ON DELETE CASCADE,
      actor     TEXT NOT NULL,
      message   TEXT NOT NULL,
      event_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_erp_ticket_events_ticket
      ON erp_ticket_events(ticket_id)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_workshops (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      address     TEXT,
      city        TEXT,
      province    TEXT,
      postal_code TEXT,
      phone       TEXT,
      email       TEXT,
      is_active   BOOLEAN DEFAULT TRUE,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_appointments (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL,
      agent         TEXT,
      workshop_id   UUID REFERENCES erp_workshops(id) ON DELETE SET NULL,
      workshop_name TEXT,
      scheduled_at  TIMESTAMPTZ NOT NULL,
      type          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'scheduled',
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor       TEXT NOT NULL,
      action      TEXT NOT NULL,
      resource    TEXT NOT NULL,
      resource_id TEXT,
      payload     JSONB,
      ip          TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_erp_audit_log_resource
      ON erp_audit_log(resource, resource_id)
  `);

  await query(`
    ALTER TABLE IF EXISTS moveadvisor_market_leads
      ADD COLUMN IF NOT EXISTS erp_response         TEXT         NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_date     DATE,
      ADD COLUMN IF NOT EXISTS appointment_time     VARCHAR(10)  NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_address  TEXT         NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_contact  VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS notified_at          TIMESTAMPTZ
  `);

  console.log('[schema] ERP tables verified');
}
