/**
 * Los transportes: cada viaje que hace un coche.
 *
 * Un coche de Alemania hace uno, y a veces tres: del vendedor al almacén, del
 * almacén al taller, del taller al cliente. Cada uno es un **tramo** con su
 * transportista, sus fechas y su coste, y sumarlos es parte de lo que cuesta el
 * coche de verdad.
 *
 * Cuelgan de un pedido. Las fotos de la recogida y de la entrega se suben como
 * documentos del transporte: son lo único que distingue un golpe que ya venía de
 * uno que se hizo por el camino.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import {
  INCIDENCIA, esEstadoTransporteValido, puedeContratarse, notaDelCambio, fotosQueFaltan,
} from '../lib/transportes.js';

export const transportesRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_transportes (
    id            TEXT PRIMARY KEY,
    pedido_id     TEXT,
    lead_id       TEXT,
    tramo         INTEGER NOT NULL DEFAULT 1,
    estado        TEXT NOT NULL DEFAULT 'Por organizar',
    transportista TEXT NOT NULL DEFAULT '',
    desde         TEXT NOT NULL DEFAULT '',
    hasta         TEXT NOT NULL DEFAULT '',
    vehiculo_titulo TEXT NOT NULL DEFAULT '',
    matricula     TEXT NOT NULL DEFAULT '',
    coste         NUMERIC(12,2),
    recogida_prevista DATE,
    entrega_prevista  DATE,
    fecha_recogida    TIMESTAMPTZ,
    fecha_entrega     TIMESTAMPTZ,
    notas         TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_HISTORY = `
  CREATE TABLE IF NOT EXISTS erp_transporte_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transporte_id TEXT NOT NULL,
    operador      TEXT NOT NULL,
    campo         TEXT NOT NULL,
    antes         TEXT,
    despues       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_transportes_estado
    ON erp_transportes (estado, created_at DESC)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_HISTORY, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, pedido_id, lead_id, tramo, estado, transportista, desde, hasta,
                vehiculo_titulo, matricula, coste::numeric AS coste,
                TO_CHAR(recogida_prevista, 'YYYY-MM-DD') AS recogida_prevista,
                TO_CHAR(entrega_prevista, 'YYYY-MM-DD')  AS entrega_prevista,
                fecha_recogida, fecha_entrega, notas, creado_por, created_at, updated_at`;

// ── Listar ──────────────────────────────────────────────────────────────────
transportesRouter.get('/transportes', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const estado = nt(req.query.estado);
  const pedido = nt(req.query.pedido_id);
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (estado) { valores.push(estado); condiciones.push(`estado = $${valores.length}`); }
  if (pedido) { valores.push(pedido); condiciones.push(`pedido_id = $${valores.length}`); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  try {
    await prepara();
    const r = await query(
      `SELECT ${CAMPOS} FROM erp_transportes ${where} ORDER BY created_at DESC, tramo ASC LIMIT 200`,
      valores
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[transportes] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

// ── Crear un tramo ──────────────────────────────────────────────────────────
transportesRouter.post('/transportes', requireRole(['admin', 'operations']), async (req, res) => {
  const desde = nt(req.body?.desde);
  const hasta = nt(req.body?.hasta);
  if (!desde || !hasta) {
    res.status(400).json({ ok: false, error: 'falta_recorrido', detail: 'Un tramo va de un sitio a otro.' });
    return;
  }

  try {
    await prepara();
    const pedidoId = nt(req.body?.pedido_id) || null;
    // El número de tramo: el siguiente de ese pedido. Sirve para leerlos en
    // orden aunque se creen desordenados.
    let tramo = 1;
    if (pedidoId) {
      const previos = await query(
        `SELECT COALESCE(MAX(tramo), 0) + 1 AS siguiente FROM erp_transportes WHERE pedido_id = $1`,
        [pedidoId]
      );
      tramo = Number((previos.rows[0] as { siguiente: number }).siguiente) || 1;
    }

    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_transportes', prefijoAnual('TRP')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_transportes
             (id, pedido_id, lead_id, tramo, transportista, desde, hasta,
              vehiculo_titulo, matricula, coste, recogida_prevista, entrega_prevista, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            nuevoId, pedidoId, nt(req.body?.lead_id) || null, tramo,
            nt(req.body?.transportista), desde, hasta,
            nt(req.body?.vehiculo_titulo), nt(req.body?.matricula),
            req.body?.coste != null && req.body?.coste !== '' ? Number(req.body.coste) : null,
            nt(req.body?.recogida_prevista) || null, nt(req.body?.entrega_prevista) || null,
            nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
          ]
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM erp_transportes WHERE id = $1`, [id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[transportes] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
transportesRouter.patch('/transportes/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const estado = nt(req.body?.estado);
  if (estado && !esEstadoTransporteValido(estado)) {
    res.status(400).json({ ok: false, error: 'estado_no_valido' });
    return;
  }

  try {
    await prepara();
    const antes = await query(`SELECT ${CAMPOS} FROM erp_transportes WHERE id = $1`, [req.params.id]);
    const previo = antes.rows[0] as Record<string, unknown> | undefined;
    if (!previo) { res.status(404).json({ ok: false, error: 'transporte_no_encontrado' }); return; }

    // Contratarlo exige saber a quién y por cuánto.
    if (estado && estado !== 'Por organizar' && estado !== INCIDENCIA && !puedeContratarse({
      transportista: nt(req.body?.transportista) || String(previo.transportista ?? ''),
      coste: req.body?.coste ?? previo.coste,
    })) {
      res.status(409).json({
        ok: false, error: 'sin_transportista_o_precio',
        detail: 'Di quién lo trae y por cuánto: sin eso, nadie ha quedado en recogerlo y la factura será la que quieran.',
      });
      return;
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (columna: string, valor: unknown) => { valores.push(valor); sets.push(`${columna} = $${valores.length}`); };

    for (const campo of ['transportista', 'desde', 'hasta', 'vehiculo_titulo', 'matricula'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.coste !== undefined) pon('coste', req.body.coste === '' || req.body.coste === null ? null : Number(req.body.coste));
    for (const fecha of ['recogida_prevista', 'entrega_prevista'] as const) {
      if (req.body?.[fecha] !== undefined) pon(fecha, nt(req.body[fecha]) || null);
    }

    const notasNuevas = estado && estado !== previo.estado
      ? notaDelCambio(String(previo.notas ?? ''), String(previo.estado ?? ''), estado, nt(req.body?.nota))
      : (req.body?.notas !== undefined ? nt(req.body.notas) : null);
    if (notasNuevas !== null) pon('notas', notasNuevas);

    if (estado) {
      pon('estado', estado);
      // Las fechas de verdad, que son las que luego dicen cuánto tardó.
      if (estado === 'Recogido' && !previo.fecha_recogida) sets.push('fecha_recogida = NOW()');
      if (estado === 'Entregado' && !previo.fecha_entrega) sets.push('fecha_entrega = NOW()');
    }

    if (!sets.length) { res.json({ ok: true, data: previo }); return; }
    sets.push('updated_at = NOW()');
    valores.push(req.params.id);

    const r = await query(
      `UPDATE erp_transportes SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );

    if (estado && estado !== previo.estado) {
      await query(
        `INSERT INTO erp_transporte_history (transporte_id, operador, campo, antes, despues) VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.actor?.name ?? req.actor?.sub ?? 'desconocido', 'estado', String(previo.estado ?? ''), estado]
      ).catch(() => {});
    }

    // Qué fotos faltan. No bloquea —un coche que ha llegado ha llegado— pero se
    // dice, porque el día de la reclamación no habrá manera de conseguirlas.
    const fila = (r.rows[0] ?? previo) as Record<string, unknown>;
    const papeles = await query(
      `SELECT papel FROM erp_documentos WHERE ambito = 'transporte' AND ambito_id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] as { papel?: string }[] }));

    res.json({
      ok: true,
      data: fila,
      faltanFotos: fotosQueFaltan(String(fila.estado ?? ''), papeles.rows.map((x) => String((x as { papel?: string }).papel ?? ''))),
    });
  } catch (err) {
    console.error('[transportes] cambiar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'transportes_failed' });
  }
});

/**
 * El primer tramo de un pedido que hay que traer.
 *
 * Se abre al confirmar el pedido, que es cuando ya se sabe que el coche existe y
 * hay que organizar cómo llega. Solo uno: los demás tramos los añade quien los
 * necesite, porque cuántos hacen falta no lo sabe el sistema.
 */
export async function abreTransporteDePedido(datos: {
  pedidoId: string;
  vehiculoTitulo: string;
  matricula?: string;
  desde: string;
  hasta: string;
  creadoPor: string;
  /**
   * Qué viaje de los suyos es. El primero por defecto.
   *
   * Un coche de fuera hace dos: de Alemania a nuestras instalaciones, y de aquí
   * a casa del cliente. Antes esto se saltaba en cuanto el pedido tenía **algún**
   * tramo, así que el segundo no llegaba a abrirse nunca.
   */
  tramo?: number;
}): Promise<string | null> {
  await prepara();
  const tramo = Math.max(1, Math.floor(Number(datos.tramo) || 1));
  // Se mira ese tramo, no si hay alguno: si no, el segundo viaje no cabría.
  const yaHay = await query(
    `SELECT id FROM erp_transportes WHERE pedido_id = $1 AND tramo = $2`,
    [datos.pedidoId, tramo]
  );
  if (yaHay.rows.length) return String((yaHay.rows[0] as { id: string }).id);

  try {
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_transportes', prefijoAnual('TRP')),
      async (nuevoId) => {
        await query(
          // En orden: un $8 metido en medio se lee mal y se copia peor.
          `INSERT INTO erp_transportes (id, pedido_id, tramo, vehiculo_titulo, matricula, desde, hasta, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [nuevoId, datos.pedidoId, tramo, datos.vehiculoTitulo, datos.matricula ?? '',
           datos.desde, datos.hasta, datos.creadoPor]
        );
      }
    );
    return id;
  } catch (e) {
    console.error('[transportes] no se ha podido abrir el tramo:', (e as Error).message);
    return null;
  }
}
