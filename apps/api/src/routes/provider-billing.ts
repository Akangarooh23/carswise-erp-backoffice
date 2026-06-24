import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

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

// ── Helper: generate invoice ID ───────────────────────────────────────────────
export async function nextProviderInvoiceId(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM moveadvisor_provider_invoices WHERE id LIKE $1`,
    [`PROV-${year}-%`]
  );
  const seq = ((r.rows[0] as { n: number }).n + 1).toString().padStart(3, '0');
  return `PROV-${year}-${seq}`;
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
    `);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'summary_failed', detail: (err as Error).message });
  }
});

// ── List invoices (emitted: renting_fee + portal_commission) ──────────────────
providerBillingRouter.get('/provider-billing/invoices', requireRole(['admin', 'operations']), async (req, res) => {
  const type   = String(req.query.type   || 'all').trim();
  const status = String(req.query.status || '').trim();
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (type !== 'all') { values.push(type);   conditions.push(`type = $${values.length}`); }
  if (status)         { values.push(status); conditions.push(`status = $${values.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

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
    res.status(500).json({ ok: false, error: 'list_failed', detail: (err as Error).message });
  }
});

// ── Create received invoice (provider → CarsWise) manually with optional PDF ──
// Body: { provider_name, vehicle_title, amount, invoice_date, notes?, contract_id?,
//         pdf_base64?, pdf_filename? }
providerBillingRouter.post('/provider-billing/received', requireRole(['admin', 'operations']), async (req, res) => {
  const { provider_name, vehicle_title, amount, invoice_date, notes, contract_id, pdf_base64, pdf_filename } = req.body ?? {};
  if (!provider_name || !amount) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'provider_name and amount are required' });
    return;
  }
  try {
    const id = await nextProviderInvoiceId();
    let pdf_url: string | null = null;
    if (pdf_base64 && pdf_filename) {
      pdf_url = await uploadPdfToSupabase(pdf_base64, pdf_filename, id);
    }
    await query(
      `INSERT INTO moveadvisor_provider_invoices
         (id, type, direction, provider_name, contract_id, vehicle_title,
          invoice_amount, invoice_date, pdf_url, notes, status)
       VALUES ($1, 'received_invoice', 'received', $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [id, provider_name, contract_id || null, vehicle_title || null,
       Number(amount), invoice_date || null, pdf_url, notes || null]
    );
    res.status(201).json({ ok: true, data: { id, pdf_url } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'create_failed', detail: (err as Error).message });
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
    await query(`UPDATE moveadvisor_provider_invoices SET pdf_url = $1, updated_at = NOW() WHERE id = $2`, [pdf_url, req.params.id]);
    res.json({ ok: true, data: { pdf_url } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'pdf_update_failed', detail: (err as Error).message });
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
        `SELECT id, provider_name, vehicle_title, contract_id,
                invoice_amount, invoice_date, status, pdf_url, notes,
                issued_at, paid_at, updated_at
         FROM moveadvisor_provider_invoices
         WHERE direction = 'received'
         ORDER BY COALESCE(invoice_date::timestamptz, issued_at) DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_provider_invoices WHERE direction = 'received'`),
    ]);
    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total.rows[0] as { total: number }).total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'received_failed', detail: (err as Error).message });
  }
});

// ── Mark invoice as paid / cancelled ─────────────────────────────────────────
providerBillingRouter.patch('/provider-billing/invoices/:id', requireRole(['admin', 'operations']), async (req, res) => {
  const { status, notes } = req.body ?? {};
  const allowed = ['paid', 'cancelled', 'pending'];
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
    res.status(500).json({ ok: false, error: 'update_failed', detail: (err as Error).message });
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
    res.status(500).json({ ok: false, error: 'pending_failed', detail: (err as Error).message });
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
    const id = await nextProviderInvoiceId();

    await query(
      `INSERT INTO moveadvisor_provider_invoices
         (id, type, provider_name, contract_id, vehicle_title, customer_name, customer_email, base_amount, invoice_amount)
       VALUES ($1, 'portal_commission', $2, $3, $4, $5, $6, $7, $8)`,
      [id, providerName, lead_id, lead.vehicle_title, lead.contact_name, lead.user_email, salePrice, invoiceAmount]
    );

    res.status(201).json({ ok: true, data: { id, invoice_amount: invoiceAmount, provider_name: providerName } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'create_failed', detail: (err as Error).message });
  }
});
