/**
 * Los papeles, colgados de donde toque.
 *
 * Sustituye al almacén que solo entendía de solicitudes. Un documento se guarda
 * diciendo de qué cuelga —una solicitud, un pedido o un trámite— y **qué papel
 * es**, para poder decir cuáles faltan.
 *
 * Lo de antes no se pierde: al arrancar se copian los que hubiera, marcados como
 * de una solicitud, y la tabla vieja se queda donde está por si acaso.
 *
 * **No se sirven por su dirección pública.** El almacén de Supabase lo es, y
 * estos papeles llevan matrícula, nombre y dirección de una persona. Se guarda la
 * ruta, y para verlos hay que pedirlos aquí, que exige sesión del ERP.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { cajonesDelCoche } from '../lib/cajones-del-coche.js';
import { config } from '../config.js';
import { revisaFichero, tamanoDeBase64, TIPOS_ACEPTADOS } from '../lib/ficheros.js';
import { esAmbito, papelesEsperados, papelesQueFaltan } from '../lib/documentos.js';

export const documentosRouter = Router();

const BUCKET = 'vehicle-files';

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_documentos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambito      TEXT NOT NULL,
    ambito_id   TEXT NOT NULL,
    papel       TEXT NOT NULL DEFAULT '',
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL,
    ruta        TEXT NOT NULL,
    tamano      INTEGER NOT NULL DEFAULT 0,
    subido_por  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_documentos_ambito
    ON erp_documentos (ambito, ambito_id, created_at DESC)`;

/**
 * Lo que hubiera en el almacén viejo, traído aquí.
 *
 * Con `ON CONFLICT` no importa cuántas veces se ejecute: la clave es la misma.
 * La tabla de antes no se borra — copiar es reversible, borrar no.
 */
const MIGRA_LO_VIEJO = `
  INSERT INTO erp_documentos (id, ambito, ambito_id, nombre, tipo, ruta, tamano, subido_por, created_at)
  SELECT id, 'lead', lead_id, nombre, tipo, ruta, tamano, subido_por, created_at
    FROM erp_lead_documentos
  ON CONFLICT (id) DO NOTHING`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  // Si la tabla vieja no existe, esto falla y da igual: no había nada que traer.
  await query(MIGRA_LO_VIEJO, []).catch(() => {});
  preparado = true;
}

/**
 * Para quien mire los papeles desde fuera de aquí.
 *
 * Los pedidos no dejan mover un coche sin sus papeles imprescindibles, y esa
 * consulta puede ser la primera que toque la tabla en todo el arranque.
 */
export async function preparaDocumentos(): Promise<void> {
  await prepara();
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Un nombre de fichero que no puede pisar nada ni escaparse de su carpeta. */
function rutaDe(ambito: string, ambitoId: string, nombre: string): string {
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const carpeta = `${ambito}/${ambitoId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  return `documentos/${carpeta}/${randomUUID()}-${limpio}`;
}

/** Los ámbitos válidos, con su mensaje. */
function ambitoValido(v: string): boolean {
  return esAmbito(v);
}

// ── Qué papeles se esperan de un origen ─────────────────────────────────────
documentosRouter.get(
  '/documentos/esperados/:origen',
  requireRole(['admin', 'support', 'operations', 'sales']),
  (req, res) => {
    res.json({ ok: true, data: papelesEsperados(req.params.origen) });
  }
);

// ── Listar ──────────────────────────────────────────────────────────────────
documentosRouter.get(
  '/documentos/:ambito/:id',
  requireRole(['admin', 'support', 'operations']),
  async (req, res) => {
    if (!ambitoValido(req.params.ambito)) { res.status(400).json({ ok: false, error: 'ambito_no_valido' }); return; }
    try {
      await prepara();

      /**
       * Los papeles son del coche, no de la pantalla.
       *
       * La factura del vendedor alemán se sube desde el pedido o desde el
       * expediente, y hasta ahora cada uno miraba solo su cajón: subida en
       * uno, el otro seguía diciendo que faltaba, y acababa subida dos veces.
       *
       * Con `coche` se leen los cajones de ese expediente —el suyo, el de su
       * pedido y el de su peritación— y **lo que falta se cuenta sobre todos**.
       * Se sigue subiendo a un cajón concreto: lo que cambia es desde dónde
       * se ve.
       */
      const coche = nt(req.query.coche);
      const cajones = coche
        ? await cajonesDelCoche(coche)
        : [{ ambito: req.params.ambito, id: req.params.id }];
      const ambitos = cajones.map((c) => c.ambito);
      const ids = cajones.map((c) => c.id ?? '');

      const r = await query(
        `SELECT id, papel, nombre, tipo, tamano, subido_por, created_at,
                ambito, ambito_id
           FROM erp_documentos
          WHERE (ambito, ambito_id) IN (SELECT * FROM UNNEST($1::text[], $2::text[]))
          ORDER BY created_at DESC`,
        [ambitos, ids]
      );
      // Lo que falta, si se dice de qué origen es. Sin origen, solo la lista.
      const origen = nt(req.query.origen);
      const faltan = origen
        ? papelesQueFaltan(origen, r.rows.map((x) => String((x as { papel?: string }).papel ?? '')))
        : [];
      res.json({ ok: true, data: r.rows, faltan });
    } catch (err) {
      console.error('[documentos] listar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);

// ── Subir ───────────────────────────────────────────────────────────────────
documentosRouter.post(
  '/documentos/:ambito/:id',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    if (!ambitoValido(req.params.ambito)) { res.status(400).json({ ok: false, error: 'ambito_no_valido' }); return; }

    const nombre = nt(req.body?.nombre);
    const tipo = nt(req.body?.tipo);
    const papel = nt(req.body?.papel);
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

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('[documentos] almacén sin configurar');
      res.status(503).json({ ok: false, error: 'almacen_sin_configurar', detail: 'No se pueden guardar documentos ahora mismo.' });
      return;
    }

    const ruta = rutaDe(req.params.ambito, req.params.id, nombre);
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
        console.error('[documentos] subida fallida %d %s', subida.status, await subida.text().catch(() => ''));
        res.status(502).json({ ok: false, error: 'subida_fallida' });
        return;
      }
    } catch (err) {
      console.error('[documentos] subida:', (err as Error).message);
      res.status(502).json({ ok: false, error: 'subida_fallida' });
      return;
    }

    try {
      await prepara();
      const r = await query(
        `INSERT INTO erp_documentos (ambito, ambito_id, papel, nombre, tipo, ruta, tamano, subido_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, papel, nombre, tipo, tamano, subido_por, created_at`,
        [req.params.ambito, req.params.id, papel, nombre, tipo, ruta, tamano,
         req.actor?.name ?? req.actor?.sub ?? '']
      );
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) {
      console.error('[documentos] guardar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'documentos_failed' });
    }
  }
);

// ── Ver uno ─────────────────────────────────────────────────────────────────
documentosRouter.get(
  '/documentos/:ambito/:id/:docId',
  requireRole(['admin', 'support', 'operations']),
  async (req, res) => {
    if (!ambitoValido(req.params.ambito)) { res.status(400).json({ ok: false, error: 'ambito_no_valido' }); return; }
    try {
      await prepara();
      const r = await query(
        `SELECT nombre, tipo, ruta FROM erp_documentos WHERE id = $1 AND ambito = $2 AND ambito_id = $3`,
        [req.params.docId, req.params.ambito, req.params.id]
      );
      const doc = r.rows[0] as { nombre: string; tipo: string; ruta: string } | undefined;
      if (!doc) { res.status(404).json({ ok: false, error: 'documento_no_encontrado' }); return; }

      const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { res.status(503).json({ ok: false, error: 'almacen_sin_configurar' }); return; }

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
documentosRouter.delete(
  '/documentos/:ambito/:id/:docId',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    if (!ambitoValido(req.params.ambito)) { res.status(400).json({ ok: false, error: 'ambito_no_valido' }); return; }
    try {
      await prepara();
      const r = await query(
        `DELETE FROM erp_documentos WHERE id = $1 AND ambito = $2 AND ambito_id = $3 RETURNING ruta`,
        [req.params.docId, req.params.ambito, req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'documento_no_encontrado' }); return; }

      const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${(r.rows[0] as { ruta: string }).ruta}`, {
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
