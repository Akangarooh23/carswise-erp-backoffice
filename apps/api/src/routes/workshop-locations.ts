import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const workshopLocationsRouter = Router();

// ── GET /workshop-locations ───────────────────────────────────────────────────
workshopLocationsRouter.get('/workshop-locations', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const q        = String(req.query.q || '').trim();
  const province = String(req.query.province || '').trim();
  const city     = String(req.query.city || '').trim();
  const partner  = String(req.query.partner || '').trim();
  const active   = req.query.active;

  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(
      `(lower(COALESCE(name,'')) LIKE $${values.length} OR lower(COALESCE(city,'')) LIKE $${values.length} OR lower(COALESCE(address,'')) LIKE $${values.length})`
    );
  }
  if (province) {
    values.push(`%${province.toLowerCase()}%`);
    conditions.push(`lower(COALESCE(province,'')) LIKE $${values.length}`);
  }
  if (city) {
    values.push(`%${city.toLowerCase()}%`);
    conditions.push(`lower(COALESCE(city,'')) LIKE $${values.length}`);
  }
  if (partner) {
    values.push(partner.toLowerCase());
    conditions.push(`lower(COALESCE(partner,'')) = $${values.length}`);
  }
  if (active === 'true' || active === 'false') {
    values.push(active === 'true');
    conditions.push(`is_active = $${values.length}`);
  }

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
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM workshop_locations ${where}`,
        values
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
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (!keys.length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }

  const setClauses = keys.map((k, i) => {
    if (k === 'service_types') return `service_types = $${i + 1}::text[]`;
    return `${k} = $${i + 1}`;
  }).join(', ');
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
