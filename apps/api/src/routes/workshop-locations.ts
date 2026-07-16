import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const workshopLocationsRouter = Router();

// ── GET /workshop-locations ───────────────────────────────────────────────────
workshopLocationsRouter.get('/workshop-locations', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const filterId       = String(req.query.id        || '').trim();
  const filterSource   = String(req.query.source    || '').trim();
  const filterPartner  = String(req.query.partner   || '').trim();
  const filterName     = String(req.query.name      || '').trim();
  const filterAddress  = String(req.query.address   || '').trim();
  const filterCity     = String(req.query.city      || '').trim();
  const filterProvince = String(req.query.province  || '').trim();
  const filterPostcode = String(req.query.postcode  || '').trim();
  const filterPhone    = String(req.query.has_phone || '').trim();   // 'yes' | 'no' | ''
  const filterWeb      = String(req.query.has_web   || '').trim();   // 'yes' | 'no' | ''
  const filterHours    = String(req.query.has_hours || '').trim();   // 'yes' | 'no' | ''
  const filterActive   = String(req.query.active    || '').trim();   // 'true' | 'false' | ''

  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  const push = (val: unknown) => { values.push(val); return `$${values.length}`; };

  if (filterId)       conditions.push(`id = ${push(Number(filterId))}`);
  if (filterSource)   conditions.push(`lower(COALESCE(source,'')) = ${push(filterSource.toLowerCase())}`);
  if (filterPartner)  conditions.push(`lower(COALESCE(partner,'')) = ${push(filterPartner.toLowerCase())}`);
  if (filterName)     conditions.push(`lower(COALESCE(name,'')) LIKE ${push('%' + filterName.toLowerCase() + '%')}`);
  if (filterAddress)  conditions.push(`lower(COALESCE(address,'')) LIKE ${push('%' + filterAddress.toLowerCase() + '%')}`);
  if (filterCity)     conditions.push(`lower(COALESCE(city,'')) LIKE ${push('%' + filterCity.toLowerCase() + '%')}`);
  if (filterProvince) conditions.push(`lower(COALESCE(province,'')) LIKE ${push('%' + filterProvince.toLowerCase() + '%')}`);
  if (filterPostcode) conditions.push(`lower(COALESCE(postcode,'')) LIKE ${push('%' + filterPostcode.toLowerCase() + '%')}`);
  if (filterPhone === 'yes') conditions.push(`phone IS NOT NULL AND phone <> ''`);
  if (filterPhone === 'no')  conditions.push(`(phone IS NULL OR phone = '')`);
  if (filterWeb === 'yes')   conditions.push(`website IS NOT NULL AND website <> ''`);
  if (filterWeb === 'no')    conditions.push(`(website IS NULL OR website = '')`);
  if (filterHours === 'yes') conditions.push(`business_hours IS NOT NULL AND business_hours <> ''`);
  if (filterHours === 'no')  conditions.push(`(business_hours IS NULL OR business_hours = '')`);
  if (filterActive === 'true')  conditions.push(`is_active = true`);
  if (filterActive === 'false') conditions.push(`is_active = false`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      query(
        `SELECT id, source, partner, name, address, city, postcode, province,
                lat, lon, phone, website, is_active, rating, rating_count,
                service_types, business_hours, osm_id, external_id, created_at, updated_at
         FROM workshop_locations
         ${where}
         ORDER BY name ASC
         LIMIT ${push(limit)} OFFSET ${push(offset)}`,
        values
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM workshop_locations ${where}`,
        values.slice(0, values.length - 2)   // exclude limit/offset placeholders
      ),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: countResult.rows[0].total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_locations_list_failed', detail: (err as Error).message });
  }
});

// ── GET /workshop-locations/:id ───────────────────────────────────────────────
workshopLocationsRouter.get('/workshop-locations/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, source, partner, name, address, city, postcode, province,
              lat, lon, phone, website, is_active, rating, rating_count,
              service_types, business_hours, osm_id, external_id, created_at, updated_at
       FROM workshop_locations WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'workshop_location_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_location_get_failed', detail: (err as Error).message });
  }
});

// ── PATCH /workshop-locations/:id ─────────────────────────────────────────────
const patchSchema = z.object({
  name:           z.string().min(1).max(255).optional(),
  address:        z.string().max(512).nullable().optional(),
  city:           z.string().max(128).nullable().optional(),
  postcode:       z.string().max(16).nullable().optional(),
  province:       z.string().max(128).nullable().optional(),
  lat:            z.number().nullable().optional(),
  lon:            z.number().nullable().optional(),
  phone:          z.string().max(64).nullable().optional(),
  website:        z.string().max(512).nullable().optional(),
  partner:        z.string().max(64).nullable().optional(),
  is_active:      z.boolean().optional(),
  business_hours: z.string().max(1024).nullable().optional(),
  service_types:  z.array(z.string()).nullable().optional(),
});

workshopLocationsRouter.patch('/workshop-locations/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: parsed.error.flatten() });
    return;
  }

  const fields = parsed.data;
  const keys   = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  const setClauses = keys.map((k, i) =>
    k === 'service_types' ? `service_types = $${i + 1}::text[]` : `${k} = $${i + 1}`
  ).join(', ');
  const values = [...keys.map((k) => fields[k]), req.params.id];

  try {
    const result = await query(
      `UPDATE workshop_locations SET ${setClauses}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING id, name, city, province, is_active, business_hours, updated_at`,
      values
    );
    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'workshop_location_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'workshop_location_update_failed', detail: (err as Error).message });
  }
});
