import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole, type Role } from '../middleware/auth.js';
import { enviar, plantilla, parrafo, datos, aviso, boton, esc, MARCA } from '../lib/correo.js';
import { config } from '../config.js';

export const visitsRouter = Router();

const ROLES: Role[] = ['admin', 'support', 'operations', 'sales'];

interface Reserva {
  id: string;
  offer_id: string;
  vehicle_title: string | null;
  starts_at: string;
  buyer_email: string | null;
  buyer_name: string | null;
}

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/**
 * El correo que se le manda al cliente cuando le cancelan la visita.
 *
 * Separado del envío para poder comprobarlo: lo que importa aquí es que diga
 * qué visita era y ofrezca pedir otra, y eso se puede leer sin mandar nada.
 */
export function correoDeCancelacion(r: Reserva, motivo: string): { subject: string; html: string } {
  const coche = r.vehicle_title || 'el vehículo';
  const enlaceOferta = `${config.PUBLIC_SITE_URL.replace(/\/$/, '')}/marketplace-vo/${encodeURIComponent(r.offer_id)}`;

  return {
    subject: `Tu visita se ha cancelado — ${coche}`,
    html: plantilla({
      titulo: 'Tu visita se ha cancelado',
      cuerpo:
        parrafo(`Hola${r.buyer_name ? ` ${esc(r.buyer_name)}` : ''}, hemos tenido que cancelar la visita que tenías reservada. Sentimos el cambio.`) +
        datos([
          ['Vehículo', esc(coche)],
          ['Era el', `${fechaLarga(r.starts_at)} a las ${hora(r.starts_at)}`],
        ]) +
        (motivo ? aviso('Motivo', esc(motivo)) : '') +
        parrafo('Puedes elegir otro día y otra hora desde el anuncio. Si prefieres que te llamemos, responde a este correo.') +
        boton('Pedir otra hora', enlaceOferta),
    }),
  };
}

/**
 * Se le dice al cliente que su visita se ha cancelado.
 *
 * Antes no se le decía nada: la cancelación desde el ERP solo tocaba la base, y
 * quien había reservado se presentaba igual. La única defensa era acordarse de
 * escribirle a mano, y eso es una instrucción que se incumple sola.
 *
 * Lanza si el envío falla, para que la ruta pueda contar si el aviso salió: una
 * cita cancelada de la que el cliente no se ha enterado no es lo mismo que una
 * cita cancelada, y quien la cancela tiene que poder distinguirlo.
 */
async function avisaDeLaCancelacion(r: Reserva, motivo: string): Promise<void> {
  if (!r.buyer_email) throw new Error('la reserva no tiene correo del cliente');
  const { subject, html } = correoDeCancelacion(r, motivo);
  await enviar({
    to: r.buyer_email,
    subject,
    // Aunque haya un desvío de pruebas puesto: es su cita, y enterarse de que
    // se ha cancelado no puede depender de una variable de entorno.
    alClienteSiempre: true,
    html,
  });
}

// GET /visit-slots?offerId=X  — returns available + booked slots for an offer
visitsRouter.get('/visit-slots', requireRole(ROLES), async (req, res) => {
  const offerId = String(req.query.offerId || '').trim();
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  try {
    const r = await query(
      `SELECT id, offer_id, starts_at, ends_at, status, source
       FROM vehicle_visit_availability
       WHERE offer_id = $1
       ORDER BY starts_at ASC
       LIMIT 200`,
      [offerId]
    );
    return res.json({ ok: true, slots: r.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /visit-slots  { offerId, startsAt, endsAt, source }
visitsRouter.post('/visit-slots', requireRole(ROLES), async (req, res) => {
  const { offerId, startsAt, endsAt, source } = req.body;
  if (!offerId || !startsAt || !endsAt) return res.status(400).json({ ok: false, error: 'offerId, startsAt, endsAt required' });
  try {
    const overlap = await query(
      `SELECT id FROM vehicle_visit_availability
       WHERE offer_id = $1 AND status != 'blocked'
         AND tstzrange(starts_at, ends_at) && tstzrange($2::timestamptz, $3::timestamptz)
       LIMIT 1`,
      [offerId, startsAt, endsAt]
    );
    if (overlap.rows.length) return res.status(409).json({ ok: false, error: 'El horario se solapa con otro existente' });
    const r = await query(
      `INSERT INTO vehicle_visit_availability (offer_id, starts_at, ends_at, source)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [offerId, startsAt, endsAt, source || 'erp']
    );
    return res.json({ ok: true, slot: r.rows[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /visit-slots/:slotId?offerId=X
visitsRouter.delete('/visit-slots/:slotId', requireRole(ROLES), async (req, res) => {
  const { slotId } = req.params;
  const offerId = String(req.query.offerId || '').trim();
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  try {
    await query(
      `DELETE FROM vehicle_visit_availability WHERE id = $1 AND offer_id = $2 AND status = 'available'`,
      [slotId, offerId]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /visit-bookings?offerId=X  — returns all non-cancelled bookings for an offer
visitsRouter.get('/visit-bookings', requireRole(ROLES), async (req, res) => {
  const offerId = String(req.query.offerId || '').trim();
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  try {
    const r = await query(
      `SELECT b.id, b.offer_id, b.vehicle_title, b.starts_at, b.ends_at,
              b.buyer_email, b.buyer_name, b.buyer_phone, b.notes,
              b.status, b.created_at
       FROM vehicle_visit_bookings b
       WHERE b.offer_id = $1 AND b.status != 'cancelled'
       ORDER BY b.starts_at ASC`,
      [offerId]
    );
    return res.json({ ok: true, bookings: r.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /visit-bookings/:bookingId/cancel  (ERP staff can cancel any booking)
visitsRouter.post('/visit-bookings/:bookingId/cancel', requireRole(ROLES), async (req, res) => {
  const { bookingId } = req.params;
  const motivo = String(req.body?.motivo ?? '').trim().slice(0, 300);
  try {
    const r = await query(
      `UPDATE vehicle_visit_bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status != 'cancelled'
       RETURNING availability_id, id, offer_id, vehicle_title, starts_at, buyer_email, buyer_name`,
      [bookingId]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
    await query(`UPDATE vehicle_visit_availability SET status = 'available' WHERE id = $1`, [r.rows[0].availability_id]);

    // El correo va después de liberar el hueco y no puede tumbar la cancelación:
    // ya está hecha. Pero sí se cuenta si salió, porque una cita cancelada de la
    // que el cliente no se ha enterado exige llamarle, y quien la cancela tiene
    // que saberlo sin ir a mirar ningún registro.
    let avisado = true;
    let fallo = '';
    try {
      await avisaDeLaCancelacion(r.rows[0] as Reserva, motivo);
    } catch (e) {
      avisado = false;
      fallo = e instanceof Error ? e.message : String(e);
      console.error('[visitas] no se ha podido avisar de la cancelación:', fallo);
    }

    return res.json({ ok: true, avisado, ...(avisado ? {} : { fallo }) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /all-bookings — global agenda for ERP (all upcoming bookings)
visitsRouter.get('/all-bookings', requireRole(ROLES), async (req, res) => {
  const status = String(req.query.status || 'confirmed').trim();
  const from   = String(req.query.from || '').trim();
  const to     = String(req.query.to   || '').trim();
  try {
    let sql = `
      SELECT b.id, b.offer_id, b.vehicle_title, b.starts_at, b.ends_at,
             b.buyer_email, b.buyer_name, b.buyer_phone, b.notes,
             b.status, b.source, b.created_at,
             a.source AS slot_source
      FROM vehicle_visit_bookings b
      JOIN vehicle_visit_availability a ON a.id = b.availability_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let pi = 1;
    if (status) { sql += ` AND b.status = $${pi++}`; params.push(status); }
    if (from)   { sql += ` AND b.starts_at >= $${pi++}`; params.push(from); }
    if (to)     { sql += ` AND b.starts_at <= $${pi++}`; params.push(to); }
    sql += ' ORDER BY b.starts_at ASC LIMIT 200';
    const r = await query(sql, params);
    return res.json({ ok: true, bookings: r.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
