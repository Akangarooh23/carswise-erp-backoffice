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
  fallaLaMatriz, EXPLICA_FALLO_DE_MATRIZ, elYLosSuyos,
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

/**
 * De qué grupo es, si es de alguno.
 *
 * No se fusionan las filas: la factura la emite la filial, con su CIF. Esto
 * solo dice que van juntas, para poder sumar lo del grupo y para que una tarifa
 * negociada con él valga para las sociedades que facturan.
 */
const ENSURE_MATRIZ = `
  ALTER TABLE erp_proveedores ADD COLUMN IF NOT EXISTS matriz_id TEXT`;

/**
 * Dónde se le paga.
 *
 * Faltaba, y es el dato del que depende que salga dinero: a un vendedor
 * alemán se le transfieren 16.890 € del cliente. Sin sitio propio acababa en
 * «notas», que es texto libre —no se puede exigir, ni comprobar, ni cotejar el
 * día que llegue un correo con un dígito cambiado—.
 */
const ENSURE_IBAN = `
  ALTER TABLE erp_proveedores ADD COLUMN IF NOT EXISTS iban TEXT NOT NULL DEFAULT ''`;

/**
 * Quién sale a abrir, y en qué horas.
 *
 * Una empresa tiene centralita; un camión pregunta por alguien. Y esas dos
 * cosas acababan escritas a mano en cada tramo, coche a coche: nuestro
 * depósito es el origen de todos los segundos viajes y el mismo nombre, el
 * mismo teléfono y el mismo horario se volvían a teclear cada vez, con la
 * variedad de erratas que eso trae.
 *
 * El horario es texto libre y no dos horas: lo que se contesta es «de lunes a
 * viernes de 9 a 17, avisando antes», y eso no cabe en un desplegable sin
 * perder la mitad.
 */
const ENSURE_CONTACTO = `
  ALTER TABLE erp_proveedores
    ADD COLUMN IF NOT EXISTS contacto TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS horario  TEXT NOT NULL DEFAULT ''`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_CONTACTO, []).catch(() => {});
  await query(ENSURE_UNIQUE, []).catch(() => {});
  await query(ENSURE_MATRIZ, []).catch(() => {});
  await query(ENSURE_IBAN, []).catch(() => {});
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

/** Sin espacios y en mayúsculas, que es como se compara un IBAN con otro. */
export function ibanLimpio(v: unknown): string {
  return nt(v).replace(/[\s-]/g, '').toUpperCase();
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

const CAMPOS = `id, nombre, tipos, nif, telefono, email, direccion, contacto, horario,
                iban, notas, activo, created_at,
                matriz_id,
                (SELECT nombre FROM erp_proveedores m WHERE m.id = erp_proveedores.matriz_id) AS matriz`;

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
          `INSERT INTO erp_proveedores (id, nombre, clave, tipos, nif, telefono, email, direccion,
                                        contacto, horario, iban, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [nuevoId, nombre, clave, tipos, nt(req.body?.nif), nt(req.body?.telefono),
           nt(req.body?.email).toLowerCase(), nt(req.body?.direccion),
           nt(req.body?.contacto), nt(req.body?.horario), ibanLimpio(req.body?.iban),
           nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '']
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
    for (const campo of ['nif', 'telefono', 'email', 'direccion', 'contacto', 'horario', 'notas'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    // El IBAN se guarda sin espacios: escrito de dos formas distintas, el mismo
    // número no se puede comparar con el que venga en un correo.
    if (req.body?.iban !== undefined) pon('iban', ibanLimpio(req.body.iban));
    // Dar de baja, no borrar: lo que se le compró sigue siendo suyo.
    if (req.body?.activo !== undefined) pon('activo', req.body.activo !== false);

    /**
     * De qué grupo cuelga.
     *
     * Se comprueba contra los que hay, no contra lo que llegue: una cadena de
     * tres niveles o un ciclo dejarían «lo que llevamos con el grupo» sin una
     * respuesta, y la suma podría no terminar.
     */
    if (req.body?.matriz_id !== undefined) {
      const matrizId = nt(req.body.matriz_id);
      if (matrizId) {
        const todos = await query(`SELECT id, matriz_id FROM erp_proveedores`, []);
        const fallo = fallaLaMatriz(
          req.params.id, matrizId,
          todos.rows as { id: string; matriz_id?: string | null }[]
        );
        if (fallo) {
          res.status(400).json({
            ok: false, error: 'matriz_no_valida', detail: EXPLICA_FALLO_DE_MATRIZ[fallo],
          });
          return;
        }
        if (!todos.rows.some((x) => (x as { id: string }).id === matrizId)) {
          res.status(404).json({
            ok: false, error: 'matriz_no_encontrada',
            detail: 'Esa matriz no existe. Dala de alta como proveedor antes de colgarle una filial.',
          });
          return;
        }
      }
      pon('matriz_id', matrizId || null);
    }

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
    /**
     * Se suma por nombre, y con los del grupo.
     *
     * Lo que hay escrito en cada tramo y en cada trámite es el nombre de quien
     * facturó. Al abrir un grupo se suman también sus filiales —es el número con
     * el que se negocia—; al abrir una filial, solo lo suyo, o el mismo gasto se
     * contaría dos veces.
     */
    const todos = await query(`SELECT id, nombre, matriz_id FROM erp_proveedores`, []);
    const suyos = elYLosSuyos(
      req.params.id,
      todos.rows as { id: string; nombre: string; matriz_id?: string | null }[]
    );
    if (!suyos.length) { res.status(404).json({ ok: false, error: 'proveedor_no_encontrado' }); return; }
    const nombres = suyos.map((x) => x.nombre.toLowerCase());

    const [transportes, tramites, gastos] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(coste),0)::numeric AS total
               FROM erp_transportes WHERE lower(transportista) = ANY($1)`, [nombres])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(coste),0)::numeric AS total
               FROM erp_tramites WHERE lower(gestoria) = ANY($1)`, [nombres])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(importe),0)::numeric AS total
               FROM erp_gastos_pedido WHERE lower(proveedor) = ANY($1)`, [nombres])
        .catch(() => ({ rows: [{ n: 0, total: 0 }] })),
    ]);

    const lee = (r: { rows: unknown[] }) => {
      const f = (r.rows[0] ?? {}) as { n?: number; total?: unknown };
      return { cuantos: Number(f.n) || 0, total: Number(f.total) || 0 };
    };
    const partes = { transportes: lee(transportes), tramites: lee(tramites), gastos: lee(gastos) };
    res.json({
      ok: true,
      data: {
        ...partes,
        total: partes.transportes.total + partes.tramites.total + partes.gastos.total,
        // Cuántas sociedades se han sumado, para que un total grande se explique.
        sociedades: suyos.length,
      },
    });
  } catch (err) {
    console.error('[proveedores] cuentas:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'proveedores_failed' });
  }
});
