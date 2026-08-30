/**
 * Lo que se gasta en dejar el coche listo.
 *
 * Taller, ruedas, ITV, chapa, limpieza. Es la partida que faltaba en el coste, y
 * la que hace que el margen sea el de verdad y no uno optimista: un coche de
 * importación que llega con las ruedas gastadas y una revisión pendiente puede
 * llevar mil euros encima antes de ponerse a la venta.
 *
 * Cuelgan de un pedido, como todo lo demás del coche, y suman en su coste.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const gastosRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_gastos_pedido (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id   TEXT NOT NULL,
    concepto    TEXT NOT NULL,
    proveedor   TEXT NOT NULL DEFAULT '',
    importe     NUMERIC(12,2) NOT NULL DEFAULT 0,
    fecha       DATE,
    notas       TEXT NOT NULL DEFAULT '',
    creado_por  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_gastos_pedido
    ON erp_gastos_pedido (pedido_id, created_at DESC)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Lo que más se repite, para no escribirlo cada vez.
 *
 * Sugerencias, no una lista cerrada: en un coche siempre aparece algo que nadie
 * había previsto.
 */
export const GASTOS_HABITUALES = [
  'Revisión y mantenimiento',
  'Neumáticos',
  'Frenos',
  'ITV',
  'Chapa y pintura',
  'Limpieza y preparación',
  'Segunda llave',
  'Reparación',
];

gastosRouter.get('/gastos/habituales', requireRole(['admin', 'support', 'operations']), (_req, res) => {
  res.json({ ok: true, data: GASTOS_HABITUALES });
});

gastosRouter.get('/pedidos/:id/gastos', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  try {
    await prepara();
    const r = await query(
      `SELECT id, concepto, proveedor, importe::numeric AS importe,
              TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, notas, creado_por, created_at
         FROM erp_gastos_pedido WHERE pedido_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    const total = r.rows.reduce((s, x) => s + Number((x as { importe?: unknown }).importe ?? 0), 0);
    res.json({ ok: true, data: r.rows, total });
  } catch (err) {
    console.error('[gastos] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'gastos_failed' });
  }
});

gastosRouter.post('/pedidos/:id/gastos', requireRole(['admin', 'operations']), async (req, res) => {
  const concepto = nt(req.body?.concepto);
  const importe = Number(req.body?.importe);
  if (!concepto) {
    res.status(400).json({ ok: false, error: 'falta_concepto', detail: 'Di en qué se ha gastado.' });
    return;
  }
  // Un gasto de cero no es un gasto: o no se sabe todavía, o no lo hubo.
  if (!(importe > 0)) {
    res.status(400).json({ ok: false, error: 'falta_importe', detail: 'Un gasto sin importe no suma nada al coste.' });
    return;
  }

  try {
    await prepara();
    const r = await query(
      `INSERT INTO erp_gastos_pedido (pedido_id, concepto, proveedor, importe, fecha, notas, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, concepto, proveedor, importe::numeric AS importe,
                 TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, notas, creado_por, created_at`,
      [req.params.id, concepto, nt(req.body?.proveedor), importe,
       nt(req.body?.fecha) || null, nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '']
    );
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[gastos] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'gastos_failed' });
  }
});

gastosRouter.delete('/pedidos/:id/gastos/:gastoId', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    await prepara();
    const r = await query(
      `DELETE FROM erp_gastos_pedido WHERE id = $1 AND pedido_id = $2 RETURNING id`,
      [req.params.gastoId, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'gasto_no_encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error('[gastos] borrar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'gastos_failed' });
  }
});
