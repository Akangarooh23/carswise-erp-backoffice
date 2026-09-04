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
      assignee TEXT NOT NULL DEFAULT 'unassigned',
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

  /**
   * El depósito de una importación, y lo que lo suelta.
   *
   * Las escribe PopCar al recibir la solicitud, pero se declaran también aquí:
   * el ERP es quien las lee para decidir si se puede liberar el dinero, y una
   * columna que existe solo porque otro servicio la creó primero es una columna
   * que un día no está.
   *
   * Va partido por destino —el coche al vendedor alemán, el fee nuestro, la
   * garantía a su proveedor— porque el día que haya que liberar hay que soltar
   * lo del vendedor y no lo demás.
   */
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_market_leads
      ADD COLUMN IF NOT EXISTS escrow_coche           NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS escrow_fee             NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS escrow_garantia        NUMERIC(10,2),
      -- El impuesto va a cuenta: se cobra estimado y se liquida al matricular.
      ADD COLUMN IF NOT EXISTS escrow_impuesto        NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS liquidacion_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escrow_estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      ADD COLUMN IF NOT EXISTS escrow_pagado_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escrow_liberado_at     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS escrow_devuelto_at     TIMESTAMPTZ,
      -- La fecha en que alguien nuestro vio el coche. Sin esto no se libera.
      ADD COLUMN IF NOT EXISTS verificado_alemania_at TIMESTAMPTZ,
      -- Los avisos que salen a proveedores: cuándo se mandaron y a qué correo.
      --
      -- Van en columnas y no dentro de meta, porque meta no es una columna: se
      -- arma en el SELECT con un jsonb_build_object. Escribirle era un UPDATE
      -- que fallaba en silencio, y el aviso salía como sin mandar aunque el
      -- correo hubiera salido.
      ADD COLUMN IF NOT EXISTS reserva_preguntada_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reserva_preguntada_a        TEXT,
      ADD COLUMN IF NOT EXISTS factura_vendedor_pedida_at  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS factura_vendedor_pedida_a   TEXT,
      ADD COLUMN IF NOT EXISTS encargo_gestoria_enviado_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS encargo_gestoria_enviado_a  TEXT
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

  // ── El personal del ERP ────────────────────────────────────────────────
  //
  // Hasta ahora habia cuatro cuentas escritas en el codigo, una por area, con
  // la contrasena en una variable de entorno. Tres personas en Operaciones
  // compartian cuenta: el registro de actividad solo podia decir «ops», nunca
  // quien, y dar de baja a alguien obligaba a cambiarle la clave a su equipo.
  //
  // Ojo: erp_users NO es esta tabla. Esa refleja clientes —se cruza con
  // moveadvisor_users por email— y el parecido del nombre despista.
  await query(`
    CREATE TABLE IF NOT EXISTS erp_staff (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT UNIQUE NOT NULL,
      nombre        TEXT NOT NULL,
      rol           TEXT NOT NULL,
      activo        BOOLEAN NOT NULL DEFAULT TRUE,
      creado_por    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_erp_staff_email ON erp_staff(lower(email))`);

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
      ADD COLUMN IF NOT EXISTS cw_pdf_url        TEXT,
      ADD COLUMN IF NOT EXISTS cw_sent_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cw_generated_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cw_paid_at        TIMESTAMPTZ
  `);

  /*
   * De dónde viene una factura recibida, que cambia quién paga el IVA.
   *
   * Una de 890 € de una empresa alemana con ROI viene sin IVA y la cuota se
   * autoliquida aquí; la misma de una española lleva 154,46 € deducibles
   * dentro. Guardadas las dos como «890» parecen iguales, y con ellas el coste
   * del coche sale mal y el trimestre no cuadra.
   */
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_provider_invoices
      ADD COLUMN IF NOT EXISTS regimen VARCHAR(20) NOT NULL DEFAULT 'nacional'
  `);

  // ── Rectificativas support ───────────────────────────────────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_provider_invoices
      ADD COLUMN IF NOT EXISTS rectifies_id VARCHAR(40),
      ADD COLUMN IF NOT EXISTS cw_sent_at   TIMESTAMPTZ
  `);

  // ── Client type differentiation ──────────────────────────────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_users
      ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) NOT NULL DEFAULT 'individual'
  `);

  // ── Separate address fields ───────────────────────────────────────────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_users
      ADD COLUMN IF NOT EXISTS billing_street      VARCHAR(300) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS billing_postal_code VARCHAR(10)  NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS billing_province    VARCHAR(100) NOT NULL DEFAULT ''
  `);

  // ── Vehicle sale tracking columns (needed by processSaleOutcome) ──────────────
  await query(`
    ALTER TABLE IF EXISTS moveadvisor_user_vehicles
      ADD COLUMN IF NOT EXISTS source_lead_id VARCHAR(80),
      ADD COLUMN IF NOT EXISTS purchased_from VARCHAR(60),
      ADD COLUMN IF NOT EXISTS sold_at        TIMESTAMPTZ
  `);

  console.log('[schema] ERP tables verified');
}
