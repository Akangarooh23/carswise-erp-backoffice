import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';

/**
 * El explorador de datos.
 *
 * Las quince secciones del ERP son los caminos rápidos de lo que se usa a
 * diario. Pero en la base hay 66 tablas, y la mayoría no merecen una pantalla
 * propia: el catálogo maestro, los duplicados de ofertas, las tiradas del
 * rastreador. Cuando alguien necesita mirar una de esas, hoy tiene que pedirla.
 *
 * Aquí se elige tabla, se filtra por columna, se ordena y se exporta. Sin
 * escribir SQL y sin esperar a que alguien lo saque.
 *
 * ── Por qué esto no es una inyección de SQL esperando a ocurrir ────────────
 *
 * Los nombres de tabla y de columna no se pueden pasar como parámetros: van en
 * el texto de la consulta por narices. Así que nunca se usa lo que llega del
 * navegador: se pregunta a la base qué tablas y qué columnas existen de verdad,
 * y solo se acepta lo que aparece en esa lista. Lo que el usuario manda sirve
 * para *elegir* de una lista cerrada, no para construir la consulta.
 *
 * Los valores, esos sí, van siempre parametrizados.
 */

export const datosRouter = Router();

/** Tablas que no se enseñan: son llaves, no datos. */
export const OCULTAS = new Set([
  'erp_staff_passwords',      // hashes de contraseña
  'erp_refresh_tokens',       // sesiones vivas
  'erp_password_resets',      // códigos de recuperación en curso
  'moveadvisor_sessions',     // sesiones de clientes
]);

/** Columnas que nunca se devuelven, esté donde esté la tabla. */
export const COLUMNAS_OCULTAS = /(password|token|secret|_hash$|^hash$)/i;

const PUEDEN = ['admin', 'operations'] as const;

async function tablasReales(): Promise<string[]> {
  const r = await query(
    `SELECT c.relname AS t
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`
  );
  return r.rows.map((f) => String(f.t)).filter((t) => !OCULTAS.has(t));
}

async function columnasReales(tabla: string): Promise<string[]> {
  const r = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tabla]
  );
  return r.rows
    .map((f) => String(f.column_name))
    .filter((c) => !COLUMNAS_OCULTAS.test(c));
}

/** Devuelve el nombre solo si existe de verdad. Si no, null. */
async function tablaValida(pedida: string): Promise<string | null> {
  const todas = await tablasReales();
  return todas.includes(pedida) ? pedida : null;
}

// ── Qué hay ─────────────────────────────────────────────────────────────────

datosRouter.get('/datos/tablas', requireRole([...PUEDEN]), async (_req, res) => {
  try {
    const nombres = await tablasReales();
    // El recuento exacto de 800.000 filas es caro; la estimación del
    // planificador basta para orientar y es instantánea.
    const est = await query(
      `SELECT relname AS t, GREATEST(n_live_tup, 0)::bigint AS filas
       FROM pg_stat_user_tables WHERE schemaname = 'public'`
    );
    const porNombre = new Map(est.rows.map((f) => [String(f.t), Number(f.filas)] as [string, number]));
    res.json({
      ok: true,
      data: nombres.map((t) => ({ tabla: t, filas: porNombre.get(t) ?? 0 })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Mirar una ───────────────────────────────────────────────────────────────

datosRouter.get('/datos/:tabla', requireRole([...PUEDEN]), async (req, res) => {
  const tabla = await tablaValida(req.params.tabla);
  if (!tabla) { res.status(404).json({ ok: false, error: 'tabla_desconocida' }); return; }

  try {
    const columnas = await columnasReales(tabla);
    if (!columnas.length) { res.status(404).json({ ok: false, error: 'sin_columnas' }); return; }

    const limite = Math.min(Number(req.query.limit) || 50, 500);
    const salto = Math.max(Number(req.query.offset) || 0, 0);

    // El orden: solo por una columna que exista.
    const pedidoOrden = String(req.query.orden || '');
    const orden = columnas.includes(pedidoOrden) ? pedidoOrden : columnas[0];
    const sentido = String(req.query.desc || '') === '1' ? 'DESC' : 'ASC';

    // El filtro: igual, solo por columnas que existan. El valor va parametrizado.
    const cond: string[] = [];
    const vals: unknown[] = [];
    for (const [clave, valor] of Object.entries(req.query)) {
      if (!clave.startsWith('f_')) continue;
      const col = clave.slice(2);
      if (!columnas.includes(col) || !valor) continue;
      vals.push('%' + String(valor).toLowerCase() + '%');
      cond.push(`lower(COALESCE("${col}"::text, '')) LIKE $${vals.length}`);
    }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    const lista = columnas.map((c) => `"${c}"`).join(', ');
    const [filas, total] = await Promise.all([
      query(
        `SELECT ${lista} FROM "${tabla}" ${where} ORDER BY "${orden}" ${sentido}
         LIMIT ${limite} OFFSET ${salto}`,
        vals
      ),
      query(`SELECT COUNT(*)::int AS n FROM "${tabla}" ${where}`, vals),
    ]);

    res.json({
      ok: true,
      data: filas.rows,
      columnas,
      total: total.rows[0]?.n ?? 0,
      limite,
      salto,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Llevárselo ──────────────────────────────────────────────────────────────

datosRouter.get('/datos/:tabla/csv', requireRole([...PUEDEN]), async (req, res) => {
  const tabla = await tablaValida(req.params.tabla);
  if (!tabla) { res.status(404).json({ ok: false, error: 'tabla_desconocida' }); return; }

  try {
    const columnas = await columnasReales(tabla);
    const limite = Math.min(Number(req.query.limit) || 5000, 50000);
    const lista = columnas.map((c) => `"${c}"`).join(', ');
    const r = await query(`SELECT ${lista} FROM "${tabla}" LIMIT ${limite}`);

    // Punto y coma y BOM: es lo que abre bien Excel en español sin pelearse.
    const escapa = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lineas = [
      columnas.join(';'),
      ...r.rows.map((f: Record<string, unknown>) => columnas.map((c) => escapa(f[c])).join(';')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${tabla}.csv"`);
    res.send('﻿' + lineas.join('\r\n'));
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});
