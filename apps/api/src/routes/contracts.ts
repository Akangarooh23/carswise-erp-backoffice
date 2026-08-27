import { Router } from 'express';
import { nextProviderInvoiceId } from './provider-billing.js';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

export const contractsRouter = Router();

import { enviar, plantilla, parrafo, datos, boton, esc, MARCA } from '../lib/correo.js';

/** Lo que el cliente necesita saber: nunca se desvia a un buzon de pruebas. */
const enviarContrato = (to: string, subject: string, html: string) =>
  enviar({ to, subject, html, alClienteSiempre: true });

function rentingContractEmailHtml(data: {
  contact_name: string; vehicle_title: string; color: string; quantity: number;
  duration_months: number; km_year: number; monthly_price: number;
  start_date: string; end_date: string; contract_id: string;
}): string {
  const fecha = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const num = (n: number) => n.toLocaleString('es-ES');
  return plantilla({
    titulo: 'Tu contrato de renting está activo',
    cuerpo:
      parrafo(`Hola <strong>${esc(data.contact_name) || 'cliente'}</strong>,`) +
      parrafo(`El contrato de renting de <strong>${esc(data.vehicle_title)}</strong> ha quedado formalizado.`) +
      datos([
        ['Nº de contrato', esc(data.contract_id)],
        ['Color', esc(data.color) + (data.quantity > 1 ? ` × ${data.quantity}` : '')],
        ['Duración', `${data.duration_months} meses`],
        ['Km/año incluidos', `${num(data.km_year)} km`],
        ['Cuota mensual', `${num(data.monthly_price)} €/mes`],
        ['Inicio', fecha(data.start_date)],
        ['Fin previsto', fecha(data.end_date)],
      ]) +
      parrafo('El vehículo ya aparece en tu garaje digital. Desde ahí puedes guardar documentos, registrar incidencias y llevar el historial de mantenimiento.') +
      boton('Ver mi vehículo en renting', `${MARCA.sitioUrl}/panel/vehiculos`),
  });
}

/** El prefijo de la serie de renting del año en curso. */
export function prefijoContrato(anio = new Date().getFullYear()): string {
  return `PC-RENT-${anio}-`;
}

/**
 * El identificador a partir del último número emitido.
 *
 * Tres dígitos porque una serie anual de renting no llega a mil; si llegara,
 * el número sigue creciendo y deja de ir alineado, que es mejor que repetirse.
 */
export function siguienteContrato(ultimo: number, anio?: number): string {
  return prefijoContrato(anio) + String(ultimo + 1).padStart(3, '0');
}

/**
 * El siguiente número de contrato: PC-RENT-2026-001.
 *
 * Se mira el último sufijo emitido del año, no cuántos hay. Contando filas,
 * borrar un contrato hace que el siguiente repita un número ya usado.
 *
 * Solo se miran los que acaban en dígitos: un identificador escrito a mano
 * que no siga el formato no puede tumbar la creación del siguiente.
 */
async function generateContractId(): Promise<string> {
  const prefijo = prefijoContrato();
  const result = await query(
    `SELECT COALESCE(MAX(substring(id from '[0-9]+$')::int), 0) AS ultimo
       FROM moveadvisor_renting_contracts
      WHERE id LIKE $1 AND id ~ '[0-9]+$'`,
    [`${prefijo}%`]
  );
  return siguienteContrato(Number((result.rows[0] as { ultimo: number }).ultimo));
}

// ── GET /contracts — unified list of purchases + renting contracts ─────────────
contractsRouter.get('/contracts', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  try {
    const type   = (req.query.type as string) || 'all';
    const status = (req.query.status as string) || '';
    const page   = Math.max(1, Number(req.query.page) || 1);
    const limit  = 50;
    const offset = (page - 1) * limit;

    const rows: unknown[] = [];
    const debugErrors: string[] = [];

    // Purchases — all leads with status Vendido (marketplace + external portals)
    if (type === 'all' || type === 'compra') {
      try {
        const res2 = await query(
          `SELECT
             l.id, l.user_email, l.contact_name, l.vehicle_title,
             COALESCE(vo.sold_at, l.created_at) AS date,
             l.status, l.portal, l.vehicle_id, l.sale_price, l.sale_notes,
             v.id AS idcar_id,
             COALESCE(l.sale_price, vo.price, mo.price)          AS offer_price,
             COALESCE(vo.year::text, mo.year::text)              AS offer_year,
             COALESCE(vo.mileage::text, mo.mileage::text)        AS offer_mileage,
             COALESCE(vo.fuel, mo.fuel)                          AS offer_fuel
           FROM moveadvisor_market_leads l
           LEFT JOIN moveadvisor_user_vehicles v              ON v.source_lead_id = l.id
           LEFT JOIN moveadvisor_marketplace_vo_offers vo     ON vo.id = l.vehicle_id
           LEFT JOIN moveadvisor_market_offers mo             ON mo.id = l.vehicle_id AND vo.id IS NULL
           WHERE l.status = 'Vendido'
           ORDER BY l.created_at DESC`
        );
        for (const r of res2.rows as Record<string, string>[]) {
          const price = r.sale_price ? Number(r.sale_price) : (r.offer_price ? Number(r.offer_price) : null);
          const detail = [r.offer_year, r.offer_mileage ? `${Number(r.offer_mileage).toLocaleString('es-ES')} km` : null, r.offer_fuel].filter(Boolean).join(' · ') || null;
          rows.push({
            id: r.id, type: 'compra', date: r.date,
            user_email: r.user_email, contact_name: r.contact_name,
            vehicle_title: r.vehicle_title, status: 'completada',
            portal: r.portal || null,
            idcar_id: r.idcar_id || null,
            amount: price,
            monthly_price: null, duration_months: null,
            km_year: null, color: null, quantity: null,
            start_date: null, end_date: null,
            detail,
          });
        }
      } catch (e) {
        debugErrors.push(`compras: ${(e as Error).message}`);
      }
    }

    // Renting contracts — wrapped individually; table may not exist yet in production
    if (type === 'all' || type === 'renting') {
      try {
        const whereClauses: string[] = [];
        const vals: unknown[] = [];
        if (status) { vals.push(status); whereClauses.push(`status = $${vals.length}`); }
        const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const res2 = await query(
          `SELECT * FROM moveadvisor_renting_contracts ${whereSQL} ORDER BY created_at DESC`,
          vals
        );
        for (const r of res2.rows as Record<string, string | number>[]) {
          rows.push({
            id: r.id, type: 'renting', date: r.created_at,
            user_email: r.user_email, contact_name: r.contact_name,
            vehicle_title: r.vehicle_title, status: r.status,
            portal: null,
            idcar_id: r.idcar_id || null,
            amount: Number(r.monthly_price) * Number(r.duration_months) || null,
            monthly_price: r.monthly_price, duration_months: r.duration_months,
            km_year: r.km_year, color: r.color, quantity: r.quantity,
            start_date: r.start_date, end_date: r.end_date,
          });
        }
      } catch (e) {
        debugErrors.push(`rentings: ${(e as Error).message}`);
      }
    }

    // Stats — isolated catches so a missing table never blocks the response
    const statsCompra = await query(
      `SELECT COUNT(*) AS total FROM moveadvisor_market_leads WHERE status = 'Vendido'`
    ).catch(() => ({ rows: [{ total: '0' }] }));

    const statsRentingRow = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')    AS active,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COALESCE(SUM(monthly_price) FILTER (WHERE status = 'active'), 0) AS mrr
      FROM moveadvisor_renting_contracts
    `).catch(() => ({ rows: [{ active: '0', completed: '0', cancelled: '0', mrr: '0' }] }));

    const s = statsRentingRow.rows[0] as Record<string, string>;

    // Sort combined by date desc
    rows.sort((a, b) => {
      const da = new Date((a as { date: string }).date).getTime();
      const db = new Date((b as { date: string }).date).getTime();
      return db - da;
    });

    const paginated = rows.slice(offset, offset + limit);

    res.json({
      ok: true,
      data: paginated,
      meta: {
        total: rows.length,
        page, limit,
        debug: debugErrors.length ? debugErrors : undefined,
        stats: {
          total_compras:   Number((statsCompra.rows[0] as { total: string }).total),
          total_rentings:  Number(s.active) + Number(s.completed) + Number(s.cancelled),
          rentings_activos: Number(s.active),
          rentings_completados: Number(s.completed),
          mrr: Number(s.mrr),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'contracts_fetch_failed', detail: (err as Error).message });
  }
});

// ── POST /contracts/renting — create renting contract ─────────────────────────
contractsRouter.post('/contracts/renting', requireRole(['admin', 'support', 'operations', 'sales']), async (req, res) => {
  const { lead_id, color, quantity = 1, duration_months, km_year, monthly_price, start_date, notes } = req.body ?? {};

  if (!lead_id || !duration_months || !monthly_price || !start_date) {
    res.status(400).json({ ok: false, error: 'missing_fields', detail: 'lead_id, duration_months, monthly_price, start_date are required' });
    return;
  }

  try {
    // Fetch the lead
    const leadResult = await query(`SELECT * FROM moveadvisor_market_leads WHERE id = $1`, [lead_id]);
    if (!leadResult.rows.length) { res.status(404).json({ ok: false, error: 'lead_not_found' }); return; }
    const lead = leadResult.rows[0] as Record<string, string>;

    // Guard: one active contract per lead
    const existing = await query(
      `SELECT id FROM moveadvisor_renting_contracts WHERE lead_id = $1 AND status = 'active' LIMIT 1`,
      [lead_id]
    );
    if ((existing.rows as unknown[]).length) {
      res.status(409).json({ ok: false, error: 'contract_already_exists', existing_id: (existing.rows[0] as { id: string }).id });
      return;
    }

    // Calculate end date
    const start = new Date(start_date);
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + Number(duration_months));
    const end_date = endDate.toISOString().slice(0, 10);

    // Dos personas creando un contrato a la vez leen el mismo máximo y
    // escriben el mismo número. La clave primaria impide que se guarden los
    // dos —que es lo importante—, pero al segundo le saldría un error de base
    // de datos en vez del contrato que pidió. Se vuelve a pedir número.
    let contractId = '';
    for (let intento = 0; intento < 3; intento++) {
      contractId = await generateContractId();
      try {
        await query(
          `INSERT INTO moveadvisor_renting_contracts
             (id, lead_id, offer_id, user_email, contact_name, vehicle_title,
              color, quantity, duration_months, km_year, monthly_price,
              start_date, end_date, status, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,NOW(),NOW())`,
          [
            contractId, lead_id, lead.vehicle_id, lead.user_email, lead.contact_name, lead.vehicle_title,
            color || null, Number(quantity), Number(duration_months), km_year ? Number(km_year) : null,
            Number(monthly_price), start_date, end_date, notes || null,
          ]
        );
        break;
      } catch (e) {
        const duplicado = (e as { code?: string }).code === '23505';
        if (!duplicado || intento === 2) throw e;
      }
    }

    // Update lead status to Cerrado
    await query(
      `UPDATE moveadvisor_market_leads SET status = 'Cerrado', updated_at = NOW() WHERE id = $1`,
      [lead_id]
    ).catch(() => {});

    // Create buyer IDCar with renting state
    const newId = `v-cw-rent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const offerData = await query(
      `SELECT title, brand, model, version, year, mileage, fuel, color, cv, horsepower, body_type, transmission_type, environmental_label, co2
       FROM moveadvisor_marketplace_vo_offers WHERE id = $1`,
      [lead.vehicle_id]
    ).catch(() => ({ rows: [] }));
    const v = (offerData.rows as Record<string, string>[])[0] ?? {};

    await query(
      `INSERT INTO moveadvisor_user_vehicles
         (id, user_email, title, brand, model, version, year, mileage, fuel, color,
          cv, horsepower, body_type, transmission_type, environmental_label, co2,
          notes, purchased_from, source_lead_id,
          renting_contract_id, renting_end_date, renting_monthly_price, renting_km_year, renting_duration_months,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,'carswise-marketplace-renting',$18,$19,$20,$21,$22,$23,NOW(),NOW())`,
      [
        newId, lead.user_email,
        v.title || lead.vehicle_title, v.brand || '', v.model || '', v.version || '',
        v.year || '', v.mileage || '0', v.fuel || '', color || v.color || '',
        v.cv || '', v.horsepower || '', v.body_type || '', v.transmission_type || '',
        v.environmental_label || '', v.co2 || '',
        `Renting activo — vence el ${end_date} — Contrato ${contractId}`,
        lead_id, contractId, end_date, Number(monthly_price),
        km_year ? Number(km_year) : null, Number(duration_months),
      ]
    ).catch((e: Error) => { throw new Error(`IDCar insert failed: ${e.message}`); });

    // Set vehicle state to 'renting'
    await query(
      `INSERT INTO moveadvisor_user_vehicle_states (user_email, vehicle_id, state, notes, updated_at)
       VALUES ($1, $2, 'renting', $3, NOW())
       ON CONFLICT (user_email, vehicle_id) DO NOTHING`,
      [lead.user_email, newId, `Renting activo — ${contractId}`]
    ).catch(() => {});

    // Update contract with idcar_id
    await query(`UPDATE moveadvisor_renting_contracts SET idcar_id = $1 WHERE id = $2`, [newId, contractId]).catch(() => {});

    // Auto-generate provider invoice (carswise_fee from offer, default 400€)
    try {
      const offerFee = await query(
        `SELECT carswise_fee, seller, portal FROM moveadvisor_marketplace_vo_offers WHERE id = $1`,
        [lead.vehicle_id]
      ).catch(() => ({ rows: [] }));
      const fee = (offerFee.rows[0] as Record<string, string | null> | undefined)?.carswise_fee ?? '400';
      const providerName = (offerFee.rows[0] as Record<string, string | null> | undefined)?.seller
        || (offerFee.rows[0] as Record<string, string | null> | undefined)?.portal
        || 'Proveedor';
      const provInvoiceId = await nextProviderInvoiceId();
      await query(
        `INSERT INTO moveadvisor_provider_invoices
           (id, type, provider_name, contract_id, vehicle_title, customer_name, customer_email, base_amount, invoice_amount)
         VALUES ($1, 'renting_fee', $2, $3, $4, $5, $6, $7, $8)`,
        [provInvoiceId, providerName, contractId, lead.vehicle_title, lead.contact_name, lead.user_email,
         Number(monthly_price), Number(fee)]
      );
    } catch (e) { console.error('[contracts] provider invoice error:', (e as Error).message); }

    // Send email to client
    enviarContrato(
      lead.user_email,
      `Tu contrato de renting está activo — ${lead.vehicle_title || 'PopCar'}`,
      rentingContractEmailHtml({
        contact_name: lead.contact_name,
        vehicle_title: lead.vehicle_title,
        color: color || '',
        quantity: Number(quantity),
        duration_months: Number(duration_months),
        km_year: Number(km_year) || 0,
        monthly_price: Number(monthly_price),
        start_date,
        end_date,
        contract_id: contractId,
      })
    ).catch((e: Error) => console.error('[contracts] email error:', e.message));

    res.status(201).json({ ok: true, data: { id: contractId, idcar_id: newId, end_date } });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'contract_create_failed', detail: (err as Error).message });
  }
});

// ── PATCH /contracts/renting/:id — update status (complete/cancel) ─────────────
contractsRouter.patch('/contracts/renting/:id', requireRole(['admin', 'support', 'operations']), async (req, res) => {
  const { status, notes } = req.body ?? {};
  const allowed = ['active', 'completed', 'cancelled'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ ok: false, error: 'invalid_status' });
    return;
  }
  try {
    const result = await query(
      `UPDATE moveadvisor_renting_contracts SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes || null, req.params.id]
    );
    if (!result.rows.length) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
    const contract = result.rows[0] as Record<string, string>;

    // When completed or cancelled, set IDCar state accordingly
    if (contract.idcar_id) {
      const newState = status === 'completed' ? 'owned' : 'returned';
      const noteText = status === 'completed'
        ? `Renting finalizado — ${contract.id}`
        : `Renting cancelado — ${contract.id}`;
      await query(
        `INSERT INTO moveadvisor_user_vehicle_states (user_email, vehicle_id, state, notes, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_email, vehicle_id) DO UPDATE SET state = $3, notes = $4, updated_at = NOW()`,
        [contract.user_email, contract.idcar_id, newState, noteText]
      ).catch(() => {});
    }

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'contract_update_failed', detail: (err as Error).message });
  }
});
