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
import { sqlInformeVigente } from '../lib/encargo-de-venta.js';
import { LO_QUE_NO_TRAE } from '../lib/la-ficha-tecnica.js';
import { leeYGuarda, comoQuedaContraElCoche, etiquetaDe, lasVersionesPosibles } from '../lib/la-ficha-leida.js';
import { timingSafeEqual } from 'node:crypto';
import { elExpedienteDe } from '../lib/expediente-del-vehiculo.js';
import { sirveGuardado } from '../lib/sirve-lo-guardado.js';
import { publicaElIdcar, llevaLasCaracteristicasAlAnuncio } from '../lib/publica-el-idcar.js';

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
      /*
       * Y en qué estado está su informe de estado.
       *
       * El ERP sabía que el informe existe —lo usa de puerta para publicar y
       * sale en los papeles que faltan— pero la ficha del coche no lo decía ni
       * dejaba abrirlo. Si un cliente llamaba preguntando por su informe, quien
       * cogía el teléfono veía que estaba hecho y no podía verlo.
       *
       * El vigente, que es el más avanzado y no el último: un coche puede
       * repetir el informe, y una captura abierta después no borra el que ya
       * estaba hecho. Ver `sqlInformeVigente`.
       */
      `SELECT v.*, u.name AS owner_name, u.email AS owner_email,
              (SELECT r.status FROM moveadvisor_vehicle_condition_reports r
                WHERE r.vehicle_id = v.id
                ${sqlInformeVigente('r')} LIMIT 1) AS informe_estado,
              (SELECT r.created_at FROM moveadvisor_vehicle_condition_reports r
                WHERE r.vehicle_id = v.id
                ${sqlInformeVigente('r')} LIMIT 1) AS informe_fecha
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

/**
 * El expediente del coche: todos sus papeles, estén donde estén.
 *
 * Va aparte de `/files`, que es otra cosa: aquél lista lo que subió el cliente
 * para poder enseñarlo y reordenarlo en el anuncio. Esto contesta «enséñame
 * todo lo del 5228HNS», que hasta hoy obligaba a abrir cuatro pantallas y a
 * saber de antemano dónde mirar.
 *
 * Solo dice **qué hay y por dónde se abre**: no sirve ni un byte. Abrir cada
 * papel sigue siendo cosa de la ruta que ya comprueba de quién es, y poner
 * aquí una descarga sería una puerta nueva a la póliza de alguien.
 */
idcarsRouter.get('/idcars/:id/expediente', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    res.json({ ok: true, data: await elExpedienteDe(req.params.id) });
  } catch (err) {
    falloInterno(res, 'expediente_failed', err);
  }
});

/**
 * Y abrir uno de esos papeles, cuando está en el cajón privado.
 *
 * Su dirección es la del almacén y pide una llave que el navegador de quien
 * mira el ERP no tiene: enlazarla directamente da un 400 y parece que el
 * fichero se ha perdido. Esto comprueba la sesión y lo trae con la llave del
 * servidor, igual que ya hacen las facturas y las peritaciones.
 *
 * ## Por qué se vuelve a buscar la fila en vez de aceptar la dirección
 *
 * Porque una ruta que acepta una URL y la descarga con la llave del servidor
 * es un agujero: quien tenga sesión del ERP podría pedir cualquier cosa del
 * almacén, de cualquier coche, pasando por nuestra llave. Aquí se pide el
 * identificador de la fila y **se comprueba que esa fila es de ese coche**;
 * la dirección sale de la base, no de quien llama.
 */
const DE_DONDE_SALE: Record<string, { tabla: string; porElCoche: string }> = {
  fichero: { tabla: 'moveadvisor_user_vehicle_files', porElCoche: 'vehicle_id = $2' },
  documento: { tabla: 'moveadvisor_user_vehicle_documents', porElCoche: 'vehicle_id = $2' },
  seguro: {
    tabla: 'moveadvisor_user_insurance_documents d JOIN moveadvisor_user_insurances s ON s.id = d.insurance_id',
    porElCoche: 's.vehicle_id = $2',
  },
  mantenimiento: {
    tabla: 'moveadvisor_user_maintenance_invoices f JOIN moveadvisor_user_maintenances m ON m.id = f.maintenance_id',
    porElCoche: 'm.vehicle_id = $2',
  },
};

idcarsRouter.get(
  '/idcars/:id/expediente/:fuente/:docId',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    const de = DE_DONDE_SALE[String(req.params.fuente)];
    if (!de) { res.status(400).json({ ok: false, error: 'fuente_no_valida' }); return; }
    try {
      const alias = de.tabla.includes(' JOIN ') ? de.tabla.split(' ')[1] : '';
      const r = await query<{ file_url: string; file_name: string }>(
        `SELECT ${alias ? `${alias}.` : ''}file_url, ${alias ? `${alias}.` : ''}file_name
           FROM ${de.tabla}
          WHERE ${alias ? `${alias}.` : ''}id = $1 AND ${de.porElCoche}`,
        [req.params.docId, req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'papel_no_encontrado' }); return; }
      await sirveGuardado(r.rows[0].file_url, res, r.rows[0].file_name || 'documento');
    } catch (err) {
      falloInterno(res, 'papel_del_expediente_failed', err);
    }
  }
);

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

/**
 * El botón «Publicar en Marketplace».
 *
 * Lo que hace vive en `lib/publica-el-idcar`, porque hace falta en dos sitios:
 * aquí, cuando lo pulsa una persona, y al firmar el cliente el precio de
 * salida, cuando el coche tiene que salir solo.
 */
idcarsRouter.post('/idcars/:id/publish', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    const r = await publicaElIdcar(req.params.id, String(req.body?.seller ?? ''));
    if (!r.ok) {
      const { estado, ...resto } = r;
      res.status(estado).json(resto);
      return;
    }
    res.json(r);
  } catch (err) {
    falloInterno(res, 'idcar_publish_failed', err);
  }
});


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

/**
 * PopCar avisa de que el cliente ha subido su ficha técnica.
 *
 * El lector vive aquí y estaba enganchado a la subida de documentos **del
 * ERP**, que es el lado que no usa nadie: la ficha la sube el cliente desde su
 * panel. Por ese camino no se leía nunca, y seguía haciendo falta que alguien
 * pulsara un botón — que es justo lo que se venía a quitar.
 *
 * No lleva `requireRole`: quien llama es PopCar, que no tiene sesión de
 * trabajador. La puerta es el secreto compartido, el mismo que usa el ERP para
 * pedirle a PopCar una devolución de fianza. Sin secreto configurado no pasa
 * nadie: un fallo de configuración puede cerrar una puerta —eso se nota y se
 * arregla— pero no abrirla.
 *
 * Contesta lo que ha pasado y no lo leído. Quien llama no va a mirarlo —el
 * coche del cliente ya está guardado— y devolver los datos del coche por una
 * puerta que solo tiene un secreto delante es dar más de lo que hace falta.
 */
/**
 * ¿La cabecera trae el secreto compartido?
 *
 * Esto era `String(req.headers.authorization) !== \`Bearer \${secreto}\``, una
 * comparación de cadenas, que **corta en el primer carácter distinto**.
 *
 * A diferencia de comparar hashes —donde da igual, porque el atacante no controla
 * lo que se compara— aquí sí lo controla: puede mandar el token que quiera y medir
 * cuánto tarda la respuesta. Sacar un secreto byte a byte por la red es difícil y
 * ruidoso, pero no imposible con suficientes muestras, y la puerta que protege es
 * la que lee documentos de coches de clientes.
 *
 * Y la costumbre buena ya estaba en este repositorio: `lib/personal.ts`,
 * `lib/whatsapp.ts` y los dos de `routes/auth.ts` usan `timingSafeEqual`. Aquí no
 * se aplicó.
 *
 * El orden importa: `timingSafeEqual` **levanta** si los búferes miden distinto, así
 * que la longitud se comprueba antes. Eso filtra por tamaño —que no es secreto— y
 * deja el contenido en tiempo constante, que es lo que se protege.
 */
function elSecretoCuadra(cabecera: string, secreto: string): boolean {
  const esperada = Buffer.from(`Bearer ${secreto}`, 'utf8');
  const recibida = Buffer.from(cabecera, 'utf8');
  if (recibida.length !== esperada.length) return false;
  return timingSafeEqual(recibida, esperada);
}

idcarsRouter.post('/interno/ficha-tecnica', async (req, res) => {
  const secreto = String(process.env.INTERNAL_API_SECRET ?? '').trim();
  if (!secreto) {
    console.error('[interno] INTERNAL_API_SECRET no está configurado: la ficha técnica no se lee sola.');
    res.status(503).json({ ok: false, error: 'sin_configurar' });
    return;
  }
  if (!elSecretoCuadra(String(req.headers.authorization ?? ''), secreto)) {
    res.status(401).json({ ok: false, error: 'no_autorizado' });
    return;
  }

  const vehicleId = String((req.body as { vehicleId?: unknown })?.vehicleId ?? '').trim();
  if (!vehicleId) { res.status(400).json({ ok: false, error: 'falta_el_coche' }); return; }

  try {
    const lectura = await leeYGuarda(vehicleId, { otraVez: true });
    if (!lectura) { res.status(404).json({ ok: false, error: 'sin_ficha_tecnica' }); return; }
    res.json({ ok: true, leida: !lectura.fallo, fallo: lectura.fallo || undefined });
  } catch (err) {
    falloInterno(res, 'ficha_tecnica_interna_failed', err);
  }
});

/**
 * Publicar un coche cuando su dueño acaba de firmar el precio de salida.
 *
 * Lo llama PopCar en cuanto recibe el papel firmado. Hasta ahora había que
 * entrar al ERP y pulsar «Publicar», y entre una cosa y otra el coche se
 * quedaba fuera sin que nadie lo notara — y los enlaces que el ERP da para
 * pegar en coches.net llevaban a «este coche ya no está a la venta», que
 * encima es mentira: no se ha vendido, es que no ha salido.
 *
 * ## Las puertas siguen mandando
 *
 * Esto no publica «porque sí»: corre la misma comprobación que el botón. Si
 * falta el informe, las franjas o el precio, contesta por qué y el coche no
 * sale. La promesa de que un anuncio nuestro lleva informe y se puede visitar
 * tiene que sostenerse venga la llamada de donde venga.
 *
 * ## Y por qué no revienta nunca del lado de PopCar
 *
 * Porque el papel del cliente **ya está firmado y guardado**. Que no se pueda
 * publicar es un problema nuestro y de después; dejarlo sin guardar porque el
 * anuncio no sale sería perder lo único que hizo él.
 */
idcarsRouter.post('/interno/publicar-idcar', async (req, res) => {
  const secreto = String(process.env.INTERNAL_API_SECRET ?? '').trim();
  if (!secreto) {
    console.error('[interno] INTERNAL_API_SECRET no está configurado: el coche no se publica solo al firmar.');
    res.status(503).json({ ok: false, error: 'sin_configurar' });
    return;
  }
  if (!elSecretoCuadra(String(req.headers.authorization ?? ''), secreto)) {
    res.status(401).json({ ok: false, error: 'no_autorizado' });
    return;
  }

  const vehicleId = String((req.body as { vehicleId?: unknown })?.vehicleId ?? '').trim();
  if (!vehicleId) { res.status(400).json({ ok: false, error: 'falta_el_coche' }); return; }

  try {
    const r = await publicaElIdcar(vehicleId);
    if (!r.ok) {
      // Se apunta con su motivo: es lo que explica, mirando el registro, por
      // qué un coche con el precio firmado sigue sin anuncio.
      console.error('[interno] %s no se ha publicado: %s', vehicleId, r.detail || r.error);
      res.status(r.estado).json({ ok: false, error: r.error, detail: r.detail });
      return;
    }
    res.json(r);
  } catch (err) {
    falloInterno(res, 'publicar_interno_failed', err);
  }
});

/**
 * El informe de estado del coche, en PDF, para verlo desde su ficha.
 *
 * Se lo pedimos a PopCar y no a PopCar Check directamente, aunque el documento
 * lo tenga Check: su clave de servicio vive en un solo sitio. Si estuviera
 * también aquí habría dos sitios desde los que se habla con Check y dos donde
 * rotarla el día que toque. Es el mismo criterio que la devolución de fianzas.
 *
 * Va por una ruta con sesión, como las facturas y los papeles del coche: el PDF
 * lleva las fotos del coche de un cliente.
 */
idcarsRouter.get(
  '/idcars/:id/informe-de-estado',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    const secreto = String(process.env.INTERNAL_API_SECRET ?? '').trim();
    if (!secreto) {
      res.status(503).json({ ok: false, error: 'sin_configurar', detail: 'Falta INTERNAL_API_SECRET.' });
      return;
    }
    const sitio = config.PUBLIC_SITE_URL.replace(/\/$/, '');
    try {
      const r = await fetch(
        `${sitio}/api/market?route=informe-de-estado-interno&vehicleId=${encodeURIComponent(req.params.id)}`,
        { headers: { Authorization: `Bearer ${secreto}` } },
      );

      if (!r.ok) {
        // Lo que contesta PopCar se pasa tal cual: «todavía no está» no es un
        // error que haya que disfrazar de avería.
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; estado?: string };
        res.status(r.status).json({ ok: false, error: cuerpo.error ?? 'sin_informe', estado: cuerpo.estado });
        return;
      }

      const bytes = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="informe-${req.params.id}.pdf"`);
      res.setHeader('Content-Length', bytes.byteLength);
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(bytes);
    } catch (err) {
      falloInterno(res, 'informe_de_estado_failed', err);
    }
  },
);

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

    /*
     * `leeYGuarda` ya decide si hace falta leerlo: reaprovecha la lectura
     * buena del mismo documento y reintenta la que fallo. Decidirlo tambien
     * aqui era una segunda regla que un dia diria otra cosa — y la que habia
     * devolvia para siempre el fallo guardado aunque ya estuviera arreglado.
     */
    const otraVez = String(req.query.otraVez ?? '') === '1';
    const lectura = await leeYGuarda(req.params.id, { otraVez });

    if (!lectura) {
      res.status(404).json({ ok: false, error: 'sin_ficha_tecnica', detail: 'Este coche no tiene ficha técnica subida' });
      return;
    }

    const contra = comoQuedaContraElCoche(lectura, coche.rows[0]);
    /*
     * Y qué versiones puede tener ese motor.
     *
     * La versión no viene en ningún papel del coche, pero sí los datos duros;
     * con ellos se mira qué versiones existen de verdad entre nuestros
     * anuncios, que además son contra los que se le compara al tasarlo. Con su
     * `catch`: sin candidatas se escribe a mano, como hasta ahora.
     */
    const versiones = await lasVersionesPosibles(lectura, coche.rows[0]).catch(() => []);
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
        versiones,
        version_actual: String(coche.rows[0].version ?? ''),
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
