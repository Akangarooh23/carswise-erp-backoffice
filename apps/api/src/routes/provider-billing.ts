import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { subeAlAlmacen } from '../lib/subir-al-almacen.js';
import { prefijoAnual, siguienteDeSerie, guardaConIdUnico } from '../lib/series.js';
import { falloInterno } from '../lib/fallos.js';
import { IVA_GENERAL, tipoDeIva, regimenPorDefecto, noCuadra, type Regimen } from '../lib/dinero.js';
import { seEsperaFactura, cualEsperaCierra, ESPERADA, CUADRADA } from '../lib/facturas-esperadas.js';
import { preparaGarantias } from './garantias.js';
import { preparaVisitas } from './visits.js';
import { FEE_POR_VENTA, laComision, elConcepto } from '../lib/comision-del-concesionario.js';
import { elProveedorDe } from '../lib/proveedores.js';

/**
 * A qué ficha de proveedor corresponde cada factura.
 *
 * Hasta ahora la única atadura era `provider_name`, texto libre. Eso vale para
 * leer la factura y no vale para sumar: «Becker Solutions, S.L.» y «Becker
 * Solutions, S.L. (Becker Lines)» son el mismo acreedor y dos cadenas
 * distintas, y el día que haya sedes —Modrive Madrid, Modrive Barcelona— hay
 * que poder saber que las dos declaran con Modrive SL.
 *
 * `provider_name` **no se toca**: es lo que decía el documento cuando se
 * emitió, y reescribirlo a posteriori cambiaría una factura ya emitida. La
 * columna nueva es para sumar; la vieja es lo que se imprimió.
 */
const ENSURE_PROVEEDOR = `
  ALTER TABLE moveadvisor_provider_invoices
    ADD COLUMN IF NOT EXISTS proveedor_id VARCHAR(40)`;

let preparado = false;
async function prepara() {
  if (preparado) return;
  await query(ENSURE_PROVEEDOR, []).catch(() => {});
  await ataLasQueYaEstaban();
  preparado = true;
}

/**
 * Las facturas que ya estaban, atadas a su ficha.
 *
 * Se hace una vez, al arrancar, y solo sobre las que no tienen ficha todavía:
 * volver a pasar no cambia nada. Se resuelve con `elProveedorDe`, que es el
 * mismo emparejador que usa el resto —el nombre entero primero y, si no, que
 * uno empiece por el otro—, así que lo que aquí quede atado es lo mismo que ya
 * se juntaba para leer.
 *
 * Las ventas de vehículo se quedan fuera: ahí el otro lado es un cliente, no un
 * proveedor. Ponerles una ficha sería decir que le compramos algo a alguien a
 * quien le hemos vendido un coche.
 */
async function ataLasQueYaEstaban() {
  const sinFicha = await query<{ provider_name: string }>(
    `SELECT DISTINCT provider_name FROM moveadvisor_provider_invoices
      WHERE proveedor_id IS NULL AND COALESCE(provider_name, '') <> '' AND type <> 'vehicle_sale'`,
    []
  ).catch(() => ({ rows: [] as { provider_name: string }[] }));
  if (!sinFicha.rows.length) return;

  const fichas = await query<{ id: string; nombre: string; relacion: string | null }>(
    `SELECT id, nombre, relacion FROM erp_proveedores`, []
  ).catch(() => ({ rows: [] as { id: string; nombre: string; relacion: string | null }[] }));
  if (!fichas.rows.length) return;

  for (const { provider_name } of sinFicha.rows) {
    const ficha = elProveedorDe(provider_name, fichas.rows);
    if (!ficha) continue;
    await query(
      `UPDATE moveadvisor_provider_invoices SET proveedor_id = $2
        WHERE proveedor_id IS NULL AND provider_name = $1 AND type <> 'vehicle_sale'`,
      [provider_name, ficha.id]
    ).catch(() => {});
  }
}

/**
 * La ficha que le toca a un nombre, al guardar una factura nueva.
 *
 * Se resuelve al crearla y no al leerla: el nombre puede cambiar de forma más
 * tarde —o el proveedor puede pasar a ser sede de otro— y lo que hay que
 * conservar es a quién se le facturó entonces.
 *
 * Si no casa con ninguna ficha, se queda a nulo. No se da de alta sola: dar de
 * alta un proveedor con lo que venga escrito en una factura es cómo se acaba
 * con tres fichas del mismo. Sale sin ficha, y sin ficha se ve.
 */
async function laFichaDe(nombre: unknown): Promise<string | null> {
  const buscado = typeof nombre === 'string' ? nombre.trim() : '';
  if (!buscado) return null;
  const fichas = await query<{ id: string; nombre: string; relacion: string | null }>(
    `SELECT id, nombre, relacion FROM erp_proveedores WHERE activo = TRUE`, []
  ).catch(() => ({ rows: [] as { id: string; nombre: string; relacion: string | null }[] }));
  return elProveedorDe(buscado, fichas.rows)?.id ?? null;
}

/**
 * Ata una factura recién creada a la ficha de quien la emite.
 *
 * Va después del alta y no dentro, a propósito. Hay seis sitios que crean
 * facturas, cada uno con sus columnas: meter una más en las seis es seis
 * ocasiones de desplazar un parámetro sin darse cuenta, y ahí lo que se
 * desplaza son importes.
 *
 * Y si esto falla, la factura queda sin ficha y no pasa nada más: se ata sola
 * en el siguiente arranque, porque `ataLasQueYaEstaban` busca exactamente eso.
 * Lo que no puede pasar es que una factura no se guarde por no encontrar una
 * ficha.
 */
async function ataLaFactura(id: string, nombre: unknown): Promise<void> {
  const ficha = await laFichaDe(nombre);
  if (!ficha) return;
  await query(
    `UPDATE moveadvisor_provider_invoices SET proveedor_id = $2
      WHERE id = $1 AND proveedor_id IS NULL`,
    [id, ficha]
  ).catch(() => {});
}


export const providerBillingRouter = Router();

/**
 * Un tipo de IVA que llega en tanto por uno, leído en tanto por ciento.
 *
 * La pantalla manda `0.21` porque así lo guarda la columna, y `tipoDeIva`
 * trabaja en por ciento, que es como lo escribe una factura. Sin esto, un 0,21
 * es un tipo inventado y se descarta: la factura se quedaba sin IVA.
 */
function enPorCiento(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n * 100 : null;
}

/**
 * El siguiente identificador de fila de facturación de proveedores.
 *
 * Contaba filas, así que borrar una hacía que la siguiente repitiera un
 * identificador ya usado y chocara contra la clave primaria. Ahora se lee el
 * último emitido, como en los contratos, y desde el mismo sitio.
 *
 * No confundir con el número fiscal de la factura, que sale de
 * `nextInvoiceNumber` y lleva su propio contador atómico.
 */
export async function nextProviderInvoiceId(): Promise<string> {
  return siguienteDeSerie('moveadvisor_provider_invoices', prefijoAnual('PROV'));
}

// ── Summary ───────────────────────────────────────────────────────────────────
providerBillingRouter.get('/provider-billing/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const r = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int                AS pending_count,
        COUNT(*) FILTER (WHERE status = 'paid')::int                   AS paid_count,
        COALESCE(SUM(invoice_amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_amount,
        COALESCE(SUM(invoice_amount) FILTER (WHERE status = 'paid'),    0)::numeric AS paid_amount,
        COUNT(*) FILTER (WHERE type = 'renting_fee')::int              AS renting_count,
        COUNT(*) FILTER (WHERE type = 'portal_commission')::int        AS commission_count
      FROM moveadvisor_provider_invoices
      -- «Pendientes de cobro» es lo que nos deben a nosotros. Contando las
      -- dos direcciones, lo que le debemos al perito salía como dinero por
      -- cobrar.
      WHERE direction = 'emitted'
    `);

    /*
     * Y lo recibido, que es la pregunta contraria.
     *
     * En una factura emitida lo pendiente es dinero que nos deben; en una
     * recibida, dinero que debemos. Con los mismos números arriba en las dos
     * pestañas, «pendientes de cobro» acababa contando lo que le debemos al
     * perito.
     */
    const rec = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'pending_payment'))::int AS por_pagar_n,
        COALESCE(SUM(invoice_amount) FILTER (WHERE status IN ('pending', 'pending_payment')), 0)::numeric AS por_pagar,
        COUNT(*) FILTER (WHERE status = 'paid')::int                          AS pagadas_n,
        COALESCE(SUM(invoice_amount) FILTER (WHERE status = 'paid'), 0)::numeric AS pagado,
        COUNT(*) FILTER (WHERE status = 'esperada')::int                      AS esperando_n,
        COALESCE(SUM(invoice_amount) FILTER (WHERE status = 'esperada'), 0)::numeric AS esperando
      FROM moveadvisor_provider_invoices
      WHERE direction = 'received'
    `);

    res.json({ ok: true, data: { ...r.rows[0], recibidas: rec.rows[0] } });
  } catch (err) {
    falloInterno(res, 'summary_failed', err);
  }
});

// ── List invoices (emitted: renting_fee + portal_commission) ──────────────────
providerBillingRouter.get('/provider-billing/invoices', requireRole(['admin', 'operations']), async (req, res) => {
  // La columna de la ficha se crea al arrancar, y aqui es donde primero se
  // entra: sin esto, las que ya estaban se quedarian sin atar hasta que
  // alguien pasara por otra pantalla.
  await prepara();
  const type   = String(req.query.type   || 'all').trim();
  const status = String(req.query.status || '').trim();
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  /*
   * Solo las emitidas.
   *
   * No filtraba por dirección, así que esta lista enseñaba también las
   * facturas de proveedor —y, en cuanto existieron, las que solo estamos
   * esperando—. Una factura que nadie ha emitido, con nuestro identificador
   * interno en la columna «Nº factura», parece una factura que hemos emitido
   * nosotros; y ahí no hay ninguna.
   */
  const conditions: string[] = ["direction = 'emitted'"];
  const values: unknown[] = [];
  if (type !== 'all') { values.push(type);   conditions.push(`type = $${values.length}`); }
  if (status)         { values.push(status); conditions.push(`status = $${values.length}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT * FROM moveadvisor_provider_invoices ${where}
         ORDER BY issued_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_provider_invoices ${where}`, values),
    ]);
    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total.rows[0] as { total: number }).total, page, limit },
    });
  } catch (err) {
    falloInterno(res, 'list_failed', err);
  }
});

/**
 * Apuntar que **esperamos** una factura de alguien.
 *
 * Nace cuando el servicio está hecho —la revisión hecha, el tramo entregado,
 * el trámite resuelto— y no cuando se contrata: antes de eso no falta ninguna
 * factura, porque nadie puede facturar lo que no ha hecho.
 *
 * Va con estado propio y **no suma en lo pendiente de pagar**. Mezclarla con
 * las recibidas acabaría con alguien pagando contra una línea que nadie ha
 * emitido, y con una cifra de deuda que incluye lo que nadie ha reclamado.
 *
 * Una por proveedor, concepto y coche: la peritación de este Kia es una, y
 * volver a guardarla la corrige en vez de duplicarla.
 */
export async function apuntaFacturaEsperada(datos: {
  proveedor: string;
  concepto: string;
  importe: number | string | null;
  /**
   * Cómo se parte, si ya se sabe.
   *
   * Se sabe antes de que llegue la factura: lo acordado con el transportista
   * ya lleva su base y su tipo, y el régimen sale de su NIF. Guardarlo aquí
   * hace que la esperada se pueda cuadrar con la que llegue sin volver a
   * teclear nada.
   */
  base?: number | string | null;
  iva?: number | string | null;
  regimen?: string | null;
  vehiculo?: string | null;
  /** Desde cuándo se espera: el día que el servicio quedó hecho. */
  desde?: string | null;
}): Promise<string | null> {
  const proveedor = String(datos.proveedor ?? '').trim();
  const concepto = String(datos.concepto ?? '').trim();
  if (!seEsperaFactura({ proveedor, importe: datos.importe, hecho: true })) return null;
  if (!concepto) return null;

  const ya = await query<{ id: string; status: string }>(
    `SELECT id, status FROM moveadvisor_provider_invoices
      WHERE direction = 'received' AND provider_name = $1 AND notes = $2
        AND COALESCE(vehicle_title, '') = COALESCE($3, '') LIMIT 1`,
    [proveedor, concepto, datos.vehiculo || null]
  ).catch(() => ({ rows: [] as { id: string; status: string }[] }));

  /*
   * Si ya hay algo para este servicio, no se toca el estado.
   *
   * Puede ser la propia espera —se corrige el importe— o la factura ya
   * recibida, y en ese caso devolverla a «esperada» sería borrar el hecho de
   * que llegó.
   */
  if (ya.rows[0]) {
    if (ya.rows[0].status === ESPERADA) {
      await query(
        `UPDATE moveadvisor_provider_invoices
            SET invoice_amount = $2, updated_at = NOW()
          WHERE id = $1`,
        [ya.rows[0].id, Number(datos.importe)]
      ).catch(() => {});
    }
    return ya.rows[0].id;
  }

  const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (nuevoId) => {
    await query(
      `INSERT INTO moveadvisor_provider_invoices
         (id, type, direction, provider_name, vehicle_title,
          invoice_amount, base_amount, iva_rate, regimen, notes, status, issued_at)
       VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, $7, $8, $9,
               COALESCE($10::timestamptz, NOW()))`,
      [nuevoId, proveedor, datos.vehiculo || null, Number(datos.importe),
       datos.base != null && datos.base !== '' ? Number(datos.base) : null,
       // El tipo, en tanto por uno: es como estaba ya la columna.
       datos.iva != null && datos.iva !== '' ? Number(datos.iva) / 100 : null,
       datos.regimen || 'nacional', concepto,
       ESPERADA, datos.desde || null]
    );
  });
  await ataLaFactura(id, proveedor);
  return id;
}

/**
 * Apuntar una factura que nos han mandado.
 *
 * Está aparte de la ruta para poder llamarla desde donde la factura aparece de
 * verdad. La del perito llega en la peritación, y obligar a volver a teclearla
 * en otra pantalla es garantizar que un día no se teclea: entonces el gasto
 * existe en la cuenta del coche pero no hay nada que pagar en ningún sitio.
 *
 * Idempotente por proveedor y número: apuntarla dos veces la corrige, no la
 * duplica. Corregir el importe de una factura no puede crear una segunda.
 */
export async function apuntaFacturaRecibida(datos: {
  proveedor: string;
  numero: string;
  importe: number;
  fecha?: string | null;
  vehiculo?: string | null;
  notas?: string | null;
  /** Su factura en PDF, si la han mandado. */
  pdfBase64?: string | null;
  pdfNombre?: string | null;
}): Promise<string | null> {
  const proveedor = String(datos.proveedor ?? '').trim();
  const numero = String(datos.numero ?? '').trim();
  if (!proveedor || !numero || !(Number(datos.importe) > 0)) return null;

  /*
   * ¿Hay ya algo de este proveedor para esto?
   *
   * Puede ser la misma factura apuntada dos veces —se busca por su número—
   * o **la línea que la estaba esperando**, que no tiene número todavía. Si
   * no se buscara la segunda, al llegar la factura quedarían dos filas: una
   * esperando para siempre y otra por pagar.
   */
  const ya = await query<{ id: string }>(
    `SELECT id FROM moveadvisor_provider_invoices
      WHERE direction = 'received' AND provider_name = $1
        AND (notes LIKE $2
             OR (status = $3 AND notes = $4
                 AND COALESCE(vehicle_title, '') = COALESCE($5, '')))
      ORDER BY (notes LIKE $2) DESC LIMIT 1`,
    [proveedor, `%${numero}%`, ESPERADA, datos.notas || null, datos.vehiculo || null]
  ).catch(() => ({ rows: [] as { id: string }[] }));

  const notas = [`Factura ${numero}`, datos.notas].filter(Boolean).join(' · ');

  /*
   * El PDF va con la factura, no con los papeles del coche.
   *
   * Es el documento contra el que se paga: quien lo busca lo busca en
   * Facturación proveedores, no en el expediente. Si no se puede subir se
   * apunta igual —una factura sin PDF sigue siendo una factura que hay que
   * pagar— y se dice después.
   */
  async function subeElPdf(id: string): Promise<string | null> {
    if (!datos.pdfBase64 || !datos.pdfNombre) return null;
    return subeAlAlmacen(datos.pdfBase64, datos.pdfNombre, 'provider-invoices', id).catch(() => null);
  }
  if (ya.rows[0]) {
    const pdf = await subeElPdf(ya.rows[0].id);
    await query(
      `UPDATE moveadvisor_provider_invoices
          SET invoice_amount = $2, invoice_date = $3, vehicle_title = $4, notes = $5,
              -- El número es el suyo, no nuestro identificador de fila.
              invoice_number = $6,
              -- Un PDF nuevo sustituye al que hubiera; sin PDF, se deja el que hay.
              pdf_url = COALESCE($7, pdf_url),
              -- Si era una espera, deja de serlo: ya hay factura que pagar. Y
              -- si llega con su documento, queda lista para pagar sin más.
              status = CASE
                WHEN status IN ('esperada', 'pending') AND $7 IS NOT NULL THEN 'pending_payment'
                WHEN status = 'esperada' THEN 'pending'
                ELSE status END,
              updated_at = NOW()
        WHERE id = $1`,
      [ya.rows[0].id, Number(datos.importe), datos.fecha || null, datos.vehiculo || null,
       notas, numero, pdf]
    ).catch(() => {});
    return ya.rows[0].id;
  }

  const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (nuevoId) => {
    await query(
      `INSERT INTO moveadvisor_provider_invoices
         (id, type, direction, provider_name, vehicle_title,
          invoice_amount, invoice_date, notes, invoice_number, pdf_url, status)
       VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $8 IS NULL THEN 'pending' ELSE 'pending_payment' END)`,
      [nuevoId, proveedor, datos.vehiculo || null, Number(datos.importe), datos.fecha || null,
       notas, numero, await subeElPdf(nuevoId)]
    );
  });
  await ataLaFactura(id, proveedor);
  return id;
}

// ── Create received invoice (provider → CarsWise) manually with optional PDF ──
// Body: { provider_name, vehicle_title, amount, invoice_date, notes?, contract_id?,
//         pdf_base64?, pdf_filename? }
providerBillingRouter.post('/provider-billing/received', requireRole(['admin', 'operations']), async (req, res) => {
  const {
    provider_name, vehicle_title, amount, invoice_date, notes, contract_id,
    invoice_number, pdf_base64, pdf_filename, esperada_id,
    iva_rate, regimen, autorepercusion,
  } = req.body ?? {};
  if (!provider_name || !amount) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'provider_name and amount are required' });
    return;
  }
  try {
    /*
     * De dónde viene la factura y cómo se parte, que antes se perdían.
     *
     * El formulario mandaba `iva_rate` y esto no lo guardaba: una factura
     * alemana de 890 € entraba como nacional al 21 % y se deducían 154,46 €
     * de IVA que nadie soportó. Ahora se guardan los tres.
     *
     * Si no lo dicen, el régimen se saca del NIF del proveedor —un ROI
     * alemán es intracomunitario— y si tampoco está de alta, nacional, que
     * es lo que más hay y el error se ve en el papel.
     */
    const suRegimen: Regimen = (regimen === 'intracomunitario' || regimen === 'exento' || regimen === 'nacional')
      ? regimen
      : regimenPorDefecto((await query<{ nif: string }>(
          `SELECT nif FROM erp_proveedores WHERE LOWER(nombre) = LOWER($1) LIMIT 1`,
          [String(provider_name)]
        ).catch(() => ({ rows: [] as { nif: string }[] }))).rows[0]?.nif);

    // Una intracomunitaria no lleva IVA en el papel, diga lo que diga el
    // formulario; el tipo español va aparte, y nulo mientras no se decida.
    const suIva = suRegimen === 'nacional' ? (tipoDeIva(enPorCiento(iva_rate)) ?? IVA_GENERAL) : 0;
    const suAuto = suRegimen === 'intracomunitario' ? tipoDeIva(enPorCiento(autorepercusion)) : null;

    // Si dos personas dan de alta una factura a la vez, las dos piden el mismo
    // identificador. Una gana y la otra vuelve a pedir, en vez de llevarse un
    // error de base de datos.
    let pdf_url: string | null = null;

    /*
     * Si esta factura cierra una espera, se rellena esa fila.
     *
     * Antes se creaba siempre una nueva y la espera se quedaba ahí: en la
     * pantalla salían las dos —los 400 € de Becker contados dos veces— y
     * «esperando factura» no bajaba nunca.
     *
     * Cuál se cierra lo dice quien registra, pinchando la espera. Y si ha
     * entrado por el botón de arriba sin decirlo, se busca la del mismo
     * proveedor y el mismo coche: si no hay ninguna, entra como nueva. No
     * se fuerza el cuadre, porque cuadrar con la espera equivocada da por
     * facturado un servicio que sigue sin factura.
     */
    const candidatas = esperada_id
      ? await query<{ id: string; invoice_amount: unknown }>(
          `SELECT id, invoice_amount FROM moveadvisor_provider_invoices
            WHERE id = $1 AND direction = 'received' AND status = $2`,
          [String(esperada_id), ESPERADA]
        ).catch(() => ({ rows: [] }))
      : await query<{ id: string; invoice_amount: unknown }>(
          `SELECT id, invoice_amount FROM moveadvisor_provider_invoices
            WHERE direction = 'received' AND status = $1 AND provider_name = $2
              AND COALESCE(vehicle_title, '') = COALESCE($3, '')
            ORDER BY created_at`,
          [ESPERADA, provider_name, vehicle_title || null]
        ).catch(() => ({ rows: [] }));

    const cierra = cualEsperaCierra(candidatas.rows, amount);
    if (cierra) {
      const url = pdf_base64 && pdf_filename
        ? await subeAlAlmacen(pdf_base64, pdf_filename, 'provider-invoices', cierra)
        : null;
      await query(
        `UPDATE moveadvisor_provider_invoices
            SET invoice_number = COALESCE($2, invoice_number),
                invoice_amount = $3,
                invoice_date   = COALESCE($4, invoice_date),
                notes          = COALESCE($5, notes),
                pdf_url        = COALESCE($6, pdf_url),
                status         = CASE WHEN $6 IS NOT NULL THEN 'pending_payment' ELSE 'pending' END,
                regimen        = $7,
                iva_rate       = $8,
                autorepercusion = $9,
                updated_at     = NOW()
          WHERE id = $1`,
        [cierra, String(invoice_number ?? '').trim() || null, Number(amount),
         invoice_date || null, notes || null, url,
         suRegimen, suIva / 100, suAuto === null ? null : suAuto / 100]
      );
      res.status(201).json({ ok: true, data: { id: cierra, pdf_url: url, cuadrada: true } });
      return;
    }

    const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (id) => {
      // El PDF se guarda con el identificador en la ruta, así que va aquí
      // dentro: si hay que reintentar, el identificador cambia.
      if (pdf_base64 && pdf_filename) {
        pdf_url = await subeAlAlmacen(pdf_base64, pdf_filename, 'provider-invoices', id);
      }
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, direction, provider_name, contract_id, vehicle_title,
            invoice_amount, invoice_date, pdf_url, notes, invoice_number, status,
            regimen, iva_rate, autorepercusion)
         VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, $7, $8, $9, 'pending',
                 $10, $11, $12)`,
        [id, provider_name, contract_id || null, vehicle_title || null,
         Number(amount), invoice_date || null, pdf_url, notes || null,
         String(invoice_number ?? '').trim() || null,
         suRegimen, suIva / 100, suAuto === null ? null : suAuto / 100]
      );
    });
    await ataLaFactura(id, provider_name);
    res.status(201).json({ ok: true, data: { id, pdf_url } });
  } catch (err) {
    falloInterno(res, 'create_failed', err);
  }
});

// ── Attach or replace PDF on any invoice ────────────────────────────────────
providerBillingRouter.patch('/provider-billing/invoices/:id/pdf', requireRole(['admin', 'operations']), async (req, res) => {
  const { pdf_base64, pdf_filename } = req.body ?? {};
  if (!pdf_base64 || !pdf_filename) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  try {
    const pdf_url = await subeAlAlmacen(pdf_base64, pdf_filename, 'provider-invoices', req.params.id);
    if (!pdf_url) { res.status(500).json({ ok: false, error: 'upload_failed' }); return; }
    // Auto-advance received invoices from pending → pending_payment when PDF is attached
    await query(
      `UPDATE moveadvisor_provider_invoices
       SET pdf_url = $1,
           status = CASE WHEN direction = 'received' AND status = 'pending' THEN 'pending_payment' ELSE status END,
           updated_at = NOW()
       WHERE id = $2`,
      [pdf_url, req.params.id]
    );
    res.json({ ok: true, data: { pdf_url } });
  } catch (err) {
    falloInterno(res, 'pdf_update_failed', err);
  }
});

// ── List stored received invoices (provider → CarsWise) ──────────────────────
providerBillingRouter.get('/provider-billing/received', requireRole(['admin', 'operations']), async (req, res) => {
  await prepara();
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    // Return stored received invoices (manually created with optional PDF)
    const [rows, total] = await Promise.all([
      query(
        // Las que esperamos no son facturas: van en su propia lista. Aquí
        // se cuenta y se paga lo que alguien ha emitido de verdad.
        // `invoice_number` es el número que puso el proveedor; `id` es el
        // nuestro. Sin pedirlo, la columna de su número salía siempre vacía
        // aunque el dato estuviera guardado.
        // Y cómo se parte, que es lo que se corrige desde la propia lista: sin
        // estos cuatro no se puede decir cuál está sin cerrar sin abrirlas una
        // a una.
        `SELECT id, provider_name, vehicle_title, contract_id, invoice_number,
                invoice_amount, invoice_date, status, pdf_url, notes,
                base_amount, iva_rate, iva_amount, regimen, autorepercusion,
                issued_at, paid_at, updated_at
         FROM moveadvisor_provider_invoices
         WHERE direction = 'received' AND status NOT IN ($3, $4)
         ORDER BY COALESCE(invoice_date::timestamptz, issued_at) DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, ESPERADA, CUADRADA]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_provider_invoices
          WHERE direction = 'received' AND status NOT IN ($1, $2)`,
        [ESPERADA, CUADRADA]
      ),
    ]);
    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total.rows[0] as { total: number }).total, page, limit },
    });
  } catch (err) {
    falloInterno(res, 'received_failed', err);
  }
});

// ── Las que esperamos ─────────────────────────────────────────────────────────
/**
 * Lo que sabemos que nos van a facturar y todavía no ha llegado.
 *
 * En su propia lista, no mezcladas con las recibidas: son dos preguntas
 * distintas —qué facturas me faltan y cuánto me falta por pagar— y cada una
 * necesita su número. Y no suman en lo pendiente de pagar: nadie ha emitido
 * todavía nada contra lo que pagar.
 */
providerBillingRouter.get('/provider-billing/esperadas', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const r = await query(
      `SELECT id, provider_name, vehicle_title, invoice_amount, notes, issued_at
         FROM moveadvisor_provider_invoices
        WHERE direction = 'received' AND status = $1
        ORDER BY issued_at ASC`,
      [ESPERADA]
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    falloInterno(res, 'esperadas_failed', err);
  }
});

// ── Update invoice status ─────────────────────────────────────────────────────
providerBillingRouter.patch('/provider-billing/invoices/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const { status, notes } = req.body ?? {};
  const allowed = ['pending', 'sent', 'pending_payment', 'paid', 'cancelled'];
  if (!allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }
  try {
    /*
     * La nota se **añade**, no sustituye.
     *
     * Al confirmar un pago se escribe «pagado el 10/07 a las 9:00», y eso
     * borraba lo que hubiera: en la factura del perito, «Factura
     * ACD-2026-0907-001 · Peritación en Alemania» — que es lo único que ata
     * esa fila a su concepto y a su coche.
     */
    const r = await query(
      `UPDATE moveadvisor_provider_invoices
       SET status = $1::text,
           notes = CASE
             WHEN COALESCE($2::text, '') = '' THEN notes
             WHEN COALESCE(notes, '') = '' THEN $2::text
             WHEN notes LIKE '%' || $2::text || '%' THEN notes
             ELSE notes || ' · ' || $2::text END,
           paid_at = CASE WHEN $1::text = 'paid' THEN NOW() ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, notes ?? null, req.params.id]
    );
    if (!r.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    falloInterno(res, 'update_failed', err);
  }
});

// ── List external portal sales pending a commission invoice ───────────────────
providerBillingRouter.get('/provider-billing/pending-commissions', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const r = await query(`
      SELECT l.id, l.contact_name, l.user_email, l.vehicle_title, l.portal,
             COALESCE(l.sale_price, mo.price)::numeric AS sale_price,
             COALESCE(vo.sold_at, l.created_at) AS date
      FROM moveadvisor_market_leads l
      LEFT JOIN moveadvisor_market_offers mo             ON mo.id = l.vehicle_id
      LEFT JOIN moveadvisor_marketplace_vo_offers vo     ON vo.id = l.vehicle_id
      WHERE l.status = 'Vendido'
        AND (l.portal IS NULL OR l.portal NOT LIKE 'marketplace-%')
        AND l.id NOT IN (
          SELECT contract_id FROM moveadvisor_provider_invoices WHERE type = 'portal_commission'
        )
      ORDER BY date DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    falloInterno(res, 'pending_failed', err);
  }
});

// ── Create a single portal commission invoice manually ────────────────────────
// Body: { lead_id, invoice_mode: 'percent'|'fixed', percent?: number, fixed_amount?: number }
providerBillingRouter.post('/provider-billing/commissions', requireRole(['admin', 'operations']), async (req, res) => {
  const { lead_id, invoice_mode, percent, fixed_amount } = req.body ?? {};
  if (!lead_id || !invoice_mode) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  try {
    // Fetch lead + sale price
    const lr = await query(`
      SELECT l.id, l.contact_name, l.user_email, l.vehicle_title, l.portal,
             COALESCE(l.sale_price, mo.price)::numeric AS sale_price
      FROM moveadvisor_market_leads l
      LEFT JOIN moveadvisor_market_offers mo ON mo.id = l.vehicle_id
      WHERE l.id = $1
    `, [lead_id]);

    if (!lr.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    const lead = lr.rows[0] as Record<string, string>;
    const salePrice = Number(lead.sale_price) || 0;

    let invoiceAmount: number;
    if (invoice_mode === 'percent') {
      if (!percent || Number(percent) <= 0) { res.status(400).json({ ok: false, error: 'invalid_percent' }); return; }
      invoiceAmount = Math.round(salePrice * (Number(percent) / 100) * 100) / 100;
    } else {
      if (!fixed_amount || Number(fixed_amount) <= 0) { res.status(400).json({ ok: false, error: 'invalid_amount' }); return; }
      invoiceAmount = Number(fixed_amount);
    }

    const portal = lead.portal || 'externo';
    const providerName = portal.charAt(0).toUpperCase() + portal.slice(1);
    // Igual que en el alta manual: se reintenta en vez de fallar.
    const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (id) => {
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, provider_name, contract_id, vehicle_title, customer_name, customer_email, base_amount, invoice_amount)
         VALUES ($1, 'portal_commission', $2, $3, $4, $5, $6, $7, $8)`,
        [id, providerName, lead_id, lead.vehicle_title, lead.contact_name, lead.user_email, salePrice, invoiceAmount]
      );
    });
    await ataLaFactura(id, providerName);

    res.status(201).json({ ok: true, data: { id, invoice_amount: invoiceAmount, provider_name: providerName } });
  } catch (err) {
    falloInterno(res, 'create_failed', err);
  }
});

/**
 * Los coches de concesionario que se vendieron por una visita nuestra y cuya
 * comisión no hemos facturado.
 *
 * El coche no es nuestro: lo único que hacemos es concertar que el cliente vaya
 * a verlo, y lo que ganamos es un fee del concesionario cuando la visita acaba
 * en venta. Hasta ahora esta línea no tenía dinero por ninguna parte.
 *
 * Sale cuando la visita está cerrada como **«fue y se lo quedó»**, que es lo
 * único que dice que hubo venta. Una visita confirmada y sin cerrar no vale:
 * facturar por una venta que nadie ha confirmado es cobrar por nada.
 *
 * El identificador de la visita se guarda en `contract_id`, que es lo que
 * impide emitir dos veces la misma. No es un lead —una visita no lo es—, y por
 * eso las consultas que cruzan `contract_id` con leads no la encuentran: es un
 * LEFT JOIN y sale sin datos de lead, que es exactamente lo que es.
 */
providerBillingRouter.get('/provider-billing/pending-dealer-commissions', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    // Las columnas del resultado las crea la Agenda al arrancar, y aquí se
    // puede llegar antes.
    await preparaVisitas().catch(() => {});
    const r = await query(`
      SELECT b.id, b.vehicle_title, b.buyer_name AS contact_name, b.buyer_email AS user_email,
             b.resultado_at::date AS date,
             o.seller AS proveedor,
             o.price::numeric AS precio
        FROM vehicle_visit_bookings b
        LEFT JOIN moveadvisor_marketplace_vo_offers o ON o.id = b.offer_id
       WHERE b.resultado = 'compro'
         AND COALESCE(NULLIF(TRIM(o.seller), ''), '') <> ''
         AND b.id::text NOT IN (
           SELECT contract_id FROM moveadvisor_provider_invoices
            WHERE type = 'dealer_commission' AND contract_id IS NOT NULL
         )
       ORDER BY date DESC
    `);
    res.json({ ok: true, data: { ventas: r.rows, fee: FEE_POR_VENTA } });
  } catch (err) {
    falloInterno(res, 'pending_dealer_failed', err);
  }
});

/**
 * Y emitirla.
 *
 * El importe llega de fuera, como en la de la garantía: los 200 € son una cifra
 * provisional mientras no haya contrato con cada concesionario, y quien la
 * emite tiene que poder cambiarla sin tocar código. Lo que sí se impone aquí es
 * que la visita esté cerrada como venta.
 *
 * El importe es **el total, con IVA dentro**. La base se saca de ahí, y se
 * comprueba que base y cuota sumen: una factura que no suma es una factura mal
 * hecha, y de esas ya hubo una.
 */
providerBillingRouter.post('/provider-billing/dealer-commissions', requireRole(['admin', 'operations']), async (req, res) => {
  const { booking_id } = req.body ?? {};
  const importe = req.body?.amount == null ? FEE_POR_VENTA : Number(req.body.amount);
  if (!booking_id || !Number.isFinite(importe) || importe <= 0) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'booking_id es obligatorio' });
    return;
  }
  try {
    await preparaVisitas().catch(() => {});
    const vr = await query<Record<string, string>>(`
      SELECT b.id, b.vehicle_title, b.buyer_name, b.buyer_email, b.resultado,
             o.seller AS proveedor, o.price::numeric AS precio
        FROM vehicle_visit_bookings b
        LEFT JOIN moveadvisor_marketplace_vo_offers o ON o.id = b.offer_id
       WHERE b.id = $1
    `, [booking_id]);
    const v = vr.rows[0];
    if (!v) { res.status(404).json({ ok: false, error: 'not_found' }); return; }

    // La puerta: sin venta no hay comisión. Se comprueba aquí y no solo en la
    // pantalla, porque la pantalla esconde el botón y esto es lo que manda.
    if (v.resultado !== 'compro') {
      res.status(409).json({ ok: false, error: 'sin_venta', detail: 'esta visita no acabó en venta' });
      return;
    }
    const proveedor = String(v.proveedor ?? '').trim();
    if (!proveedor) {
      res.status(409).json({ ok: false, error: 'sin_proveedor', detail: 'no consta quién vende, así que no hay a quién facturar' });
      return;
    }

    // Y que no salga dos veces. La comprobación va antes del alta y con el
    // mismo criterio que la lista de arriba.
    const ya = await query(
      `SELECT id FROM moveadvisor_provider_invoices
        WHERE type = 'dealer_commission' AND contract_id = $1 LIMIT 1`,
      [String(v.id)]
    );
    if (ya.rows.length) {
      res.status(409).json({ ok: false, error: 'ya_emitida', detail: `ya está la ${ya.rows[0].id}` });
      return;
    }

    const c = laComision(importe);
    const concepto = elConcepto(v.vehicle_title, Number(v.precio) || null);

    const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (nuevo) => {
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, provider_name, contract_id, vehicle_title, customer_name, customer_email,
            base_amount, invoice_amount, iva_rate, regimen, notes)
         VALUES ($1, 'dealer_commission', $2, $3, $4, $5, $6, $7, $8, $9, 'nacional', $10)`,
        [nuevo, proveedor, String(v.id), v.vehicle_title, v.buyer_name, v.buyer_email,
         c.base, c.total, c.iva / 100, concepto]
      );
    });
    await ataLaFactura(id, proveedor);

    res.status(201).json({ ok: true, data: { id, invoice_amount: c.total, provider_name: proveedor } });
  } catch (err) {
    falloInterno(res, 'create_failed', err);
  }
});

/**
 * Las garantías vendidas cuya comisión no hemos facturado.
 *
 * Vendemos la garantía **por cuenta de quien la da**: el proveedor le pone el
 * precio y se lo cobra al cliente, y lo que ganamos es una comisión que nos
 * paga él. Esa comisión es una factura nuestra, y no la emitía nadie.
 *
 * Al entregar el primer coche con garantía, los 190 € quedaron cobrados y sin
 * papel por ninguna de las dos partes: ni el proveedor le había facturado al
 * cliente ni nosotros le habíamos facturado a él. Esto es la mitad que nos toca.
 *
 * Sale cuando el coche está **entregado**, que es cuando la garantía empieza:
 * facturar la comisión de una garantía que no ha llegado a existir sería cobrar
 * por una venta que puede caerse.
 */
providerBillingRouter.get('/provider-billing/pending-warranty-commissions', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    // La columna de la comisión se crea la primera vez que se abre Garantías,
    // y aquí se puede llegar antes: sin esto la consulta revienta el día que
    // alguien mire esta pantalla primero.
    await preparaGarantias().catch(() => {});
    const r = await query(`
      SELECT l.id, l.contact_name, l.user_email, l.vehicle_title,
             l.garantia_precio::numeric AS precio,
             g.nombre AS garantia, g.comision::numeric AS comision,
             COALESCE(p.nombre, 'Proveedor de garantías') AS proveedor,
             -- El día que se entregó, que es cuando empieza la garantía. Si no
             -- consta, el día que se pidió el coche: una fecha vieja se ve rara
             -- y se mira, y una vacía deja la fila descolocada al ordenar.
             COALESCE(NULLIF(l.entrega->>'fecha', '')::date, l.created_at::date) AS date
        FROM moveadvisor_market_leads l
        JOIN market_garantias g ON g.id = l.garantia_id
        LEFT JOIN erp_proveedores p ON p.id = g.proveedor_id
       WHERE l.status = 'Entregado'
         AND l.garantia_id IS NOT NULL
         AND l.id NOT IN (
           SELECT contract_id FROM moveadvisor_provider_invoices
            WHERE type = 'warranty_commission' AND contract_id IS NOT NULL
         )
       ORDER BY date DESC
    `);
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    falloInterno(res, 'pending_warranty_failed', err);
  }
});

/**
 * Y emitirla.
 *
 * El importe que llega es **el total, con IVA dentro**, que es como lo dice el
 * catálogo de garantías y como se habla de él: «nos comisionan 70 €». La base
 * se saca de ahí.
 *
 * El importe llega de fuera y no se calcula aquí: la comisión la fija el
 * contrato con el proveedor, y hasta que haya uno lo que hay en el catálogo es
 * una cifra provisional. Se propone, no se impone.
 */
providerBillingRouter.post('/provider-billing/warranty-commissions', requireRole(['admin', 'operations']), async (req, res) => {
  const { lead_id, amount } = req.body ?? {};
  const importe = Number(amount);
  if (!lead_id || !Number.isFinite(importe) || importe <= 0) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'lead_id y amount son obligatorios' });
    return;
  }
  try {
    const lr = await query<Record<string, string>>(`
      SELECT l.id, l.contact_name, l.user_email, l.vehicle_title,
             l.garantia_precio::numeric AS precio,
             g.nombre AS garantia,
             COALESCE(p.nombre, 'Proveedor de garantías') AS proveedor
        FROM moveadvisor_market_leads l
        JOIN market_garantias g ON g.id = l.garantia_id
        LEFT JOIN erp_proveedores p ON p.id = g.proveedor_id
       WHERE l.id = $1
    `, [lead_id]);
    if (!lr.rows.length) { res.status(404).json({ ok: false, error: 'sin_garantia' }); return; }
    const x = lr.rows[0];

    /*
     * La comisión es el total, con el IVA dentro.
     *
     * Aquí ponía el precio de la garantía —190 €— en la base y la comisión
     * —70 €— en el total, y esa factura no existe: dice que se le facturaron
     * 190 € al proveedor y que el total es menor que la base. En el desglose
     * salía un ingreso de 190 € donde se ganan 70.
     *
     * Y de los 70 € no todo es nuestro: 12,15 € son de Hacienda. Lo que pagó el
     * cliente se queda escrito en el concepto, que es donde sirve para
     * comprobar la liquidación.
     */
    const base = Math.round((importe / (1 + IVA_GENERAL / 100)) * 100) / 100;
    const precio = Number(x.precio) || 0;
    const concepto = precio > 0
      ? `Comisión · ${x.garantia} · el cliente pagó ${precio.toFixed(2)} €`
      : `Comisión · ${x.garantia}`;

    const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (nuevo) => {
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, provider_name, contract_id, vehicle_title, customer_name, customer_email,
            base_amount, invoice_amount, iva_rate, regimen, notes)
         VALUES ($1, 'warranty_commission', $2, $3, $4, $5, $6, $7, $8, $9, 'nacional', $10)`,
        [nuevo, x.proveedor, lead_id, x.vehicle_title, x.contact_name, x.user_email,
         base, importe, IVA_GENERAL / 100, concepto]
      );
    });
    await ataLaFactura(id, x.proveedor);

    res.status(201).json({ ok: true, data: { id, invoice_amount: importe, provider_name: x.proveedor } });
  } catch (err) {
    falloInterno(res, 'create_failed', err);
  }
});

/**
 * Corregir cómo se parte una factura que ya está guardada.
 *
 * De una recibida solo se podía cambiar el estado y las notas, así que una que
 * entró sin decir su IVA o sin decidir su autorrepercusión se quedaba mal para
 * siempre —y sale en Pendientes todos los días sin que haya botón para
 * arreglarla—. Hoy eso se corrige tocando la base a mano, que es peor que no
 * poder.
 *
 * Va aparte del cambio de estado a propósito: son dos cosas distintas y
 * mezclarlas obligaría a mandar un estado válido para corregir un IVA.
 *
 * **No se toca el importe total.** Ese es lo que pone el papel y no se
 * reinterpreta desde una pantalla: si el total está mal, la factura está mal y
 * se pide una rectificativa. Lo que se corrige aquí es cómo se parte.
 */
providerBillingRouter.patch('/provider-billing/invoices/:id/desglose', requireRole(['admin', 'operations']), async (req, res) => {
  const { regimen, iva_rate, autorepercusion, base_amount, iva_amount } = req.body ?? {};

  const suRegimen: Regimen | null =
    regimen === 'nacional' || regimen === 'intracomunitario' || regimen === 'exento' ? regimen : null;
  if (!suRegimen) {
    res.status(400).json({ ok: false, error: 'regimen_invalido', detail: 'nacional, intracomunitario o exento' });
    return;
  }

  // Un tipo que no existe no se guarda: un 15 % tecleado a mano es una errata,
  // y una errata guardada es peor que un hueco, porque parece un dato.
  const pedido = enPorCiento(iva_rate);
  const suIva = suRegimen === 'nacional' ? tipoDeIva(pedido) : 0;
  if (suRegimen === 'nacional' && pedido !== null && suIva === null) {
    res.status(400).json({ ok: false, error: 'iva_invalido', detail: 'los tipos son 0, 4, 10 y 21' });
    return;
  }

  const pedidoAuto = enPorCiento(autorepercusion);
  const suAuto = suRegimen === 'intracomunitario' ? tipoDeIva(pedidoAuto) : null;
  if (suRegimen === 'intracomunitario' && pedidoAuto !== null && suAuto === null) {
    res.status(400).json({ ok: false, error: 'autorepercusion_invalida', detail: 'los tipos son 0, 4, 10 y 21' });
    return;
  }

  const suBase = base_amount === null || base_amount === undefined || base_amount === ''
    ? null
    : Number(base_amount);
  if (suBase !== null && (!Number.isFinite(suBase) || suBase < 0)) {
    res.status(400).json({ ok: false, error: 'base_invalida' });
    return;
  }

  /*
   * La cuota, para las facturas que llevan varios tipos.
   *
   * No se teclea libre: el propio UPDATE exige que base + cuota sumen el total
   * de la factura. Esa comprobación es lo que la distingue de inventarse un
   * número, y es la que evita que el trimestre no cierre por catorce céntimos.
   */
  const suCuota = iva_amount === null || iva_amount === undefined || iva_amount === ''
    ? null
    : Number(iva_amount);
  if (suCuota !== null && (!Number.isFinite(suCuota) || suCuota < 0)) {
    res.status(400).json({ ok: false, error: 'cuota_invalida' });
    return;
  }

  try {
    const r = await query<Record<string, unknown>>(
      `UPDATE moveadvisor_provider_invoices
          SET regimen         = $2,
              iva_rate        = $3,
              autorepercusion = $4,
              base_amount     = COALESCE($5, base_amount),
              iva_amount      = $6,
              updated_at      = NOW()
        WHERE id = $1 AND direction = 'received'
          AND (
            $6::numeric IS NULL
            OR ABS(COALESCE($5::numeric, base_amount) + $6::numeric - invoice_amount) <= 0.02
          )
    RETURNING id, regimen, base_amount, invoice_amount, iva_rate, iva_amount, autorepercusion`,
      [String(req.params.id), suRegimen,
       suIva === null ? null : suIva / 100,
       suAuto === null ? null : suAuto / 100,
       suBase,
       suRegimen === 'nacional' ? suCuota : null]
    );
    if (!r.rows.length) {
      /*
       * O no existe, o la cuota no cuadra. Se dice cuál de las dos.
       *
       * «No encontrada» delante de una factura que se está viendo en pantalla
       * es el mensaje que hace perder media hora buscando dónde se ha ido.
       */
      const existe = await query<Record<string, unknown>>(
        `SELECT invoice_amount FROM moveadvisor_provider_invoices WHERE id = $1`,
        [String(req.params.id)]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (existe.rows.length) {
        res.status(400).json({
          ok: false, error: 'no_cuadra',
          detail: `La base y la cuota tienen que sumar el total de la factura, ${existe.rows[0].invoice_amount} €.`,
        });
        return;
      }
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    // Y se contesta si cuadra o no, para poder decirlo en la misma pantalla en
    // vez de que aparezca en Pendientes al día siguiente.
    const fila = r.rows[0];
    res.json({
      ok: true,
      data: {
        ...fila,
        // Con cuota dada no hay nada que contradecir: la comprobación la hizo
        // el propio UPDATE, que no habría guardado si no sumara.
        aviso: fila.iva_amount != null ? null : noCuadra({
          base: fila.base_amount,
          total: fila.invoice_amount,
          iva: fila.iva_rate == null ? null : Number(fila.iva_rate) * 100,
          regimen: suRegimen,
        }),
      },
    });
  } catch (err) {
    falloInterno(res, 'desglose_failed', err);
  }
});
