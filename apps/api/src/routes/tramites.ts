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
import { resumenDeLaGestoria, type Partida } from '../lib/partidas-de-la-gestoria.js';
import { faltaParaResolver } from '../lib/expediente-de-gestoria.js';
import { escritoEnLista } from '../lib/escrow.js';
import { ponAlDiaLasEtapas } from './transportes.js';
import { requireRole } from '../middleware/auth.js';
import { apuntaFacturaEsperada, emiteLaFacturaDelTramite } from './provider-billing.js';
import {
  ENSURE_COLUMNAS as ENSURE_COBRO, SQL_SIN_COBRAR, SQL_LOS_SIN_COBRAR, SQL_COBRA,
  loQueSeProponeCobrar, loQueDeja, QUE_SE_COBRA,
} from '../lib/cobro-del-tramite.js';
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

/**
 * Y del encargo de venta de un particular.
 *
 * Es el tercer sitio del que puede colgar un tramite, y hacia falta: el flujo
 * gestionado cierra **encargos**, no leads, y un encargo abierto desde la ficha
 * del IDCar no tiene lead. Colgandolo del lead, esa transferencia no se abria
 * y no fallaba nada — `abreTramites` se salta en silencio lo que no tiene de
 * donde colgar.
 *
 * Y aunque hubiera lead, el sitio correcto es el encargo: el lead es la
 * peticion y el encargo es el mandato, que es lo que tiene el coche, el cliente
 * y la venta.
 */
const ENSURE_UNIQUE_ENCARGO = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_encargo_tipo
    ON erp_tramites (encargo_id, tipo) WHERE encargo_id IS NOT NULL`;

const ENSURE_UNIQUE_PEDIDO = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_pedido_tipo
    ON erp_tramites (pedido_id, tipo) WHERE pedido_id IS NOT NULL`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_TABLE, []).catch(() => {});
  // Lo que factura la gestoría, partida a partida. Un número suelto mete el
  // impuesto de matriculación en el coste del coche como si fuera gasto
  // nuestro, y son mil cuatrocientos euros de Hacienda.
  await query(`ALTER TABLE erp_tramites ADD COLUMN IF NOT EXISTS partidas JSONB NOT NULL DEFAULT '[]'::jsonb`, []).catch(() => {});
  await query(`ALTER TABLE erp_tramites ADD COLUMN IF NOT EXISTS encargo_id TEXT`, []).catch(() => {});
  /*
   * Lo que le cobramos al comprador por el papeleo, que no es lo que nos cuesta.
   *
   * El contrato dice que los gastos del cambio de titularidad son suyos, y de
   * todo eso el ERP guardaba una sola cifra: la de la gestoria. El ingreso que
   * la compensa no existia en ningun sitio.
   */
  await query(ENSURE_COBRO, []).catch(() => {});
  await query(ENSURE_HISTORY, []).catch(() => {});
  await query(ENSURE_INDEX, []).catch(() => {});
  await query(ENSURE_UNIQUE, []).catch(() => {});
  await query(ENSURE_UNIQUE_PEDIDO, []).catch(() => {});
  await query(ENSURE_UNIQUE_ENCARGO, []).catch(() => {});
  preparado = true;
}

function nt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CAMPOS = `id, tipo, estado, gestoria, vehiculo_titulo, matricula, bastidor, cliente_email,
                pedido_id, lead_id, encargo_id, coste::numeric AS coste, partidas,
                fecha_enviado, fecha_resuelto,
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
  await laMatriculaQueYaTiene().catch(() => 0);
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
      // Y de qué coche es, resolviendo el pedido: cuelgan de uno o de otro
      // según por dónde se abrieran, y el mismo coche salía en dos tarjetas.
      `SELECT ${CAMPOS},
              COALESCE(erp_tramites.lead_id,
                       (SELECT pe.lead_id FROM erp_pedidos pe WHERE pe.id = erp_tramites.pedido_id),
                       erp_tramites.pedido_id) AS coche,
              COALESCE((SELECT array_agg(d.papel) FROM erp_documentos d
                         WHERE d.ambito = 'tramite' AND d.ambito_id = erp_tramites.id), '{}') AS papeles,
              (SELECT l.encargo_gestoria_enviado_at FROM moveadvisor_market_leads l
                WHERE l.id = COALESCE(erp_tramites.lead_id,
                       (SELECT pe.lead_id FROM erp_pedidos pe WHERE pe.id = erp_tramites.pedido_id))
              ) AS encargo_enviado_at
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

    /*
     * Y no se da por resuelto sin lo que tiene que volver.
     *
     * Los papeles y el coste. Sin el permiso de circulación y la ficha técnica
     * el coche no se entrega, y eso se descubre el día de la entrega; sin el
     * coste queda un gasto que aparece semanas después, cuando el margen ya se
     * ha calculado.
     */
    if (estado === 'Resuelto') {
      const suyos = await query<{ papel: string }>(
        `SELECT papel FROM erp_documentos WHERE ambito = 'tramite' AND ambito_id = $1`,
        [req.params.id]
      ).catch(() => ({ rows: [] as { papel: string }[] }));
      const conPartidas = req.body?.partidas !== undefined
        ? resumenDeLaGestoria(req.body.partidas as Partida[]).total
        : previo.coste;
      const falta = faltaParaResolver({
        tipo: String(previo.tipo ?? ''),
        papeles: suyos.rows.map((d) => d.papel),
        coste: conPartidas,
      });
      if (falta.length) {
        res.status(409).json({
          ok: false, error: 'sin_lo_que_vuelve',
          detail: `Antes de darlo por resuelto falta ${escritoEnLista(falta)}.`,
          faltan: falta,
        });
        return;
      }
    }

    const sets: string[] = [];
    const valores: unknown[] = [];
    const pon = (columna: string, valor: unknown) => { valores.push(valor); sets.push(`${columna} = $${valores.length}`); };

    for (const campo of ['tipo', 'gestoria', 'vehiculo_titulo', 'matricula', 'bastidor', 'cliente_email'] as const) {
      if (req.body?.[campo] !== undefined) pon(campo, nt(req.body[campo]));
    }
    /*
     * El coste, solo si no vienen partidas.
     *
     * La pantalla manda las dos cosas —el formulario sigue llevando `coste`
     * dentro— y asignar la misma columna dos veces en un `UPDATE` es un error
     * de Postgres, no un aviso: la petición entera se caía con
     * «tramites_failed» y no se guardaba nada.
     *
     * Con partidas mandan ellas: son el detalle y el coste es su suma.
     */
    if (req.body?.coste !== undefined && req.body?.partidas === undefined) {
      pon('coste', req.body.coste === '' || req.body.coste === null ? null : Number(req.body.coste));
    }

    /*
     * Las partidas, y el coste que sale de ellas.
     *
     * El coste deja de escribirse a mano cuando hay partidas: es su suma, y
     * dos números que dicen lo mismo acaban diciendo cosas distintas. Se guarda
     * igualmente en `coste` porque es de donde lo lee todo lo demás —lo que
     * cuesta el coche, los totales de la pantalla— y ahí no hace falta el
     * detalle.
     */
    if (req.body?.partidas !== undefined) {
      const lista = Array.isArray(req.body.partidas) ? (req.body.partidas as Partida[]) : [];
      const limpias = lista
        .filter((p) => p && String(p?.concepto ?? '').trim())
        .map((p) => ({
          concepto: String(p.concepto).trim(),
          importe: p.importe ?? null,
          que: p.que === 'nuestro' ? 'nuestro' : 'suplido',
        }));
      pon('partidas', JSON.stringify(limpias));
      pon('coste', limpias.length ? resumenDeLaGestoria(limpias as Partida[]).total : null);
    }

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

// ── Lo que el comprador nos debe por el papeleo ─────────────────────────────
/**
 * Cuántas transferencias están sin cobrarle al comprador.
 *
 * Para el panel. El contrato dice que los gastos del cambio de titularidad son
 * suyos; el ERP guardaba solo lo que nos cuesta la gestoría, así que esa
 * operación únicamente restaba en el margen del coche.
 */
export async function losTramitesSinCobrar(): Promise<{ tramites_sin_cobrar: number }> {
  await prepara().catch(() => {});
  const r = await query(SQL_SIN_COBRAR).catch(() => null);
  return { tramites_sin_cobrar: Number(r?.rows[0]?.n ?? 0) };
}

/** Y cuáles son, con lo que cuestan y lo que dejarían. */
tramitesRouter.get('/tramites/sin-cobrar', requireRole(['admin', 'support', 'operations']), async (_req, res) => {
  try {
    await prepara();
    const r = await query(SQL_LOS_SIN_COBRAR).catch(() => ({ rows: [] }));
    res.json({
      ok: true,
      data: {
        tramites: (r.rows as Record<string, unknown>[]).map((t) => ({
          ...t,
          // Lo que se propone cobrar es el coste: un suelo, no una tarifa.
          propuesto: loQueSeProponeCobrar(t.coste),
          deja: loQueDeja(t.precio, t.coste),
        })),
        que_se_cobra: QUE_SE_COBRA,
      },
    });
  } catch (e) {
    console.error('[tramites] sin cobrar:', (e as Error).message);
    res.status(500).json({ ok: false, error: 'tramites_sin_cobrar_failed' });
  }
});

/**
 * Se apunta que el comprador ya lo ha pagado, y cuánto.
 *
 * Esto **no cobra nada**: apunta que se cobró. Por eso pide el importe en vez
 * de dar por bueno el propuesto — lo que entra en los libros tiene que ser lo
 * que de verdad pagó, no lo que pensábamos cobrarle.
 */
tramitesRouter.post('/tramites/:id/cobrado', requireRole(['admin', 'operations']), async (req, res) => {
  const importe = Number(req.body?.precio);
  if (!Number.isFinite(importe) || importe <= 0) {
    res.status(400).json({ ok: false, error: 'importe_invalido', detail: 'Hace falta lo que pagó' });
    return;
  }
  try {
    await prepara();
    const r = await query(SQL_COBRA, [
      req.params.id, importe, req.actor?.name ?? req.actor?.sub ?? '',
    ]);
    if (!r.rows.length) {
      res.status(409).json({ ok: false, error: 'ya_estaba_cobrado' });
      return;
    }

    /*
     * Y se le emite su factura.
     *
     * Aquí y no en un botón aparte: cobrar y facturar son el mismo hecho, y
     * separarlos crearía una segunda lista de «cobrados sin facturar» que se
     * olvidaría igual que se olvidaba ésta. Desde aquí entra sola en la
     * maquinaria que ya existe — sale en «facturas emitidas sin enviar» hasta
     * que alguien descargue el PDF, que es lo que se la manda.
     *
     * Con su propio `catch`: el cobro ya está apuntado y no puede deshacerse
     * porque la factura falle. Si falla, queda el aviso en el log y el trámite
     * cobrado, que es mejor que un cobro perdido.
     */
    const t = await query<Record<string, string>>(
      `SELECT tipo, matricula, vehiculo_titulo, comprador_nombre, comprador_email
         FROM erp_tramites WHERE id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] as Record<string, string>[] }));
    const suyo = t.rows[0];
    if (suyo) {
      await emiteLaFacturaDelTramite({
        tramiteId: req.params.id,
        tipo: suyo.tipo,
        matricula: suyo.matricula,
        vehiculo: suyo.vehiculo_titulo,
        compradorNombre: suyo.comprador_nombre,
        compradorEmail: suyo.comprador_email,
        total: importe,
      }).catch((e) => console.error('[tramites] cobrado pero sin factura:', (e as Error).message));
    }

    res.json({ ok: true, data: { id: r.rows[0].id, precio: r.rows[0].precio } });
  } catch (e) {
    console.error('[tramites] apuntar el cobro:', (e as Error).message);
    res.status(500).json({ ok: false, error: 'tramite_cobrado_failed' });
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

/**
 * Y el de vender el coche de un particular por él.
 *
 * Es el mismo trámite —una transferencia de titularidad— pero por otro motivo:
 * aquí el coche nunca fue nuestro. Pasa de su dueño al comprador que le hemos
 * encontrado, y el contrato y la transferencia los hacemos nosotros. Se lo
 * prometemos por escrito en el mandato que firma y en la guía.
 *
 * Hasta ahora no lo abría nadie. `abreTramitesDeVenta` salta cuando un **lead**
 * pasa a «Vendido», y el flujo gestionado no cierra leads: cierra encargos. Así
 * que se cobraban los 299 € y el papel que le habíamos prometido no existía —
 * y encima al final, cuando el cliente ya lo da por hecho.
 */
export async function abreLaTransferenciaDelEncargo(datos: {
  encargoId: string;
  vehiculoTitulo: string;
  matricula: string;
  clienteEmail: string;
  creadoPor: string;
  /** Quien compra, que es quien paga el papeleo. */
  compradorNombre?: string;
  compradorEmail?: string;
}): Promise<string[]> {
  return abreTramites(TRAMITES_AL_VENDER, {
    encargoId: datos.encargoId,
    vehiculoTitulo: datos.vehiculoTitulo,
    matricula: datos.matricula,
    clienteEmail: datos.clienteEmail,
    creadoPor: datos.creadoPor,
    compradorNombre: datos.compradorNombre,
    compradorEmail: datos.compradorEmail,
  });
}

/** Lo común: abrir una lista de trámites colgando de algo, sin repetir. */
async function abreTramites(tipos: string[], datos: {
  leadId?: string;
  pedidoId?: string;
  encargoId?: string;
  vehiculoTitulo: string;
  matricula: string;
  clienteEmail: string;
  creadoPor: string;
  /*
   * Quien compra, que es quien paga el papeleo.
   *
   * `clienteEmail` es el vendedor: es su encargo y su coche. Pero el contrato
   * dice que los gastos del cambio de titularidad son del comprador, asi que
   * hace falta saber a quien cobrarselo — y sin esto la columna existia y no la
   * rellenaba nadie.
   */
  compradorNombre?: string;
  compradorEmail?: string;
}): Promise<string[]> {
  await prepara();
  const creados: string[] = [];

  /*
   * De qué cuelga: pedido, encargo o lead, en ese orden.
   *
   * El encargo va antes que el lead a propósito. Un encargo puede tener lead o
   * no —los que se abren desde la ficha del IDCar no lo tienen— y aunque lo
   * tenga, el sitio correcto es el encargo: el lead es la petición y el encargo
   * es el mandato, que es lo que tiene el coche, el cliente y la venta.
   */
  const columna = datos.pedidoId ? 'pedido_id' : datos.encargoId ? 'encargo_id' : 'lead_id';
  const valor = datos.pedidoId ?? datos.encargoId ?? datos.leadId ?? '';

  /*
   * Sin nada de lo que colgar no se abre nada, y se dice.
   *
   * Esto se saltaba en silencio dentro del bucle: quien llamaba recibía una
   * lista vacía igual que si ya estuvieran todos abiertos, y no hay forma de
   * distinguir «ya estaban» de «no se ha abierto ninguno». Es como la
   * transferencia del flujo gestionado no se abría sin que fallara nada.
   */
  if (!valor) {
    console.error('[tramites] no se abre nada: no hay pedido, encargo ni lead del que colgar');
    return creados;
  }

  for (const tipo of tipos) {

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
            `INSERT INTO erp_tramites (id, tipo, vehiculo_titulo, matricula, cliente_email, ${columna},
                                       creado_por, comprador_nombre, comprador_email)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [nuevoId, tipo, datos.vehiculoTitulo, datos.matricula,
             String(datos.clienteEmail).toLowerCase(), valor, datos.creadoPor,
             String(datos.compradorNombre ?? ''),
             String(datos.compradorEmail ?? '').toLowerCase()]
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
/**
 * La matrícula española nace en la gestoría, y de ahí no salía.
 *
 * Es el trámite el que la trae: hasta que la gestoría no matricula, el coche
 * no tiene ninguna. Y en cuanto la tiene, **es la matrícula del coche** —no un
 * dato del papeleo—: es como se le busca, cómo se le nombra en una orden de
 * recogida y lo que el cliente está esperando leer.
 *
 * Se quedaba escrita en el expediente de gestoría y en ningún sitio más. El
 * pedido seguía sin matrícula, los tramos también, y el correo que le dice al
 * cliente que su coche sale hacia su casa decía «ya está matriculado» sin poder
 * decir con qué matrícula, que es justo la frase que él quería leer.
 *
 * Reconciliador y no un disparo al guardar el trámite, por lo de siempre: se
 * escribió a mano en la base, se guardó desde una pantalla que no lo copiaba,
 * se resolvió antes de que esto existiera. El hecho —la matrícula está ahí—
 * sigue mañana; el momento en que se tecleó, no.
 *
 * Solo rellena lo que está **vacío**. Una matrícula escrita a mano en el pedido
 * gana: puede ser la buena y la del trámite un dedazo, y la que alguien tecleó
 * mirando el permiso de circulación no se pisa desde aquí.
 */
export async function laMatriculaQueYaTiene(): Promise<number> {
  await prepara();
  let puestas = 0;

  /*
   * El mismo coche por sus dos columnas.
   *
   * Un papeleo cuelga del pedido o del expediente según por dónde se abriera,
   * y las dos cosas son el mismo coche. Mirando una sola, la mitad de las
   * matrículas no llegaría a ninguna parte.
   */
  const alPedido = await query(
    `UPDATE erp_pedidos pe
        SET matricula = tr.matricula, updated_at = NOW()
       FROM erp_tramites tr
      WHERE COALESCE(pe.matricula, '') = ''
        AND COALESCE(tr.matricula, '') <> ''
        AND (tr.pedido_id = pe.id OR tr.lead_id = pe.lead_id)`
  ).catch((e: Error) => {
    console.error('[tramites] no se ha podido llevar la matrícula al pedido:', e.message);
    return { rowCount: 0 };
  });
  puestas += alPedido.rowCount ?? 0;

  /*
   * Y a los viajes, que es donde se lee.
   *
   * Va en el asunto de la orden de recogida —es como la van a buscar en su
   * bandeja— y en el correo al cliente. También al primer tramo, aunque
   * entonces el coche viajara con matrícula alemana: el tramo no guarda la
   * matrícula que tenía ese día, guarda de qué coche es.
   */
  const alViaje = await query(
    `UPDATE erp_transportes t
        SET matricula = tr.matricula, updated_at = NOW()
       FROM erp_tramites tr
      WHERE COALESCE(t.matricula, '') = ''
        AND COALESCE(tr.matricula, '') <> ''
        AND (tr.pedido_id = t.pedido_id OR tr.lead_id = t.lead_id)`
  ).catch((e: Error) => {
    console.error('[tramites] no se ha podido llevar la matrícula al viaje:', e.message);
    return { rowCount: 0 };
  });
  puestas += alViaje.rowCount ?? 0;

  if (puestas) console.log('[tramites] repartida la matrícula a %d fichas', puestas);
  return puestas;
}

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

  /*
   * Y se recogen los que dejó la regla vieja.
   *
   * Una importación abría tres papeleos y ahora abre uno. Los tres que ya
   * existían se quedarían ahí para siempre pidiendo trabajo por triplicado:
   * cambiar una regla sin recoger lo que dejó la anterior es dejar el tablero
   * contando algo que ya no es.
   *
   * Solo los **intactos** —sin coste, sin partidas, sin salir y sin resolver—
   * y solo si el coche ya tiene el que abre la regla de ahora. Uno con algo
   * escrito no lo abrió esta función sola, y lo que alguien escribió no se
   * borra por un cambio de criterio.
   */
  const sobran = await query(
    `DELETE FROM erp_tramites t
      WHERE t.tipo IN ('Impuesto de matriculación', 'ITV de homologación')
        AND t.estado = 'Pendiente'
        AND t.coste IS NULL
        AND COALESCE(jsonb_array_length(t.partidas), 0) = 0
        AND t.fecha_enviado IS NULL
        AND t.fecha_resuelto IS NULL
        AND EXISTS (
          SELECT 1 FROM erp_pedidos pe
           WHERE pe.id = t.pedido_id OR pe.lead_id = t.lead_id
             AND pe.origen = 'importacion')
        -- Y solo si ya tiene el de ahora, para no dejarlo sin ninguno.
        AND EXISTS (
          SELECT 1 FROM erp_tramites otro
           WHERE otro.tipo = 'Matriculación de importación'
             AND (otro.lead_id = t.lead_id
               OR otro.pedido_id = t.pedido_id
               OR otro.lead_id IN (SELECT pe.lead_id FROM erp_pedidos pe WHERE pe.id = t.pedido_id)
               OR otro.pedido_id IN (SELECT pe.id FROM erp_pedidos pe WHERE pe.lead_id = t.lead_id)))`
  ).catch((e: Error) => {
    console.error('[tramites] no se han podido recoger los que sobran:', e.message);
    return { rowCount: 0 };
  });
  if (sobran.rowCount) {
    console.log('[tramites] recogidos %d papeleos de la regla vieja', sobran.rowCount);
  }

  /*
   * Y los gemelos, uno en cada cajón.
   *
   * El mismo papeleo del mismo coche podía abrirse dos veces —colgando del
   * expediente y colgando del pedido— porque durante un rato cada camino
   * miraba solo su columna. Dos fichas idénticas del mismo trámite no son dos
   * cosas que hacer: son la misma contada dos veces.
   *
   * Se queda **el más viejo**, que es el que puede tener historia detrás, y se
   * va el intacto. Con algo escrito, ninguno se toca.
   */
  const gemelos = await query(
    `DELETE FROM erp_tramites t
      WHERE t.estado = 'Pendiente'
        AND t.coste IS NULL
        AND COALESCE(jsonb_array_length(t.partidas), 0) = 0
        AND t.fecha_enviado IS NULL
        AND t.fecha_resuelto IS NULL
        AND EXISTS (
          SELECT 1 FROM erp_tramites viejo
           WHERE viejo.id <> t.id
             AND viejo.tipo = t.tipo
             AND viejo.created_at <= t.created_at
             AND (viejo.lead_id = t.lead_id
               OR viejo.pedido_id = t.pedido_id
               OR viejo.lead_id IN (SELECT pe.lead_id FROM erp_pedidos pe WHERE pe.id = t.pedido_id)
               OR viejo.pedido_id IN (SELECT pe.id FROM erp_pedidos pe WHERE pe.lead_id = t.lead_id)))`
  ).catch((e: Error) => {
    console.error('[tramites] no se han podido recoger los gemelos:', e.message);
    return { rowCount: 0 };
  });
  if (gemelos.rowCount) {
    console.log('[tramites] recogidos %d papeleos repetidos', gemelos.rowCount);
  }

  /*
   * Y el que ya se encargó, fuera.
   *
   * Con el correo mandado la pelota es de la gestoría, pero eso se apuntaba en
   * el momento de mandarlo, y un momento se pierde: los que se encargaron
   * antes de que existiera esa regla se quedaron diciendo «Pendiente» en el
   * bloque de lo que depende de nosotros, con el reloj parado.
   *
   * La fecha de salida se cuenta desde el correo, no desde ahora: si no, un
   * expediente que lleva tres semanas fuera aparecería recién salido.
   */
  const fuera = await query(
    `UPDATE erp_tramites t
        SET estado = 'Enviado a gestoría',
            fecha_enviado = COALESCE(t.fecha_enviado, l.encargo_gestoria_enviado_at),
            updated_at = NOW()
       FROM moveadvisor_market_leads l
      WHERE l.encargo_gestoria_enviado_at IS NOT NULL
        AND (t.lead_id = l.id
          OR t.pedido_id IN (SELECT pe.id FROM erp_pedidos pe WHERE pe.lead_id = l.id))
        AND t.estado IN ('Pendiente', 'Documentación incompleta')`
  ).catch((e: Error) => {
    console.error('[tramites] no se han podido poner fuera los ya encargados:', e.message);
    return { rowCount: 0 };
  });
  if (fuera.rowCount) {
    console.log('[tramites] puestos fuera %d ya encargados', fuera.rowCount);
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
