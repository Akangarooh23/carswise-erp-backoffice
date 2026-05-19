import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const marketplaceRouter = Router();

// ── Offers from portal scraping ───────────────────────────────────────────────

marketplaceRouter.get('/marketplace/offers', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q      = String(req.query.q      || '').trim();
  const portal = String(req.query.portal || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(title,'')) LIKE $${values.length} OR lower(brand) LIKE $${values.length} OR lower(model) LIKE $${values.length})`);
  }
  if (portal) {
    values.push(portal);
    conditions.push(`portal = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, portal, title, brand, model, version, year, mileage, price, fuel,
                body_type, color, doors, seats, power_cv, traction, image_url, url,
                scraped_at, updated_at
         FROM moveadvisor_market_offers ${where}
         ORDER BY updated_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_market_offers ${where}`, values),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_offers_failed', detail: (err as Error).message });
  }
});

// ── Carswise VO Marketplace ───────────────────────────────────────────────────

marketplaceRouter.get('/marketplace/vo', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q        = String(req.query.q        || '').trim();
  const brand    = String(req.query.brand    || '').trim();
  const isActive = req.query.is_active;
  const page     = Math.max(1, Number(req.query.page) || 1);
  const limit    = Math.min(500, Math.max(10, Number(req.query.limit) || 50));
  const offset   = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(title,'')) LIKE $${values.length} OR lower(brand) LIKE $${values.length} OR lower(model) LIKE $${values.length})`);
  }
  if (brand) {
    values.push(brand.toLowerCase());
    conditions.push(`lower(brand) = $${values.length}`);
  }
  if (isActive === 'true' || isActive === 'false') {
    values.push(isActive === 'true');
    conditions.push(`is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, title, brand, model, year, price, mileage, fuel,
                color, displacement, power, location, seller, seller_type, image_url,
                CASE WHEN image_urls IS NOT NULL AND image_urls <> '' THEN image_urls::json ELSE '[]'::json END AS image_urls,
                source_url, description, portal_score, warranty_months, has_guarantee_seal, is_active,
                available_for_purchase, renting_available, renting_km_year,
                renting_12m, renting_24m, renting_36m, renting_48m, renting_60m,
                created_at, updated_at
         FROM moveadvisor_marketplace_vo_offers ${where}
         ORDER BY portal_score DESC NULLS LAST, updated_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_marketplace_vo_offers ${where}`, values),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_vo_failed', detail: (err as Error).message });
  }
});

marketplaceRouter.get('/marketplace/vo/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM moveadvisor_marketplace_vo_offers WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'offer_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'offer_get_failed', detail: (err as Error).message });
  }
});

// ── Create single vehicle ─────────────────────────────────────────────────────

const voCreateSchema = z.object({
  title:                 z.string().min(1),
  brand:                 z.string().min(1),
  model:                 z.string().min(1),
  year:                  z.number().int().min(1990).max(2035),
  price:                 z.number().min(0).default(0),
  mileage:               z.number().int().min(0).default(0),
  fuel:                  z.string().default(''),
  power:                 z.string().default(''),
  displacement:          z.number().int().min(0).default(0),
  color:                 z.string().default(''),
  location:              z.string().default(''),
  seller:                z.string().default(''),
  description:           z.string().default(''),
  image_url:             z.string().default(''),
  source_url:            z.string().default(''),
  warranty_months:       z.number().int().min(0).default(0),
  has_guarantee_seal:    z.boolean().default(false),
  portal_score:          z.number().int().min(0).max(100).default(80),
  is_active:             z.boolean().default(true),
  available_for_purchase: z.boolean().default(true),
  renting_available:     z.boolean().default(false),
  renting_km_year:       z.number().int().min(0).default(15000),
  renting_12m:           z.number().min(0).nullable().default(null),
  renting_24m:           z.number().min(0).nullable().default(null),
  renting_36m:           z.number().min(0).nullable().default(null),
  renting_48m:           z.number().min(0).nullable().default(null),
  renting_60m:           z.number().min(0).nullable().default(null),
  seller_type:           z.enum(['professional', 'particular']).nullable().default(null),
  image_urls:            z.array(z.string()).max(10).default([]),
});

marketplaceRouter.post('/marketplace/vo', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = voCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const d = parsed.data;
  const id = `erp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const result = await query(
      `INSERT INTO moveadvisor_marketplace_vo_offers
         (id, title, brand, model, year, price, mileage, fuel, power, displacement,
          color, location, seller, seller_type, description, image_url, image_urls, source_url,
          warranty_months, has_guarantee_seal, portal_score, is_active, portal,
          available_for_purchase, renting_available, renting_km_year,
          renting_12m, renting_24m, renting_36m, renting_48m, renting_60m,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'manual',
               $22,$23,$24,$25,$26,$27,$28,$29,$30,NOW(),NOW())
       RETURNING *`,
      [id, d.title, d.brand, d.model, d.year, d.price, d.mileage, d.fuel, d.power,
       d.displacement, d.color, d.location, d.seller, d.seller_type,
       d.description, d.image_urls?.[0] ?? d.image_url, JSON.stringify(d.image_urls ?? []),
       d.source_url, d.warranty_months, d.has_guarantee_seal, d.portal_score, d.is_active,
       d.available_for_purchase, d.renting_available, d.renting_km_year,
       d.renting_12m, d.renting_24m, d.renting_36m, d.renting_48m, d.renting_60m]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'offer_create_failed', detail: (err as Error).message });
  }
});

// ── Bulk create from CSV/Excel import ────────────────────────────────────────

const voBulkRowSchema = z.object({
  title:        z.string().min(1),
  brand:        z.string().min(1),
  model:        z.string().min(1),
  year:         z.coerce.number().int().min(1990).max(2035),
  price:        z.coerce.number().positive(),
  mileage:      z.coerce.number().int().min(0).default(0),
  fuel:         z.string().default(''),
  power:        z.string().default(''),
  color:        z.string().default(''),
  location:     z.string().default(''),
  seller:       z.string().default(''),
  image_url:    z.string().default(''),
  source_url:   z.string().default(''),
  description:  z.string().default(''),
});

marketplaceRouter.post('/marketplace/vo/bulk', requireRole(['admin', 'operations']), async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ ok: false, error: 'no_rows' });
    return;
  }
  if (rows.length > 500) {
    res.status(400).json({ ok: false, error: 'too_many_rows', detail: 'Max 500 rows per import' });
    return;
  }

  const results = { inserted: 0, errors: 0, errorDetails: [] as string[] };

  for (const raw of rows) {
    const parsed = voBulkRowSchema.safeParse(raw);
    if (!parsed.success) {
      results.errors++;
      results.errorDetails.push(`Fila inválida: ${JSON.stringify(raw).slice(0, 80)}`);
      continue;
    }
    const d = parsed.data;
    const id = `erp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await query(
        `INSERT INTO moveadvisor_marketplace_vo_offers
           (id, title, brand, model, year, price, mileage, fuel, power, color,
            location, seller, image_url, source_url, description,
            portal_score, warranty_months, has_guarantee_seal, is_active, portal,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,80,0,false,true,'manual',NOW(),NOW())`,
        [id, d.title, d.brand, d.model, d.year, d.price, d.mileage, d.fuel,
         d.power, d.color, d.location, d.seller, d.image_url, d.source_url, d.description]
      );
      results.inserted++;
    } catch {
      results.errors++;
    }
  }

  res.json({ ok: true, data: results });
});

// ── Update vehicle ────────────────────────────────────────────────────────────

const voUpdateSchema = z.object({
  title:                 z.string().min(1).optional(),
  brand:                 z.string().min(1).optional(),
  model:                 z.string().min(1).optional(),
  year:                  z.number().int().min(1990).max(2035).optional(),
  price:                 z.number().min(0).optional(),
  mileage:               z.number().int().min(0).optional(),
  fuel:                  z.string().optional(),
  power:                 z.string().optional(),
  displacement:          z.number().int().min(0).optional(),
  color:                 z.string().optional(),
  location:              z.string().optional(),
  seller:                z.string().optional(),
  description:           z.string().optional(),
  image_url:             z.string().optional(),
  source_url:            z.string().optional(),
  warranty_months:       z.number().int().min(0).optional(),
  has_guarantee_seal:    z.boolean().optional(),
  portal_score:          z.number().int().min(0).max(100).optional(),
  is_active:             z.boolean().optional(),
  available_for_purchase: z.boolean().optional(),
  renting_available:     z.boolean().optional(),
  renting_km_year:       z.number().int().min(0).optional(),
  renting_12m:           z.number().min(0).nullable().optional(),
  renting_24m:           z.number().min(0).nullable().optional(),
  renting_36m:           z.number().min(0).nullable().optional(),
  renting_48m:           z.number().min(0).nullable().optional(),
  renting_60m:           z.number().min(0).nullable().optional(),
  seller_type:           z.enum(['professional', 'particular']).nullable().optional(),
  image_urls:            z.array(z.string()).max(10).optional(),
});

marketplaceRouter.patch('/marketplace/vo/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = voUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const fields = parsed.data;
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  // Serialize image_urls array to JSON string; also sync image_url to first element
  const dbFields: Record<string, unknown> = { ...fields };
  if (Array.isArray(dbFields.image_urls)) {
    const arr = dbFields.image_urls as string[];
    dbFields.image_url = arr[0] ?? null;
    dbFields.image_urls = JSON.stringify(arr);
  }

  const dbKeys = Object.keys(dbFields);
  const setClauses = dbKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values     = [...dbKeys.map((k) => dbFields[k]), req.params.id];

  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, title, brand, model, year, price, mileage, fuel, color, displacement, power, location, seller, seller_type, image_url, source_url, description, portal_score, warranty_months, has_guarantee_seal, is_active, available_for_purchase, renting_available, renting_km_year, renting_12m, renting_24m, renting_36m, renting_48m, renting_60m, CASE WHEN image_urls IS NOT NULL AND image_urls <> '' THEN image_urls::json ELSE '[]'::json END AS image_urls, created_at, updated_at`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'offer_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'offer_update_failed', detail: (err as Error).message });
  }
});

// ── Hard delete vehicle ───────────────────────────────────────────────────────

marketplaceRouter.delete('/marketplace/vo/:id', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM moveadvisor_marketplace_vo_offers WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'offer_not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'offer_delete_failed', detail: (err as Error).message });
  }
});

// ── Brands list ───────────────────────────────────────────────────────────────

marketplaceRouter.get('/marketplace/brands', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT brand FROM moveadvisor_marketplace_vo_offers
       WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand`
    );
    res.json({ ok: true, data: result.rows.map((r) => (r as { brand: string }).brand) });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'brands_failed', detail: (err as Error).message });
  }
});
