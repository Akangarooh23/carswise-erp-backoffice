import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

export const billingRouter = Router();

// ── Summary ──────────────────────────────────────────────────────────────────
billingRouter.get('/billing/summary', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE plan_id = 'free')::int    AS free_count,
        COUNT(*) FILTER (WHERE plan_id = 'plus')::int    AS plus_count,
        COUNT(*) FILTER (WHERE plan_id = 'premium')::int AS premium_count,
        0::int AS active_trials,
        0::int AS expired_trials,
        COUNT(*) FILTER (WHERE plan_id IN ('plus','premium') AND plan_updated_at >= NOW() - INTERVAL '30 days')::int AS new_paid_30d
      FROM moveadvisor_users
    `);
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_summary_failed', detail: (err as Error).message });
  }
});

// ── Unified invoices list ─────────────────────────────────────────────────────
// type filter: 'all' | 'suscripcion' | 'venta' | 'renting'
billingRouter.get('/billing/invoices', requireRole(['admin', 'operations']), async (req, res) => {
  const type  = String(req.query.type  || 'all').trim();
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const rows: unknown[] = [];

  try {
    // ── 1. Subscription invoices ──
    if (type === 'all' || type === 'suscripcion') {
      const r = await query(`
        SELECT
          i.id, i.email, u.name, u.apellidos,
          i.date, i.number,
          i.amount::numeric  AS precio,
          i.amount::numeric  AS precio_facturado,
          i.status,
          u.plan_id          AS plan,
          i.cw_invoice_number,
          i.cw_sent_at
        FROM moveadvisor_user_invoices i
        LEFT JOIN moveadvisor_users u ON u.email = i.email
        ORDER BY i.date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        rows.push({
          id: row.id, type: 'suscripcion',
          date: row.date,
          customer_name: [row.name, row.apellidos].filter(Boolean).join(' ') || row.email,
          customer_email: row.email,
          description: `Plan ${String(row.plan || '').charAt(0).toUpperCase() + String(row.plan || '').slice(1)} · ${row.number}`,
          precio: row.precio ? Number(row.precio) : 0,
          precio_facturado: row.precio_facturado ? Number(row.precio_facturado) : 0,
          status: row.status,
          cw_invoice_number: row.cw_invoice_number || null,
          cw_sent_at: row.cw_sent_at || null,
          iva_rate: 0.21,
        });
      }
    }

    // ── 2. Vehicle sale invoices ──
    if (type === 'all' || type === 'venta') {
      const r = await query(`
        SELECT
          l.id, l.contact_name, l.user_email, l.vehicle_title,
          COALESCE(vo.sold_at, l.created_at) AS date,
          l.portal,
          COALESCE(l.sale_price, vo.price, mo.price)::numeric AS precio,
          pi.invoice_number AS cw_invoice_number
        FROM moveadvisor_market_leads l
        LEFT JOIN moveadvisor_marketplace_vo_offers vo ON vo.id = l.vehicle_id
        LEFT JOIN moveadvisor_market_offers mo         ON mo.id = l.vehicle_id AND vo.id IS NULL
        LEFT JOIN moveadvisor_provider_invoices pi
          ON pi.type = 'vehicle_sale' AND pi.direction = 'emitted' AND pi.contract_id = l.id
        WHERE l.status = 'Vendido'
        ORDER BY date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        const portal = String(row.portal || '');
        const portalLabel = portal.startsWith('marketplace') ? 'CarsWise Marketplace'
          : portal ? portal.charAt(0).toUpperCase() + portal.slice(1) : 'CarsWise';
        rows.push({
          id: row.id, type: 'venta',
          date: row.date,
          customer_name: row.contact_name || '–',
          customer_email: row.user_email,
          description: `${row.vehicle_title} · ${portalLabel}`,
          precio: row.precio ? Number(row.precio) : null,
          precio_facturado: 0,
          status: 'Completada',
          cw_invoice_number: row.cw_invoice_number || null,
          iva_rate: 0.21,
        });
      }
    }

    // ── 3. Renting contract invoices ──
    if (type === 'all' || type === 'renting') {
      const r = await query(`
        SELECT
          id, contact_name, user_email, vehicle_title,
          monthly_price::numeric, duration_months,
          start_date, end_date, status, created_at
        FROM moveadvisor_renting_contracts
        ORDER BY created_at DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        rows.push({
          id: row.id, type: 'renting',
          date: row.start_date || row.created_at,
          customer_name: row.contact_name || '–',
          customer_email: row.user_email,
          description: `${row.vehicle_title} · ${row.duration_months}m · hasta ${row.end_date ? new Date(String(row.end_date)).toLocaleDateString('es-ES') : '–'}`,
          precio: row.monthly_price ? Number(row.monthly_price) : null,
          precio_facturado: 0,
          status: row.status,
          cw_invoice_number: null,
          iva_rate: 0.21,
        });
      }
    }

    // Sort all by date desc when type=all
    if (type === 'all') {
      (rows as Array<{ date: string }>).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    const total = rows.length;
    const paginated = rows.slice(offset, offset + limit);

    res.json({ ok: true, data: paginated, meta: { total, page, limit } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_invoices_failed', detail: (err as Error).message });
  }
});

// ── Invoice stats ─────────────────────────────────────────────────────────────
billingRouter.get('/billing/invoices/stats', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const [susResult, ventaResult, rentingResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int                   AS count_suscripcion,
          COALESCE(SUM(amount), 0)::numeric AS total_suscripcion
        FROM moveadvisor_user_invoices
      `).catch(() => ({ rows: [{ count_suscripcion: 0, total_suscripcion: 0 }] })),

      query(`
        SELECT
          COUNT(*)::int                                            AS count_ventas,
          COALESCE(SUM(COALESCE(l.sale_price, vo.price, mo.price)), 0)::numeric AS total_ventas
        FROM moveadvisor_market_leads l
        LEFT JOIN moveadvisor_marketplace_vo_offers vo ON vo.id = l.vehicle_id
        LEFT JOIN moveadvisor_market_offers mo         ON mo.id = l.vehicle_id AND vo.id IS NULL
        WHERE l.status = 'Vendido'
      `).catch(() => ({ rows: [{ count_ventas: 0, total_ventas: 0 }] })),

      query(`
        SELECT COUNT(*)::int AS count_renting
        FROM moveadvisor_renting_contracts
      `).catch(() => ({ rows: [{ count_renting: 0 }] })),
    ]);

    const sus     = susResult.rows[0]     as Record<string, unknown>;
    const venta   = ventaResult.rows[0]   as Record<string, unknown>;
    const renting = rentingResult.rows[0] as Record<string, unknown>;

    res.json({
      ok: true,
      data: {
        total_suscripcion: Number(sus.total_suscripcion)   || 0,
        total_ventas:      Number(venta.total_ventas)       || 0,
        count_suscripcion: Number(sus.count_suscripcion)   || 0,
        count_ventas:      Number(venta.count_ventas)       || 0,
        count_renting:     Number(renting.count_renting)    || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_stats_failed', detail: (err as Error).message });
  }
});

// ── Invoice CSV export ────────────────────────────────────────────────────────
billingRouter.get('/billing/invoices/export', requireRole(['admin', 'operations']), async (req, res) => {
  const type = String(req.query.type || 'all').trim();
  const rows: unknown[] = [];

  try {
    // ── 1. Subscription invoices ──
    if (type === 'all' || type === 'suscripcion') {
      const r = await query(`
        SELECT
          i.id, i.email, u.name, u.apellidos,
          i.date, i.number,
          i.amount::numeric  AS precio,
          i.amount::numeric  AS precio_facturado,
          i.status,
          u.plan_id          AS plan,
          i.cw_invoice_number,
          i.cw_sent_at
        FROM moveadvisor_user_invoices i
        LEFT JOIN moveadvisor_users u ON u.email = i.email
        ORDER BY i.date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        rows.push({
          type: 'suscripcion',
          date: row.date,
          customer_name: [row.name, row.apellidos].filter(Boolean).join(' ') || row.email,
          customer_email: row.email,
          description: `Plan ${String(row.plan || '').charAt(0).toUpperCase() + String(row.plan || '').slice(1)} · ${row.number}`,
          precio: row.precio ? Number(row.precio) : 0,
          precio_facturado: row.precio_facturado ? Number(row.precio_facturado) : 0,
          status: row.status,
          cw_invoice_number: row.cw_invoice_number || null,
        });
      }
    }

    // ── 2. Vehicle sale invoices ──
    if (type === 'all' || type === 'venta') {
      const r = await query(`
        SELECT
          l.id, l.contact_name, l.user_email, l.vehicle_title,
          COALESCE(vo.sold_at, l.created_at) AS date,
          l.portal,
          COALESCE(l.sale_price, vo.price, mo.price)::numeric AS precio,
          pi.invoice_number AS cw_invoice_number
        FROM moveadvisor_market_leads l
        LEFT JOIN moveadvisor_marketplace_vo_offers vo ON vo.id = l.vehicle_id
        LEFT JOIN moveadvisor_market_offers mo         ON mo.id = l.vehicle_id AND vo.id IS NULL
        LEFT JOIN moveadvisor_provider_invoices pi
          ON pi.type = 'vehicle_sale' AND pi.direction = 'emitted' AND pi.contract_id = l.id
        WHERE l.status = 'Vendido'
        ORDER BY date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        const portal = String(row.portal || '');
        const portalLabel = portal.startsWith('marketplace') ? 'CarsWise Marketplace'
          : portal ? portal.charAt(0).toUpperCase() + portal.slice(1) : 'CarsWise';
        rows.push({
          type: 'venta',
          date: row.date,
          customer_name: row.contact_name || '–',
          customer_email: row.user_email,
          description: `${row.vehicle_title} · ${portalLabel}`,
          precio: row.precio ? Number(row.precio) : null,
          precio_facturado: 0,
          status: 'Completada',
          cw_invoice_number: row.cw_invoice_number || null,
        });
      }
    }

    // ── 3. Renting contract invoices ──
    if (type === 'all' || type === 'renting') {
      const r = await query(`
        SELECT
          id, contact_name, user_email, vehicle_title,
          monthly_price::numeric, duration_months,
          start_date, end_date, status, created_at
        FROM moveadvisor_renting_contracts
        ORDER BY created_at DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        rows.push({
          type: 'renting',
          date: row.start_date || row.created_at,
          customer_name: row.contact_name || '–',
          customer_email: row.user_email,
          description: `${row.vehicle_title} · ${row.duration_months}m · hasta ${row.end_date ? new Date(String(row.end_date)).toLocaleDateString('es-ES') : '–'}`,
          precio: row.monthly_price ? Number(row.monthly_price) : null,
          precio_facturado: 0,
          status: row.status,
          cw_invoice_number: null,
        });
      }
    }

    // Sort all by date desc when type=all
    if (type === 'all') {
      (rows as Array<{ date: string }>).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    const IVA_RATE = 0.21;

    const toSpanishNumber = (n: number | null | undefined): string => {
      if (n === null || n === undefined) return '';
      return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const escapeCSV = (val: unknown): string => {
      const s = val === null || val === undefined ? '' : String(val);
      if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const header = [
      'Nº Factura', 'Fecha', 'Tipo', 'Cliente', 'Email',
      'Descripción', 'Precio', 'Precio Facturado', 'IVA (21%)', 'Total con IVA', 'Estado',
    ].map(escapeCSV).join(';');

    const csvRows = (rows as Array<Record<string, unknown>>).map(row => {
      const precioFacturado = Number(row.precio_facturado) || 0;
      const iva = precioFacturado * IVA_RATE;
      const totalConIva = precioFacturado + iva;
      const fecha = row.date ? new Date(String(row.date)).toLocaleDateString('es-ES') : '';

      return [
        row.cw_invoice_number || '',
        fecha,
        row.type,
        row.customer_name,
        row.customer_email,
        row.description,
        toSpanishNumber(row.precio as number | null),
        toSpanishNumber(precioFacturado),
        toSpanishNumber(iva),
        toSpanishNumber(totalConIva),
        row.status,
      ].map(escapeCSV).join(';');
    });

    const csv = [header, ...csvRows].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="facturas-clientes-${today}.csv"`);
    res.send('﻿' + csv); // BOM for Spanish Excel
  } catch (err) {
    res.status(500).json({ ok: false, error: 'billing_export_failed', detail: (err as Error).message });
  }
});

// ── Free users list ───────────────────────────────────────────────────────────
billingRouter.get('/billing/free-users', requireRole(['admin', 'operations']), async (req, res) => {
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT id, email, name, apellidos, plan_id AS plan_type, plan_status AS status, created_at
         FROM moveadvisor_users WHERE plan_id = 'free'
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM moveadvisor_users WHERE plan_id = 'free'`),
    ]);
    res.json({
      ok: true,
      data: rows.rows,
      meta: { total: (total.rows[0] as { total: number }).total, page, limit },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'free_users_failed', detail: (err as Error).message });
  }
});

// Keep old endpoints for backwards compatibility
billingRouter.get('/billing/subscribers', requireRole(['admin', 'operations']), async (_req, res) => {
  res.redirect('/api/billing/invoices?type=suscripcion');
});
billingRouter.get('/billing/trials', requireRole(['admin', 'operations']), async (_req, res) => {
  res.redirect('/api/billing/free-users');
});
