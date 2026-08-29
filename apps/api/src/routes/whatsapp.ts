/**
 * Lo que contesta el cliente por WhatsApp.
 *
 * Cuando el concesionario no puede a la hora pedida, se le mandan las que sí
 * como botones. Aquí llega lo que pulsa, y la hora se aplica sola: la visita
 * queda confirmada y le sale el correo con el calendario, sin que nadie tenga
 * que leer un WhatsApp y teclearlo en la Agenda.
 *
 * Va sin sesión, porque quien llama es Meta y no una persona. Lo que lo protege
 * es que la hora tiene que venir en un botón que mandamos nosotros, con la cita
 * dentro, y que solo se aceptan horas de las que se propusieron.
 *
 * Para enchufarlo, en la app de Meta:
 *
 *   URL          https://<esta-api>/api/whatsapp/webhook
 *   Verify token lo que valga WHATSAPP_VERIFY_TOKEN
 *
 * Sin esa variable el webhook no se puede dar de alta, que es lo que se quiere:
 * un webhook abierto a cualquiera es una forma de que le muevan la cita a la
 * gente.
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { loQuePulso } from '../lib/whatsapp.js';
import { aplicaHoraElegida } from './visits.js';

export const whatsappRouter = Router();

/** El apretón de manos con Meta al dar de alta el webhook. */
whatsappRouter.get('/whatsapp/webhook', (req, res) => {
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!esperado) return res.status(503).send('sin WHATSAPP_VERIFY_TOKEN');
  const modo   = String(req.query['hub.mode'] || '');
  const token  = String(req.query['hub.verify_token'] || '');
  const reto   = String(req.query['hub.challenge'] || '');
  if (modo === 'subscribe' && token === esperado) return res.status(200).send(reto);
  return res.sendStatus(403);
});

/**
 * Lo que pulsa el cliente.
 *
 * Se contesta 200 pase lo que pase, y a propósito: Meta reintenta durante horas
 * lo que no se le acepta, y un fallo nuestro no se arregla porque nos manden el
 * mismo mensaje veinte veces. Lo que salga mal se apunta en el rastro de la
 * cita, que es donde alguien lo va a ver.
 */
whatsappRouter.post('/whatsapp/webhook', async (req, res) => {
  // Se contesta antes de trabajar: Meta corta a los pocos segundos.
  res.sendStatus(200);

  const pulsado = loQuePulso(req.body);
  if (!pulsado) return;

  try {
    // La hora tiene que ser una de las que se le propusieron. Sin esto, quien
    // supiera el identificador de una cita podría moverla a donde quisiera.
    const r = await query(
      `SELECT datos FROM visit_booking_events
        WHERE booking_id = $1 AND evento = 'horas_propuestas'
        ORDER BY created_at DESC LIMIT 1`,
      [pulsado.bookingId]
    );
    const horas: unknown = r.rows[0]?.datos?.horas;
    const cuando = new Date(pulsado.hora).getTime();
    const vale = Array.isArray(horas) && horas.some((h) => new Date(String(h)).getTime() === cuando);
    if (!vale) {
      console.error('[whatsapp] hora que no se propuso para', pulsado.bookingId, pulsado.hora);
      return;
    }

    // El paso del rastro lo deja ella: aquí solo se le cuenta de dónde viene
    // la respuesta, para que mañana se sepa que la eligió él con el móvil.
    const hecho = await aplicaHoraElegida(pulsado.bookingId, pulsado.hora, {
      actor: 'cliente',
      laEligioElCliente: true,
      por: `un botón de WhatsApp desde ${pulsado.telefono}`,
    });
    if (!hecho.ok) {
      console.error('[whatsapp] no se ha podido aplicar la hora:', hecho.error);
      return;
    }
  } catch (e) {
    console.error('[whatsapp] webhook:', e instanceof Error ? e.message : String(e));
  }
});
