/**
 * Los papeles de un expediente.
 *
 * Una importación deja documentos por el camino: la factura del vendedor
 * alemán, la ficha técnica, el justificante del impuesto de matriculación, el
 * permiso de circulación. Hasta ahora no había dónde ponerlos, así que vivían en
 * el correo de quien los recibiera — y el día que esa persona no está, el
 * expediente no tiene nada.
 *
 * **No se sirven por su dirección pública.** El almacén de Supabase lo es, y
 * estos papeles llevan matrícula, nombre y dirección de una persona. Lo que se
 * guarda es la ruta; para verlos hay que pedirlos aquí, y aquí se exige sesión
 * del ERP. Mientras el cubo siga siendo público eso no es un candado perfecto
 * —quien acierte la ruta entra—, y por eso el nombre lleva un tramo aleatorio;
 * el candado de verdad es mudar el cubo, que está en Pendientes.
 *
 * Son internos: el cliente no los ve en su panel. Lo que tenga que llegarle se
 * le manda, que es lo que ya se hace.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { revisaFichero, tamanoDeBase64, TIPOS_ACEPTADOS } from '../lib/ficheros.js';

export const leadDocumentosRouter = Router();

const BUCKET = 'vehicle-files';

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_lead_documentos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL,
    ruta        TEXT NOT NULL,
    tamano      INTEGER NOT NULL DEFAULT 0,
    subido_por  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_lead_documentos_lead
    ON erp_lead_documentos (lead_id, created_at DESC)`;

async function preparaTabla() {
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Un nombre de fichero que no puede pisar nada ni escaparse de su carpeta. */
function rutaDe(leadId: string, nombre: string): string {
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `expedientes/${leadId.replace(/[^a-zA-Z0-9._-]/g, '_')}/${randomUUID()}-${limpio}`;
}

// ── Listar ──────────────────────────────────────────────────────────────────
leadDocumentosRouter.get(
  '/leads/:id/documentos',
  requireRole(['admin', 'support', 'operations']),
  async (req, res) => {
    try {
      await preparaTabla();
      const r = await query(
        `SELECT id, nombre, tipo, tamano, subido_por, created_at
           FROM erp_lead_documentos WHERE lead_id = $1 ORDER BY created_at DESC`,
        [req.params.id]
      );
      res.json({ ok: true, data: r.rows });
    } catch (err) {
      console.error('[documentos] listar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);

// ── Subir ───────────────────────────────────────────────────────────────────
leadDocumentosRouter.post(
  '/leads/:id/documentos',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    const nombre = nt(req.body?.nombre);
    const tipo = nt(req.body?.tipo);
    const contenido = nt(req.body?.contenido_base64);

    if (!nombre || !contenido) {
      res.status(400).json({ ok: false, error: 'faltan_datos', detail: 'Hace falta el fichero y su nombre.' });
      return;
    }

    const tamano = tamanoDeBase64(contenido);
    const problema = revisaFichero(nombre, tipo, tamano);
    if (problema) {
      res.status(400).json({ ok: false, error: 'fichero_no_valido', detail: problema.motivo, acepta: TIPOS_ACEPTADOS });
      return;
    }

    // Que el expediente exista. Colgar papeles de un identificador inventado
    // deja ficheros que no son de nadie.
    const existe = await query(`SELECT id FROM moveadvisor_market_leads WHERE id = $1`, [req.params.id]);
    if (!existe.rows.length) {
      res.status(404).json({ ok: false, error: 'lead_not_found' });
      return;
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[documentos] almacén sin configurar');
      res.status(503).json({ ok: false, error: 'almacen_sin_configurar', detail: 'No se pueden guardar documentos ahora mismo.' });
      return;
    }

    const ruta = rutaDe(req.params.id, nombre);
    try {
      const subida = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${ruta}`, {
        method: 'POST',
        headers: {
          // Sin `apikey` la clave nueva de Supabase no vale.
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': tipo || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: Buffer.from(contenido, 'base64'),
      });
      if (!subida.ok) {
        const detalle = await subida.text().catch(() => '');
        console.error('[documentos] subida fallida %d %s', subida.status, detalle);
        res.status(502).json({ ok: false, error: 'subida_fallida' });
        return;
      }
    } catch (err) {
      console.error('[documentos] subida:', (err as Error).message);
      res.status(502).json({ ok: false, error: 'subida_fallida' });
      return;
    }

    try {
      await preparaTabla();
      const r = await query(
        `INSERT INTO erp_lead_documentos (lead_id, nombre, tipo, ruta, tamano, subido_por)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, nombre, tipo, tamano, subido_por, created_at`,
        [req.params.id, nombre, tipo, ruta, tamano, req.actor?.name ?? req.actor?.sub ?? '']
      );
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) {
      console.error('[documentos] guardar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);

// ── Ver uno ─────────────────────────────────────────────────────────────────
leadDocumentosRouter.get(
  '/leads/:id/documentos/:docId',
  requireRole(['admin', 'support', 'operations']),
  async (req, res) => {
    try {
      await preparaTabla();
      const r = await query(
        `SELECT nombre, tipo, ruta FROM erp_lead_documentos WHERE id = $1 AND lead_id = $2`,
        [req.params.docId, req.params.id]
      );
      const doc = r.rows[0];
      if (!doc) { res.status(404).json({ ok: false, error: 'documento_no_encontrado' }); return; }

      const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        res.status(503).json({ ok: false, error: 'almacen_sin_configurar' });
        return;
      }
      const bajada = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${doc.ruta}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      if (!bajada.ok) { res.status(502).json({ ok: false, error: 'no_se_puede_leer' }); return; }

      res.setHeader('Content-Type', doc.tipo || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${String(doc.nombre).replace(/"/g, '')}"`);
      res.send(Buffer.from(await bajada.arrayBuffer()));
    } catch (err) {
      console.error('[documentos] ver:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);

// ── Quitar ──────────────────────────────────────────────────────────────────
//
// Se borra la fila y el fichero. Un documento que sigue en el almacén después de
// quitarlo de la pantalla es un papel con datos de alguien que ya nadie mira.
leadDocumentosRouter.delete(
  '/leads/:id/documentos/:docId',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await preparaTabla();
      const r = await query(
        `DELETE FROM erp_lead_documentos WHERE id = $1 AND lead_id = $2 RETURNING ruta`,
        [req.params.docId, req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'documento_no_encontrado' }); return; }

      const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${r.rows[0].ruta}`, {
          method: 'DELETE',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
        }).catch((e: Error) => console.error('[documentos] borrar del almacén:', e.message));
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[documentos] borrar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);
