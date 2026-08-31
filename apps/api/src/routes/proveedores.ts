/**
 * Con quién trabajamos: transportistas, gestorías, talleres y vendedores.
 *
 * Se escribían a mano en cada tramo, en cada trámite y en cada gasto. Ahora se
 * eligen de una lista, y lo que ya estaba escrito se trae al arrancar: los
 * nombres sueltos se agrupan —«Transportes Gómez» y «transportes gomez» son
 * uno— y se convierten en proveedores.
 *
 * El texto que había en cada sitio **no se toca**. Un tramo de hace tres meses
 * sigue diciendo lo que decía; lo que cambia es que a partir de ahora se
 * escribe eligiendo.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import {
  TIPOS_PROVEEDOR, ETIQUETA_TIPO, tiposLimpios, nombreComparable, agrupaNombresSueltos,
  type TipoProveedor,
} from '../lib/proveedores.js';

export const proveedoresRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_proveedores (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    /* Para juntar lo que está escrito de tres maneras distintas. */
    clave       TEXT NOT NULL,
    tipos       TEXT[] NOT NULL DEFAULT '{}',
    nif         TEXT NOT NULL DEFAULT '',
    telefono    TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    direccion   TEXT NOT NULL DEFAULT '',
    notas       TEXT NOT NULL DEFAULT '',
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

/** Dos proveedores con el mismo nombre son el mismo proveedor. */
const ENSURE_UNIQUE = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_clave ON erp_proveedores (clave)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_UNIQUE, []).catch(() => {});
  await traeLoQueYaEstaba();
  preparado = true;
}

/**
 * Para quien dé de alta proveedores desde fuera de aquí.
 *
 * La tabla se crea sola la primera vez que alguien abre Proveedores. Un alta
 * hecha con un guion puede llegar antes que esa primera visita.
 */
export async function preparaProveedores(): Promise<void> {
  await prepara();
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Los nombres que ya estaban escritos a mano, convertidos en proveedores.
 *
 * Se hace una vez, al arrancar. Lo que ya exista no se duplica: la clave es el
 * nombre comparable, y el índice único hace el resto.
 */
async function traeLoQueYaEstaba() {
  const fuentes: { sql: string; tipo: TipoProveedor }[] = [
    { sql: `SELECT DISTINCT transportista AS nombre FROM erp_transportes WHERE COALESCE(transportista,'') <> ''`, tipo: 'transportista' },
    { sql: `SELECT DISTINCT gestoria AS nombre FROM erp_tramites WHERE COALESCE(gestoria,'') <> ''`, tipo: 'gestoria' },
    { sql: `SELECT DISTINCT proveedor AS nombre FROM erp_gastos_pedido WHERE COALESCE(proveedor,'') <> ''`, tipo: 'taller' },
    { sql: `SELECT DISTINCT proveedor AS nombre FROM erp_pedidos WHERE COALESCE(proveedor,'') <> ''`, tipo: 'vendedor' },
  ];

  const sueltos: { nombre: string; tipo: TipoProveedor }[] = [];
  for (const f of fuentes) {
    const r = await query(f.sql, []).catch(() => ({ rows: [] as { nombre?: string }[] }));
    for (const fila of r.rows as { nombre?: string }[]) {
      if (fila.nombre) sueltos.push({ nombre: String(fila.nombre), tipo: f.tipo });
    }
  }

  for (const g of agrupaNombresSueltos(sueltos)) {
    try {
      await guardaConIdUnico(
        () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
        async (nuevoId) => {
          await query(
            `INSERT INTO erp_proveedores (id, nombre, clave, tipos, creado_por)
             VALUES ($1,$2,$3,$4,'traído de lo que ya estaba escrito')
             ON CONFLICT (clave) DO NOTHING`,
            [nuevoId, g.nombre, nombreComparable(g.nombre), g.tipos]
          );
        }
      );
    } catch (e) {
      console.error('[proveedores] no se ha podido traer «%s»:', g.nombre, (e as Error).message);
    }
  }
}

const CAMPOS = `id, nombre, tipos, nif, telefono, email, direccion, notas, activo, created_at`;

// ── Los tipos que hay ───────────────────────────────────────────────────────
proveedoresRouter.get('/proveedores/tipos', requireRole(['admin', 'support', 'operations', 'sales']), (_req, res) => {
  res.json({ ok: true, data: TIPOS_PROVEEDOR.map((t) => ({ tipo: t, etiqueta: ETIQUETA_TIPO[t] })) });
});

// ── Listar ──────────────────────────────────────────────────────────────────
proveedoresRouter.get('/proveedores', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const tipo = nt(req.query.tipo);
  const valores: unknown[] = [];
  let where = 'WHERE activo = TRUE';
  if (tipo) { valores.push(tipo); where += ` AND $${valores.length} = ANY(tipos)`; }

  try {
    await prepara();
    const r = await query(`SELECT ${CAMPOS} FROM erp_proveedores ${where} ORDER BY nombre ASC`, valores);
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[proveedores] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'proveedores_failed' });
  }
});

// ── Crear ───────────────────────────────────────────────────────────────────
proveedoresRouter.post('/proveedores', requireRole(['admin', 'operations']), async (req, res) => {
  const nombre = nt(req.body?.nombre);
  if (!nombre) { res.status(400).json({ ok: false, error: 'falta_nombre' }); return; }
  const tipos = tiposLimpios(req.body?.tipos);
  if (!tipos.length) {
    res.status(400).json({ ok: false, error: 'falta_tipo', detail: 'Di qué hace: transportista, gestoría, taller…' });
    return;
  }

  try {
    await prepara();
    const clave = nombreComparable(nombre);
    // Si ya existe con ese nombre, se le suman los tipos en vez de duplicarlo.
    const yaHay = await query(`SELECT id, tipos FROM erp_proveedores WHERE clave = $1`, [clave]);
    if (yaHay.rows.length) {
      const previo = yaHay.rows[0] as { id: string; tipos: string[] };
      const juntos = [...new Set([...(previo.tipos ?? []), ...tipos])];
      const r = await query(
        `UPDATE erp_proveedores SET tipos = $2, activo = TRUE WHERE id = $1 RETURNING ${CAMPOS}`,
        [previo.id, juntos]
      );
      res.json({ ok: true, data: r.rows[0], yaEstaba: true });
      return;
    }

    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_proveedores (id, nombre, clave, tipos, nif, telefono, email, direccion, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [nuevoId, nombre, clave, tipos, nt(req.body?.nif), nt(req.body?.telefono),
           nt(req.body?.email).toLowerCase(), nt(req.body?.direccion), nt(req.body?.notas),
           req.actor?.name ?? req.actor?.sub ?? '']
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM erp_proveedores WHERE id = $1`, [id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[proveedores] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'proveedores_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
proveedoresRouter.patch('/proveedores/:id', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    await prepara();
    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (col: string, v: unknown) => { valores.push(v); sets.push(`${col} = $${valores.length}`); };

    if (req.body?.nombre !== undefined) {
      const nombre = nt(req.body.nombre);
      if (!nombre) { res.status(400).json({ ok: false, error: 'falta_nombre' }); return; }
      pon('nombre', nombre);
      pon('clave', nombreComparable(nombre));
    }
    if (req.body?.tipos !== undefined) {
      const tipos = tiposLimpios(req.body.tipos);
      if (!tipos.length) { res.status(400).json({ ok: false, error: 'falta_tipo' }); return; }
      pon('tipos', tipos);
    }
    for (const campo of ['nif', 'telefono', 'email', 'direccion', 'notas'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    // Dar de baja, no borrar: lo que se le compró sigue siendo suyo.
    if (req.body?.activo !== undefined) pon('activo', req.body.activo !== false);

    if (!sets.length) { res.status(400).json({ ok: false, error: 'nada_que_cambiar' }); return; }
    valores.push(req.params.id);
    const r = await query(
      `UPDATE erp_proveedores SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'proveedor_no_encontrado' }); return; }
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[proveedores] cambiar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'proveedores_failed' });
  }
});

/**
 * Lo que llevamos con cada uno.
 *
 * La pregunta que justifica tener esta lista: cuánto se le ha pagado a este
 * transportista, cuántos trámites lleva esta gestoría. Se cuenta por el nombre,
 * que es lo que hay guardado en cada tramo y en cada trámite.
 */
proveedoresRouter.get('/proveedores/:id/cuentas', requireRole(['admin', 'operations']), async (req, res) => {
  try {
    await prepara();
    const p = await query(`SELECT nombre FROM erp_proveedores WHERE id = $1`, [req.params.id]);
    if (!p.rows.length) { res.status(404).json({ ok: false, error: 'proveedor_no_encontrado' }); return; }
    const nombre = String((p.rows[0] as { nombre: string }).nombre);

    const [transportes, tramites, gastos] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(coste),0)::numeric AS total
               FROM erp_transportes WHERE lower(transportista) = lower($1)`, [nombre])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(coste),0)::numeric AS total
               FROM erp_tramites WHERE lower(gestoria) = lower($1)`, [nombre])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(importe),0)::numeric AS total
               FROM erp_gastos_pedido WHERE lower(proveedor) = lower($1)`, [nombre])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
    ]);

    const lee = (r: { rows: unknown[] }) => {
      const f = (r.rows[0] ?? {}) as { n?: number; total?: unknown };
      return { cuantos: Number(f.n) || 0, total: Number(f.total) || 0 };
    };
    const partes = { transportes: lee(transportes), tramites: lee(tramites), gastos: lee(gastos) };
    res.json({
      ok: true,
      data: { ...partes, total: partes.transportes.total + partes.tramites.total + partes.gastos.total },
    });
  } catch (err) {
    console.error('[proveedores] cuentas:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'proveedores_failed' });
  }
});
