import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

const FILES_TABLE = 'moveadvisor_user_vehicle_files';
const DOCS_TABLE  = 'moveadvisor_user_vehicle_documents';
const DOCS_TYPES  = new Set(['technical_sheet', 'circulation_permit', 'itv', 'insurance', 'maintenance_invoices']);

async function uploadIdCarFileToSupabase(
  base64: string, vehicleId: string, fileType: string, fileName: string, mimeType: string
): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const ext  = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const path = `idcars/${vehicleId}/${fileType}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const buf  = Buffer.from(base64, 'base64');
    const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/vehicle-files/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': mimeType || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/vehicle-files/${path}`;
  } catch { return null; }
}

export const idcarsRouter = Router();

idcarsRouter.get('/idcars', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const userId = String(req.query.user_id || '').trim();
  const q      = String(req.query.q      || '').trim();
  const page   = Math.max(1, Number(req.query.page) || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[]    = [];

  if (userId) {
    values.push(userId);
    conditions.push(`v.user_id = $${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(COALESCE(v.brand,'')) LIKE $${values.length} OR lower(COALESCE(v.model,'')) LIKE $${values.length} OR lower(COALESCE(v.plate,'')) LIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT v.*, u.name AS owner_name, u.email AS owner_email
         FROM moveadvisor_user_vehicles v
         LEFT JOIN moveadvisor_users u ON u.id::text = v.user_id
         ${where}
         ORDER BY v.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_user_vehicles v ${where}`,
        values
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total as { rows: { total: number }[] }).rows[0]?.total ?? 0, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcars_list_failed', detail: (err as Error).message });
  }
});

idcarsRouter.get('/idcars/:id', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const result = await query(
      `SELECT v.*, u.name AS owner_name, u.email AS owner_email
       FROM moveadvisor_user_vehicles v
       LEFT JOIN moveadvisor_users u ON u.id = v.user_id
       WHERE v.id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));

    if (!result.rows.length) {
      res.status(404).json({ ok: false, error: 'idcar_not_found' });
      return;
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcar_get_failed', detail: (err as Error).message });
  }
});

// List files from Supabase Storage for a given vehicle path prefix
async function listSupabaseStorageFiles(vehicleId: string): Promise<{
  id: number; file_type: string; file_name: string; file_size: number;
  file_mime_type: string; file_url: string; file_content_base64: null;
  created_at: string; sort_order: number; source: 'storage';
}[]> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return [];

  const BUCKET = 'vehicle-files';
  // The user dashboard uploads to 'vehicles/{id}/', ERP uploads to 'idcars/{id}/'
  const PREFIXES = [`vehicles/${vehicleId}`, `idcars/${vehicleId}`];
  const BASE_URL = `${SUPABASE_URL}/storage/v1`;
  const headers = { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

  const FILE_TYPE_MAP: Record<string, string> = {
    photos: 'photo', documents: 'document', photo: 'photo', document: 'document',
    'technical-sheet': 'technical_sheet', technical_sheet: 'technical_sheet',
    'circulation-permit': 'circulation_permit', circulation_permit: 'circulation_permit',
    itv: 'itv', insurance: 'insurance', 'maintenance-invoices': 'maintenance_invoices',
    maintenance_invoices: 'maintenance_invoices',
  };

  type StorageFile = Awaited<ReturnType<typeof listSupabaseStorageFiles>>[number];
  const results: StorageFile[] = [];
  let fakeId = -1;

  for (const prefix of PREFIXES) {
    try {
      // List subfolders
      const foldersRes = await fetch(`${BASE_URL}/object/list/${BUCKET}`, {
        method: 'POST', headers,
        body: JSON.stringify({ prefix: `${prefix}/`, delimiter: '/', limit: 50 }),
      });
      if (!foldersRes.ok) continue;
      const foldersData = await foldersRes.json() as { name: string }[];
      const folders = foldersData.filter((f) => f.name?.endsWith('/'));

      for (const folder of folders) {
        const folderName = folder.name.replace(/\/$/, '').split('/').pop() ?? '';
        const fileType = FILE_TYPE_MAP[folderName] ?? 'document';

        // List files in this folder
        const filesRes = await fetch(`${BASE_URL}/object/list/${BUCKET}`, {
          method: 'POST', headers,
          body: JSON.stringify({ prefix: `${prefix}/${folderName}/`, delimiter: '/', limit: 100 }),
        });
        if (!filesRes.ok) continue;
        const filesData = await filesRes.json() as { name: string; metadata?: { size?: number; mimetype?: string; lastModified?: string } }[];

        for (const file of filesData.filter((f) => f.name && !f.name.endsWith('/'))) {
          const fileName = file.name.split('/').pop() ?? file.name;
          const fileUrl  = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${prefix}/${folderName}/${fileName}`;
          results.push({
            id: fakeId--,
            file_type: fileType,
            file_name: fileName,
            file_size: file.metadata?.size ?? 0,
            file_mime_type: file.metadata?.mimetype ?? (fileType === 'photo' ? 'image/jpeg' : 'application/octet-stream'),
            file_url: fileUrl,
            file_content_base64: null,
            created_at: file.metadata?.lastModified ?? new Date().toISOString(),
            sort_order: 9999,
            source: 'storage',
          });
        }
      }
    } catch { /* continue */ }
  }
  return results;
}

idcarsRouter.get('/idcars/:id/files', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    // Query DB (fallback chain if columns don't exist yet)
    const dbFilesQuery = await query(
      `SELECT id, file_type, file_name, file_size, file_mime_type,
              file_url, file_content_base64, created_at,
              COALESCE(sort_order, 9999) AS sort_order
       FROM moveadvisor_user_vehicle_files
       WHERE vehicle_id = $1
       ORDER BY COALESCE(sort_order, 9999) ASC, created_at ASC`,
      [req.params.id]
    ).catch(() =>
      query(
        `SELECT id, file_type, file_name, file_size, file_mime_type,
                file_url, NULL AS file_content_base64, created_at, 9999 AS sort_order
         FROM moveadvisor_user_vehicle_files
         WHERE vehicle_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      ).catch(() => ({ rows: [] }))
    );

    const dbDocsQuery = await query(
      `SELECT id, document_type AS file_type, file_name, file_size, file_mime_type,
              file_url, file_content_base64, created_at
       FROM moveadvisor_user_vehicle_documents
       WHERE vehicle_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    ).catch(() =>
      query(
        `SELECT id, document_type AS file_type, file_name, file_size, file_mime_type,
                file_url, NULL AS file_content_base64, created_at
         FROM moveadvisor_user_vehicle_documents
         WHERE vehicle_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      ).catch(() => ({ rows: [] }))
    );

    const dbFiles   = [...dbFilesQuery.rows, ...dbDocsQuery.rows];
    const dbFileUrls = new Set(dbFiles.map((f: { file_url: string }) => f.file_url).filter(Boolean));

    // Also list from Supabase Storage — fills gaps when DB records are missing
    const storageFiles = await listSupabaseStorageFiles(req.params.id);

    // Merge: deduplicate by URL so we don't show the same file twice
    const storageOnly = storageFiles.filter((sf) => !dbFileUrls.has(sf.file_url));
    const allFiles = [...dbFiles, ...storageOnly];

    res.json({ ok: true, data: allFiles });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcar_files_failed', detail: (err as Error).message });
  }
});

idcarsRouter.post('/idcars/:id/files', requireRole(['admin', 'operations', 'support']), async (req, res) => {
  const vehicleId = req.params.id;
  const { file_type, file_name, file_mime_type, file_content_base64, file_size } = req.body ?? {};

  const ALL_TYPES = ['photo', 'document', 'technical_sheet', 'circulation_permit', 'itv', 'insurance', 'maintenance_invoices'];
  if (!ALL_TYPES.includes(file_type) || !file_name || !file_content_base64) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  try {
    const fileUrl = await uploadIdCarFileToSupabase(file_content_base64, vehicleId, file_type, file_name, file_mime_type || 'application/octet-stream');
    const size    = Number(file_size) || Buffer.from(file_content_base64, 'base64').byteLength;

    // When Supabase upload fails, store base64 in DB as fallback
    const storedB64   = fileUrl ? '' : file_content_base64;

    let inserted;
    if (DOCS_TYPES.has(file_type)) {
      inserted = await query(
        `INSERT INTO ${DOCS_TABLE} (vehicle_id, document_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         RETURNING id, document_type AS file_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at`,
        [vehicleId, file_type, file_name, size, file_mime_type, fileUrl ?? '', storedB64]
      ).catch(() =>
        // Fallback: store in files table as 'document' if documents table has strict CHECK
        query(
          `INSERT INTO ${FILES_TABLE} (vehicle_id, file_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at)
           VALUES ($1,'document',$2,$3,$4,$5,$6,NOW())
           RETURNING id, file_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at`,
          [vehicleId, file_name, size, file_mime_type, fileUrl ?? '', storedB64]
        )
      );
    } else {
      inserted = await query(
        `INSERT INTO ${FILES_TABLE} (vehicle_id, file_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         RETURNING id, file_type, file_name, file_size, file_mime_type, file_url, file_content_base64, created_at`,
        [vehicleId, file_type, file_name, size, file_mime_type, fileUrl ?? '', storedB64]
      );
    }
    res.status(201).json({ ok: true, data: inserted.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'file_upload_failed', detail: (err as Error).message });
  }
});

idcarsRouter.delete('/idcars/:id/files/:fileId', requireRole(['admin', 'operations']), async (req, res) => {
  const fileType = String(req.query.file_type || '');
  const table    = DOCS_TYPES.has(fileType) ? DOCS_TABLE : FILES_TABLE;
  const idCol    = DOCS_TYPES.has(fileType) ? 'id' : 'id';

  try {
    await query(`DELETE FROM ${table} WHERE ${idCol} = $1 AND vehicle_id = $2`, [req.params.fileId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'file_delete_failed', detail: (err as Error).message });
  }
});

idcarsRouter.post('/idcars/:id/publish', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const vehicle = await query(
      `SELECT * FROM moveadvisor_user_vehicles WHERE id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));

    if (!vehicle.rows.length) {
      res.status(404).json({ ok: false, error: 'idcar_not_found' });
      return;
    }
    const v = vehicle.rows[0];

    const { price, title, brand, model, year, mileage, fuel, color, notes, cv, co2 } = v;

    const missing: string[] = [];
    if (!brand?.toString().trim())  missing.push('marca');
    if (!model?.toString().trim())  missing.push('modelo');
    if (!year  || Number(year) < 1900) missing.push('año');
    if (!price || parseFloat(String(price)) <= 0) missing.push('precio');
    if (missing.length) {
      res.status(400).json({ ok: false, error: 'missing_required_fields', fields: missing,
        detail: `Campos obligatorios sin rellenar: ${missing.join(', ')}` });
      return;
    }

    // Get all photo URLs — first one (by upload date) becomes the primary
    const allPhotosResult = await query(
      `SELECT file_url FROM moveadvisor_user_vehicle_files
       WHERE vehicle_id = $1 AND file_type = 'photo' AND file_url != '' ORDER BY created_at ASC LIMIT 20`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));
    const allPhotoUrls = (allPhotosResult.rows as { file_url: string }[]).map(r => r.file_url);
    const imageUrl  = allPhotoUrls[0] || '';
    const imageUrls = JSON.stringify(allPhotoUrls);

    const offerId = `idcar-${req.params.id}`;
    const seller  = (req.body?.seller as string) || v.user_email || 'particular';
    const priceNum = parseFloat(String(price || req.body?.price || 0)) || 0;

    const existing = await query(`SELECT id, image_url, image_urls FROM moveadvisor_marketplace_vo_offers WHERE id = $1`, [offerId]);

    if (existing.rows.length) {
      // Preserve a manually chosen primary photo (set via "Hacer principal") if it's still in the photo list
      const savedPrimary: string = existing.rows[0].image_url || '';
      let resolvedImageUrl = imageUrl;
      let resolvedImageUrls = imageUrls;
      if (savedPrimary && allPhotoUrls.includes(savedPrimary)) {
        // Keep the manually chosen primary at the front
        const reordered = [savedPrimary, ...allPhotoUrls.filter((u: string) => u !== savedPrimary)];
        resolvedImageUrl  = savedPrimary;
        resolvedImageUrls = JSON.stringify(reordered);
      }

      await query(
        `UPDATE moveadvisor_marketplace_vo_offers SET
          title = $1, brand = $2, model = $3, year = $4, price = $5, mileage = $6,
          fuel = $7, color = $8, description = $9, image_url = $10, image_urls = $11,
          seller_type = 'particular', is_active = TRUE, updated_at = NOW()
         WHERE id = $12`,
        [
          title || `${brand} ${model} ${year}`,
          brand || '', model || '',
          Number(year) || 0, priceNum, Number(mileage) || 0,
          fuel || '', color || '', notes || '',
          resolvedImageUrl, resolvedImageUrls, offerId,
        ]
      );
    } else {
      await query(
        `INSERT INTO moveadvisor_marketplace_vo_offers
           (id, title, brand, model, year, price, mileage, fuel, color, description,
            image_url, image_urls, seller, seller_type, location, power, displacement,
            has_guarantee_seal, portal_score, warranty_months,
            available_for_purchase, renting_available, renting_km_year,
            has_stock_management, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'particular','',
                 $14,$15, FALSE, 0, 0, TRUE, FALSE, 0, FALSE, TRUE, NOW(), NOW())`,
        [
          offerId,
          title || `${brand} ${model} ${year}`,
          brand || '', model || '',
          Number(year) || 0, priceNum, Number(mileage) || 0,
          fuel || '', color || '', notes || '',
          imageUrl, imageUrls, seller,
          `${cv || ''} CV`.trim(),
          parseFloat(String(co2 || 0)) || 0,
        ]
      );
    }

    res.json({ ok: true, offer_id: offerId });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcar_publish_failed', detail: (err as Error).message });
  }
});

idcarsRouter.patch('/idcars/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const ALLOWED = [
    'title', 'brand', 'model', 'version', 'year', 'plate', 'fuel', 'mileage',
    'color', 'body_type', 'transmission_type', 'cv', 'price', 'notes',
    'vehicle_location', 'environmental_label', 'seats', 'doors', 'co2',
  ];
  const fields: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (req.body && key in req.body) fields[key] = req.body[key] ?? null;
  }
  if (!Object.keys(fields).length) {
    res.status(400).json({ ok: false, error: 'no_fields_to_update' });
    return;
  }
  const keys   = Object.keys(fields);
  const values = keys.map((k) => fields[k]);
  const set    = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  try {
    const result = await query(
      `UPDATE moveadvisor_user_vehicles SET ${set}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, req.params.id]
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'idcar_not_found' }); return; }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcar_update_failed', detail: (err as Error).message });
  }
});

idcarsRouter.patch('/idcars/:id/photos/reorder', requireRole(['admin', 'operations', 'support']), async (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order as { id: number; sort_order: number }[] : [];
  if (!order.length) { res.status(400).json({ ok: false, error: 'empty_order' }); return; }
  try {
    // Ensure column exists (safe to run multiple times)
    await query(`ALTER TABLE moveadvisor_user_vehicle_files ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 9999`).catch(() => {});
    for (const item of order) {
      await query(
        `UPDATE moveadvisor_user_vehicle_files SET sort_order = $1 WHERE id = $2 AND vehicle_id = $3`,
        [item.sort_order, item.id, req.params.id]
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'reorder_failed', detail: (err as Error).message });
  }
});

idcarsRouter.patch('/idcars/:id/primary-photo', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const photoUrl = String(req.body?.photo_url || '').trim();
  if (!photoUrl) {
    res.status(400).json({ ok: false, error: 'photo_url_required' });
    return;
  }
  const offerId = `idcar-${req.params.id}`;
  try {
    const current = await query(
      `SELECT image_url, image_urls FROM moveadvisor_marketplace_vo_offers WHERE id = $1`,
      [offerId]
    ).catch(() => ({ rows: [] }));

    if (!current.rows.length) {
      res.json({ ok: true, updated: false, note: 'offer_not_published_yet' });
      return;
    }

    let urls: string[] = [];
    try {
      const raw = current.rows[0].image_urls;
      urls = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { urls = []; }

    const newUrls = [photoUrl, ...urls.filter((u: string) => u !== photoUrl)];
    await query(
      `UPDATE moveadvisor_marketplace_vo_offers SET image_url = $1, image_urls = $2, updated_at = NOW() WHERE id = $3`,
      [photoUrl, JSON.stringify(newUrls), offerId]
    );

    res.json({ ok: true, updated: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'primary_photo_update_failed', detail: (err as Error).message });
  }
});

idcarsRouter.get('/idcars/stats/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        COUNT(*)::int                                          AS total,
        COUNT(DISTINCT user_id)::int                          AS unique_owners,
        COUNT(*) FILTER (WHERE lower(fuel) = 'eléctrico' OR lower(fuel) = 'electrico')::int AS electric,
        COUNT(*) FILTER (WHERE lower(fuel) LIKE '%híbrido%' OR lower(fuel) LIKE '%hibrido%')::int AS hybrid,
        ROUND(AVG(EXTRACT(YEAR FROM NOW()) - year_int)::numeric, 1) AS avg_age_years
       FROM moveadvisor_user_vehicles`
    ).catch(() => ({ rows: [{ total: 0, unique_owners: 0, electric: 0, hybrid: 0, avg_age_years: 0 }] }));

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'idcars_stats_failed', detail: (err as Error).message });
  }
});
