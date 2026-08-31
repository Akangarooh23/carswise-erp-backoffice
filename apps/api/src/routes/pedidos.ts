/**
 * Los pedidos: coches encargados a un proveedor.
 *
 * Vivían dentro de Importaciones, porque hasta ahora el único coche que se
 * encargaba venía de Alemania. Pero encargar es lo mismo se lo pidas a un
 * vendedor alemán, a un concesionario de aquí o a una empresa de renting, y
 * también se encarga sin cliente detrás: comprar una unidad para stock es un
 * pedido y no cuelga de ninguna solicitud.
 *
 * Por eso tiene ficha propia y no es una vista de otra cosa.
 *
 * El pedido es el registro interno —proveedor, coste, fechas de verdad—. Cuando
 * sale de una solicitud de importación, el expediente sigue teniendo sus etapas,
 * que son las que ve el cliente en su panel. El pedido empuja la etapa; la etapa
 * nunca manda sobre el pedido. Un solo sentido, para que no haya dos verdades
 * sobre dónde está un coche.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import {
  ESTADOS_PEDIDO, CANCELADO, esEstadoValido, esOrigenPedido,
  puedeEncargarse, notaDelCambio, alMenos, importeAcordado, faltaPorEstado, compraPagada,
} from '../lib/pedidos.js';
import { papelesQueFaltan } from '../lib/documentos.js';
import { preparaDocumentos } from './documentos.js';
import { abreTramitesDePedido } from './tramites.js';
import { abreTransporteDePedido } from './transportes.js';
import { haSalido } from '../lib/transportes.js';
import { costeDelCoche, margenDelCoche, margenPorOrigen } from '../lib/coste.js';
import {
  esTitularidad, titularidadPorDefecto, vigilaElPlazo, revenderAntesDe, PLAZO_REVENTA_MESES,
} from '../lib/titularidad.js';
import {
  comprobacionesQueTocan, comprobacionesQueFaltan, puedeEncargarseConComprobaciones, marca,
  type Comprobadas,
} from '../lib/comprobaciones.js';
import {
  faltaPorMirar, puedeDarsePorRecibido, reclamacionCompleta, anota, type Recepcion,
} from '../lib/recepcion.js';

export const pedidosRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_pedidos (
    id             TEXT PRIMARY KEY,
    origen         TEXT NOT NULL,
    estado         TEXT NOT NULL DEFAULT 'Borrador',
    proveedor      TEXT NOT NULL DEFAULT '',
    vehiculo_titulo TEXT NOT NULL DEFAULT '',
    vehiculo_id    TEXT NOT NULL DEFAULT '',
    matricula      TEXT NOT NULL DEFAULT '',
    bastidor       TEXT NOT NULL DEFAULT '',
    importe        NUMERIC(12,2),
    cliente_email  TEXT NOT NULL DEFAULT '',
    lead_id        TEXT,
    fecha_estimada DATE,
    fecha_pedido      TIMESTAMPTZ,
    fecha_confirmado  TIMESTAMPTZ,
    fecha_recepcion   TIMESTAMPTZ,
    notas          TEXT NOT NULL DEFAULT '',
    -- Lo que se miró antes de comprarle a un particular, con quién y cuándo.
    comprobaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- A nombre de quién va el coche. No es lo mismo que quién lo vende.
    titularidad    TEXT NOT NULL DEFAULT 'popcar',
    -- Hasta cuándo hay que revenderlo si está a nuestro nombre.
    revender_antes_de DATE,
    -- Lo que se vio del coche al llegar: kilómetros, llaves, daños.
    recepcion      JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_por     TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_HISTORY = `
  CREATE TABLE IF NOT EXISTS erp_pedido_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id   TEXT NOT NULL,
    operador    TEXT NOT NULL,
    campo       TEXT NOT NULL,
    antes       TEXT,
    despues     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

/**
 * Un pedido por solicitud, no dos.
 *
 * La etapa de un expediente se puede tocar más de una vez —se pasa, se vuelve
 * atrás, se corrige—, y cada vez llamaría aquí. Sin esto, un mismo coche
 * acabaría con tres pedidos al mismo proveedor.
 */
const ENSURE_UNIQUE_LEAD = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_lead
    ON erp_pedidos (lead_id) WHERE lead_id IS NOT NULL`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_pedidos_estado
    ON erp_pedidos (estado, created_at DESC)`;

/** Para las tablas que ya estuvieran creadas sin esta columna. */
const ENSURE_COMPROBACIONES = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS comprobaciones JSONB NOT NULL DEFAULT '{}'::jsonb`;

const ENSURE_TITULARIDAD = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS titularidad TEXT NOT NULL DEFAULT 'popcar'`;

const ENSURE_PLAZO = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS revender_antes_de DATE`;

/**
 * La factura del vendedor y su pago.
 *
 * Sin esto no se sabía si el coche estaba pagado. Un coche que se mueve sin
 * pagar sigue siendo del vendedor, viajando a nuestro riesgo.
 */
const ENSURE_COMPRA = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS factura_proveedor TEXT NOT NULL DEFAULT ''`;

const ENSURE_PAGO = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS factura_pagada_el DATE`;

const ENSURE_RECEPCION = `
  ALTER TABLE erp_pedidos ADD COLUMN IF NOT EXISTS recepcion JSONB NOT NULL DEFAULT '{}'::jsonb`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_COMPROBACIONES, []).catch(() => {});
  await query(ENSURE_RECEPCION, []).catch(() => {});
  await query(ENSURE_COMPRA, []).catch(() => {});
  await query(ENSURE_PAGO, []).catch(() => {});
  await query(ENSURE_TITULARIDAD, []).catch(() => {});
  await query(ENSURE_PLAZO, []).catch(() => {});
  await query(ENSURE_HISTORY, []).catch(() => {});
  await query(ENSURE_UNIQUE_LEAD, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  // La lista de pedidos consulta los papeles para decir qué falta.
  await preparaDocumentos().catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, origen, estado, proveedor, vehiculo_titulo, vehiculo_id, matricula, bastidor,
                importe::numeric AS importe, cliente_email, lead_id,
                factura_proveedor, TO_CHAR(factura_pagada_el, 'YYYY-MM-DD') AS factura_pagada_el,
                TO_CHAR(fecha_estimada, 'YYYY-MM-DD') AS fecha_estimada,
                fecha_pedido, fecha_confirmado, fecha_recepcion,
                titularidad, TO_CHAR(revender_antes_de, 'YYYY-MM-DD') AS revender_antes_de,
                notas, comprobaciones, recepcion, creado_por, created_at, updated_at`;

/**
 * Los papeles de cada pedido, en la misma consulta que la lista.
 *
 * Uno por uno serían doscientas consultas para pintar una tabla. Va aparte de
 * `CAMPOS` porque este trozo lleva su propio `WHERE`, y en un `RETURNING` eso
 * confunde a cualquiera que lea el SQL.
 */
const PAPELES_DEL_PEDIDO = `,
  COALESCE((SELECT array_agg(d.papel) FROM erp_documentos d
             WHERE d.ambito = 'pedido' AND d.ambito_id = erp_pedidos.id), '{}') AS papeles`;

/**
 * Los pedidos cuyo coche ya ha salido, de una vez.
 *
 * Se pregunta por todos los de la pantalla en una consulta: uno por uno serían
 * doscientas más solo para saber si el botón va encendido.
 */
async function pedidosConTransporteSalido(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const r = await query(
    `SELECT DISTINCT pedido_id, estado FROM erp_transportes WHERE pedido_id = ANY($1)`,
    [ids]
  ).catch(() => ({ rows: [] as { pedido_id?: string; estado?: string }[] }));
  const salidos = new Set<string>();
  for (const f of r.rows as { pedido_id?: string; estado?: string }[]) {
    if (haSalido(String(f.estado ?? ''))) salidos.add(String(f.pedido_id ?? ''));
  }
  return salidos;
}

/**
 * La ciudad alemana donde está el coche.
 *
 * Vive en la oferta del marketplace, no en el pedido. Las 1.568 publicadas la
 * tienen, así que casi siempre se encuentra.
 */
async function ciudadDeLaOferta(ofertaId: string): Promise<string> {
  if (!ofertaId) return '';
  const r = await query(
    `SELECT COALESCE(province, location, '') AS ciudad
       FROM moveadvisor_market_offers WHERE id = $1`,
    [ofertaId]
  ).catch(() => ({ rows: [] as { ciudad?: string }[] }));
  return String((r.rows[0] as { ciudad?: string } | undefined)?.ciudad ?? '').trim();
}

/** Los papeles subidos a un pedido. Para las respuestas de una sola fila. */
async function papelesDe(id: string): Promise<string[]> {
  const r = await query(
    `SELECT papel FROM erp_documentos WHERE ambito = 'pedido' AND ambito_id = $1`,
    [id]
  ).catch(() => ({ rows: [] as { papel?: string }[] }));
  return (r.rows as { papel?: string }[]).map((x) => String(x.papel ?? ''));
}

/**
 * Lo que le falta a un pedido para cada estado.
 *
 * Va en la propia fila para que la pantalla pueda **decirlo antes** de que
 * alguien lo intente, en vez de dejarle escribir la nota y contestarle que no.
 * Las reglas siguen siendo las del servidor: esto es la misma función.
 */
function conLoQueFalta(
  fila: Record<string, unknown>,
  papelesSubidos?: string[],
  transporteSalido = false
): Record<string, unknown> {
  const { papeles, ...resto } = fila;
  const subidos = papelesSubidos
    ?? (Array.isArray(papeles) ? (papeles as unknown[]).map((x) => String(x ?? '')) : []);
  const origen = String(fila.origen ?? '');
  return {
    ...resto,
    papeles_faltan: papelesQueFaltan(origen, subidos)
      .filter((x) => x.imprescindible).map((x) => x.papel),
    falta_por_estado: faltaPorEstado(
      {
        proveedor: fila.proveedor as string | null, importe: fila.importe,
        factura_proveedor: fila.factura_proveedor, factura_pagada_el: fila.factura_pagada_el,
      },
      {
        comprobaciones: comprobacionesQueFaltan(origen, (fila.comprobaciones ?? {}) as Comprobadas)
          .map((c) => c.que),
        papeles: papelesQueFaltan(origen, subidos).filter((x) => x.imprescindible).map((x) => x.papel),
        recepcion: faltaPorMirar((fila.recepcion ?? {}) as Recepcion),
        transporteSinSalir: !transporteSalido,
      }
    ),
  };
}

// ── Qué hay que comprobar antes de encargar, según el origen ───────────────
pedidosRouter.get('/pedidos/comprobaciones/:origen', requireRole(['admin', 'support', 'operations', 'sales']), (req, res) => {
  res.json({ ok: true, data: comprobacionesQueTocan(req.params.origen) });
});

// ── Listar ──────────────────────────────────────────────────────────────────
pedidosRouter.get('/pedidos', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const estado = nt(req.query.estado);
  const origen = nt(req.query.origen);
  const q = nt(req.query.q);

  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (estado) { valores.push(estado); condiciones.push(`estado = $${valores.length}`); }
  if (origen) { valores.push(origen); condiciones.push(`origen = $${valores.length}`); }
  if (q) {
    valores.push(`%${q.toLowerCase()}%`);
    condiciones.push(`(lower(vehiculo_titulo) LIKE $${valores.length}
                       OR lower(proveedor) LIKE $${valores.length}
                       OR lower(cliente_email) LIKE $${valores.length}
                       OR lower(matricula) LIKE $${valores.length}
                       OR lower(id) LIKE $${valores.length})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  try {
    await prepara();
    const r = await query(
      `SELECT ${CAMPOS}${PAPELES_DEL_PEDIDO} FROM erp_pedidos ${where} ORDER BY created_at DESC LIMIT 200`,
      valores
    );
    const salidos = await pedidosConTransporteSalido(r.rows.map((f) => String(f.id)));
    res.json({ ok: true, data: r.rows.map((f) => conLoQueFalta(f, undefined, salidos.has(String(f.id)))) });
  } catch (err) {
    console.error('[pedidos] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});

// ── Crear ───────────────────────────────────────────────────────────────────
pedidosRouter.post('/pedidos', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const origen = nt(req.body?.origen);
  if (!esOrigenPedido(origen)) {
    res.status(400).json({ ok: false, error: 'origen_no_valido' });
    return;
  }
  const vehiculo = nt(req.body?.vehiculo_titulo);
  if (!vehiculo) {
    res.status(400).json({ ok: false, error: 'falta_vehiculo', detail: 'Un pedido es de un coche concreto.' });
    return;
  }

  try {
    await prepara();
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_pedidos', prefijoAnual('PED')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_pedidos
             (id, origen, proveedor, vehiculo_titulo, vehiculo_id, matricula, bastidor,
              importe, cliente_email, lead_id, titularidad, notas, creado_por,
              factura_proveedor, factura_pagada_el)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            nuevoId, origen, nt(req.body?.proveedor), vehiculo, nt(req.body?.vehiculo_id),
            nt(req.body?.matricula), nt(req.body?.bastidor),
            req.body?.importe != null && req.body?.importe !== '' ? Number(req.body.importe) : null,
            nt(req.body?.cliente_email).toLowerCase(), nt(req.body?.lead_id) || null,
            esTitularidad(nt(req.body?.titularidad))
              ? nt(req.body.titularidad)
              : titularidadPorDefecto(origen, nt(req.body?.cliente_email)),
            nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
            // Comprando a un concesionario de aquí, la factura suele venir en el acto.
            nt(req.body?.factura_proveedor), nt(req.body?.factura_pagada_el) || null,
          ]
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM erp_pedidos WHERE id = $1`, [id]);
    res.json({
      ok: true,
      data: conLoQueFalta(r.rows[0], await papelesDe(id), (await pedidosConTransporteSalido([id])).has(id)),
    });
  } catch (err) {
    console.error('[pedidos] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
pedidosRouter.patch('/pedidos/:id', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const estado = nt(req.body?.estado);
  if (estado && !esEstadoValido(estado)) {
    res.status(400).json({ ok: false, error: 'estado_no_valido' });
    return;
  }

  try {
    await prepara();
    const antes = await query(`SELECT ${CAMPOS} FROM erp_pedidos WHERE id = $1`, [req.params.id]);
    const previo = antes.rows[0] as Record<string, unknown> | undefined;
    if (!previo) { res.status(404).json({ ok: false, error: 'pedido_no_encontrado' }); return; }

    /**
     * A un particular no se le encarga a ciegas.
     *
     * El borrador existe justamente para poder prepararlo mientras se mira el
     * informe de la DGT y lo demás. Pasar de ahí es comprometerse, y con una
     * persona uno se compromete con lo comprobado: un embargo o una deuda no se
     * arreglan después de pagar.
     */
    const comprobadas = (previo.comprobaciones ?? {}) as Comprobadas;
    if (estado && estado !== 'Borrador' && estado !== CANCELADO
        && !puedeEncargarseConComprobaciones(String(previo.origen ?? ""), comprobadas)) {
      res.status(409).json({
        ok: false, error: 'faltan_comprobaciones',
        detail: 'Antes de encargarlo hay que mirar lo que no se puede arreglar después.',
        faltan: comprobacionesQueFaltan(String(previo.origen ?? ""), comprobadas),
      });
      return;
    }

    /**
     * Un coche no se da por recibido sin haberlo mirado.
     *
     * Los kilómetros hay que leerlos antes de moverlo y las llaves hay que
     * contarlas delante de quien lo trae. Los dos datos pierden valor con el
     * tiempo: dentro de una semana ya no hay forma de sostener que faltaba una
     * llave o que el cuentakilómetros marcaba otra cosa.
     */
    const recepcionPrevia = (previo.recepcion ?? {}) as Recepcion;
    const recepcionNueva = req.body?.recepcion
      ? anota(recepcionPrevia, req.body.recepcion as Recepcion, req.actor?.name ?? req.actor?.sub ?? "desconocido")
      : recepcionPrevia;

    if (estado === 'Recibido' && !puedeDarsePorRecibido(recepcionNueva)) {
      res.status(409).json({
        ok: false, error: 'falta_mirar_el_coche',
        detail: 'Antes de darlo por recibido hay que mirarlo: eso no se puede hacer después.',
        faltan: faltaPorMirar(recepcionNueva),
      });
      return;
    }

    // Decir que no está conforme sin decir qué se reclama no sirve de nada.
    if (!reclamacionCompleta(recepcionNueva)) {
      res.status(409).json({
        ok: false, error: 'falta_la_reclamacion',
        detail: 'Has marcado que no es lo que se compró. Escribe qué se le reclama al proveedor.',
      });
      return;
    }

    // Encargar un coche es encargárselo a alguien.
    if (estado && estado !== 'Borrador' && estado !== CANCELADO && !puedeEncargarse({
      proveedor: nt(req.body?.proveedor) || String(previo.proveedor ?? ''),
    })) {
      res.status(409).json({
        ok: false, error: 'sin_proveedor',
        detail: 'Dile a quién se le encarga: sin proveedor no hay a quién reclamar.',
      });
      return;
    }

    /**
     * Confirmado es que hay precio acordado.
     *
     * Sin importe, el coste de ese coche se calcula sobre cero y el margen que
     * salga es mentira. Y el número se sabe justo ahí: confirmar es que el
     * proveedor ha aceptado, y ha aceptado por una cifra.
     */
    const importeFinal = req.body?.importe !== undefined ? req.body.importe : previo.importe;
    if (estado && estado !== CANCELADO && alMenos(estado, 'Confirmado') && !importeAcordado(importeFinal)) {
      res.status(409).json({
        ok: false, error: 'sin_importe',
        detail: 'Pon por cuánto se ha cerrado: sin importe, el coste y el margen de este coche salen mal.',
        faltan: ['Por cuánto se ha cerrado'],
      });
      return;
    }

    /**
     * Un coche no se mueve sin los papeles que lo hacen nuestro.
     *
     * Hasta aquí no había nada irreversible: se preparaba, se encargaba, el
     * proveedor decía que sí. Ponerlo en camino es contratar un transporte y
     * pagarlo. Si el título no está, lo que se mueve es un coche de otro.
     *
     * Solo los imprescindibles del origen. Los demás son convenientes y llegan
     * cuando llegan.
     */
    if (estado && estado !== CANCELADO && alMenos(estado, 'En camino')) {
      await preparaDocumentos();
      const subidos = await query(
        `SELECT papel FROM erp_documentos WHERE ambito = 'pedido' AND ambito_id = $1`,
        [req.params.id]
      ).catch(() => ({ rows: [] as { papel?: string }[] }));
      const faltan = papelesQueFaltan(
        String(previo.origen ?? ''),
        (subidos.rows as { papel?: string }[]).map((x) => String(x.papel ?? ''))
      ).filter((x) => x.imprescindible);
      if (faltan.length) {
        res.status(409).json({
          ok: false, error: 'faltan_papeles',
          detail: 'Antes de moverlo hacen falta los papeles que dicen que el coche es nuestro.',
          faltan: faltan.map((x) => x.papel),
        });
        return;
      }

      /**
       * Y pagado.
       *
       * Un coche que se mueve sin pagar sigue siendo del vendedor, viajando por
       * nuestra cuenta y a nuestro riesgo. El número de la factura es lo que ata
       * el pago a este coche: sin él, meses después hay un cargo sin concepto.
       */
      const sinPagar = compraPagada({
        factura_proveedor: req.body?.factura_proveedor !== undefined
          ? req.body.factura_proveedor : previo.factura_proveedor,
        factura_pagada_el: req.body?.factura_pagada_el !== undefined
          ? req.body.factura_pagada_el : previo.factura_pagada_el,
      });
      if (sinPagar.length) {
        res.status(409).json({
          ok: false, error: 'compra_sin_pagar',
          detail: 'La compra tiene que estar facturada y pagada antes de mover el coche.',
          faltan: sinPagar,
        });
        return;
      }

      /**
       * Y que alguien lo haya recogido de verdad.
       *
       * «En camino» era una casilla que se marcaba sola: el pedido decía que el
       * coche venía sin que existiera ningún transporte contratado. Ahora lo dice
       * quien lo lleva — un tramo recogido, en tránsito o ya entregado—, no una
       * suposición.
       */
      if (!(await pedidosConTransporteSalido([req.params.id])).has(req.params.id)) {
        res.status(409).json({
          ok: false, error: 'transporte_sin_salir',
          detail: 'Ningún transporte de este coche ha salido todavía. Contrátalo y márcalo como recogido.',
          faltan: ['Que alguien lo haya recogido: el transporte, contratado y de camino'],
        });
        return;
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (columna: string, valor: unknown) => { valores.push(valor); sets.push(`${columna} = $${valores.length}`); };

    for (const campo of ['proveedor', 'vehiculo_titulo', 'matricula', 'bastidor', 'cliente_email',
                         'factura_proveedor'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.titularidad !== undefined) {
      const t = nt(req.body.titularidad);
      if (!esTitularidad(t)) { res.status(400).json({ ok: false, error: 'titularidad_no_valida' }); return; }
      pon('titularidad', t);
    }
    if (req.body?.revender_antes_de !== undefined) pon('revender_antes_de', nt(req.body.revender_antes_de) || null);
    if (req.body?.factura_pagada_el !== undefined) pon('factura_pagada_el', nt(req.body.factura_pagada_el) || null);
    if (req.body?.importe !== undefined) pon('importe', req.body.importe === '' || req.body.importe === null ? null : Number(req.body.importe));
    if (req.body?.fecha_estimada !== undefined) pon('fecha_estimada', nt(req.body.fecha_estimada) || null);

    if (req.body?.recepcion) pon('recepcion', JSON.stringify(recepcionNueva));

    // Marcar o desmarcar una comprobación, con quién y cuándo.
    if (nt(req.body?.comprobacion)) {
      const quien = req.actor?.name ?? req.actor?.sub ?? "desconocido";
      pon('comprobaciones', JSON.stringify(
        marca(comprobadas, nt(req.body.comprobacion), req.body?.ok !== false, quien)
      ));
    }

    // La nota del cambio se suma a lo que hubiera; nunca lo pisa.
    const notasNuevas = estado && estado !== previo.estado
      ? notaDelCambio(String(previo.notas ?? ''), String(previo.estado ?? ''), estado, nt(req.body?.nota))
      : (req.body?.notas !== undefined ? nt(req.body.notas) : null);
    if (notasNuevas !== null) pon('notas', notasNuevas);

    if (estado) {
      pon('estado', estado);
      // Las fechas de verdad, las que luego se miran para saber cuánto tardó.
      if (estado === 'Pedido'     && !previo.fecha_pedido)     sets.push('fecha_pedido = NOW()');
      if (estado === 'Confirmado' && !previo.fecha_confirmado) sets.push('fecha_confirmado = NOW()');
      if (estado === 'Recibido'   && !previo.fecha_recepcion)  sets.push('fecha_recepcion = NOW()');
    }

    if (!sets.length) { res.json({ ok: true, data: previo }); return; }
    sets.push('updated_at = NOW()');
    valores.push(req.params.id);

    const r = await query(
      `UPDATE erp_pedidos SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );

    // El rastro: quién lo movió y cuándo.
    if (estado && estado !== previo.estado) {
      await query(
        `INSERT INTO erp_pedido_history (pedido_id, operador, campo, antes, despues) VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.actor?.name ?? req.actor?.sub ?? 'desconocido', 'estado', String(previo.estado ?? ''), estado]
      ).catch(() => {});
    }

    // Confirmado el pedido, hay que traerlo.
    //
    // Se abre el primer tramo, por organizar. Solo uno: cuántos hacen falta no lo
    // sabe el sistema —del vendedor al almacén, del almacén al taller— y los
    // añade quien los necesite.
    if (estado === 'Confirmado' && previo.estado !== 'Confirmado') {
      const fila = (r.rows[0] ?? previo) as Record<string, unknown>;
      /**
       * De dónde sale el coche: la ciudad, no el nombre del vendedor.
       *
       * El tramo ponía «Autohero GmbH → Nuestras instalaciones», que no es un
       * viaje: es un nombre y un sitio. Sin ciudad de salida no se puede casar
       * con ninguna tarifa por corredor ni pedir presupuesto de nada.
       *
       * La ciudad está en la oferta de la que salió el pedido. Si no se
       * encuentra —un pedido creado a mano, sin oferta detrás— se queda el
       * proveedor, que es mejor que dejarlo vacío.
       */
      const ciudadDeSalida = await ciudadDeLaOferta(String(fila.vehiculo_id ?? ""));
      abreTransporteDePedido({
        pedidoId: req.params.id,
        vehiculoTitulo: String(fila.vehiculo_titulo ?? ""),
        matricula: String(fila.matricula ?? ""),
        desde: ciudadDeSalida || String(fila.proveedor ?? "") || "El proveedor",
        hasta: "Nuestras instalaciones",
        creadoPor: req.actor?.name ?? req.actor?.sub ?? '',
      }).catch((e: Error) => console.error('[pedidos] transporte del pedido:', e.message));
    }

    /**
     * Con el coche a nuestro nombre, empieza a correr el plazo de reventa.
     *
     * Comprar para revender no paga el impuesto de transmisiones **si se revende
     * dentro de plazo**. Pasado, sí — y ese dinero aparece de golpe, meses
     * después, sobre un coche que ya no interesa a nadie. El límite se guarda en
     * el pedido, no en el código, porque el plazo lo dice la gestoría.
     */
    const titularidadAhora = nt(req.body?.titularidad) || String(previo.titularidad ?? "popcar");
    if (estado === 'Recibido' && previo.estado !== 'Recibido'
        && vigilaElPlazo(titularidadAhora) && !previo.revender_antes_de) {
      pon('revender_antes_de', revenderAntesDe(new Date(), PLAZO_REVENTA_MESES));
    }

    // Con el coche aquí empieza el papeleo.
    //
    // Antes no se puede: la transferencia necesita el contrato firmado y la
    // matriculación necesita el coche. Lo que se abre depende de a quién se le
    // compró — uno de Alemania se matricula, uno de aquí cambia de dueño.
    if (estado === 'Recibido' && previo.estado !== 'Recibido') {
      const fila = (r.rows[0] ?? previo) as Record<string, unknown>;
      abreTramitesDePedido({
        pedidoId: req.params.id,
        origen: String(fila.origen ?? ""),
        titularidad: String(fila.titularidad ?? "popcar"),
        vehiculoTitulo: String(fila.vehiculo_titulo ?? ""),
        matricula: String(fila.matricula ?? ""),
        clienteEmail: String(fila.cliente_email ?? ""),
        creadoPor: req.actor?.name ?? req.actor?.sub ?? '',
      }).catch((e: Error) => console.error('[pedidos] trámites del pedido:', e.message));
    }

    res.json({
      ok: true,
      data: conLoQueFalta(
        r.rows[0], await papelesDe(req.params.id),
        (await pedidosConTransporteSalido([req.params.id])).has(req.params.id)
      ),
    });
  } catch (err) {
    console.error('[pedidos] cambiar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});

// ── El rastro ───────────────────────────────────────────────────────────────
pedidosRouter.get('/pedidos/:id/history', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  try {
    await prepara();
    const r = await query(
      `SELECT id, operador, campo, antes, despues, created_at
         FROM erp_pedido_history WHERE pedido_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[pedidos] historial:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});


/**
 * El pedido que nace de una solicitud de importación.
 *
 * Se llama al pasar el expediente a «Pedido a Alemania», que es el momento en
 * que de verdad se le encarga el coche a alguien. Lo que se sabe del proveedor y
 * del precio está en la oferta del marketplace: el vendedor alemán y lo que él
 * cobra, que no es lo mismo que la cifra que ve el cliente —esa lleva dentro el
 * coste de traerlo—.
 *
 * Si ya hay uno de esta solicitud, no se crea otro: la etapa se puede tocar
 * varias veces y no puede dejar tres pedidos del mismo coche.
 */
export async function creaPedidoDeImportacion(datos: {
  leadId: string;
  vehiculoTitulo: string;
  vehiculoId: string;
  clienteEmail: string;
  creadoPor: string;
}): Promise<string | null> {
  await prepara();

  const yaHay = await query(`SELECT id FROM erp_pedidos WHERE lead_id = $1`, [datos.leadId]);
  if (yaHay.rows.length) return String((yaHay.rows[0] as { id: string }).id);

  // Lo que se sabe del proveedor y del precio, si la oferta sigue publicada.
  let proveedor = "";
  let importe: number | null = null;
  if (datos.vehiculoId) {
    const oferta = await query(
      `SELECT dealer_name, price::numeric AS price FROM moveadvisor_market_offers WHERE id = $1`,
      [datos.vehiculoId]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const fila = oferta.rows[0] as { dealer_name?: string; price?: string } | undefined;
    if (fila) {
      proveedor = String(fila.dealer_name ?? "");
      importe = fila.price != null ? Number(fila.price) : null;
    }
  }

  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_pedidos', prefijoAnual('PED')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_pedidos
           (id, origen, estado, proveedor, vehiculo_titulo, vehiculo_id, importe,
            cliente_email, lead_id, creado_por)
         VALUES ($1,'importacion','Pedido',$2,$3,$4,$5,$6,$7,$8)`,
        [nuevoId, proveedor, datos.vehiculoTitulo, datos.vehiculoId, importe,
         String(datos.clienteEmail).toLowerCase(), datos.leadId, datos.creadoPor]
      );
    }
  );

  await query(
    `INSERT INTO erp_pedido_history (pedido_id, operador, campo, antes, despues) VALUES ($1,$2,'estado','','Pedido')`,
    [id, datos.creadoPor || "sistema"]
  ).catch(() => {});

  return id;
}
export { ESTADOS_PEDIDO };

/**
 * Lo que ha costado un coche, y lo que se ha ganado con él.
 *
 * Se junta aquí porque las piezas viven en sitios distintos: el precio en el
 * pedido, el transporte en sus tramos, la gestoría en sus trámites. Nadie tenía
 * la suma, y sin ella no se sabe si un camino de compra deja dinero.
 */
pedidosRouter.get('/pedidos/:id/coste', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  try {
    await prepara();
    const p = await query(`SELECT ${CAMPOS} FROM erp_pedidos WHERE id = $1`, [req.params.id]);
    const pedido = p.rows[0] as Record<string, unknown> | undefined;
    if (!pedido) { res.status(404).json({ ok: false, error: 'pedido_no_encontrado' }); return; }

    const [transportes, tramites, gastos] = await Promise.all([
      query(`SELECT coste::numeric AS coste FROM erp_transportes WHERE pedido_id = $1`, [req.params.id])
        .catch(() => ({ rows: [] as { coste?: unknown }[] })),
      query(`SELECT coste::numeric AS coste FROM erp_tramites WHERE pedido_id = $1`, [req.params.id])
        .catch(() => ({ rows: [] as { coste?: unknown }[] })),
      query(`SELECT importe::numeric AS importe FROM erp_gastos_pedido WHERE pedido_id = $1`, [req.params.id])
        .catch(() => ({ rows: [] as { importe?: unknown }[] })),
    ]);

    const coste = costeDelCoche({
      precioProveedor: pedido.importe,
      transportes: transportes.rows as { coste?: unknown }[],
      tramites: tramites.rows as { coste?: unknown }[],
      gastos: gastos.rows as { importe?: unknown }[],
    });

    // Lo que se cobró, si este pedido salió de una solicitud que acabó en venta.
    let venta: unknown = null;
    if (pedido.lead_id) {
      const l = await query(`SELECT sale_price FROM moveadvisor_market_leads WHERE id = $1`, [pedido.lead_id])
        .catch(() => ({ rows: [] as { sale_price?: unknown }[] }));
      venta = (l.rows[0] as { sale_price?: unknown } | undefined)?.sale_price ?? null;
    }

    res.json({ ok: true, data: { ...coste, margen: margenDelCoche(coste.total, venta) } });
  } catch (err) {
    console.error('[pedidos] coste:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});

/**
 * Dónde se gana dinero.
 *
 * La pregunta de negocio que justifica todo lo anterior: de los cuatro caminos
 * de compra, cuál deja margen. Alemania parece barato hasta que se suman el
 * transporte y el impuesto; un particular parece caro hasta que se ve que no
 * lleva ninguna de las dos cosas.
 *
 * Solo cuentan los vendidos. Mezclar los que están de camino daría un número que
 * baja cada vez que se compra un coche, y eso no dice nada de si el camino es
 * bueno.
 */
pedidosRouter.get('/pedidos/margen-por-origen', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  try {
    await prepara();
    const [pedidos, transportes, tramites, gastos] = await Promise.all([
      query(`SELECT id, origen, importe::numeric AS importe, lead_id FROM erp_pedidos`),
      query(`SELECT pedido_id, SUM(coste)::numeric AS coste FROM erp_transportes
              WHERE pedido_id IS NOT NULL GROUP BY pedido_id`)
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
      query(`SELECT pedido_id, SUM(coste)::numeric AS coste FROM erp_tramites
              WHERE pedido_id IS NOT NULL GROUP BY pedido_id`)
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
      query(`SELECT pedido_id, SUM(importe)::numeric AS coste FROM erp_gastos_pedido
              GROUP BY pedido_id`)
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    const porPedido = (filas: Record<string, unknown>[]) => {
      const mapa = new Map<string, number>();
      for (const f of filas) mapa.set(String(f.pedido_id), Number(f.coste) || 0);
      return mapa;
    };
    const transporte = porPedido(transportes.rows as Record<string, unknown>[]);
    const gestoria = porPedido(tramites.rows as Record<string, unknown>[]);
    const reacondicionado = porPedido(gastos.rows as Record<string, unknown>[]);

    // Lo que se cobró por cada uno, de las solicitudes que acabaron en venta.
    const leadIds = (pedidos.rows as Record<string, unknown>[])
      .map((p) => p.lead_id).filter(Boolean) as string[];
    const ventas = new Map<string, unknown>();
    if (leadIds.length) {
      const l = await query(
        `SELECT id, sale_price FROM moveadvisor_market_leads WHERE id = ANY($1::text[])`,
        [leadIds]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      for (const f of l.rows as Record<string, unknown>[]) ventas.set(String(f.id), f.sale_price);
    }

    const coches = (pedidos.rows as Record<string, unknown>[]).map((p) => ({
      origen: String(p.origen ?? ''),
      coste: costeDelCoche({
        precioProveedor: p.importe,
        transportes: [{ coste: transporte.get(String(p.id)) ?? 0 }],
        tramites: [{ coste: gestoria.get(String(p.id)) ?? 0 }],
        gastos: [{ importe: reacondicionado.get(String(p.id)) ?? 0 }],
      }).total,
      venta: p.lead_id ? ventas.get(String(p.lead_id)) : null,
    }));

    res.json({ ok: true, data: margenPorOrigen(coches), coches: coches.length });
  } catch (err) {
    console.error('[pedidos] margen por origen:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'pedidos_failed' });
  }
});
