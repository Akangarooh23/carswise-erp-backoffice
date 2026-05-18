import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const marketplaceRouter = Router();

// ── Offers from portal scraping (moveadvisor_market_offers) ─────────────────

marketplaceRouter.get('/marketplace/offers', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q       = String(req.query.q      || '').trim();
  const portal  = String(req.query.portal || '').trim();
  const page    = Math.max(1, Number(req.query.page) || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(title) LIKE $${values.length} OR lower(brand) LIKE $${values.length} OR lower(model) LIKE $${values.length})`);
  }
  if (portal) {
    values.push(portal);
    conditions.push(`portal = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, portal, title, brand, model, year, price, km, fuel_type,
                body_type, color, doors, seats, power_cv, traction, image_url, url,
                is_active, created_at, updated_at
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

// ── Carswise VO Marketplace (moveadvisor_marketplace_vo_offers) ──────────────

marketplaceRouter.get('/marketplace/vo', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q        = String(req.query.q        || '').trim();
  const brand    = String(req.query.brand    || '').trim();
  const isActive = req.query.is_active;
  const page     = Math.max(1, Number(req.query.page) || 1);
  const limit    = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset   = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(title) LIKE $${values.length} OR lower(brand) LIKE $${values.length} OR lower(model) LIKE $${values.length})`);
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
        `SELECT id, title, brand, model, year, price, km, fuel_type,
                body_type, color, doors, seats, power_cv, image_url, images,
                is_active, portal_score, created_at, updated_at
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

const voUpdateSchema = z.object({
  title:       z.string().min(1).optional(),
  price:       z.number().positive().optional(),
  km:          z.number().min(0).optional(),
  year:        z.number().min(1990).max(2030).optional(),
  color:       z.string().optional(),
  body_type:   z.string().optional(),
  fuel_type:   z.string().optional(),
  doors:       z.number().int().min(1).max(6).optional(),
  seats:       z.number().int().min(1).max(9).optional(),
  power_cv:    z.number().int().min(1).optional(),
  traction:    z.string().optional(),
  description: z.string().optional(),
  is_active:   z.boolean().optional(),
  portal_score:z.number().min(0).max(100).optional(),
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

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values     = [...keys.map((k) => fields[k]), req.params.id];

  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
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

marketplaceRouter.delete('/marketplace/vo/:id', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
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

// ── Brands list for filters ──────────────────────────────────────────────────
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
