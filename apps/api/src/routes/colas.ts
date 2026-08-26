import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { registrar } from '../lib/auditoria.js';

/**
 * Las cuatro colas de trabajo que PopCar generaba y el ERP no veía.
 *
 * Todas tienen columna de estado desde el principio: estaban pensadas para que
 * alguien las trabajara. Lo único que ocurría era que salía un correo a un
 * buzón, así que nadie tenía una lista, ni sabía cuántas había pendientes, ni
 * cuál llevaba tres días sin tocar.
 *
 * Se sirven juntas porque son el mismo patrón —listar, filtrar por estado,
 * mover de estado— y separarlas en cuatro ficheros solo repetiría el código.
 *
 * Los estados no se inventan aquí: son los que PopCar ya escribe. Si el ERP
 * pusiera otros, las dos mitades dejarían de entenderse.
 */

export const colasRouter = Router();

interface Cola {
  tabla: string;
  /** Columnas que se devuelven. Se listan a mano: `SELECT *` trae tokens. */
  campos: string;
  /** Por dónde se busca con el buscador de la pantalla. */
  busca: string[];
  /** Los estados válidos, en el orden en que avanza el trabajo. */
  estados: string[];
  /** Los que significan «ya no hay nada que hacer aquí». */
  cerrados: string[];
}

const COLAS: Record<string, Cola> = {
  servicios: {
    tabla: 'moveadvisor_service_requests',
    campos: `id, user_email, vehicle_title, service_type, preferred_partner,
             preferred_province, preferred_dates, notes, status, created_at, updated_at`,
    busca: ['user_email', 'vehicle_title', 'service_type', 'preferred_province'],
    estados: ['pendiente', 'en_curso', 'agendada', 'resuelta', 'cancelada'],
    cerrados: ['resuelta', 'cancelada'],
  },
  visitas: {
    // Sin token_seller ni token_buyer: son llaves de un solo uso que dan acceso
    // a la cita. No pintan nada en una pantalla del backoffice.
    tabla: 'moveadvisor_viewing_appointments',
    campos: `id, offer_id, vehicle_title, buyer_email, buyer_name, buyer_message,
             seller_email, status, proposed_slots, confirmed_slot, created_at, updated_at`,
    busca: ['buyer_email', 'buyer_name', 'seller_email', 'vehicle_title'],
    estados: ['pending_seller', 'pending_buyer', 'confirmed', 'cancelled'],
    cerrados: ['confirmed', 'cancelled'],
  },
  informes: {
    tabla: 'moveadvisor_vehicle_condition_reports',
    campos: `id, vehicle_id, capture_session_id, status, created_by_email,
             expires_at, status_checked_at, created_at, updated_at`,
    busca: ['created_by_email', 'vehicle_id', 'status'],
    estados: ['iniciada', 'capturando', 'subida_completa', 'procesando',
              'informe_listo', 'verificada', 'caducada', 'anulada'],
    cerrados: ['verificada', 'caducada', 'anulada'],
  },
  citas: {
    tabla: 'moveadvisor_user_appointments',
    campos: `id, user_email, vehicle_id, appointment_type, title, status,
             requested_at_text, created_at, updated_at`,
    busca: ['user_email', 'title', 'appointment_type'],
    estados: ['Pendiente', 'Solicitud enviada', 'Pendiente de confirmación',
              'Confirmada', 'Realizada', 'Cancelada'],
    cerrados: ['Realizada', 'Cancelada'],
  },
};

const PUEDEN = ['admin', 'operations', 'support'] as const;

// ── Qué colas hay y en qué estado están ─────────────────────────────────────

colasRouter.get('/colas', requireRole([...PUEDEN]), async (_req, res) => {
  try {
    const resumen = await Promise.all(
      Object.entries(COLAS).map(async ([clave, c]) => {
        const abiertos = c.estados.filter((e) => !c.cerrados.includes(e));
        const r = await query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status = ANY($1))::int AS abiertas,
                  MIN(created_at) FILTER (WHERE status = ANY($1)) AS mas_vieja
           FROM ${c.tabla}`,
          [abiertos]
        ).catch(() => ({ rows: [{ total: 0, abiertas: 0, mas_vieja: null }] }));
        return { cola: clave, ...r.rows[0] };
      })
    );
    res.json({ ok: true, data: resumen });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

colasRouter.get('/colas/:cola', requireRole([...PUEDEN]), async (req, res) => {
  const c = COLAS[req.params.cola];
  if (!c) { res.status(404).json({ ok: false, error: 'cola_desconocida' }); return; }

  const estado = String(req.query.estado || '').trim();
  const busca = String(req.query.q || '').trim().toLowerCase();
  const soloAbiertas = String(req.query.abiertas || '') === '1';
  const limite = Math.min(Number(req.query.limit) || 200, 500);

  const cond: string[] = [];
  const vals: unknown[] = [];
  if (estado) { vals.push(estado); cond.push(`status = $${vals.length}`); }
  else if (soloAbiertas) {
    vals.push(c.estados.filter((e) => !c.cerrados.includes(e)));
    cond.push(`status = ANY($${vals.length})`);
  }
  if (busca) {
    vals.push('%' + busca + '%');
    const i = vals.length;
    cond.push('(' + c.busca.map((col) => `lower(COALESCE(${col}::text,'')) LIKE $${i}`).join(' OR ') + ')');
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  try {
    vals.push(limite);
    const r = await query(
      `SELECT ${c.campos} FROM ${c.tabla} ${where} ORDER BY created_at DESC LIMIT $${vals.length}`,
      vals
    );
    res.json({ ok: true, data: r.rows, estados: c.estados, cerrados: c.cerrados });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Mover de estado ─────────────────────────────────────────────────────────

colasRouter.patch('/colas/:cola/:id/estado', requireRole([...PUEDEN]), async (req, res) => {
  const c = COLAS[req.params.cola];
  if (!c) { res.status(404).json({ ok: false, error: 'cola_desconocida' }); return; }

  const estado = String(req.body?.estado ?? '');
  if (!c.estados.includes(estado)) {
    // No se acepta cualquier cadena: los estados son los que PopCar entiende, y
    // uno inventado desde aquí rompe el otro lado en silencio.
    res.status(400).json({ ok: false, error: 'estado_invalido' });
    return;
  }

  try {
    const antes = await query(`SELECT status FROM ${c.tabla} WHERE id = $1`, [req.params.id]);
    if (!antes.rows.length) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }

    await query(`UPDATE ${c.tabla} SET status = $1, updated_at = NOW() WHERE id = $2`, [
      estado, req.params.id,
    ]);
    await registrar(req, {
      accion: 'cambiar_estado',
      recurso: req.params.cola,
      recursoId: req.params.id,
      datos: { de: antes.rows[0].status, a: estado },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});
