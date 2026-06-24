import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { buildInvoicePdf, generateAndStoreInvoicePdf, nextInvoiceNumber, type InvoiceData } from '../services/invoice-pdf.js';

export const invoiceDownloadRouter = Router();

// ── Helper: send invoice PDF by email via Resend ─────────────────────────────
const RESEND_API = 'https://api.resend.com/emails';

async function sendInvoiceEmail(to: string, invoiceNumber: string, pdfBytes: Uint8Array): Promise<void> {
  const apiKey = (await import('../config.js')).config.RESEND_API_KEY;
  if (!apiKey) return;
  const fromEmail = (await import('../config.js')).config.RESEND_FROM_EMAIL || 'CarsWise <onboarding@resend.dev>';
  const base64Pdf = Buffer.from(pdfBytes).toString('base64');
  await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: `Tu factura ${invoiceNumber} — CarsWiseAi`,
      html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1e293b">
        <h2 style="color:#2563eb">📄 Tu factura está lista</h2>
        <p>Adjuntamos tu factura <strong>${invoiceNumber}</strong> de CarsWiseAi.</p>
        <p style="font-size:13px;color:#64748b">Puedes consultar el detalle en tu panel: <a href="https://carswiseai.com/panel">carswiseai.com/panel</a></p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8">El equipo de CarsWise — carswiseai.com</p>
      </div>`,
      attachments: [{ filename: `${invoiceNumber}.pdf`, content: base64Pdf }],
    }),
  }).catch(() => {});
}

// ── Helper: stream PDF to client ──────────────────────────────────────────────
function sendPdf(res: import('express').Response, pdf: Uint8Array, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdf.byteLength);
  res.end(Buffer.from(pdf));
}

// ── Provider invoices (PROV series) ──────────────────────────────────────────
invoiceDownloadRouter.get(
  '/invoices/provider/:id/pdf',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT * FROM moveadvisor_provider_invoices WHERE id = $1 AND direction = 'emitted'`,
        [req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const inv = r.rows[0] as Record<string, string | number | null>;

      // Assign invoice number if not yet assigned
      let invoiceNumber = inv.invoice_number as string | null;
      if (!invoiceNumber) {
        invoiceNumber = await nextInvoiceNumber('PROV');
        await query(
          `UPDATE moveadvisor_provider_invoices SET invoice_number = $1, updated_at = NOW() WHERE id = $2`,
          [invoiceNumber, req.params.id]
        );
      }

      const typeLabel: Record<string, string> = {
        renting_fee:       'Fee de conversión — Renting',
        portal_commission: 'Comisión de intermediación — Portal',
      };
      const typeSub: Record<string, string> = {
        renting_fee:       'Por cliente captado y contrato de renting firmado',
        portal_commission: 'Por intermediación en venta de vehículo a través de portal',
      };

      const baseAmount = Number(inv.invoice_amount) || 0;
      const ivaRate    = Number(inv.iva_rate) || 0.21;

      const data: InvoiceData = {
        invoiceNumber,
        date: inv.issued_at ? new Date(inv.issued_at as string) : new Date(),
        series: 'PROV',
        recipientName:    String(inv.provider_name   || 'Proveedor'),
        recipientEmail:   inv.customer_email ? String(inv.customer_email) : undefined,
        lines: [{
          description: typeLabel[inv.type as string] ?? String(inv.type),
          subtitle: [
            typeSub[inv.type as string],
            inv.vehicle_title ? `Vehículo: ${inv.vehicle_title}` : null,
            inv.customer_name ? `Cliente: ${inv.customer_name}` : null,
            inv.contract_id   ? `Ref: ${inv.contract_id}` : null,
          ].filter(Boolean).join(' · '),
          amount: baseAmount,
        }],
        ivaRate,
        notes: inv.notes ? String(inv.notes) : undefined,
      };

      const { pdf, url } = await generateAndStoreInvoicePdf(
        data,
        `cw-invoices/prov/${invoiceNumber}.pdf`,
        async (pdfUrl) => {
          await query(
            `UPDATE moveadvisor_provider_invoices SET pdf_url = $1, status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END, updated_at = NOW() WHERE id = $2`,
            [pdfUrl, req.params.id]
          );
        }
      );

      sendPdf(res, pdf, `${invoiceNumber}.pdf`);
      if (inv.customer_email) {
        sendInvoiceEmail(String(inv.customer_email), invoiceNumber!, pdf).catch(() => {});
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: 'pdf_failed', detail: (err as Error).message });
    }
  }
);

// ── Subscription invoices (SUBS series) — generate CarsWise PDF from Stripe data ──
invoiceDownloadRouter.get(
  '/invoices/subscription/:id/pdf',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT * FROM moveadvisor_user_invoices WHERE id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const inv = r.rows[0] as Record<string, string | number | null>;

      let invoiceNumber = inv.cw_invoice_number as string | null;
      if (!invoiceNumber) {
        invoiceNumber = await nextInvoiceNumber('SUBS');
        await query(
          `UPDATE moveadvisor_user_invoices SET cw_invoice_number = $1 WHERE id = $2`,
          [invoiceNumber, req.params.id]
        );
      }

      // Fetch billing profile for full name, NIF and address
      const profileR = await query(
        `SELECT name, apellidos, company_name, tax_id, billing_address, phone
         FROM moveadvisor_users WHERE lower(email) = lower($1) LIMIT 1`,
        [String(inv.email || '')]
      );
      const profile = (profileR.rows[0] ?? {}) as Record<string, string | null>;
      const fullName = profile.company_name
        || [profile.name, profile.apellidos].filter(Boolean).join(' ')
        || '';

      // Validate required billing profile fields
      const missing: string[] = [];
      if (!fullName) missing.push('Nombre completo o razón social');
      if (!profile.billing_address) missing.push('Dirección fiscal');
      if (missing.length) {
        res.status(422).json({
          ok: false,
          error: 'incomplete_profile',
          missing,
          message: `No se puede generar la factura porque faltan datos del cliente: ${missing.join(', ')}.`,
        });
        return;
      }

      const planLabels: Record<string, string> = {
        plus:         'Plan Plus',
        pro:          'Plan Pro',
        free:         'Plan Free',
        professional: 'Plan Professional',
      };
      const planId  = String(inv.plan_id || inv.plan || 'plus');
      const ivaRate = 0.21;
      const totalWithIva = Number(inv.amount) || 0;
      const amount = Math.round((totalWithIva / (1 + ivaRate)) * 100) / 100;

      const data: InvoiceData = {
        invoiceNumber,
        date: inv.created_at ? new Date(inv.created_at as string) : new Date(),
        series: 'SUBS',
        recipientName:    fullName,
        recipientEmail:   String(inv.email || ''),
        recipientNif:     profile.tax_id        || undefined,
        recipientPhone:   profile.phone          || undefined,
        recipientAddress: profile.billing_address || undefined,
        lines: [{
          description: planLabels[planId] ?? `Suscripción ${planId}`,
          subtitle: `Suscripción mensual · Periodo de facturación · Ref. Stripe: ${inv.stripe_invoice_id ?? inv.id ?? ''}`,
          amount,
        }],
        ivaRate,
      };

      const shouldSendEmail = req.query.send === 'true';

      const isPaid = String(inv.status || '').toLowerCase() === 'paid';

      const { pdf } = await generateAndStoreInvoicePdf(
        data,
        `cw-invoices/subs/${invoiceNumber}.pdf`,
        async (pdfUrl) => {
          await query(
            `UPDATE moveadvisor_user_invoices
             SET cw_pdf_url        = $1,
                 cw_invoice_number = $2,
                 cw_generated_at   = COALESCE(cw_generated_at, NOW()),
                 cw_paid_at        = CASE WHEN $4 AND cw_paid_at IS NULL THEN NOW() ELSE cw_paid_at END
                 ${shouldSendEmail ? ', cw_sent_at = NOW()' : ''}
             WHERE id = $3`,
            [pdfUrl, invoiceNumber, req.params.id, isPaid]
          );
        }
      );

      sendPdf(res, pdf, `${invoiceNumber}.pdf`);
      if (shouldSendEmail && inv.email) {
        sendInvoiceEmail(String(inv.email), invoiceNumber!, pdf).catch(() => {});
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: 'pdf_failed', detail: (err as Error).message });
    }
  }
);

// ── Vehicle sale invoices (VTA series) ───────────────────────────────────────
invoiceDownloadRouter.get(
  '/invoices/sale/:leadId/pdf',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT l.*, u.name AS user_name
         FROM moveadvisor_market_leads l
         LEFT JOIN moveadvisor_users u ON u.email = l.user_email
         WHERE l.id = $1 AND l.status = 'Vendido'`,
        [req.params.leadId]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const lead = r.rows[0] as Record<string, string | number | null>;

      // Check/assign VTA invoice number stored as a provider invoice record for vehicle sales
      let existingVta = await query(
        `SELECT invoice_number, pdf_url FROM moveadvisor_provider_invoices
         WHERE contract_id = $1 AND type = 'vehicle_sale' AND direction = 'emitted' LIMIT 1`,
        [req.params.leadId]
      );

      let invoiceNumber: string;
      let recordId: string | null = null;

      if (existingVta.rows.length && (existingVta.rows[0] as Record<string, string>).invoice_number) {
        invoiceNumber = (existingVta.rows[0] as Record<string, string>).invoice_number;
        recordId = null; // already exists
      } else {
        invoiceNumber = await nextInvoiceNumber('VTA');
        // Store in provider_invoices as vehicle_sale type for tracking
        const inserted = await query(
          `INSERT INTO moveadvisor_provider_invoices
             (id, type, direction, contract_id, vehicle_title, customer_name, customer_email,
              invoice_amount, invoice_number, status)
           VALUES ($1, 'vehicle_sale', 'emitted', $2, $3, $4, $5, $6, $7, 'sent')
           ON CONFLICT DO NOTHING RETURNING id`,
          [invoiceNumber, req.params.leadId,
           lead.vehicle_title, lead.contact_name, lead.user_email,
           Number(lead.sale_price) || 0, invoiceNumber]
        );
        recordId = inserted.rows[0]?.id ?? null;
      }

      const baseAmount = Number(lead.sale_price) || 0;

      const data: InvoiceData = {
        invoiceNumber,
        date: lead.created_at ? new Date(lead.created_at as string) : new Date(),
        series: 'VTA',
        recipientName:    String(lead.contact_name || lead.user_name || lead.user_email || ''),
        recipientEmail:   String(lead.user_email || ''),
        lines: [{
          description: `Venta de vehículo — ${lead.vehicle_title || ''}`,
          subtitle: `Ref. solicitud: ${req.params.leadId}`,
          amount: baseAmount,
        }],
        ivaRate: 0.21,
        notes: lead.sale_notes ? String(lead.sale_notes) : undefined,
      };

      const shouldSendVta = req.query.send === 'true';

      const { pdf } = await generateAndStoreInvoicePdf(
        data,
        `cw-invoices/vta/${invoiceNumber}.pdf`,
        async (pdfUrl) => {
          await query(
            `UPDATE moveadvisor_provider_invoices
             SET pdf_url        = $1,
                 cw_generated_at = COALESCE(issued_at, NOW())
                 ${shouldSendVta ? ', cw_sent_at = NOW()' : ''}
             WHERE invoice_number = $2`,
            [pdfUrl, invoiceNumber]
          );
        }
      );

      sendPdf(res, pdf, `${invoiceNumber}.pdf`);
      if (shouldSendVta && lead.user_email) {
        sendInvoiceEmail(String(lead.user_email), invoiceNumber!, pdf).catch(() => {});
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: 'pdf_failed', detail: (err as Error).message });
    }
  }
);

// ── Create rectificativa (credit note) for a provider emitted invoice ─────────
invoiceDownloadRouter.post(
  '/invoices/provider/:id/rectify',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT * FROM moveadvisor_provider_invoices WHERE id = $1 AND direction = 'emitted'`,
        [req.params.id]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const orig = r.rows[0] as Record<string, string | number | null>;

      // Check not already rectified
      const existing = await query(
        `SELECT id FROM moveadvisor_provider_invoices WHERE rectifies_id = $1 LIMIT 1`,
        [req.params.id]
      );
      if (existing.rows.length) {
        res.status(409).json({ ok: false, error: 'already_rectified', rectify_id: (existing.rows[0] as Record<string, string>).id });
        return;
      }

      const { reason } = req.body ?? {};
      const rectId = await nextInvoiceNumber('RECT');
      const origAmount = Number(orig.invoice_amount) || 0;

      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, direction, provider_name, contract_id, vehicle_title,
            customer_name, customer_email, invoice_amount, invoice_number,
            status, rectifies_id, notes, iva_rate)
         VALUES ($1, $2, 'emitted', $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12)`,
        [
          rectId, orig.type, orig.provider_name, orig.contract_id,
          orig.vehicle_title, orig.customer_name, orig.customer_email,
          -origAmount, rectId, req.params.id,
          reason ? `Rectificativa de ${orig.invoice_number ?? orig.id}. Motivo: ${reason}` : `Rectificativa de ${orig.invoice_number ?? orig.id}`,
          orig.iva_rate ?? 0.21,
        ]
      );

      res.status(201).json({ ok: true, data: { id: rectId, amount: -origAmount } });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'rectify_failed', detail: (err as Error).message });
    }
  }
);
