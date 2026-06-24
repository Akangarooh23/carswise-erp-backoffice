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
      ADD COLUMN IF NOT EXISTS sale_price             NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS sale_notes             TEXT
  `);

  await query(`
    ALTER TABLE IF EXISTS moveadvisor_market_leads
      ADD COLUMN IF NOT EXISTS erp_response           TEXT         NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_date       DATE,
      ADD COLUMN IF NOT EXISTS appointment_time       VARCHAR(10)  NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_address    TEXT         NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS appointment_contact    VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS notified_at            TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reschedule_proposals   JSONB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_password_resets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email      TEXT NOT NULL,
      token      TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS erp_staff_passwords (
      email         TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── moveadvisor_marketplace_vo_offers column migrations ──────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_marketplace_vo_offers
      ADD COLUMN IF NOT EXISTS seller_type          VARCHAR(20),
      ADD COLUMN IF NOT EXISTS image_urls           TEXT,
      ADD COLUMN IF NOT EXISTS has_stock_management BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS renting_12m          NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS renting_24m          NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS renting_36m          NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS renting_48m          NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS renting_60m          NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS carswise_fee         NUMERIC(10,2)
  `);

  // Default 400€ fee for all existing renting offers
  await query(`
    UPDATE moveadvisor_marketplace_vo_offers
    SET carswise_fee = 400
    WHERE renting_available = true AND carswise_fee IS NULL
  `);

  // ── moveadvisor_provider_invoices ────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS moveadvisor_provider_invoices (
      id               VARCHAR(40)    PRIMARY KEY,
      type             VARCHAR(40)    NOT NULL,  -- 'renting_fee' | 'portal_commission'
      provider_name    VARCHAR(200),
      contract_id      VARCHAR(80),
      vehicle_title    VARCHAR(300),
      customer_name    VARCHAR(200),
      customer_email   VARCHAR(200),
      base_amount      NUMERIC(10,2), -- original sale/monthly price
      invoice_amount   NUMERIC(10,2), -- what CarsWise charges the provider
      status           VARCHAR(20)    DEFAULT 'pending', -- pending | paid | cancelled
      issued_at        TIMESTAMPTZ    DEFAULT NOW(),
      paid_at          TIMESTAMPTZ,
      notes            TEXT,
      created_at       TIMESTAMPTZ    DEFAULT NOW(),
      updated_at       TIMESTAMPTZ    DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE IF EXISTS moveadvisor_provider_invoices
      ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'emitted',
      ADD COLUMN IF NOT EXISTS pdf_url   TEXT,
      ADD COLUMN IF NOT EXISTS invoice_date DATE
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS ix_provider_invoices_status
      ON moveadvisor_provider_invoices (status, issued_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS moveadvisor_marketplace_vo_units (
      id           VARCHAR(64)  PRIMARY KEY,
      offer_id     VARCHAR(64)  NOT NULL REFERENCES moveadvisor_marketplace_vo_offers(id) ON DELETE CASCADE,
      color        VARCHAR(80),
      mileage      INTEGER      DEFAULT 0,
      status       VARCHAR(20)  DEFAULT 'available',
      notes        TEXT,
      rented_at    TIMESTAMPTZ,
      returned_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ  DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS ix_vo_units_offer_id
      ON moveadvisor_marketplace_vo_units (offer_id, status)
  `);

  // ── moveadvisor_renting_contracts ────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS moveadvisor_renting_contracts (
      id                  VARCHAR(40)    PRIMARY KEY,
      lead_id             VARCHAR(80),
      offer_id            VARCHAR(80),
      user_email          VARCHAR(200),
      contact_name        VARCHAR(200),
      vehicle_title       VARCHAR(300),
      color               VARCHAR(80),
      quantity            INT            DEFAULT 1,
      duration_months     INT,
      km_year             INT,
      monthly_price       NUMERIC(10,2),
      start_date          DATE,
      end_date            DATE,
      status              VARCHAR(20)    DEFAULT 'active',
      idcar_id            VARCHAR(80),
      notes               TEXT,
      created_at          TIMESTAMPTZ    DEFAULT NOW(),
      updated_at          TIMESTAMPTZ    DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS ix_renting_contracts_user
      ON moveadvisor_renting_contracts (user_email, status)
  `);

  await query(`
    ALTER TABLE IF EXISTS moveadvisor_user_vehicles
      ADD COLUMN IF NOT EXISTS renting_contract_id     VARCHAR(40),
      ADD COLUMN IF NOT EXISTS renting_end_date        DATE,
      ADD COLUMN IF NOT EXISTS renting_monthly_price   NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS renting_km_year         INT,
      ADD COLUMN IF NOT EXISTS renting_duration_months INT
  `);

  // ── moveadvisor_user_vehicle_files / documents column migrations ─────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_user_vehicle_files
      ADD COLUMN IF NOT EXISTS file_url TEXT NOT NULL DEFAULT ''
  `);

  await query(`
    ALTER TABLE IF EXISTS moveadvisor_user_vehicle_documents
      ADD COLUMN IF NOT EXISTS file_url TEXT NOT NULL DEFAULT ''
  `);

  // ── Invoice series counters ─────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS moveadvisor_invoice_counters (
      series  VARCHAR(20) NOT NULL,
      year    INT         NOT NULL,
      last_n  INT         NOT NULL DEFAULT 0,
      PRIMARY KEY (series, year)
    )
  `);

  // ── invoice_number + pdf_url on provider invoices ───────────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_provider_invoices
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40),
      ADD COLUMN IF NOT EXISTS iva_rate       NUMERIC(5,4) DEFAULT 0.21
  `);

  // ── invoice_number + pdf_url on user invoices (Stripe) ──────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_user_invoices
      ADD COLUMN IF NOT EXISTS cw_invoice_number VARCHAR(40),
      ADD COLUMN IF NOT EXISTS cw_pdf_url        TEXT
  `);

  // ── Rectificativas support ───────────────────────────────────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_provider_invoices
      ADD COLUMN IF NOT EXISTS rectifies_id VARCHAR(40)
  `);

  console.log('[schema] ERP tables verified');
}
