import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { porQueNoSePuedePublicar, avisaDeQueSePublico, apuntaQueSePublico, elPrecioAcordadoDe } from './encargos.js';
import { config } from '../config.js';
import { revisaFichero, tamanoDeBase64 } from '../lib/ficheros.js';
import { falloInterno } from '../lib/fallos.js';
import {
  CAMPOS, GEMELAS, limpiaLosCambios, loQueVaAlAnuncio,
  ENSURE_COLUMNAS as ENSURE_COLUMNAS_DEL_COCHE, type ElAnuncio,
} from '../lib/caracteristicas-del-coche.js';
import { LO_QUE_NO_TRAE } from '../lib/la-ficha-tecnica.js';
import { leeYGuarda, loLeido, comoQuedaContraElCoche, etiquetaDe } from '../lib/la-ficha-leida.js';

const FILES_TABLE = 'moveadvisor_user_vehicle_files';
const DOCS_TABLE  = 'moveadvisor_user_vehicle_documents';
const DOCS_TYPES  = new Set(['technical_sheet', 'circulation_permit', 'itv', 'insurance', 'maintenance_invoices']);

async function uploadIdCarFileToSupabase(
  base64: string, vehicleId: string, fileType: string, fileName: string, mimeType: string
): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[supabase-upload] Missing env: SUPABASE_URL=%s KEY=%s', !!SUPABASE_URL, !!SUPABASE_SERVICE_KEY);
    return null;
  }
  try {
    const ext  = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const path = `vehicles/${vehicleId}/${fileType}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const buf  = Buffer.from(base64, 'base64');
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/vehicle-files/${path}`;
    console.log('[supabase-upload] POST', uploadUrl, 'size=%d mime=%s', buf.length, mimeType);
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        // Sin `apikey` la clave nueva de Supabase no vale: ver invoice-pdf.ts.
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': mimeType || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[supabase-upload] FAILED status=%d body=%s', res.status, errText);
      return null;
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/vehicle-files/${path}`;
    console.log('[supabase-upload] OK url=%s', publicUrl);
    return publicUrl;
  } catch (e) {
    console.error('[supabase-upload] EXCEPTION', e);
    return null;
  }
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
    conditions.push(`(lower(COALESCE(v.brand,'')) LIKE $${values.length} OR lower(COALESCE(v.model,'')) LIKE $${values.length} OR lower(COALESCE(v.plate,'')) LIKE $${values.length} OR lower(COALESCE(v.numero,'')) LIKE $${values.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, total] = await Promise.all([
      query(
        /*
         * El dueño, por su identificador y si no por su correo.
         *
         * Un coche puede tener solo el correo: los que entran solos al
         * entregar una importación se dan de alta con lo que trae el
         * expediente, y ahí el cliente es una dirección. Sin la segunda
         * condición, ese coche sale en la lista sin propietario, que es como
         * decir que no es de nadie.
         *
         * La segunda solo entra cuando no hay identificador, así que no puede
         * traer dos filas.
         */
        `SELECT v.*, u.name AS owner_name, u.email AS owner_email
         FROM moveadvisor_user_vehicles v
         LEFT JOIN moveadvisor_users u
           ON u.id::text = v.user_id
           OR (v.user_id IS NULL AND lower(u.email) = lower(v.user_email))
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
    falloInterno(res, 'idcars_list_failed', err);
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
    falloInterno(res, 'idcar_get_failed', err);
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
  // vehicles/ is the canonical path; idcars/ kept as legacy for existing uploads
  const PREFIXES = [`vehicles/${vehicleId}`, `idcars/${vehicleId}`];
  const BASE_URL = `${SUPABASE_URL}/storage/v1`;
  // Sin `apikey` la clave nueva de Supabase no vale: ver invoice-pdf.ts.
  const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

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
    // Try with sort_order first; if column missing fall back keeping real file_content_base64
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
                file_url, file_content_base64, created_at, 9999 AS sort_order
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
    const dbFileUrls = new Set<string>(dbFiles.map((f) => String(f.file_url || '')).filter(Boolean));

    // Find all vehicle IDs with the same plate + user_id (catches duplicate records for same car)
    const sameVehicleQuery = await query(
      `SELECT id FROM moveadvisor_user_vehicles
       WHERE user_id = (SELECT user_id FROM moveadvisor_user_vehicles WHERE id = $1)
         AND plate   = (SELECT plate   FROM moveadvisor_user_vehicles WHERE id = $1)
         AND plate IS NOT NULL AND plate != ''`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));
    const relatedIds = (sameVehicleQuery as { rows: { id: string }[] }).rows
      .map((r) => String(r.id))
      .filter((id) => id !== req.params.id);

    // List from Supabase Storage for this vehicle AND any related IDs
    const storageFiles = (await Promise.all(
      [req.params.id, ...relatedIds].map((id) => listSupabaseStorageFiles(id))
    )).flat();

    // Merge: deduplicate by URL so we don't show the same file twice
    const storageOnly = storageFiles.filter((sf) => !dbFileUrls.has(sf.file_url));
    const allFiles = [...dbFiles, ...storageOnly];

    res.json({ ok: true, data: allFiles });
  } catch (err) {
    falloInterno(res, 'idcar_files_failed', err);
  }
});

idcarsRouter.post('/idcars/:id/files', requireRole(['admin', 'operations', 'support']), async (req, res) => {
  const vehicleId = req.params.id;
  const { file_type, file_name, file_mime_type, file_content_base64, file_size } = req.body ?? {};

  const ALL_TYPES = ['photo', 'document', 'technical_sheet', 'circulation_permit', 'itv', 'insurance', 'maintenance_invoices'];
  // Cada motivo por su nombre: «invalid_payload» no le dice nada a nadie.
  const falta =
    !ALL_TYPES.includes(file_type) ? `Tipo de archivo desconocido: ${String(file_type ?? '') || '(vacío)'}.`
    : !file_name                   ? 'El archivo no tiene nombre.'
    : !file_content_base64         ? 'El archivo ha llegado vacío.'
    : '';
  if (falta) {
    res.status(400).json({ ok: false, error: 'invalid_payload', detail: falta });
    return;
  }

  // El tipo se comprueba aquí porque el fichero acaba en un bucket público:
  // lo que se suba se sirve desde una dirección nuestra. Hoy solo hay fotos y
  // PDF guardados, así que la lista no quita nada que se esté usando.
  const problema = revisaFichero(file_name, file_mime_type, tamanoDeBase64(file_content_base64));
  if (problema) {
    res.status(400).json({ ok: false, error: 'fichero_no_valido', detail: problema.motivo });
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
    /*
     * Si lo que acaba de subir es la ficha técnica, se lee ya.
     *
     * Leerla era un botón que alguien tenía que acordarse de pulsar, y el error
     * del T-Roc —110 CV donde son 150— solo se descubría si alguien entraba en
     * esa pantalla. Ahora la contradicción existe antes de que nadie tase nada.
     *
     * Con su `catch` y sin tocar la respuesta: el documento ya está subido, y
     * que el lector esté caído no puede convertir una subida buena en un error.
     * Lo que no se lea aquí se queda para el repaso.
     */
    if (file_type === 'technical_sheet') {
      await leeYGuarda(vehicleId, { otraVez: true })
        .catch((err) => { console.error('[idcars] ficha técnica al subir:', (err as Error).message); });
    }

    res.status(201).json({ ok: true, data: inserted.rows[0] });
  } catch (err) {
    falloInterno(res, 'file_upload_failed', err);
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
    falloInterno(res, 'file_delete_failed', err);
  }
});

// Migrate base64 files stored in DB to Supabase Storage
idcarsRouter.post('/idcars/:id/migrate-to-storage', requireRole(['admin', 'operations']), async (req, res) => {
  const vehicleId = req.params.id;
  try {
    const filesResult = await query(
      `SELECT id, file_type, file_name, file_mime_type, file_content_base64
       FROM ${FILES_TABLE}
       WHERE vehicle_id = $1 AND (file_url = '' OR file_url IS NULL)
         AND file_content_base64 IS NOT NULL AND file_content_base64 != ''`,
      [vehicleId]
    ).catch(() => ({ rows: [] }));

    const docsResult = await query(
      `SELECT id, document_type AS file_type, file_name, file_mime_type, file_content_base64
       FROM ${DOCS_TABLE}
       WHERE vehicle_id = $1 AND (file_url = '' OR file_url IS NULL)
         AND file_content_base64 IS NOT NULL AND file_content_base64 != ''`,
      [vehicleId]
    ).catch(() => ({ rows: [] }));

    const toMigrate = [...filesResult.rows, ...docsResult.rows];

    // Upload all files in parallel to stay within Vercel's 10s timeout
    const results = await Promise.allSettled(
      toMigrate.map(async (f) => {
        const url = await uploadIdCarFileToSupabase(
          String(f.file_content_base64), vehicleId, String(f.file_type),
          String(f.file_name), String(f.file_mime_type || 'application/octet-stream')
        );
        if (!url) throw new Error('upload_failed');
        const table = DOCS_TYPES.has(String(f.file_type)) ? DOCS_TABLE : FILES_TABLE;
        await query(
          `UPDATE ${table} SET file_url = $1, file_content_base64 = '' WHERE id = $2`,
          [url, f.id]
        ).catch(() => null);
        return url;
      })
    );

    const migrated = results.filter((r) => r.status === 'fulfilled').length;
    res.json({ ok: true, total: toMigrate.length, migrated });
  } catch (err) {
    falloInterno(res, 'migrate_failed', err);
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

    const { brand, model, year } = v;

    /*
     * Lo que el comprador lee del coche, con las mismas reglas que al corregirlo
     * desde la ficha: el título es marca + modelo + versión y no el alias de su
     * garaje («Prueba»), la potencia con su número, la cilindrada la suya.
     */
    const anuncio = loQueVaAlAnuncio(v);

    /*
     * El precio acordado manda sobre el del panel.
     *
     * Si el coche lo vendemos nosotros, el precio se acuerda con el dueño y él
     * lo firma: ése es el que tiene que salir en el anuncio. El del panel lo
     * escribió él antes de todo esto y puede estar viejo — o vacío, que es lo
     * que dejaba un coche con el papel firmado a 17.900 € sin poder publicarse
     * por «falta el precio».
     *
     * Sin encargo no hay nada que imponer: ese precio es suyo.
     */
    const acordado = await elPrecioAcordadoDe(req.params.id);
    const price = acordado ?? v.price;

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

    /*
     * Si el coche lo vendemos nosotros, las cuatro puertas mandan.
     *
     * En la pantalla el botón sale apagado, pero un botón apagado es una pista y
     * no una regla: la promesa de que un anuncio nuestro lleva informe y se
     * puede visitar tiene que sostenerse aunque la llamada venga de otro sitio.
     *
     * Sin encargo no se comprueba nada. Un particular que publica su propio
     * IDCar no nos ha encargado la venta y no le pedimos nada.
     */
    const noPuede = await porQueNoSePuedePublicar(req.params.id);
    if (noPuede) {
      res.status(409).json({ ok: false, error: 'el_encargo_no_esta_listo', detail: noPuede });
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

      await llevaLasCaracteristicasAlAnuncio(req.params.id, anuncio);
      await query(
        `UPDATE moveadvisor_marketplace_vo_offers SET
          price = $1, image_url = $2, image_urls = $3,
          seller_type = 'particular', is_active = TRUE, updated_at = NOW()
         WHERE id = $4`,
        [priceNum, resolvedImageUrl, resolvedImageUrls, offerId]
      );
    } else {
      await query(
        `INSERT INTO moveadvisor_marketplace_vo_offers
           (id, title, brand, model, version, year, price, mileage, fuel, color, description,
            image_url, image_urls, seller, seller_type, location, power, displacement,
            transmission, body_type, doors, seats,
            has_guarantee_seal, portal_score, warranty_months,
            available_for_purchase, renting_available, renting_km_year,
            has_stock_management, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'particular',$15,
                 $16,$17,$18,$19,$20,$21, FALSE, 0, 0, TRUE, FALSE, 0, FALSE, TRUE, NOW(), NOW())`,
        [
          offerId,
          anuncio.title || `${brand} ${model} ${year}`,
          anuncio.brand, anuncio.model, anuncio.version,
          anuncio.year, priceNum, anuncio.mileage,
          anuncio.fuel, anuncio.color, anuncio.description,
          imageUrl, imageUrls, seller,
          anuncio.location,
          // Antes aquí iban «CV» a secas y, en la cilindrada, el CO₂.
          anuncio.power, anuncio.displacement,
          anuncio.transmission, anuncio.body_type, anuncio.doors, anuncio.seats,
        ]
      );
    }

    /*
     * Y si el coche es de un encargo, que ha pasado lo que decía el mandato.
     *
     * Se apunta en el encargo y no se mira la oferta: la oferta puede existir de
     * antes —el dueño la publicó él mismo meses atrás— y entonces el correo de
     * «ya está anunciado» no salía nunca, y los 30 días no tendrían desde dónde
     * contar. Solo la primera vez del encargo.
     *
     * Esperado: en Vercel lo que no se espera se corta, y así se perdía el
     * correo. Con su `catch`, porque el anuncio ya está publicado.
     */
    if (acordado !== null) {
      await query(
        `UPDATE moveadvisor_user_vehicles SET price = $2, updated_at = NOW() WHERE id = $1`,
        [req.params.id, String(priceNum)]
      ).catch((e) => console.error('[idcars] precio del coche:', (e as Error).message));
    }
    const primeraVez = await apuntaQueSePublico(req.params.id)
      .catch((e) => { console.error('[idcars] sin apuntar la publicación:', (e as Error).message); return false; });
    if (primeraVez) {
      await avisaDeQueSePublico(req.params.id, offerId, priceNum)
        .catch((e) => console.error('[idcars] sin avisar de la publicación:', (e as Error).message));
    }

    res.json({ ok: true, offer_id: offerId });
  } catch (err) {
    falloInterno(res, 'idcar_publish_failed', err);
  }
});

/**
 * Las características del anuncio, puestas al día con lo que hay en el coche.
 *
 * Todo menos el precio, las fotos y si está activo: el precio de un encargo va
 * por lo firmado y las fotos se leen vivas. Si el coche no está publicado no hay
 * fila y no pasa nada. Devuelve si había anuncio.
 */
async function llevaLasCaracteristicasAlAnuncio(vehicleId: string, a: ElAnuncio): Promise<boolean> {
  const r = await query(
    `UPDATE moveadvisor_marketplace_vo_offers SET
       title = $2, brand = $3, model = $4, version = $5, year = $6, mileage = $7,
       fuel = $8, color = $9, power = $10, displacement = $11, transmission = $12,
       body_type = $13, doors = $14, seats = $15, location = $16, description = $17,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [
      `idcar-${vehicleId}`, a.title, a.brand, a.model, a.version, a.year, a.mileage,
      a.fuel, a.color, a.power, a.displacement, a.transmission,
      a.body_type, a.doors, a.seats, a.location, a.description,
    ]
  );
  return r.rows.length > 0;
}

/** Si este coche lo vendemos nosotros: entonces su precio no se toca desde aquí. */
async function tieneEncargoVivo(vehicleId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM erp_encargos_venta WHERE vehicle_id = $1 AND cerrado_at IS NULL LIMIT 1`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}

let columnasListas = false;

/**
 * Corregir las características del coche.
 *
 * Las reglas —qué se toca, cómo se limpia, qué llega al anuncio— están en
 * `lib/caracteristicas-del-coche.ts`. Aquí solo se escribe: el coche con sus
 * columnas gemelas a la vez, y después el anuncio si lo hay.
 */
idcarsRouter.patch('/idcars/:id', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    if (!columnasListas) {
      await query(ENSURE_COLUMNAS_DEL_COCHE).catch(() => {});
      columnasListas = true;
    }

    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const hayEncargo = await tieneEncargoVivo(req.params.id);
    const { campos, errores } = limpiaLosCambios(cuerpo, { hayEncargo });

    // Las notas van aparte: son la descripción del anuncio y no se validan.
    if ('notes' in cuerpo) campos.notes = String(cuerpo.notes ?? '').slice(0, 5000);

    if (Object.keys(errores).length) {
      res.status(400).json({ ok: false, error: 'datos_no_validos', errores, detail: Object.values(errores).join('. ') });
      return;
    }
    if (!Object.keys(campos).length) {
      res.status(400).json({ ok: false, error: 'no_fields_to_update' });
      return;
    }

    /*
     * Y sus gemelas con tipo, en la misma sentencia. Si no, el ERP seguiría
     * enseñando los kilómetros viejos: lee `mileage_km`, no `mileage`.
     */
    const escribir: Record<string, unknown> = { ...campos };
    for (const [clave, { columna, tipo }] of Object.entries(GEMELAS)) {
      if (!(clave in campos)) continue;
      const valor = campos[clave];
      escribir[columna] = valor === null ? null
        : tipo === 'DATE' ? valor
        : Number(valor);
    }

    const claves = Object.keys(escribir);
    const set = claves.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const result = await query(
      `UPDATE moveadvisor_user_vehicles SET ${set}, updated_at = NOW() WHERE id = $${claves.length + 1} RETURNING *`,
      [...claves.map((k) => escribir[k]), req.params.id]
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'idcar_not_found' }); return; }

    /*
     * Y el anuncio, si está publicado: corregir el coche es corregir lo que lee
     * el comprador. Con su `catch`, porque el coche ya está guardado.
     */
    const anuncioAlDia = await llevaLasCaracteristicasAlAnuncio(req.params.id, loQueVaAlAnuncio(result.rows[0]))
      .catch((err) => { console.error('[idcars] características del anuncio:', (err as Error).message); return false; });

    res.json({ ok: true, data: result.rows[0], anuncio_actualizado: anuncioAlDia });
  } catch (err) {
    falloInterno(res, 'idcar_update_failed', err);
  }
});

/** Lo que el formulario necesita saber para pintar los campos. */
idcarsRouter.get('/idcars/campos/caracteristicas', requireRole(['admin', 'support', 'operations', 'sales']), (_req, res) => {
  res.json({ ok: true, data: { campos: CAMPOS } });
});

/**
 * Leer la ficha técnica del coche y decir en qué se diferencia de lo que hay.
 *
 * **No guarda nada.** Devuelve lo que dice el papel y las diferencias; escribir
 * sigue siendo el `PATCH` de arriba, con una persona pulsándolo. Un OCR que
 * pisa datos porque cree haber leído bien es peor que no tenerlo: el error que
 * mete no lo revisa nadie, porque ya viene «comprobado».
 */
/**
 * Lo que dice la ficha técnica del coche, contra lo que hay puesto.
 *
 * Se lee sola al subirla (ver la subida de ficheros) y aquí solo se mira lo
 * guardado; `?otraVez=1` la vuelve a leer, que es lo que hace el botón de
 * repetir.
 *
 * **No guarda nada del coche.** Escribir sigue siendo el `PATCH` de arriba,
 * con una persona pulsando. Un OCR que pisa datos porque cree haber leído bien
 * es peor que no tenerlo: el error que mete no lo revisa nadie, porque ya viene
 * «comprobado».
 */
idcarsRouter.post('/idcars/:id/ficha-tecnica/leer', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const coche = await query(`SELECT * FROM moveadvisor_user_vehicles WHERE id = $1`, [req.params.id]);
    if (!coche.rows.length) { res.status(404).json({ ok: false, error: 'idcar_not_found' }); return; }

    const otraVez = String(req.query.otraVez ?? '') === '1';
    const lectura = otraVez || !(await loLeido(req.params.id))
      ? await leeYGuarda(req.params.id, { otraVez })
      : await loLeido(req.params.id);

    if (!lectura) {
      res.status(404).json({ ok: false, error: 'sin_ficha_tecnica', detail: 'Este coche no tiene ficha técnica subida' });
      return;
    }

    const contra = comoQuedaContraElCoche(lectura, coche.rows[0]);
    res.json({
      ok: true,
      data: {
        documento: contra?.nombre ?? '',
        confianza: contra?.confianza ?? '',
        fallo: contra?.fallo ?? '',
        leida_at: lectura.leida_at,
        diferencias: contra?.diferencias ?? [],
        avisos: contra?.avisos ?? [],
        no_es_una_ficha: contra?.no_es_una_ficha ?? false,
        detail: contra?.no_es_una_ficha
          ? 'De ese documento no sale ningún dato de ficha técnica. Comprueba que lo subido sea la tarjeta ITV del coche y no otro papel.'
          : undefined,
        /*
         * Y lo que la ficha no trae nunca, por su nombre. Sin esto, quien mira
         * la pantalla ve nueve campos propuestos y se queda pensando que los
         * kilómetros no se leyeron bien, cuando es que ahí no están.
         */
        no_lo_trae: contra?.no_es_una_ficha || contra?.fallo
          ? []
          : LO_QUE_NO_TRAE.map((c) => etiquetaDe(c)).filter(Boolean),
      },
    });
  } catch (err) {
    falloInterno(res, 'ficha_tecnica_leer_failed', err);
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
    falloInterno(res, 'reorder_failed', err);
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
    falloInterno(res, 'primary_photo_update_failed', err);
  }
});

/**
 * El resumen de arriba de la pantalla de IDCars.
 *
 * La antigüedad se calcula sobre `year`, que es la columna que enseña la tabla.
 * Hay otra, `year_int`, que no siempre dice lo mismo —un Jaguar de 2006 figura
 * ahí como 2004—, y una tarjeta que contradiga a la tabla que tiene debajo es
 * peor que no tener tarjeta.
 */
idcarsRouter.get('/idcars/stats/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(
      `WITH v AS (
        SELECT
          user_id,
          lower(coalesce(fuel, '')) AS combustible,
          NULLIF(regexp_replace(coalesce(year, ''), 'D', '', 'g'), '')::int AS anio
        FROM moveadvisor_user_vehicles
      )
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(DISTINCT user_id)::int                               AS propietarios,
        COUNT(*) FILTER (WHERE combustible LIKE '%electr%')::int   AS electricos,
        COUNT(*) FILTER (WHERE combustible LIKE '%brido%')::int    AS hibridos,
        ROUND(AVG(EXTRACT(YEAR FROM NOW()) - anio)::numeric, 1)     AS antiguedad_media
      FROM v`
    );

    const f = result.rows[0] as Record<string, unknown>;
    res.json({
      ok: true,
      data: {
        total:            Number(f.total) || 0,
        propietarios:     Number(f.propietarios) || 0,
        electricos:       Number(f.electricos) || 0,
        hibridos:         Number(f.hibridos) || 0,
        // Puede venir vacía si ningún vehículo tiene año legible.
        antiguedadMedia:  f.antiguedad_media == null ? null : Number(f.antiguedad_media),
      },
    });
  } catch (err) {
    falloInterno(res, 'idcars_stats_failed', err);
  }
});
