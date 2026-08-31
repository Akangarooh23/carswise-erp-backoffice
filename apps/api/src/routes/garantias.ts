/**
 * Los productos de garantía que se le ofrecen al cliente.
 *
 * Se gestionan aquí y los lee PopCar para pintarlos en la oferta. Van con
 * prefijo `market_` y no `erp_` porque son un producto del marketplace, como las
 * alertas: el ERP los mantiene, pero de quien son es de la tienda.
 *
 * Hay una **base**, que va dentro del precio que se enseña, y otras por encima o
 * por debajo. Al cliente no se le presenta una lista de precios sueltos, sino la
 * base y la diferencia con cada alternativa.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';

export const garantiasRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS market_garantias (
    id                   TEXT PRIMARY KEY,
    nombre               TEXT NOT NULL,
    nivel                INTEGER NOT NULL DEFAULT 1,
    /* La que va dentro del precio que se enseña. Solo puede haber una activa. */
    es_base              BOOLEAN NOT NULL DEFAULT FALSE,
    /* FALSE cuando es el mínimo legal: entonces no se puede ofrecer quitarla. */
    renunciable          BOOLEAN NOT NULL DEFAULT TRUE,
    meses                INTEGER,
    km_cubiertos         INTEGER,
    /* Lo que se le cobra al cliente. */
    precio               NUMERIC(10,2) NOT NULL DEFAULT 0,
    /* Lo que nos cuesta a nosotros. Interno: nunca sale en la oferta. */
    coste                NUMERIC(10,2),
    proveedor_id         TEXT,
    /* A qué coches se puede ofrecer. Con doce años de media, esto descarta muchas. */
    antiguedad_max_anios INTEGER,
    km_max_vehiculo      INTEGER,
    activo               BOOLEAN NOT NULL DEFAULT TRUE,
    notas                TEXT NOT NULL DEFAULT '',
    creado_por           TEXT NOT NULL DEFAULT '',
    created_at           TIMESTAMPTZ DEFAULT NOW()
  )`;

/**
 * Lo que cubre y lo que no.
 *
 * Poder listar lo que **no** cubre vale tanto como lo que cubre: es lo que evita
 * la discusión del día que algo se rompe.
 */
const ENSURE_COBERTURAS = `
  CREATE TABLE IF NOT EXISTS market_garantia_coberturas (
    id          BIGSERIAL PRIMARY KEY,
    garantia_id TEXT NOT NULL,
    texto       TEXT NOT NULL,
    incluida    BOOLEAN NOT NULL DEFAULT TRUE,
    orden       INTEGER NOT NULL DEFAULT 1
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_garantia_coberturas
    ON market_garantia_coberturas (garantia_id, orden)`;

/** Solo una base activa: con dos, el precio dependería de cuál se lea primero. */
const ENSURE_UNA_BASE = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_garantias_una_base
    ON market_garantias ((TRUE)) WHERE es_base AND activo`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_COBERTURAS, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  await query(ENSURE_UNA_BASE, []).catch(() => {});
  preparado = true;
}

/** Para quien cargue productos desde un guion, antes de la primera visita. */
export async function preparaGarantias(): Promise<void> {
  await prepara();
}

const CAMPOS = `id, nombre, nivel, es_base, renunciable, meses, km_cubiertos,
                precio::numeric AS precio, coste::numeric AS coste, proveedor_id,
                antiguedad_max_anios, km_max_vehiculo, activo, notas, created_at`;

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function entero(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

function importe(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function conCoberturas(filas: Record<string, unknown>[]) {
  if (!filas.length) return filas;
  const ids = filas.map((f) => String(f.id));
  const r = await query(
    `SELECT garantia_id, texto, incluida, orden FROM market_garantia_coberturas
      WHERE garantia_id = ANY($1) ORDER BY orden`,
    [ids]
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return filas.map((f) => ({
    ...f,
    coberturas: r.rows.filter((c) => c.garantia_id === f.id),
  }));
}

// ── Listar ──────────────────────────────────────────────────────────────────
garantiasRouter.get('/garantias', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    await prepara();
    const r = await query(`SELECT ${CAMPOS} FROM market_garantias ORDER BY activo DESC, nivel, nombre`, []);
    res.json({ ok: true, data: await conCoberturas(r.rows) });
  } catch (err) {
    console.error('[garantias] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'garantias_failed' });
  }
});

// ── Crear ───────────────────────────────────────────────────────────────────
garantiasRouter.post('/garantias', requireRole(['admin', 'operations']), async (req, res) => {
  const nombre = nt(req.body?.nombre);
  if (!nombre) {
    res.status(400).json({ ok: false, error: 'sin_nombre', detail: 'Ponle nombre: es lo que ve el cliente.' });
    return;
  }
  const precio = importe(req.body?.precio);
  if (precio == null) {
    res.status(400).json({
      ok: false, error: 'sin_precio',
      detail: 'Di lo que cuesta. Una garantía sin precio no se puede sumar ni restar de un total.',
    });
    return;
  }

  try {
    await prepara();
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('market_garantias', prefijoAnual('GAR')),
      async (nuevoId) => {
        await query(
          `INSERT INTO market_garantias
             (id, nombre, nivel, es_base, renunciable, meses, km_cubiertos, precio, coste,
              proveedor_id, antiguedad_max_anios, km_max_vehiculo, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            nuevoId, nombre, entero(req.body?.nivel) ?? 1,
            req.body?.es_base === true, req.body?.renunciable !== false,
            entero(req.body?.meses), entero(req.body?.km_cubiertos),
            precio, importe(req.body?.coste), nt(req.body?.proveedor_id) || null,
            entero(req.body?.antiguedad_max_anios), entero(req.body?.km_max_vehiculo),
            nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
          ]
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM market_garantias WHERE id = $1`, [id]);
    res.json({ ok: true, data: (await conCoberturas(r.rows))[0] });
  } catch (err) {
    const msg = (err as Error).message;
    if (/idx_garantias_una_base/.test(msg)) {
      res.status(409).json({
        ok: false, error: 'ya_hay_base',
        detail: 'Ya hay una garantía base activa. Con dos, el precio dependería de cuál se leyera primero.',
      });
      return;
    }
    console.error('[garantias] crear:', msg);
    res.status(500).json({ ok: false, error: 'garantias_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
garantiasRouter.patch('/garantias/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const sets: string[] = [];
  const valores: unknown[] = [];
  const pon = (col: string, v: unknown) => { valores.push(v); sets.push(`${col} = $${valores.length}`); };

  for (const campo of ['nombre', 'notas', 'proveedor_id'] as const) {
    if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
  }
  for (const campo of ['nivel', 'meses', 'km_cubiertos', 'antiguedad_max_anios', 'km_max_vehiculo'] as const) {
    if (req.body?.[campo] !== undefined) pon(campo, entero(req.body[campo]));
  }
  for (const campo of ['precio', 'coste'] as const) {
    if (req.body?.[campo] !== undefined) pon(campo, importe(req.body[campo]));
  }
  for (const campo of ['es_base', 'renunciable', 'activo'] as const) {
    if (req.body?.[campo] !== undefined) pon(campo, req.body[campo] === true);
  }
  if (!sets.length) { res.status(400).json({ ok: false, error: 'nada_que_cambiar' }); return; }

  try {
    await prepara();
    valores.push(req.params.id);
    const r = await query(
      `UPDATE market_garantias SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'garantia_no_encontrada' }); return; }
    res.json({ ok: true, data: (await conCoberturas(r.rows))[0] });
  } catch (err) {
    const msg = (err as Error).message;
    if (/idx_garantias_una_base/.test(msg)) {
      res.status(409).json({ ok: false, error: 'ya_hay_base', detail: 'Ya hay una garantía base activa.' });
      return;
    }
    console.error('[garantias] cambiar:', msg);
    res.status(500).json({ ok: false, error: 'garantias_failed' });
  }
});

// ── Lo que cubre ────────────────────────────────────────────────────────────
garantiasRouter.post('/garantias/:id/coberturas', requireRole(['admin', 'operations']), async (req, res) => {
  const texto = nt(req.body?.texto);
  if (!texto) { res.status(400).json({ ok: false, error: 'sin_texto' }); return; }
  try {
    await prepara();
    await query(
      `INSERT INTO market_garantia_coberturas (garantia_id, texto, incluida, orden)
       VALUES ($1,$2,$3,COALESCE((SELECT MAX(orden)+1 FROM market_garantia_coberturas WHERE garantia_id=$1),1))`,
      [req.params.id, texto, req.body?.incluida !== false]
    );
    res.json({ ok: true, data: { garantia_id: req.params.id, texto } });
  } catch (err) {
    console.error('[garantias] cobertura:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'garantias_failed' });
  }
});

garantiasRouter.delete('/garantias/:id/coberturas/:coberturaId', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    await prepara();
    const r = await query(
      `DELETE FROM market_garantia_coberturas WHERE id = $1 AND garantia_id = $2 RETURNING id`,
      [req.params.coberturaId, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'cobertura_no_encontrada' }); return; }
    res.json({ ok: true, data: { id: req.params.coberturaId } });
  } catch (err) {
    console.error('[garantias] borrar cobertura:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'garantias_failed' });
  }
});
