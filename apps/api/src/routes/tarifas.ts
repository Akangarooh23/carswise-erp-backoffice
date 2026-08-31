/**
 * Las tarifas de transporte, colgando de su proveedor.
 *
 * Nacen porque el coste de traer un coche era un número fijo —700 €— igual para
 * Múnich que para Hamburgo, y ese número se le suma al precio del anuncio: no es
 * un dato interno, es lo que el cliente ve que le costaría puesto aquí.
 *
 * Una tarifa es de alguien. No se guardan precios sueltos «de mercado»: lo que
 * se estima es siempre lo que un proveedor concreto ha dicho que cobra, para que
 * al enseñarlo se pueda decir quién lo dijo.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import {
  loQueCuestaTraerlo, estaVigente, paisComparable, type Tarifa,
} from '../lib/tarifas.js';
import {
  loQueCuestaElPapeleo, desglosaTramite, type TarifaGestoria,
} from '../lib/tarifas-gestoria.js';
import { tramitesQueTocan, TRAMITES_AL_VENDER } from '../lib/tramites.js';

export const tarifasRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_tarifas_transporte (
    id            TEXT PRIMARY KEY,
    proveedor_id  TEXT NOT NULL,
    origen_pais   TEXT NOT NULL DEFAULT 'DE',
    origen_zona   TEXT NOT NULL DEFAULT '',
    destino_pais  TEXT NOT NULL DEFAULT 'ES',
    destino_zona  TEXT NOT NULL DEFAULT '',
    precio_1      NUMERIC(10,2),
    precio_2_3    NUMERIC(10,2),
    precio_4_8    NUMERIC(10,2),
    dias_transito INTEGER,
    vigente_hasta DATE,
    notas         TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_tarifas_corredor
    ON erp_tarifas_transporte (origen_pais, destino_pais, proveedor_id)`;

/**
 * Las de gestoría van aparte porque no se parecen.
 *
 * Un transporte se tarifa por corredor; un trámite, por trámite. Y una factura
 * de gestoría tiene tres partes que no llevan el mismo IVA: los honorarios sí,
 * las tasas de la DGT no. Guardarlas juntas obliga a suponer, y suponer aquí
 * infla el coste del coche.
 */
const ENSURE_GESTORIA = `
  CREATE TABLE IF NOT EXISTS erp_tarifas_gestoria (
    id            TEXT PRIMARY KEY,
    proveedor_id  TEXT NOT NULL,
    tramite       TEXT NOT NULL,
    honorarios    NUMERIC(10,2),
    tasas         NUMERIC(10,2),
    tasa_colegio  NUMERIC(10,2),
    colegio_con_iva BOOLEAN NOT NULL DEFAULT FALSE,
    vigente_hasta DATE,
    notas         TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_GESTORIA_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_tarifas_gestoria_prov
    ON erp_tarifas_gestoria (proveedor_id, tramite)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  await query(ENSURE_GESTORIA, []).catch(() => {});
  await query(ENSURE_GESTORIA_INDEX, []).catch(() => {});
  preparado = true;
}

/**
 * Para quien cargue tarifas desde fuera de aquí.
 *
 * Las tablas se crean solas la primera vez que alguien abre un proveedor. Un
 * guion de alta puede llegar antes que esa primera visita.
 */
export async function preparaTarifas(): Promise<void> {
  await prepara();
}

const CAMPOS = `t.id, t.proveedor_id, t.origen_pais, t.origen_zona, t.destino_pais, t.destino_zona,
                t.precio_1::numeric AS precio_1, t.precio_2_3::numeric AS precio_2_3,
                t.precio_4_8::numeric AS precio_4_8, t.dias_transito,
                TO_CHAR(t.vigente_hasta, 'YYYY-MM-DD') AS vigente_hasta,
                t.notas, t.created_at`;

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Un precio, o nada. Cero no es un precio: es un hueco mal rellenado. */
function precio(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function entero(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Las filas, ya con el nombre del proveedor: una tarifa sin dueño no se enseña. */
async function tarifasCon(where: string, valores: unknown[]): Promise<Tarifa[]> {
  const r = await query(
    `SELECT ${CAMPOS}, p.nombre AS proveedor
       FROM erp_tarifas_transporte t
       LEFT JOIN erp_proveedores p ON p.id = t.proveedor_id
      ${where}
      ORDER BY t.origen_pais, t.origen_zona, t.destino_zona, t.precio_1`,
    valores
  );
  return r.rows as unknown as Tarifa[];
}

// ── Las de un proveedor ─────────────────────────────────────────────────────
tarifasRouter.get(
  '/proveedores/:id/tarifas',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      res.json({ ok: true, data: await tarifasCon('WHERE t.proveedor_id = $1', [req.params.id]) });
    } catch (err) {
      console.error('[tarifas] listar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Añadir una ──────────────────────────────────────────────────────────────
tarifasRouter.post(
  '/proveedores/:id/tarifas',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    const origenPais = paisComparable(nt(req.body?.origen_pais) || 'DE');
    const destinoPais = paisComparable(nt(req.body?.destino_pais) || 'ES');
    const precios = [precio(req.body?.precio_1), precio(req.body?.precio_2_3), precio(req.body?.precio_4_8)];

    /**
     * Una tarifa sin ningún precio no es una tarifa.
     *
     * Guardarla dejaría un corredor que parece cubierto y que al estimar no da
     * nada, que es peor que no tenerlo: se cuenta con un precio que no existe.
     */
    if (!precios.some((p) => p != null)) {
      res.status(400).json({
        ok: false, error: 'sin_precio',
        detail: 'Pon al menos un precio. Una tarifa sin precio deja un corredor que parece cubierto y no lo está.',
      });
      return;
    }

    try {
      await prepara();
      const hay = await query(`SELECT id FROM erp_proveedores WHERE id = $1`, [req.params.id]);
      if (!hay.rows.length) {
        res.status(404).json({ ok: false, error: 'proveedor_no_encontrado' });
        return;
      }

      const { id } = await guardaConIdUnico(
        () => siguienteDeSerie('erp_tarifas_transporte', prefijoAnual('TRF')),
        async (nuevoId) => {
          await query(
            `INSERT INTO erp_tarifas_transporte
               (id, proveedor_id, origen_pais, origen_zona, destino_pais, destino_zona,
                precio_1, precio_2_3, precio_4_8, dias_transito, vigente_hasta, notas, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              nuevoId, req.params.id, origenPais, nt(req.body?.origen_zona),
              destinoPais, nt(req.body?.destino_zona),
              precios[0], precios[1], precios[2],
              entero(req.body?.dias_transito), nt(req.body?.vigente_hasta) || null,
              nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
            ]
          );
        }
      );

      const [fila] = await tarifasCon('WHERE t.id = $1', [id]);
      res.json({ ok: true, data: fila });
    } catch (err) {
      console.error('[tarifas] crear:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Quitar una ──────────────────────────────────────────────────────────────
tarifasRouter.delete(
  '/proveedores/:id/tarifas/:tarifaId',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `DELETE FROM erp_tarifas_transporte WHERE id = $1 AND proveedor_id = $2 RETURNING id`,
        [req.params.tarifaId, req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'tarifa_no_encontrada' }); return; }
      res.json({ ok: true, data: { id: req.params.tarifaId } });
    } catch (err) {
      console.error('[tarifas] borrar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Lo que costaría este viaje ──────────────────────────────────────────────
/**
 * La estimación, con nombre y apellidos.
 *
 * Devuelve todas las que sirven ordenadas, no un número solo: enseñar «780 €»
 * sin decir de quién invita a tratarlo como un hecho. «Trans-Frío 780, Becker
 * 950» es lo que de verdad tenemos.
 *
 * Las caducadas se quedan fuera: un precio que ya nadie sostiene no sirve para
 * estimar, y aplicarlo en silencio sería peor que no tener nada.
 */
tarifasRouter.get(
  '/tarifas/estimacion',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    const viaje = {
      origenPais: nt(req.query.origen_pais) || 'DE',
      origenZona: nt(req.query.origen_zona),
      destinoPais: nt(req.query.destino_pais) || 'ES',
      destinoZona: nt(req.query.destino_zona),
      coches: entero(req.query.coches) ?? 1,
    };

    try {
      await prepara();
      const todas = await tarifasCon(
        'WHERE t.origen_pais = $1 AND t.destino_pais = $2',
        [paisComparable(viaje.origenPais), paisComparable(viaje.destinoPais)]
      );
      const vigentes = todas.filter((t) => estaVigente(t));
      const opciones = loQueCuestaTraerlo(vigentes, viaje);
      res.json({
        ok: true,
        data: opciones,
        // Cuántas se descartaron por caducadas, para que un hueco raro se explique.
        caducadas: todas.length - vigentes.length,
      });
    } catch (err) {
      console.error('[tarifas] estimación:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

const CAMPOS_GESTORIA = `g.id, g.proveedor_id, g.tramite,
                g.honorarios::numeric AS honorarios, g.tasas::numeric AS tasas,
                g.tasa_colegio::numeric AS tasa_colegio, g.colegio_con_iva,
                TO_CHAR(g.vigente_hasta, 'YYYY-MM-DD') AS vigente_hasta, g.notas`;

async function gestoriaCon(where: string, valores: unknown[]): Promise<TarifaGestoria[]> {
  const r = await query(
    `SELECT ${CAMPOS_GESTORIA}, p.nombre AS proveedor
       FROM erp_tarifas_gestoria g
       LEFT JOIN erp_proveedores p ON p.id = g.proveedor_id
      ${where}
      ORDER BY g.tramite`,
    valores
  );
  return r.rows as unknown as TarifaGestoria[];
}

// ── Las tarifas de una gestoría ─────────────────────────────────────────────
tarifasRouter.get(
  '/proveedores/:id/tarifas-gestoria',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const filas = await gestoriaCon('WHERE g.proveedor_id = $1', [req.params.id]);
      res.json({
        ok: true,
        // Con el desglose hecho: el IVA solo va sobre los honorarios, y eso no
        // se puede dejar a que lo recalcule cada pantalla a su manera.
        data: filas.map((t) => ({ ...t, desglose: desglosaTramite(t) })),
      });
    } catch (err) {
      console.error('[tarifas] gestoría:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Añadir una ──────────────────────────────────────────────────────────────
tarifasRouter.post(
  '/proveedores/:id/tarifas-gestoria',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    const tramite = nt(req.body?.tramite);
    if (!tramite) {
      res.status(400).json({ ok: false, error: 'sin_tramite', detail: 'Di de qué trámite es el precio.' });
      return;
    }

    const honorarios = precio(req.body?.honorarios);
    const tasas = precio(req.body?.tasas);
    const colegio = precio(req.body?.tasa_colegio);
    if (honorarios == null && tasas == null && colegio == null) {
      res.status(400).json({
        ok: false, error: 'sin_precio',
        detail: 'Pon al menos un importe. Un trámite sin precio parece cubierto y no lo está.',
      });
      return;
    }

    try {
      await prepara();
      const hay = await query(`SELECT id FROM erp_proveedores WHERE id = $1`, [req.params.id]);
      if (!hay.rows.length) {
        res.status(404).json({ ok: false, error: 'proveedor_no_encontrado' });
        return;
      }

      const { id } = await guardaConIdUnico(
        () => siguienteDeSerie('erp_tarifas_gestoria', prefijoAnual('TGE')),
        async (nuevoId) => {
          await query(
            `INSERT INTO erp_tarifas_gestoria
               (id, proveedor_id, tramite, honorarios, tasas, tasa_colegio,
                colegio_con_iva, vigente_hasta, notas, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              nuevoId, req.params.id, tramite, honorarios, tasas, colegio,
              req.body?.colegio_con_iva === true,
              nt(req.body?.vigente_hasta) || null, nt(req.body?.notas),
              req.actor?.name ?? req.actor?.sub ?? '',
            ]
          );
        }
      );

      const [fila] = await gestoriaCon('WHERE g.id = $1', [id]);
      res.json({ ok: true, data: { ...fila, desglose: desglosaTramite(fila) } });
    } catch (err) {
      console.error('[tarifas] gestoría crear:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Quitar una ──────────────────────────────────────────────────────────────
tarifasRouter.delete(
  '/proveedores/:id/tarifas-gestoria/:tarifaId',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `DELETE FROM erp_tarifas_gestoria WHERE id = $1 AND proveedor_id = $2 RETURNING id`,
        [req.params.tarifaId, req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'tarifa_no_encontrada' }); return; }
      res.json({ ok: true, data: { id: req.params.tarifaId } });
    } catch (err) {
      console.error('[tarifas] gestoría borrar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);

// ── Lo que costaría el papeleo de un coche ──────────────────────────────────
/**
 * El papeleo de un coche, según de dónde viene y a nombre de quién va.
 *
 * Los trámites no se piden: los decide el ERP con las mismas reglas que abren
 * los expedientes. Por eso **dos cambios de nombre salen el doble** sin que
 * nadie multiplique nada: la lista trae la transferencia dos veces.
 *
 * Lo que no tenga tarifa sale aparte, por su nombre. Un total al que le falta
 * un trámite y no lo dice es peor que no tener total.
 */
tarifasRouter.get(
  '/tarifas-gestoria/estimacion',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    const origen = nt(req.query.origen) || 'importacion';
    const titularidad = nt(req.query.titularidad) || 'popcar';
    const proveedorId = nt(req.query.proveedor_id);

    // Al comprarlo y, si es nuestro, otra vez al venderlo.
    const tramites = [
      ...tramitesQueTocan(origen, titularidad),
      ...(titularidad === 'popcar' ? TRAMITES_AL_VENDER : []),
    ];

    try {
      await prepara();
      const tarifas = proveedorId
        ? await gestoriaCon('WHERE g.proveedor_id = $1', [proveedorId])
        : await gestoriaCon('', []);
      const vigentes = tarifas.filter((t) => estaVigente(t as never));
      res.json({ ok: true, data: { tramites, ...loQueCuestaElPapeleo(tramites, vigentes) } });
    } catch (err) {
      console.error('[tarifas] papeleo:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'tarifas_failed' });
    }
  }
);
