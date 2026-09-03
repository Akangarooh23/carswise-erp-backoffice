/**
 * Gestoría: los papeleos de un coche.
 *
 * Los lleva una gestoría de fuera, así que lo que importa de cada trámite es a
 * quién se le mandó, cuándo, y qué ha devuelto. Un trámite que lleva tres
 * semanas fuera sin que nadie lo mire es exactamente lo que esta pantalla tiene
 * que hacer imposible.
 *
 * Un trámite cuelga de un pedido, de una solicitud, o de nada: basta con la
 * matrícula o el bastidor. Una transferencia entre particulares no tiene pedido
 * detrás y tiene que caber igual.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { ponAlDiaLasEtapas } from './transportes.js';
import { requireRole } from '../middleware/auth.js';
import { apuntaFacturaEsperada } from './provider-billing.js';
import { siguienteDeSerie, prefijoAnual, guardaConIdUnico } from '../lib/series.js';
import {
  RECHAZADO, esEstadoTramiteValido, puedeEnviarse, notaDelCambio, TRAMITES_HABITUALES,
  tramitesQueTocan, TRAMITES_AL_VENDER,
} from '../lib/tramites.js';

export const tramitesRouter = Router();

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_tramites (
    id              TEXT PRIMARY KEY,
    tipo            TEXT NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'Pendiente',
    gestoria        TEXT NOT NULL DEFAULT '',
    vehiculo_titulo TEXT NOT NULL DEFAULT '',
    matricula       TEXT NOT NULL DEFAULT '',
    bastidor        TEXT NOT NULL DEFAULT '',
    cliente_email   TEXT NOT NULL DEFAULT '',
    pedido_id       TEXT,
    lead_id         TEXT,
    coste           NUMERIC(12,2),
    fecha_enviado   TIMESTAMPTZ,
    fecha_resuelto  TIMESTAMPTZ,
    notas           TEXT NOT NULL DEFAULT '',
    creado_por      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_HISTORY = `
  CREATE TABLE IF NOT EXISTS erp_tramite_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tramite_id  TEXT NOT NULL,
    operador    TEXT NOT NULL,
    campo       TEXT NOT NULL,
    antes       TEXT,
    despues     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`;

const ENSURE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_tramites_estado
    ON erp_tramites (estado, created_at DESC)`;

/**
 * El mismo trámite del mismo coche, una vez.
 *
 * Las etapas de un expediente se tocan más de una vez, y cada vez pediría crear
 * los trámites que tocan. Sin esto, un coche acabaría con cuatro
 * matriculaciones abiertas.
 */
const ENSURE_UNIQUE = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_lead_tipo
    ON erp_tramites (lead_id, tipo) WHERE lead_id IS NOT NULL`;

const ENSURE_UNIQUE_PEDIDO = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_pedido_tipo
    ON erp_tramites (pedido_id, tipo) WHERE pedido_id IS NOT NULL`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  await query(ENSURE_HISTORY, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  await query(ENSURE_UNIQUE, []).catch(() => {});
  await query(ENSURE_UNIQUE_PEDIDO, []).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, tipo, estado, gestoria, vehiculo_titulo, matricula, bastidor, cliente_email,
                pedido_id, lead_id, coste::numeric AS coste, fecha_enviado, fecha_resuelto,
                notas, creado_por, created_at, updated_at`;

// ── Lo que se puede escribir en «qué trámite es» ────────────────────────────
tramitesRouter.get('/tramites/habituales', requireRole(['admin', 'support', 'operations', 'sales']), (_req, res) => {
  res.json({ ok: true, data: TRAMITES_HABITUALES });
});

// ── Listar ──────────────────────────────────────────────────────────────────
tramitesRouter.get('/tramites', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  /*
   * Antes de listar, que la lista sea de hoy.
   *
   * Los papeleos de una importación se abren al entrar el expediente en
   * trámites, y la etapa la mueve la llegada del camión. Si esa cadena se
   * queda a medias —el despliegue llegó tarde, la escritura falló— esta
   * pantalla enseña «todavía no hay ningún trámite» con el coche ya en
   * Zaragoza. Y es la pantalla donde se viene a mirar precisamente eso.
   */
  await ponAlDiaLasEtapas().catch(() => 0);
  await abreLosTramitesQueFalten().catch(() => 0);
  const estado = nt(req.query.estado);
  const gestoria = nt(req.query.gestoria);
  const q = nt(req.query.q);

  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (estado)   { valores.push(estado);   condiciones.push(`estado = $${valores.length}`); }
  if (gestoria) { valores.push(gestoria); condiciones.push(`gestoria = $${valores.length}`); }
  if (q) {
    valores.push(`%${q.toLowerCase()}%`);
    condiciones.push(`(lower(vehiculo_titulo) LIKE $${valores.length}
                       OR lower(matricula) LIKE $${valores.length}
                       OR lower(tipo) LIKE $${valores.length}
                       OR lower(cliente_email) LIKE $${valores.length}
                       OR lower(id) LIKE $${valores.length})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  try {
    await prepara();
    // Y si al expediente de ese coche ya se le mandó el encargo. El correo es
    // uno por coche y sale del expediente, así que desde aquí no había forma
    // de saber si estaba pedido o no.
    const r = await query(
      `SELECT ${CAMPOS},
              (SELECT l.encargo_gestoria_enviado_at FROM moveadvisor_market_leads l
                WHERE l.id = erp_tramites.lead_id) AS encargo_enviado_at
         FROM erp_tramites ${where} ORDER BY created_at DESC LIMIT 200`,
      valores
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[tramites] listar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'tramites_failed' });
  }
});

// ── Crear ───────────────────────────────────────────────────────────────────
tramitesRouter.post('/tramites', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const tipo = nt(req.body?.tipo);
  if (!tipo) {
    res.status(400).json({ ok: false, error: 'falta_tipo', detail: 'Di qué trámite es.' });
    return;
  }
  // De qué coche. Con la matrícula, el bastidor o el título basta: no todo
  // trámite cuelga de un pedido.
  const deQueCoche = nt(req.body?.matricula) || nt(req.body?.bastidor) || nt(req.body?.vehiculo_titulo);
  if (!deQueCoche) {
    res.status(400).json({ ok: false, error: 'falta_coche', detail: 'Di de qué coche es: matrícula, bastidor o modelo.' });
    return;
  }

  try {
    await prepara();
    const { id } = await guardaConIdUnico(
      () => siguienteDeSerie('erp_tramites', prefijoAnual('TRA')),
      async (nuevoId) => {
        await query(
          `INSERT INTO erp_tramites
             (id, tipo, gestoria, vehiculo_titulo, matricula, bastidor, cliente_email,
              pedido_id, lead_id, coste, notas, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            nuevoId, tipo, nt(req.body?.gestoria), nt(req.body?.vehiculo_titulo),
            nt(req.body?.matricula), nt(req.body?.bastidor), nt(req.body?.cliente_email).toLowerCase(),
            nt(req.body?.pedido_id) || null, nt(req.body?.lead_id) || null,
            req.body?.coste != null && req.body?.coste !== '' ? Number(req.body.coste) : null,
            nt(req.body?.notas), req.actor?.name ?? req.actor?.sub ?? '',
          ]
        );
      }
    );
    const r = await query(`SELECT ${CAMPOS} FROM erp_tramites WHERE id = $1`, [id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[tramites] crear:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'tramites_failed' });
  }
});

// ── Cambiar ─────────────────────────────────────────────────────────────────
tramitesRouter.patch('/tramites/:id', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  const estado = nt(req.body?.estado);
  if (estado && !esEstadoTramiteValido(estado)) {
    res.status(400).json({ ok: false, error: 'estado_no_valido' });
    return;
  }

  try {
    await prepara();
    const antes = await query(`SELECT ${CAMPOS} FROM erp_tramites WHERE id = $1`, [req.params.id]);
    const previo = antes.rows[0] as Record<string, unknown> | undefined;
    if (!previo) { res.status(404).json({ ok: false, error: 'tramite_no_encontrado' }); return; }

    // Mandarlo fuera exige saber a quién.
    if (estado === 'Enviado a gestoría' && !puedeEnviarse({
      gestoria: nt(req.body?.gestoria) || String(previo.gestoria ?? ''),
    })) {
      res.status(409).json({
        ok: false, error: 'sin_gestoria',
        detail: 'Dile a qué gestoría se manda: si no, es un papel que no está en ningún sitio.',
      });
      return;
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (columna: string, valor: unknown) => { valores.push(valor); sets.push(`${columna} = $${valores.length}`); };

    for (const campo of ['tipo', 'gestoria', 'vehiculo_titulo', 'matricula', 'bastidor', 'cliente_email'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    if (req.body?.coste !== undefined) pon('coste', req.body.coste === '' || req.body.coste === null ? null : Number(req.body.coste));

    const notasNuevas = estado && estado !== previo.estado
      ? notaDelCambio(String(previo.notas ?? ''), String(previo.estado ?? ''), estado, nt(req.body?.nota))
      : (req.body?.notas !== undefined ? nt(req.body.notas) : null);
    if (notasNuevas !== null) pon('notas', notasNuevas);

    if (estado) {
      pon('estado', estado);
      // Las fechas que luego se miran para reclamar con un número delante.
      if (estado === 'Enviado a gestoría' && !previo.fecha_enviado) sets.push('fecha_enviado = NOW()');
      if (estado === 'Resuelto' && !previo.fecha_resuelto) sets.push('fecha_resuelto = NOW()');
    }

    if (!sets.length) { res.json({ ok: true, data: previo }); return; }
    sets.push('updated_at = NOW()');
    valores.push(req.params.id);

    const r = await query(
      `UPDATE erp_tramites SET ${sets.join(', ')} WHERE id = $${valores.length} RETURNING ${CAMPOS}`,
      valores
    );

    /*
     * Resuelto: la gestoría ya puede facturar este trámite.
     *
     * Igual que con el perito y el transportista: un trámite hecho y sin
     * facturar es dinero que debemos y que no aparece en ninguna cuenta
     * hasta que llega el papel.
     */
    if (estado === 'Resuelto') {
      const t = r.rows[0] as Record<string, unknown>;
      await apuntaFacturaEsperada({
        proveedor: String(t.gestoria ?? ''),
        concepto: String(t.tipo ?? 'Trámite'),
        importe: t.coste as string | null,
        vehiculo: String(t.vehiculo_titulo ?? ''),
      }).catch(() => null);
    }

    if (estado && estado !== previo.estado) {
      await query(
        `INSERT INTO erp_tramite_history (tramite_id, operador, campo, antes, despues) VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req.actor?.name ?? req.actor?.sub ?? 'desconocido', 'estado', String(previo.estado ?? ''), estado]
      ).catch(() => {});
    }

    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    console.error('[tramites] cambiar:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'tramites_failed' });
  }
});

// ── El rastro ───────────────────────────────────────────────────────────────
tramitesRouter.get('/tramites/:id/history', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  try {
    await prepara();
    const r = await query(
      `SELECT id, operador, campo, antes, despues, created_at
         FROM erp_tramite_history WHERE tramite_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('[tramites] historial:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'tramites_failed' });
  }
});

/**
 * Abre los trámites que le tocan a un pedido.
 *
 * Se llama cuando el coche llega a nuestras manos, que es cuando el papeleo
 * empieza a poder hacerse. Lo que se abre depende de a quién se le compró: uno
 * de Alemania hay que matricularlo, uno de aquí solo cambia de dueño.
 *
 * Si ya existen, no se duplican: el índice único lo garantiza aunque dos
 * llamadas a la vez lean las dos que no hay nada.
 */
export async function abreTramitesDePedido(datos: {
  pedidoId: string;
  origen: string;
  titularidad?: string;
  vehiculoTitulo: string;
  matricula?: string;
  clienteEmail?: string;
  creadoPor: string;
}): Promise<string[]> {
  return abreTramites(tramitesQueTocan(datos.origen, datos.titularidad ?? 'popcar'), {
    pedidoId: datos.pedidoId,
    vehiculoTitulo: datos.vehiculoTitulo,
    matricula: datos.matricula ?? "",
    clienteEmail: datos.clienteEmail ?? "",
    creadoPor: datos.creadoPor,
  });
}

/**
 * Y el que sale de vender un coche que era nuestro.
 *
 * Cambia de dueño otra vez. Si se compró para stock, son dos transferencias en
 * la vida del mismo coche, cada una con su coste.
 */
export async function abreTramitesDeVenta(datos: {
  leadId: string;
  vehiculoTitulo: string;
  clienteEmail: string;
  creadoPor: string;
}): Promise<string[]> {
  return abreTramites(TRAMITES_AL_VENDER, {
    leadId: datos.leadId,
    vehiculoTitulo: datos.vehiculoTitulo,
    matricula: "",
    clienteEmail: datos.clienteEmail,
    creadoPor: datos.creadoPor,
  });
}

/** Lo común: abrir una lista de trámites colgando de algo, sin repetir. */
async function abreTramites(tipos: string[], datos: {
  leadId?: string;
  pedidoId?: string;
  vehiculoTitulo: string;
  matricula: string;
  clienteEmail: string;
  creadoPor: string;
}): Promise<string[]> {
  await prepara();
  const creados: string[] = [];

  for (const tipo of tipos) {
    const columna = datos.pedidoId ? "pedido_id" : "lead_id";
    const valor = datos.pedidoId ?? datos.leadId ?? "";
    if (!valor) continue;

    /*
     * Lo mismo por el otro lado: se mira el coche entero, no la columna.
     *
     * Un pedido y su expediente son el mismo coche, y cada uno abría su juego
     * de papeleos sin ver el del otro.
     */
    const yaHay = await query(
      `SELECT id FROM erp_tramites
        WHERE tipo = $2
          AND (${columna} = $1
            OR lead_id IN (SELECT pe.lead_id FROM erp_pedidos pe WHERE pe.id = $1)
            OR pedido_id IN (SELECT pe.id FROM erp_pedidos pe WHERE pe.lead_id = $1))`,
      [valor, tipo]
    );
    if (yaHay.rows.length) continue;

    try {
      const { id } = await guardaConIdUnico(
        () => siguienteDeSerie('erp_tramites', prefijoAnual('TRA')),
        async (nuevoId) => {
          await query(
            `INSERT INTO erp_tramites (id, tipo, vehiculo_titulo, matricula, cliente_email, ${columna}, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [nuevoId, tipo, datos.vehiculoTitulo, datos.matricula,
             String(datos.clienteEmail).toLowerCase(), valor, datos.creadoPor]
          );
        }
      );
      creados.push(id);
    } catch (e) {
      console.error('[tramites] no se ha podido abrir «%s»:', tipo, (e as Error).message);
    }
  }
  return creados;
}

/**
 * Los trámites que abre una importación al llegar a «En trámites».
 *
 * Un coche traído de Alemania necesita siempre lo mismo para poder circular
 * aquí: pagar el impuesto de matriculación, pasar la ITV de homologación y que
 * le den matrícula española. Se abren los tres, y quien los lleve añade o quita
 * lo que haga falta — el tipo es texto libre justamente para eso.
 *
 * Si ya existen, no se duplican.
 */
/**
 * Los papeleos que le falten a un coche de fuera que ya está aquí.
 *
 * Se abrían desde dos sitios —al mover la etapa a mano y al llegar el camión— y
 * el mismo coche acababa con seis trámites en vez de tres: entre que uno mira
 * si ya existen y el otro los inserta caben unos milisegundos.
 *
 * Así que los abre **uno solo**, y mirando lo que hay en vez de confiar en que
 * alguien lo hizo en su momento. Es idempotente por construcción y da igual qué
 * camino haya movido la etapa: el resultado es el mismo. Es el mismo patrón que
 * los tramos que faltan y los pedidos que se ponen al día.
 */
export async function abreLosTramitesQueFalten(): Promise<number> {
  await prepara();
  /*
   * Cuelgan **del pedido**, no del expediente.
   *
   * Es donde ya colgaban, y no es un detalle de gusto: lo que cuesta un coche
   * se suma por el pedido, así que un papeleo colgado del expediente sale del
   * total y el coche parece 1.200 € más barato de lo que fue. Con dos sitios
   * abriéndolos, además, el mismo coche acababa con seis.
   *
   * Lo que cambia respecto a antes es **cuándo**: ya no hay que esperar a que
   * alguien dé el pedido por recibido; en cuanto el coche está aquí, los tres
   * papeleos existen y aparecen en Gestoría.
   */
  const coches = await query<{
    id: string; origen: string; titularidad: string; vehiculo_titulo: string;
    matricula: string; cliente_email: string;
  }>(
    `SELECT pe.id, pe.origen, pe.titularidad, pe.vehiculo_titulo, pe.matricula, pe.cliente_email
       FROM erp_pedidos pe
       JOIN moveadvisor_market_leads l ON l.id = pe.lead_id
      WHERE pe.origen = 'importacion' AND pe.estado <> 'Cancelado'
        AND l.status IN ('En trámites', 'Entregado')
      LIMIT 50`
  ).catch(() => ({ rows: [] as {
    id: string; origen: string; titularidad: string; vehiculo_titulo: string;
    matricula: string; cliente_email: string;
  }[] }));

  let abiertos = 0;
  for (const c of coches.rows) {
    const creados = await abreTramitesDePedido({
      pedidoId: c.id,
      origen: c.origen,
      titularidad: c.titularidad ?? 'popcar',
      vehiculoTitulo: c.vehiculo_titulo ?? '',
      matricula: c.matricula ?? '',
      clienteEmail: c.cliente_email ?? '',
      creadoPor: 'al llegar el coche',
    }).catch(() => [] as string[]);
    abiertos += creados.length;
  }
  return abiertos;
}

export async function abreTramitesDeImportacion(datos: {
  leadId: string;
  vehiculoTitulo: string;
  clienteEmail: string;
  creadoPor: string;
}): Promise<string[]> {
  await prepara();
  const DE_IMPORTACION = ['Impuesto de matriculación', 'ITV de homologación', 'Matriculación de importación'];
  const creados: string[] = [];

  for (const tipo of DE_IMPORTACION) {
    /*
     * ¿Ya lo tiene **el coche**? No basta con mirar el expediente.
     *
     * Un mismo coche los abre por dos caminos: al llegar a Zaragoza cuelgan
     * del expediente, y al darse el pedido por recibido cuelgan del pedido.
     * Mirando solo `lead_id`, el segundo camino no veía al primero y el coche
     * acababa con seis papeleos: dos impuestos de matriculación, dos ITV y dos
     * matrículas. Seis tarjetas en Gestoría para tres cosas que hacer.
     *
     * El papeleo es del coche, no de la fila desde la que se abrió.
     */
    const yaHay = await query(
      `SELECT id FROM erp_tramites
        WHERE tipo = $2
          AND (lead_id = $1
            OR pedido_id IN (SELECT pe.id FROM erp_pedidos pe WHERE pe.lead_id = $1))`,
      [datos.leadId, tipo]
    );
    if (yaHay.rows.length) continue;

    try {
      const { id } = await guardaConIdUnico(
        () => siguienteDeSerie('erp_tramites', prefijoAnual('TRA')),
        async (nuevoId) => {
          await query(
            `INSERT INTO erp_tramites (id, tipo, vehiculo_titulo, cliente_email, lead_id, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [nuevoId, tipo, datos.vehiculoTitulo, String(datos.clienteEmail).toLowerCase(),
             datos.leadId, datos.creadoPor]
          );
        }
      );
      creados.push(id);
    } catch (e) {
      console.error('[tramites] no se ha podido abrir «%s»:', tipo, (e as Error).message);
    }
  }
  return creados;
}

export { RECHAZADO };
