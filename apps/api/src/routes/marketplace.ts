import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

export const marketplaceRouter = Router();

// Downloads an external image URL and uploads it to Supabase Storage.
// Returns the public Supabase URL, or the original URL if upload fails/not configured.
async function mirrorImageToSupabase(imageUrl: string, offerId: string): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;
  // Already in Supabase — no need to re-upload
  if (imageUrl.includes('.supabase.co')) return imageUrl;

  const supabaseUrl = config.SUPABASE_URL;
  const serviceKey  = config.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return imageUrl;

  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return imageUrl;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return imageUrl;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 500) return imageUrl;

    const ext  = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const path = `erp-uploads/${offerId}/img-0.${ext}`;
    const bucket = 'vehicle-files';

    const upload = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!upload.ok) return imageUrl;

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  } catch {
    return imageUrl;
  }
}

// ── Offers from portal scraping ───────────────────────────────────────────────

marketplaceRouter.get('/marketplace/offers', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q      = String(req.query.q      || '').trim();
  const portal = String(req.query.portal || '').trim();
  const sellerType = String(req.query.seller_type || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const s = (k: string) => String(req.query[k] || '').trim();

  const conditions: string[] = [];
  const values: unknown[]    = [];

  // Helpers de filtro. '__empty__' = sin dato.
  const addTextCI = (val: string, col: string) => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(val.toLowerCase()); conditions.push(`lower(COALESCE(${col}, '')) = $${values.length}`);
  };
  const addNum = (val: string, col: string, op: '<=' | '>=' | '=') => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`${col} IS NULL`); return; }
    values.push(Number(val)); conditions.push(`${col} ${op} $${values.length}`);
  };
  // varchar numérico (displacement, co2): vacío = COALESCE ''; comparación con cast seguro
  const addVarcharNum = (val: string, col: string, op: '<=' | '>=') => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(Number(val));
    conditions.push(`(CASE WHEN ${col} ~ '^[0-9]+$' THEN ${col}::int ELSE NULL END) ${op} $${values.length}`);
  };
  const addExactStr = (val: string, col: string) => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(val); conditions.push(`${col} = $${values.length}`);
  };

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(title,'')) LIKE $${values.length} OR lower(brand) LIKE $${values.length} OR lower(model) LIKE $${values.length})`);
  }
  const bm = s('bm');
  if (bm) {
    values.push(`%${bm.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(brand,'')) LIKE $${values.length} OR lower(COALESCE(model,'')) LIKE $${values.length})`);
  }
  const addLike = (val: string, col: string) => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(`%${val.toLowerCase()}%`); conditions.push(`lower(COALESCE(${col}, '')) LIKE $${values.length}`);
  };
  addLike(s('brand'), 'brand');
  addLike(s('model'), 'model');
  addLike(s('version'), 'version');
  addExactStr(portal, 'portal');
  addExactStr(sellerType, 'seller_type');
  addNum(s('year'), 'year', '=');
  addTextCI(s('fuel'), 'fuel');
  addNum(s('price_max'), 'price', '<=');
  addNum(s('km_max'), 'mileage', '<=');
  addTextCI(s('color'), 'color');
  addTextCI(s('body_type'), 'body_type');
  addTextCI(s('transmission'), 'transmission');
  addNum(s('cv_min'), 'power_cv', '>=');
  addNum(s('doors'), 'doors', '=');
  addNum(s('seats'), 'seats', '=');
  addVarcharNum(s('cc_min'), 'displacement', '>=');
  addVarcharNum(s('co2_max'), 'co2', '<=');
  addExactStr(s('etiq'), 'environmental_label');
  addTextCI(s('traction'), 'traction');
  addNum(s('cons_max'), 'consumption', '<=');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, portal, title, brand, model, version, year, mileage, price, fuel,
                COALESCE(body_type, '') AS body_type, color, doors, seats, power_cv, power_kw, traction,
                COALESCE(environmental_label, '') AS environmental_label,
                COALESCE(displacement, '') AS displacement,
                consumption,
                image_url, url, seller_type, transmission,
                COALESCE(co2::text, '') AS co2,
                warranty_months,
                COALESCE(dealer_name, '') AS dealer_name,
                COALESCE(province, COALESCE(location, '')) AS location,
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

// Valores distintos para los desplegables de filtro (sobre TODA la BD, no la página).
// OJO: debe ir ANTES de '/marketplace/offers/:id' para que no lo capture como id.
marketplaceRouter.get('/marketplace/offers/filter-options', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const distinct = async (col: string): Promise<string[]> => {
      const r = await query<{ v: string }>(
        `SELECT DISTINCT ${col} AS v FROM moveadvisor_market_offers WHERE COALESCE(${col}::text, '') <> '' ORDER BY 1`
      );
      return r.rows.map((x) => x.v).filter(Boolean);
    };
    const [colors, bodyTypes, transmissions, tractions, fuels, portals] = await Promise.all([
      distinct('color'), distinct('body_type'), distinct('transmission'),
      distinct('traction'), distinct('fuel'), distinct('portal'),
    ]);
    const yearsRes = await query<{ v: number }>(
      `SELECT DISTINCT year AS v FROM moveadvisor_market_offers WHERE year IS NOT NULL ORDER BY year DESC`
    );
    res.json({ ok: true, data: { colors, bodyTypes, transmissions, tractions, fuels, portals, years: yearsRes.rows.map((x) => x.v) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_filter_options_failed', detail: (err as Error).message });
  }
});

// ── Single portal offer (ficha completa, todos los campos editables) ──────────

marketplaceRouter.get('/marketplace/offers/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, portal, title, brand, model, version, year, mileage, price,
              monthly_price, finance_price, fuel, transmission, color,
              COALESCE(body_type, '') AS body_type,
              COALESCE(environmental_label, '') AS environmental_label,
              doors, seats, power_cv, power_kw, traction,
              COALESCE(displacement, '') AS displacement,
              COALESCE(co2::text, '') AS co2, consumption,
              warranty_months, COALESCE(next_itv, '') AS next_itv,
              COALESCE(dealer_name, '') AS dealer_name, seller_type,
              COALESCE(listing_type, '') AS listing_type,
              COALESCE(province, '') AS province, COALESCE(city, '') AS city,
              COALESCE(location, '') AS location,
              image_url,
              CASE WHEN images IS NOT NULL AND images <> '' AND images <> '[]' THEN images::json ELSE '[]'::json END AS images,
              url, is_active,
              scraped_at, updated_at, last_seen_at
       FROM moveadvisor_market_offers
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'offer_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_offer_detail_failed', detail: (err as Error).message });
  }
});

// Guardar cambios manuales de una oferta de portal (rellenar/corregir datos).
// Escribe DIRECTO en moveadvisor_market_offers (la misma tabla que lee el GET) para
// evitar resoluciones de tabla ambiguas. Seguro: solo columnas reales, sin protegidas,
// y nunca pone NULL en columnas NOT NULL (omite el campo -> no rompe el guardado).
marketplaceRouter.patch('/marketplace/offers/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ ok: false, error: 'missing_id' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const values = (body.values && typeof body.values === 'object') ? body.values : body;

  try {
    const cols = await query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'moveadvisor_market_offers'`
    );
    const tableColumns = new Set(cols.rows.map((r) => r.column_name));
    const notNull = new Set(cols.rows.filter((r) => r.is_nullable === 'NO').map((r) => r.column_name));
    const protectedCols = new Set(['id', 'first_seen_at', 'scraped_at', 'created_at']);

    const entries = Object.entries(values)
      .filter(([col]) => tableColumns.has(col) && !protectedCols.has(col))
      .filter(([, v]) => typeof v !== 'object' || v === null)
      .map(([col, v]) => [col, v === '' ? null : v] as [string, unknown])
      .filter(([col, v]) => !(v === null && notNull.has(col)));

    // Nada editable → confirmar que la oferta existe
    if (!entries.length) {
      const cur = await query(`SELECT id FROM moveadvisor_market_offers WHERE id = $1 LIMIT 1`, [id]);
      if (!cur.rows.length) { res.status(404).json({ ok: false, error: 'offer_not_found' }); return; }
      res.json({ ok: true, data: cur.rows[0] });
      return;
    }

    const params: unknown[] = [];
    const setSql = entries.map(([col, v], i) => { params.push(v); return `"${col}" = $${i + 1}`; });
    setSql.push('updated_at = NOW()');
    params.push(id);

    const result = await query(
      `UPDATE moveadvisor_market_offers SET ${setSql.join(', ')} WHERE id = $${params.length} RETURNING id`,
      params
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'offer_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_offer_update_failed', detail: (err as Error).message });
  }
});

// ── Portal stats (informe de cobertura, en vivo) ──────────────────────────────

marketplaceRouter.get('/marketplace/portal-stats', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const [market, vo] = await Promise.all([
      query(`SELECT portal,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_active)::int AS active,
                    COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '1 day')::int AS updated_last_day
             FROM moveadvisor_market_offers
             GROUP BY portal
             HAVING COUNT(*) > 20
             ORDER BY total DESC`),
      query(`SELECT portal,
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE is_active)::int AS active,
                    COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 day')::int AS updated_last_day
             FROM moveadvisor_marketplace_vo_offers
             GROUP BY portal
             ORDER BY total DESC`),
    ]);
    res.json({
      ok: true,
      data: {
        market: market.rows,
        vo: vo.rows,
        marketTotal: (market.rows as { total: number }[]).reduce((a, r) => a + r.total, 0),
        voTotal: (vo.rows as { total: number }[]).reduce((a, r) => a + r.total, 0),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_portal_stats_failed', detail: (err as Error).message });
  }
});

// ── Carswise VO Marketplace ───────────────────────────────────────────────────

marketplaceRouter.get('/marketplace/vo', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q                   = String(req.query.q        || '').trim();
  const brand               = String(req.query.brand    || '').trim();
  const isActive            = req.query.is_active;
  const availableForPurchase = req.query.available_for_purchase;
  const rentingAvailable    = req.query.renting_available;
  const sellerType          = String(req.query.seller_type || '').trim();
  const page                = Math.max(1, Number(req.query.page) || 1);
  const limit               = Math.min(500, Math.max(10, Number(req.query.limit) || 50));
  const offset              = (page - 1) * limit;

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
  if (availableForPurchase === 'true') {
    conditions.push(`available_for_purchase = TRUE`);
  } else if (availableForPurchase === 'false') {
    conditions.push(`available_for_purchase = FALSE`);
  }
  if (rentingAvailable === 'true') {
    conditions.push(`renting_available = TRUE`);
  } else if (rentingAvailable === 'false') {
    conditions.push(`renting_available = FALSE`);
  }
  if (sellerType) {
    const types = sellerType.split(',').map((t: string) => t.trim()).filter(Boolean);
    if (types.length === 1) {
      values.push(types[0]);
      conditions.push(`seller_type = $${values.length}`);
    } else if (types.length > 1) {
      types.forEach((t: string) => values.push(t));
      const placeholders = types.map((_: string, i: number) => `$${values.length - types.length + i + 1}`).join(', ');
      conditions.push(`seller_type IN (${placeholders})`);
    }
  }

  // Filtros de columna server-side (mismo criterio que ofertas de portales). '__empty__' = sin dato.
  const s = (k: string) => String(req.query[k] || '').trim();
  const addTextCI = (val: string, col: string) => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(val.toLowerCase()); conditions.push(`lower(COALESCE(${col}, '')) = $${values.length}`);
  };
  const addLike = (val: string, col: string) => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`COALESCE(${col}, '') = ''`); return; }
    values.push(`%${val.toLowerCase()}%`); conditions.push(`lower(COALESCE(${col}, '')) LIKE $${values.length}`);
  };
  const addNum = (val: string, col: string, op: '<=' | '>=' | '=') => {
    if (!val) return;
    if (val === '__empty__') { conditions.push(`${col} IS NULL`); return; }
    values.push(Number(val)); conditions.push(`${col} ${op} $${values.length}`);
  };
  addLike(s('model'), 'model');
  addLike(s('version'), 'version');
  addTextCI(s('color'), 'color');
  addTextCI(s('fuel'), 'fuel');
  addTextCI(s('transmission'), 'transmission');
  addLike(s('power'), 'power');
  addLike(s('provincia'), 'provincia');
  addNum(s('year'), 'year', '=');
  addNum(s('price_max'), 'price', '<=');
  addNum(s('km_max'), 'mileage', '<=');
  addNum(s('cc_min'), 'displacement', '>=');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT o.id, o.title, o.brand, o.model, o.version, o.transmission, o.year, o.price, o.sale_price, o.mileage, o.fuel,
                o.color, o.displacement, o.power, o.location, o.internal_location, o.seller, o.seller_type, o.image_url,
                CASE WHEN o.image_urls IS NOT NULL AND o.image_urls <> '' THEN o.image_urls::json ELSE '[]'::json END AS image_urls,
                o.source_url, o.description, o.portal_score, o.warranty_months, o.has_guarantee_seal, o.is_active,
                o.available_for_purchase, o.renting_available, o.renting_km_year,
                o.renting_12m, o.renting_24m, o.renting_36m, o.renting_48m, o.renting_60m,
                o.renting_prices_json,
                o.has_stock_management,
                COALESCE((SELECT COUNT(*)::int FROM moveadvisor_marketplace_vo_units u WHERE u.offer_id = o.id), 0) AS total_units,
                COALESCE((SELECT COUNT(*)::int FROM moveadvisor_marketplace_vo_units u WHERE u.offer_id = o.id AND u.status = 'available'), 0) AS units_available,
                (SELECT ARRAY_AGG(DISTINCT u.color) FROM moveadvisor_marketplace_vo_units u WHERE u.offer_id = o.id AND u.status = 'available' AND u.color IS NOT NULL) AS available_colors,
                o.created_at, o.updated_at
         FROM moveadvisor_marketplace_vo_offers o ${where}
         ORDER BY o.portal_score DESC NULLS LAST, o.updated_at DESC
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

// Valores distintos para los desplegables de filtro VO (toda la BD). ANTES de '/marketplace/vo/:id'.
marketplaceRouter.get('/marketplace/vo/filter-options', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    const distinct = async (col: string): Promise<string[]> => {
      const r = await query<{ v: string }>(
        `SELECT DISTINCT ${col} AS v FROM moveadvisor_marketplace_vo_offers WHERE COALESCE(${col}::text, '') <> '' ORDER BY 1`
      );
      return r.rows.map((x) => x.v).filter(Boolean);
    };
    const [colors, fuels, transmissions, sellers, provincias, portals] = await Promise.all([
      distinct('color'), distinct('fuel'), distinct('transmission'), distinct('seller'), distinct('provincia'), distinct('portal'),
    ]);
    const yearsRes = await query<{ v: number }>(
      `SELECT DISTINCT year AS v FROM moveadvisor_marketplace_vo_offers WHERE year IS NOT NULL ORDER BY year DESC`
    );
    res.json({ ok: true, data: { colors, fuels, transmissions, sellers, provincias, portals, years: yearsRes.rows.map((x) => x.v) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'marketplace_vo_filter_options_failed', detail: (err as Error).message });
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
  renting_prices_json:   z.unknown().nullable().default(null),
  seller_type:           z.enum(['professional', 'particular', 'concesionario', 'importador']).nullable().default(null),
  image_urls:            z.array(z.string()).max(10).default([]),
  carswise_fee:          z.number().min(0).nullable().default(null),
});

marketplaceRouter.post('/marketplace/vo', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = voCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const d = parsed.data;
  const id = `erp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const rentingPricesJson = d.renting_prices_json ? JSON.stringify(d.renting_prices_json) : null;

  try {
    const result = await query(
      `INSERT INTO moveadvisor_marketplace_vo_offers
         (id, title, brand, model, year, price, mileage, fuel, power, displacement,
          color, location, seller, seller_type, description, image_url, image_urls, source_url,
          warranty_months, has_guarantee_seal, portal_score, is_active, portal,
          available_for_purchase, renting_available, renting_km_year,
          renting_12m, renting_24m, renting_36m, renting_48m, renting_60m, renting_prices_json,
          carswise_fee, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'manual',
               $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW(),NOW())
       RETURNING *`,
      [id, d.title, d.brand, d.model, d.year, d.price, d.mileage, d.fuel, d.power,
       d.displacement, d.color, d.location, d.seller, d.seller_type,
       d.description, d.image_urls?.[0] ?? d.image_url, JSON.stringify(d.image_urls ?? []),
       d.source_url, d.warranty_months, d.has_guarantee_seal, d.portal_score, d.is_active,
       d.available_for_purchase, d.renting_available, d.renting_km_year,
       d.renting_12m, d.renting_24m, d.renting_36m, d.renting_48m, d.renting_60m, rentingPricesJson,
       d.carswise_fee]
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
  year:                  z.number().int().min(1900).max(2100).nullable().optional(),
  price:                 z.number().min(0).nullable().optional(),
  mileage:               z.number().int().min(0).nullable().optional(),
  fuel:                  z.string().nullable().optional(),
  power:                 z.string().nullable().optional(),
  displacement:          z.number().int().min(0).nullable().optional(),
  color:                 z.string().nullable().optional(),
  location:              z.string().nullable().optional(),
  seller:                z.string().nullable().optional(),
  description:           z.string().nullable().optional(),
  image_url:             z.string().nullable().optional(),
  source_url:            z.string().nullable().optional(),
  warranty_months:       z.number().int().min(0).nullable().optional(),
  has_guarantee_seal:    z.boolean().optional(),
  portal_score:          z.number().int().min(0).max(100).nullable().optional(),
  is_active:             z.boolean().optional(),
  available_for_purchase: z.boolean().optional(),
  renting_available:     z.boolean().optional(),
  renting_km_year:       z.number().int().min(0).nullable().optional(),
  renting_12m:           z.number().min(0).nullable().optional(),
  renting_24m:           z.number().min(0).nullable().optional(),
  renting_36m:           z.number().min(0).nullable().optional(),
  renting_48m:           z.number().min(0).nullable().optional(),
  renting_60m:           z.number().min(0).nullable().optional(),
  renting_prices_json:   z.unknown().nullable().optional(),
  seller_type:           z.string().nullable().optional().transform((v: string | null | undefined) => {
    if (v === 'professional' || v === 'particular' || v === 'concesionario' || v === 'importador') return v;
    return null;
  }),
  image_urls:            z.array(z.string()).max(20).optional(),
  sale_price:            z.number().min(0).nullable().optional(),
  internal_location:     z.string().nullable().optional(),
  version:               z.string().nullable().optional(),
  transmission:          z.string().nullable().optional(),
  carswise_fee:          z.number().min(0).nullable().optional(),
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
  if (dbFields.renting_prices_json !== undefined && dbFields.renting_prices_json !== null && typeof dbFields.renting_prices_json === 'object') {
    dbFields.renting_prices_json = JSON.stringify(dbFields.renting_prices_json);
  }

  // Auto-mirror external image URLs to Supabase Storage
  if (typeof dbFields.image_url === 'string' && dbFields.image_url) {
    const mirrored = await mirrorImageToSupabase(dbFields.image_url, req.params.id);
    if (mirrored !== dbFields.image_url) {
      dbFields.image_url  = mirrored;
      dbFields.image_urls = JSON.stringify([mirrored]);
    }
  }

  const dbKeys = Object.keys(dbFields);
  const setClauses = dbKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values     = [...dbKeys.map((k) => dbFields[k]), req.params.id];

  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, title, brand, model, version, transmission, year, price, sale_price, mileage, fuel, color, displacement, power, location, internal_location, seller, seller_type, image_url, source_url, description, portal_score, warranty_months, has_guarantee_seal, is_active, available_for_purchase, renting_available, renting_km_year, renting_12m, renting_24m, renting_36m, renting_48m, renting_60m, renting_prices_json, carswise_fee, CASE WHEN image_urls IS NOT NULL AND image_urls <> '' THEN image_urls::json ELSE '[]'::json END AS image_urls, created_at, updated_at`,
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

// ── Bulk activate / deactivate ───────────────────────────────────────────────

marketplaceRouter.post('/marketplace/vo/bulk', requireRole(['admin', 'operations']), async (req, res) => {
  const { action, ids } = req.body ?? {};
  if (!['activate', 'deactivate'].includes(action) || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ ok: false, error: 'invalid_params' });
    return;
  }
  const safeIds = ids.map(String);
  const placeholders = safeIds.map((_, i) => `$${i + 2}`).join(', ');
  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_offers
       SET is_active = $1, updated_at = NOW()
       WHERE id IN (${placeholders})
       RETURNING id`,
      [action === 'activate', ...safeIds]
    );
    res.json({ ok: true, updated: result.rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'bulk_action_failed', detail: (err as Error).message });
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

// ── Units CRUD ────────────────────────────────────────────────────────────────

marketplaceRouter.get('/marketplace/vo/:id/units', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM moveadvisor_marketplace_vo_units WHERE offer_id = $1 ORDER BY status, color, mileage`,
      [req.params.id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'units_list_failed', detail: (err as Error).message });
  }
});

const unitCreateSchema = z.object({
  color:   z.string().default(''),
  mileage: z.coerce.number().int().min(0).default(0),
  notes:   z.string().optional(),
});

marketplaceRouter.post('/marketplace/vo/:id/units', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = unitCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d  = parsed.data;
  const id = `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await query(
      `INSERT INTO moveadvisor_marketplace_vo_units (id, offer_id, color, mileage, notes, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'available',NOW(),NOW())`,
      [id, req.params.id, d.color, d.mileage, d.notes ?? null]
    );
    await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET has_stock_management = TRUE, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    const result = await query(`SELECT * FROM moveadvisor_marketplace_vo_units WHERE id = $1`, [id]);
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'unit_create_failed', detail: (err as Error).message });
  }
});

const UNIT_STATUSES = ['available', 'reserved', 'rented', 'returned'] as const;

marketplaceRouter.patch('/marketplace/vo/units/:unitId', requireRole(['admin', 'operations']), async (req, res) => {
  const schema = z.object({
    color:   z.string().optional(),
    mileage: z.coerce.number().int().min(0).optional(),
    status:  z.enum(UNIT_STATUSES).optional(),
    notes:   z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const setParts: string[] = [];
  const vals: unknown[]    = [];
  if (d.color   !== undefined) { vals.push(d.color);   setParts.push(`color = $${vals.length}`); }
  if (d.mileage !== undefined) { vals.push(d.mileage); setParts.push(`mileage = $${vals.length}`); }
  if (d.notes   !== undefined) { vals.push(d.notes);   setParts.push(`notes = $${vals.length}`); }
  if (d.status  !== undefined) {
    vals.push(d.status); setParts.push(`status = $${vals.length}`);
    if (d.status === 'rented')   { setParts.push('rented_at = NOW()');   }
    if (d.status === 'returned') { setParts.push('returned_at = NOW()'); }
  }
  if (!setParts.length) { res.status(400).json({ ok: false, error: 'no_fields' }); return; }
  vals.push(req.params.unitId);
  try {
    const result = await query(
      `UPDATE moveadvisor_marketplace_vo_units SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'unit_not_found' }); return; }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'unit_update_failed', detail: (err as Error).message });
  }
});

marketplaceRouter.delete('/marketplace/vo/units/:unitId', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM moveadvisor_marketplace_vo_units WHERE id = $1 RETURNING id`, [req.params.unitId]
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'unit_not_found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'unit_delete_failed', detail: (err as Error).message });
  }
});

// ── Bulk import with units (one row per unit, grouped by brand+model+year+price) ──

const voBulkUnitRowSchema = z.object({
  title:                 z.string().min(1),
  brand:                 z.string().min(1),
  model:                 z.string().min(1),
  year:                  z.coerce.number().int().min(1990).max(2035),
  price:                 z.coerce.number().min(0).default(0),
  fuel:                  z.string().default(''),
  power:                 z.string().default(''),
  location:              z.string().default(''),
  seller:                z.string().default(''),
  seller_type:           z.string().default(''),
  image_urls:            z.string().default(''),
  source_url:            z.string().default(''),
  description:           z.string().default(''),
  available_for_purchase: z.coerce.number().default(1),
  renting_available:     z.coerce.number().default(0),
  renting_km_year:       z.coerce.number().int().default(15000),
  renting_12m:           z.coerce.number().nullable().default(null),
  renting_24m:           z.coerce.number().nullable().default(null),
  renting_36m:           z.coerce.number().nullable().default(null),
  renting_48m:           z.coerce.number().nullable().default(null),
  renting_60m:           z.coerce.number().nullable().default(null),
  unit_color:            z.string().default(''),
  unit_mileage:          z.coerce.number().int().min(0).default(0),
});

marketplaceRouter.post('/marketplace/vo/bulk-with-units', requireRole(['admin', 'operations']), async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ ok: false, error: 'no_rows' });
    return;
  }
  if (rows.length > 2000) {
    res.status(400).json({ ok: false, error: 'too_many_rows', detail: 'Max 2000 rows' });
    return;
  }

  const results = { offers_created: 0, offers_updated: 0, units_added: 0, errors: 0, errorDetails: [] as string[] };

  // Group rows by brand+model+year+price
  const groups = new Map<string, typeof rows>();
  for (const raw of rows) {
    const d = voBulkUnitRowSchema.safeParse(raw);
    if (!d.success) { results.errors++; results.errorDetails.push(`Fila inválida: ${JSON.stringify(raw).slice(0, 80)}`); continue; }
    const key = `${d.data.brand.toLowerCase()}|${d.data.model.toLowerCase()}|${d.data.year}|${d.data.price}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d.data);
  }

  for (const groupRows of groups.values()) {
    const first = groupRows[0] as ReturnType<typeof voBulkUnitRowSchema.parse>;
    try {
      // Upsert offer — find existing by brand+model+year+price
      const existing = await query(
        `SELECT id FROM moveadvisor_marketplace_vo_offers WHERE lower(brand)=$1 AND lower(model)=$2 AND year=$3 AND price=$4 LIMIT 1`,
        [first.brand.toLowerCase(), first.model.toLowerCase(), first.year, first.price]
      );

      let offerId: string;
      const imageUrlsArr = first.image_urls ? first.image_urls.split('|').map((s: string) => s.trim()).filter(Boolean) : [];
      const sellerTypeVal = ['professional','particular'].includes(first.seller_type) ? first.seller_type : null;

      if (existing.rows.length) {
        offerId = existing.rows[0].id;
        await query(
          `UPDATE moveadvisor_marketplace_vo_offers SET
             title=$1, fuel=$2, power=$3, location=$4, seller=$5, seller_type=$6,
             image_url=$7, image_urls=$8, source_url=$9, description=$10,
             available_for_purchase=$11, renting_available=$12, renting_km_year=$13,
             renting_12m=$14, renting_24m=$15, renting_36m=$16, renting_48m=$17, renting_60m=$18,
             has_stock_management=TRUE, updated_at=NOW()
           WHERE id=$19`,
          [first.title, first.fuel, first.power, first.location, first.seller, sellerTypeVal,
           imageUrlsArr[0] ?? null, JSON.stringify(imageUrlsArr), first.source_url, first.description,
           first.available_for_purchase !== 0, first.renting_available !== 0, first.renting_km_year,
           first.renting_12m || null, first.renting_24m || null, first.renting_36m || null,
           first.renting_48m || null, first.renting_60m || null, offerId]
        );
        results.offers_updated++;
      } else {
        offerId = `erp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await query(
          `INSERT INTO moveadvisor_marketplace_vo_offers
             (id, title, brand, model, year, price, fuel, power, location, seller, seller_type,
              image_url, image_urls, source_url, description,
              available_for_purchase, renting_available, renting_km_year,
              renting_12m, renting_24m, renting_36m, renting_48m, renting_60m,
              portal_score, warranty_months, has_guarantee_seal, is_active, portal,
              has_stock_management, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,80,0,false,true,'manual',TRUE,NOW(),NOW())`,
          [offerId, first.title, first.brand, first.model, first.year, first.price,
           first.fuel, first.power, first.location, first.seller, sellerTypeVal,
           imageUrlsArr[0] ?? null, JSON.stringify(imageUrlsArr), first.source_url, first.description,
           first.available_for_purchase !== 0, first.renting_available !== 0, first.renting_km_year,
           first.renting_12m || null, first.renting_24m || null, first.renting_36m || null,
           first.renting_48m || null, first.renting_60m || null]
        );
        results.offers_created++;
      }

      // Add units — skip if same color+mileage already exists as available
      for (const row of groupRows) {
        const r = row as ReturnType<typeof voBulkUnitRowSchema.parse>;
        const dup = await query(
          `SELECT id FROM moveadvisor_marketplace_vo_units WHERE offer_id=$1 AND color=$2 AND mileage=$3 AND status='available' LIMIT 1`,
          [offerId, r.unit_color, r.unit_mileage]
        );
        if (dup.rows.length) continue;
        const unitId = `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await query(
          `INSERT INTO moveadvisor_marketplace_vo_units (id, offer_id, color, mileage, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'available',NOW(),NOW())`,
          [unitId, offerId, r.unit_color, r.unit_mileage]
        );
        results.units_added++;
      }
    } catch (err) {
      results.errors++;
      results.errorDetails.push((err as Error).message.slice(0, 120));
    }
  }

  res.json({ ok: true, data: results });
});

// ── Particulares CarsWise (user garage vehicles published for sale) ──────────

marketplaceRouter.get('/marketplace/particulares', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q       = String(req.query.q    || '').trim();
  const page    = Math.max(1, Number(req.query.page)  || 1);
  const limit   = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset  = (page - 1) * limit;

  const conditions: string[] = [
    "v.price IS NOT NULL",
    "v.price != '' AND v.price != '0'",
    // Show vehicles that are listed in vehicle_states OR have an active marketplace record
    "(COALESCE(vs.is_listed, false) = true OR EXISTS (SELECT 1 FROM moveadvisor_marketplace_vo_offers mp WHERE mp.id = 'idcar-' || v.id::text AND mp.is_active = TRUE))",
    // Exclude vehicles explicitly deactivated in marketplace
    "NOT EXISTS (SELECT 1 FROM moveadvisor_marketplace_vo_offers mp WHERE mp.id = 'idcar-' || v.id::text AND mp.is_active = FALSE)",
  ];
  const values: unknown[]    = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(v.title,'')) LIKE $${values.length} OR lower(COALESCE(v.brand,'')) LIKE $${values.length} OR lower(COALESCE(v.model,'')) LIKE $${values.length})`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT v.id, v.user_email, v.title, v.brand, v.model, v.version,
                v.year, v.mileage, v.fuel, v.color, v.price,
                v.cv, v.transmission_type, v.vehicle_location, v.plate,
                v.notes, vs.listing_url, v.updated_at,
                COALESCE(u.name || ' ' || COALESCE(u.apellidos, ''), u.name, v.user_email) AS owner_name,
                u.phone AS owner_phone
         FROM moveadvisor_user_vehicles v
         LEFT JOIN moveadvisor_user_vehicle_states vs ON vs.vehicle_id = v.id
         LEFT JOIN moveadvisor_users u ON lower(u.email) = lower(v.user_email)
         ${where}
         ORDER BY v.updated_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM moveadvisor_user_vehicles v
         LEFT JOIN moveadvisor_user_vehicle_states vs ON vs.vehicle_id = v.id
         ${where}`,
        values
      ),
    ]);
    res.json({ ok: true, data: rows.rows, meta: { total: total.rows[0].total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'particulares_failed', detail: (err as Error).message });
  }
});

// ── Particulares: toggle state ────────────────────────────────────────────────

marketplaceRouter.patch('/marketplace/particulares/:vehicleId/state', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const vehicleId = String(req.params.vehicleId || '').trim();
  const state     = String((req.body as { state?: string })?.state || '').trim();

  if (!vehicleId) return res.status(400).json({ ok: false, error: 'vehicleId required' });
  if (!['active_sale', 'owned'].includes(state)) return res.status(400).json({ ok: false, error: 'state must be active_sale or owned' });

  // Map old state values to the new is_listed model
  const isListed = state === 'active_sale';

  try {
    const vRow = await query(`SELECT user_email, user_id, brand, model, year FROM moveadvisor_user_vehicles WHERE id = $1 LIMIT 1`, [vehicleId]);
    const v    = (vRow as unknown as { rows: { user_email: string; user_id: string | null; brand: string; model: string; year: number }[] }).rows?.[0];
    if (!v) return res.status(404).json({ ok: false, error: 'vehicle_not_found' });

    await query(
      `INSERT INTO moveadvisor_user_vehicle_states (user_email, user_id, vehicle_id, state, is_listed, updated_at)
       VALUES ($1, $2, $3, 'owned', $4, NOW())
       ON CONFLICT (user_email, vehicle_id) DO UPDATE SET is_listed = EXCLUDED.is_listed, updated_at = NOW()`,
      [v.user_email, v.user_id, vehicleId, isListed]
    );

    const offerId = `idcar-${vehicleId}`;

    if (isListed) {
      // On publish: reactivate the marketplace record if it exists
      await query(
        `UPDATE moveadvisor_marketplace_vo_offers SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [offerId]
      ).catch(() => {});
    } else {
      // On unpublish: deactivate the marketplace record and any dealer duplicates
      await query(`UPDATE moveadvisor_marketplace_vo_offers SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [offerId]).catch(() => {});
      if (v.brand && v.model && v.year) {
        await query(
          `UPDATE moveadvisor_marketplace_vo_offers
           SET is_active = FALSE, updated_at = NOW()
           WHERE lower(COALESCE(brand,'')) = lower($1)
             AND lower(COALESCE(model,'')) = lower($2)
             AND year = $3
             AND seller_type != 'particular'
             AND id != $4`,
          [v.brand, v.model, Number(v.year), offerId]
        ).catch(() => {});
      }
    }

    res.json({ ok: true, vehicleId, state, isListed });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db_error', detail: (err as Error).message });
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
