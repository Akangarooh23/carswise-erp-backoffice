import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { falloInterno } from '../lib/fallos.js';

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
    falloInterno(res, 'billing_summary_failed', err);
  }
});

// ── Unified invoices list ─────────────────────────────────────────────────────
// type filter: 'all' | 'suscripcion' | 'tasacion' | 'importacion' | 'venta' | 'renting'

/**
 * De qué es cada factura de cliente.
 *
 * Las tres comparten tabla, así que hay que distinguirlas al leerlas. Y no da
 * igual: un servicio de importación son 3.000 € que estaban entrando en el
 * contador de **suscripciones**, y ese contador es lo que se mira para saber
 * cuánto ingresa PopCar por cuotas. Con dos importaciones al mes, esa cifra
 * dice el triple de lo que es.
 *
 * La importación se reconoce por el identificador —lo emite el flujo del
 * depósito como `srv-imp-…`— y no solo por el texto: la descripción la escribe
 * quien emite y puede cambiar, el identificador no.
 */
export type TipoDeFactura = 'suscripcion' | 'tasacion' | 'importacion';
export function tipoDeFactura(id: unknown, descripcion: unknown): TipoDeFactura {
  const desc = String(descripcion || '').trim();
  if (/^srv-imp-/i.test(String(id || '')) || /servicio de importaci/i.test(desc)) return 'importacion';
  if (/informe|tasaci/i.test(desc)) return 'tasacion';
  return 'suscripcion';
}
billingRouter.get('/billing/invoices', requireRole(['admin', 'operations']), async (req, res) => {
  const type  = String(req.query.type  || 'all').trim();
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const rows: unknown[] = [];

  try {
    // ── 1. Subscription & tasación invoices ──
    if (type === 'all' || type === 'suscripcion' || type === 'tasacion' || type === 'importacion') {
      const r = await query(`
        SELECT
          i.id, i.email, u.name, u.apellidos,
          i.date, i.number,
          i.amount::numeric  AS precio,
          i.amount::numeric  AS precio_facturado,
          i.status,
          u.plan_id          AS plan,
          i.description,
          i.pdf_url,
          i.cw_invoice_number,
          i.cw_sent_at,
          i.cw_generated_at,
          i.cw_paid_at
        FROM moveadvisor_user_invoices i
        LEFT JOIN moveadvisor_users u ON u.email = i.email
        ORDER BY i.date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        const dbDescription  = String(row.description || '').trim();
        const derivedType    = tipoDeFactura(row.id, dbDescription);
        if (type !== 'all' && type !== derivedType) continue;
        const planLabel = String(row.plan || '');
        const fallbackDesc = planLabel
          ? `Plan ${planLabel.charAt(0).toUpperCase() + planLabel.slice(1)} · ${row.number}`
          : String(row.number || row.id);
        rows.push({
          id: row.id, type: derivedType,
          date: row.date,
          customer_name: [row.name, row.apellidos].filter(Boolean).join(' ') || row.email,
          customer_email: row.email,
          description: dbDescription || fallbackDesc,
          precio: row.precio ? Number(row.precio) : 0,
          precio_facturado: row.precio_facturado ? Number(row.precio_facturado) : 0,
          status: row.status,
          pdf_url:           row.pdf_url          || null,
          cw_invoice_number: row.cw_invoice_number || null,
          cw_sent_at:      row.cw_sent_at      || null,
          cw_generated_at: row.cw_generated_at || null,
          cw_paid_at:      row.cw_paid_at      || null,
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
          pi.invoice_number  AS cw_invoice_number,
          pi.issued_at       AS cw_generated_at,
          pi.paid_at         AS cw_paid_at,
          pi.cw_sent_at
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
          cw_generated_at:   row.cw_generated_at  || null,
          cw_paid_at:        row.cw_paid_at        || null,
          cw_sent_at:        row.cw_sent_at        || null,
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
    falloInterno(res, 'billing_invoices_failed', err);
  }
});

// ── Invoice stats ─────────────────────────────────────────────────────────────
/**
 * El resumen de arriba de la pantalla de facturación.
 *
 * Cada cifra con su nombre. Las suscripciones, los informes de mercado y los
 * servicios de importación comparten tabla y se separan igual que en el
 * listado, con `tipoDeFactura`.
 *
 * Que la importación tenga su propia cifra no es cosmético: son 3.000 € por
 * coche que estaban sumando en «Suscripciones», y esa es la cifra que dice
 * cuánto ingresa PopCar por cuotas.
 *
 * El volumen de ventas NO es facturación de PopCar: el proveedor cobra al
 * cliente y PopCar cobra su comisión aparte. Ponerlo junto a los ingresos, sin
 * decirlo, haría que la pantalla afirmara algo falso.
 *
 * Los importes cobrados llevan el IVA dentro, que es como se guardan.
 */
billingRouter.get('/billing/invoices/stats', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const [cobros, ventas, rentings] = await Promise.all([
      // Sin agrupar en SQL: la regla vive en `tipoDeFactura` y repetirla aquí
      // en otro idioma es la forma más fácil de que las dos se separen.
      query(`
        SELECT id, description, amount::numeric AS amount
        FROM moveadvisor_user_invoices
      `).catch(() => ({ rows: [] as Record<string, unknown>[] })),

      query(`
        SELECT
          COUNT(*)::int AS n,
          COALESCE(SUM(COALESCE(l.sale_price, vo.price, mo.price)), 0)::numeric AS volumen
        FROM moveadvisor_market_leads l
        LEFT JOIN moveadvisor_marketplace_vo_offers vo ON vo.id = l.vehicle_id
        LEFT JOIN moveadvisor_market_offers mo         ON mo.id = l.vehicle_id AND vo.id IS NULL
        WHERE l.status = 'Vendido'
      `).catch(() => ({ rows: [{ n: 0, volumen: 0 }] })),

      query(`SELECT COUNT(*)::int AS n FROM moveadvisor_renting_contracts`)
        .catch(() => ({ rows: [{ n: 0 }] })),
    ]);

    const suma = (tipo: TipoDeFactura) => {
      let n = 0, total = 0;
      for (const r of cobros.rows as Record<string, unknown>[]) {
        if (tipoDeFactura(r.id, r.description) !== tipo) continue;
        n += 1;
        total += Number(r.amount) || 0;
      }
      return { n, cobrado: total };
    };
    const vta  = ventas.rows[0]   as Record<string, unknown>;
    const rent = rentings.rows[0] as Record<string, unknown>;

    res.json({
      ok: true,
      data: {
        suscripciones: suma('suscripcion'),
        informes:      suma('tasacion'),
        importaciones: suma('importacion'),
        // Lo que han costado los coches vendidos. No lo cobra PopCar.
        ventas:        { n: Number(vta.n) || 0, volumen: Number(vta.volumen) || 0 },
        rentings:      { n: Number(rent.n) || 0 },
      },
    });
  } catch (err) {
    falloInterno(res, 'billing_stats_failed', err);
  }
});

// ── Invoice CSV export ────────────────────────────────────────────────────────
billingRouter.get('/billing/invoices/export', requireRole(['admin', 'operations']), async (req, res) => {
  const type = String(req.query.type || 'all').trim();
  const rows: unknown[] = [];

  try {
    // ── 1. Subscription invoices ──
    if (type === 'all' || type === 'suscripcion' || type === 'tasacion' || type === 'importacion') {
      const r = await query(`
        SELECT
          i.id, i.email, u.name, u.apellidos,
          i.date, i.number,
          i.amount::numeric  AS precio,
          i.amount::numeric  AS precio_facturado,
          i.status,
          u.plan_id          AS plan,
          i.description,
          i.cw_invoice_number,
          i.cw_sent_at,
          i.cw_generated_at,
          i.cw_paid_at
        FROM moveadvisor_user_invoices i
        LEFT JOIN moveadvisor_users u ON u.email = i.email
        ORDER BY i.date DESC
      `).catch(() => ({ rows: [] as Record<string, unknown>[] }));

      for (const row of r.rows as Record<string, unknown>[]) {
        // La misma regla que el listado, traída de un sitio: si las dos no
        // coinciden, el fichero no dice lo que se ve en pantalla.
        const dbDescription = String(row.description || '').trim();
        const derivedType   = tipoDeFactura(row.id, dbDescription);
        if (type !== 'all' && type !== derivedType) continue;
        const planLabel    = String(row.plan || '');
        const fallbackDesc = planLabel
          ? `Plan ${planLabel.charAt(0).toUpperCase() + planLabel.slice(1)}`
          : String(row.id || '');

        rows.push({
          type: derivedType,
          date: row.date,
          customer_name: [row.name, row.apellidos].filter(Boolean).join(' ') || row.email,
          customer_email: row.email,
          description: dbDescription || fallbackDesc,
          precio: row.precio ? Number(row.precio) : 0,
          precio_facturado: row.precio_facturado ? Number(row.precio_facturado) : 0,
          status: row.status,
          cw_invoice_number: row.cw_invoice_number || null,
          cw_sent_at:      row.cw_sent_at      || null,
          cw_generated_at: row.cw_generated_at || null,
          cw_paid_at:      row.cw_paid_at      || null,
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
          pi.invoice_number  AS cw_invoice_number,
          pi.issued_at       AS cw_generated_at,
          pi.paid_at         AS cw_paid_at,
          pi.cw_sent_at
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
          cw_sent_at:      row.cw_sent_at      || null,
          cw_generated_at: row.cw_generated_at || null,
          cw_paid_at:      row.cw_paid_at      || null,
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
      'Descripción', 'Precio', 'Base imponible', 'IVA (21%)', 'Total facturado', 'Estado',
    ].map(escapeCSV).join(';');

    const csvRows = (rows as Array<Record<string, unknown>>).map(row => {
      // Lo guardado es lo que pagó el cliente, con el IVA dentro. La base sale
      // de dividir, no de sumar: la factura en PDF hace exactamente esto.
      const totalFacturado = Number(row.precio_facturado) || 0;
      const base = Math.round((totalFacturado / (1 + IVA_RATE)) * 100) / 100;
      const iva = Math.round((totalFacturado - base) * 100) / 100;
      const fecha = row.date ? new Date(String(row.date)).toLocaleDateString('es-ES') : '';

      return [
        row.cw_invoice_number || '',
        fecha,
        row.type,
        row.customer_name,
        row.customer_email,
        row.description,
        toSpanishNumber(row.precio as number | null),
        toSpanishNumber(base),
        toSpanishNumber(iva),
        toSpanishNumber(totalFacturado),
        row.status,
      ].map(escapeCSV).join(';');
    });

    const csv = [header, ...csvRows].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="facturas-clientes-${today}.csv"`);
    res.send('﻿' + csv); // BOM for Spanish Excel
  } catch (err) {
    falloInterno(res, 'billing_export_failed', err);
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
    falloInterno(res, 'free_users_failed', err);
  }
});

// Aquí vivían /billing/subscribers y /billing/trials, que solo redirigían a
// /billing/invoices y /billing/free-users. No las llamaba nadie —ni la web ni
// PopCar— y una redirección que nadie sigue es una dirección más que mantener.
