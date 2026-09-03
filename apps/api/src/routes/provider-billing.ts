import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { prefijoAnual, siguienteDeSerie, guardaConIdUnico } from '../lib/series.js';
import { falloInterno } from '../lib/fallos.js';
import { seEsperaFactura, ESPERADA } from '../lib/facturas-esperadas.js';

async function uploadPdfToSupabase(base64: string, filename: string, invoiceId: string): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const ext = filename.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `provider-invoices/${invoiceId}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vehicle-files/${path}`, {
      method: 'POST',
      headers: {
        // Sin `apikey` la clave nueva de Supabase no vale: ver invoice-pdf.ts.
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': ext === 'pdf' ? 'application/pdf' : 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/vehicle-files/${path}`;
  } catch { return null; }
}

export const providerBillingRouter = Router();

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
          invoice_amount, notes, status, issued_at)
       VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))`,
      [nuevoId, proveedor, datos.vehiculo || null, Number(datos.importe), concepto,
       ESPERADA, datos.desde || null]
    );
  });
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
    return uploadPdfToSupabase(datos.pdfBase64, datos.pdfNombre, id).catch(() => null);
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
  return id;
}

// ── Create received invoice (provider → CarsWise) manually with optional PDF ──
// Body: { provider_name, vehicle_title, amount, invoice_date, notes?, contract_id?,
//         pdf_base64?, pdf_filename? }
providerBillingRouter.post('/provider-billing/received', requireRole(['admin', 'operations']), async (req, res) => {
  const {
    provider_name, vehicle_title, amount, invoice_date, notes, contract_id,
    invoice_number, pdf_base64, pdf_filename,
  } = req.body ?? {};
  if (!provider_name || !amount) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'provider_name and amount are required' });
    return;
  }
  try {
    // Si dos personas dan de alta una factura a la vez, las dos piden el mismo
    // identificador. Una gana y la otra vuelve a pedir, en vez de llevarse un
    // error de base de datos.
    let pdf_url: string | null = null;
    const { id } = await guardaConIdUnico(nextProviderInvoiceId, async (id) => {
      // El PDF se guarda con el identificador en la ruta, así que va aquí
      // dentro: si hay que reintentar, el identificador cambia.
      if (pdf_base64 && pdf_filename) {
        pdf_url = await uploadPdfToSupabase(pdf_base64, pdf_filename, id);
      }
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, direction, provider_name, contract_id, vehicle_title,
            invoice_amount, invoice_date, pdf_url, notes, invoice_number, status)
         VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
        [id, provider_name, contract_id || null, vehicle_title || null,
         Number(amount), invoice_date || null, pdf_url, notes || null,
         String(invoice_number ?? '').trim() || null]
      );
    });
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
    const pdf_url = await uploadPdfToSupabase(pdf_base64, pdf_filename, req.params.id);
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
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    // Return stored received invoices (manually created with optional PDF)
    const [rows, total] = await Promise.all([
      query(
        // Las que esperamos no son facturas: van en su propia lista. Aquí
        // se cuenta y se paga lo que alguien ha emitido de verdad.
        `SELECT id, provider_name, vehicle_title, contract_id,
                invoice_amount, invoice_date, status, pdf_url, notes,
                issued_at, paid_at, updated_at
         FROM moveadvisor_provider_invoices
         WHERE direction = 'received' AND status <> $3
         ORDER BY COALESCE(invoice_date::timestamptz, issued_at) DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, ESPERADA]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM moveadvisor_provider_invoices
          WHERE direction = 'received' AND status <> $1`,
        [ESPERADA]
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
    const r = await query(
      `UPDATE moveadvisor_provider_invoices
       SET status = $1, notes = COALESCE($2, notes),
           paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
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

    res.status(201).json({ ok: true, data: { id, invoice_amount: invoiceAmount, provider_name: providerName } });
  } catch (err) {
    falloInterno(res, 'create_failed', err);
  }
});
