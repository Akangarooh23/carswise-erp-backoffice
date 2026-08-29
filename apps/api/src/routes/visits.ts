import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole, type Role } from '../middleware/auth.js';
import { enviar, plantilla, parrafo, datos, aviso, boton, esc, MARCA, respuestaA } from '../lib/correo.js';
import { config } from '../config.js';
import { manda, mandaOpciones, botonDeHora } from '../lib/whatsapp.js';

export const visitsRouter = Router();

const ROLES: Role[] = ['admin', 'support', 'operations', 'sales'];

/** Los identificadores de cita son UUID. Lo que no lo sea, no se consulta. */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Reserva {
  id: string;
  offer_id: string;
  vehicle_title: string | null;
  starts_at: string;
  ends_at?: string;
  buyer_email: string | null;
  buyer_name: string | null;
}

/** Cuándo, como lo quiere un calendario: 20260915T100000Z. */
const enFormatoIcs = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * El archivo que mete la cita en el calendario de quien la recibe.
 *
 * Sale solo al confirmar, nunca al pedirla: un `.ics` en el móvil de alguien es
 * una cita cerrada, y una solicitud sobre un horario que nadie ha publicado no
 * lo es.
 *
 * El identificador va contra popcar.tech. Si algún día se reenvía el mismo
 * evento, el calendario lo reconoce y lo actualiza en vez de duplicarlo, así que
 * este valor no se cambia a la ligera.
 */
export function calendarioDeLaCita(r: Reserva): string {
  const fin = r.ends_at || new Date(new Date(r.starts_at).getTime() + 3600000).toISOString();
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${MARCA.nombre}//Visitas//ES`,
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${enFormatoIcs(r.starts_at)}`,
    `DTEND:${enFormatoIcs(fin)}`,
    `SUMMARY:Visita: ${r.vehicle_title || r.offer_id}`,
    `DESCRIPTION:Visita confirmada para ver el vehículo.\\nID: ${r.id}`,
    `UID:${r.id}@popcar.tech`,
    `ORGANIZER;CN=${MARCA.nombre}:mailto:${(respuestaA() || 'notifications@popcar.tech')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * El correo de cuando la visita se mueve a otra hora.
 *
 * Se manda cuando el concesionario no puede el día pedido pero sí otro. Lleva
 * las dos horas —la que era y la que es— porque quien lo lee tiene la primera
 * en la cabeza, y un correo que solo dice la nueva se lee como una cita más, no
 * como un cambio.
 *
 * Y lleva el enlace a su cita: se la hemos movido sin preguntarle, así que
 * tiene que poder decir que no le va bien sin escribir a nadie.
 */
export function correoDeCambioDeHora(r: Reserva, antes: string, enlace: string): { subject: string; html: string } {
  const coche = r.vehicle_title || 'el vehículo';
  return {
    subject: `Tu visita cambia de hora — ${coche}`,
    html: plantilla({
      titulo: 'Tu visita cambia de hora',
      cuerpo:
        parrafo(`Hola${r.buyer_name ? ` ${esc(r.buyer_name)}` : ''}, el día que pediste no era posible, así que hemos movido tu visita. Queda confirmada en el nuevo horario.`) +
        datos([
          ['Vehículo', esc(coche)],
          ['Ahora es', `${fechaLarga(r.starts_at)} a las ${hora(r.starts_at)}`],
          ['Antes era', `${fechaLarga(antes)} a las ${hora(antes)}`],
        ]) +
        parrafo('Va adjunto el archivo para tu calendario, con la hora nueva.', 14) +
        (enlace ? boton('Si no te va bien, elige otra', enlace) : ''),
    }),
  };
}

/**
 * El correo que confirma una visita que estaba pendiente.
 *
 * Separado del envío para poder leerlo sin mandarlo, igual que el de cancelar.
 */
export function correoDeConfirmacion(
  r: Reserva,
  donde = '',
  preguntarPor = ''
): { subject: string; html: string } {
  const coche = r.vehicle_title || 'el vehículo';
  return {
    subject: `Tu visita está confirmada — ${coche}`,
    html: plantilla({
      titulo: 'Tu visita está confirmada',
      cuerpo:
        parrafo(`Hola${r.buyer_name ? ` ${esc(r.buyer_name)}` : ''}, ya está: te esperamos.`) +
        // La dirección y por quién preguntar son lo que necesita para
        // presentarse. `datos()` no pinta las filas vacías, así que si no se han
        // puesto no queda un hueco con un guion.
        datos([
          ['Vehículo', esc(coche)],
          ['Día', fechaLarga(r.starts_at)],
          ['Hora', hora(r.starts_at)],
          ['Dónde', esc(donde)],
          ['Pregunta por', esc(preguntarPor)],
        ]) +
        (donde
          ? ''
          : parrafo('Te confirmaremos la dirección exacta antes de la visita.', 14)) +
        parrafo('Va adjunto un archivo para añadirla a tu calendario. Si no puedes venir, entra en tu panel, en Solicitudes: desde ahí cambias el día y la hora o cancelas la visita.', 14),
    }),
  };
}

/**
 * El correo de cuando se apunta (o se cambia) dónde es y por quién preguntar.
 *
 * Hace falta porque el sitio no siempre se sabe al confirmar. Si el trabajador
 * no lo tenía, al cliente se le dijo «te confirmaremos la dirección antes de la
 * visita», y esa frase es una promesa que alguien tiene que cumplir. Esto es
 * cumplirla.
 *
 * No lleva calendario ni dice «confirmada»: la cita ya lo estaba, y volver a
 * confirmarla hace dudar de si son dos.
 */
export function correoDeLugar(
  r: Reserva,
  donde: string,
  preguntarPor: string
): { subject: string; html: string } {
  const coche = r.vehicle_title || 'el vehículo';
  return {
    subject: `Dónde es tu visita — ${coche}`,
    html: plantilla({
      titulo: 'Dónde es tu visita',
      cuerpo:
        parrafo(`Hola${r.buyer_name ? ` ${esc(r.buyer_name)}` : ''}, ya tenemos el sitio de tu visita. La hora no cambia.`) +
        datos([
          ['Vehículo', esc(coche)],
          ['Día', fechaLarga(r.starts_at)],
          ['Hora', hora(r.starts_at)],
          ['Dónde', esc(donde)],
          ['Pregunta por', esc(preguntarPor)],
        ]) +
        parrafo('Si no puedes venir, entra en tu panel, en Solicitudes: desde ahí cambias el día y la hora o cancelas la visita.', 14),
    }),
  };
}

/**
 * El correo con las horas que ha dado el concesionario, cada una un botón.
 *
 * Es el mismo mensaje que el de WhatsApp, pero en correo y con las horas
 * pinchables: el cliente le da a la que le viene bien y la visita queda
 * confirmada sola, sin que nadie vuelva a teclear nada ni tenga que esperar a
 * que alguien lea su respuesta.
 *
 * Cada botón lleva a la página del cliente con esa hora ya marcada. No la
 * aplica al abrirse —eso lo hace un segundo toque en la página— porque los
 * lectores de correo abren solos los enlaces para comprobarlos, y una cita no
 * puede quedar confirmada porque un antivirus haya mirado el mensaje.
 */
export function correoDeOtrasHoras(
  r: Reserva,
  horas: string[],
  enlaceDe: (hora: string) => string
): { subject: string; html: string } {
  const coche = r.vehicle_title || 'el vehículo';
  return {
    subject: `Esa hora no puede ser — elige otra para ver el ${coche}`,
    html: plantilla({
      titulo: 'Elige otra hora para tu visita',
      cuerpo:
        parrafo(`Hola${r.buyer_name ? ` ${esc(r.buyer_name)}` : ''}, a la hora que pediste no puede ser. Estas son las que nos ha dado quien tiene el ${esc(coche)}.`) +
        parrafo('Pincha la que te venga bien y tu visita queda confirmada a esa hora.', 14) +
        horas.map((h) => boton(`${fechaLarga(h)} a las ${hora(h)}`, enlaceDe(h))).join('') +
        parrafo('Si ninguna te viene bien, entra en tu panel, en Solicitudes: desde ahí cancelas la visita o pides otro día.', 14),
    }),
  };
}

/**
 * El WhatsApp que se le manda al cliente cuando el concesionario no puede.
 *
 * Se le dice que su hora no ha podido ser y se le dan las que sí, para que
 * conteste con una. Va en texto plano porque es WhatsApp: sin negritas raras ni
 * enlaces largos, que ahí se leen mal.
 *
 * Las horas van numeradas para que pueda contestar «la 2» en vez de teclear una
 * fecha: es lo que hace la gente, y pedirle que escriba «jueves 17:00» es pedirle
 * que se equivoque.
 */
export function mensajeDeOtrasHoras(coche: string, nombre: string, horas: string[]): string {
  const saludo = nombre ? `Hola ${nombre}` : 'Hola';
  // Las horas llegan como fecha, no como texto libre: así, cuando el cliente
  // elija una, se puede aplicar tal cual. Con «jueves por la tarde» habría que
  // volver a teclearla, y ahí es donde se cuela el error.
  const lista = horas
    .map((h, i) => `${i + 1}. ${fechaLarga(h)} a las ${hora(h)}`)
    .join('\n');
  return [
    `${saludo}, te escribimos de ${MARCA.nombre}.`,
    '',
    `Lo sentimos: la hora que pediste para ver el ${coche} no ha podido ser.`,
    '',
    'Quien tiene el coche nos propone estas:',
    lista,
    '',
    'Contéstanos con el número que mejor te venga y te la dejamos confirmada. Si ninguna te sirve, dínoslo y buscamos otra.',
  ].join('\n');
}

/**
 * Deja constancia de un paso de la visita.
 *
 * El estado dice dónde está; esto dice cómo ha llegado. Sin ello, quien abre una
 * cita no sabe si ya se llamó al concesionario, y acaba llamando dos veces o
 * ninguna.
 *
 * No tumba la operación si falla: perder una línea del rastro es malo, pero
 * mucho menos que dejar una cita a medio confirmar por no poder escribirla.
 */
async function apunta(
  bookingId: string,
  evento: string,
  actor: string,
  datos: Record<string, unknown> = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO visit_booking_events (booking_id, evento, actor, datos) VALUES ($1,$2,$3,$4)`,
      [bookingId, evento, actor || 'sistema', JSON.stringify(datos)]
    );
  } catch (e) {
    console.error('[visitas] no se ha podido apuntar el paso', evento, (e as Error).message);
  }
}

/** Quién está haciendo esto, para el rastro. */
const quien = (req: { actor?: { sub?: string } }) => req.actor?.sub ?? 'desconocido';

/**
 * La fecha y la hora, siempre en la del cliente.
 *
 * Sin `timeZone` se usa la del servidor, y en Vercel es UTC: a una visita de las
 * 18:00 el correo le ponía las 16:00. El ERP la enseñaba bien porque lo pinta el
 * navegador, así que las dos pantallas decían cosas distintas y solo se veía
 * mirando el correo que le llega al cliente.
 *
 * Todos los clientes están en España; el día que no sea así, esto sale de la
 * oferta y no de una constante.
 */
const ZONA = 'Europe/Madrid';
const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

/**
 * La hora como cabe en un botón de WhatsApp: veinte caracteres contados.
 *
 * Meta rechaza el mensaje entero si un botón se pasa, así que el día va
 * abreviado. «mar, 16 10:00» se entiende igual que el nombre largo.
 */
export const etiquetaDeHora = (iso: string) =>
  `${new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: ZONA })} ${hora(iso)}`.slice(0, 20);

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
    return res.json({ ok: true, data: { slots: r.rows } });
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
    return res.json({ ok: true, data: { slot: r.rows[0] } });
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
              b.meeting_place, b.meeting_contact,
              b.status, b.created_at
       FROM vehicle_visit_bookings b
       WHERE b.offer_id = $1 AND b.status != 'cancelled'
       ORDER BY b.starts_at ASC`,
      [offerId]
    );
    return res.json({ ok: true, data: { bookings: r.rows } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /visit-bookings/:bookingId/cancel  (ERP staff can cancel any booking)
/**
 * Se confirma una visita que estaba pendiente.
 *
 * Pendientes son las que cayeron en un horario que generó el sistema, no una
 * persona. Hasta que alguien dice que sí, el cliente solo sabe que la ha pedido.
 * Aquí es donde se le promete algo, y por eso es aquí donde sale el calendario.
 */
visitsRouter.post('/visit-bookings/:bookingId/confirm', requireRole(ROLES), async (req, res) => {
  const { bookingId } = req.params;
  // Dónde es y por quién preguntar. El trabajador acaba de hablar con el
  // concesionario, así que los tiene delante; se guardan porque los necesitan
  // también los recordatorios y quien abra la cita después.
  const donde        = String(req.body?.donde ?? '').trim().slice(0, 200);
  const preguntarPor = String(req.body?.preguntarPor ?? '').trim().slice(0, 120);
  try {
    const r = await query(
      `UPDATE vehicle_visit_bookings
          SET status = 'confirmed', updated_at = NOW(),
              meeting_place = $2, meeting_contact = $3
        WHERE id = $1 AND status = 'pending'
        RETURNING id, offer_id, vehicle_title, starts_at, ends_at, buyer_email, buyer_name`,
      [bookingId, donde, preguntarPor]
    );
    // Si no había ninguna pendiente con ese id, o ya estaba confirmada, no se
    // vuelve a escribir al cliente: recibir dos veces la misma confirmación
    // hace dudar de si son dos citas.
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'no_pendiente' });

    const reserva = r.rows[0] as Reserva;
    await apunta(bookingId, 'confirmada', quien(req as never), donde || preguntarPor ? { donde, preguntarPor } : {});
    let avisado = true;
    let fallo = '';
    try {
      if (!reserva.buyer_email) throw new Error('la reserva no tiene correo del cliente');
      const { subject, html } = correoDeConfirmacion(reserva, donde, preguntarPor);
      await enviar({
        to: reserva.buyer_email,
        subject,
        alClienteSiempre: true,
        html,
        attachments: [{
          filename: 'visita-popcar.ics',
          content: Buffer.from(calendarioDeLaCita(reserva)).toString('base64'),
        }],
      });
    } catch (e) {
      avisado = false;
      fallo = e instanceof Error ? e.message : String(e);
      console.error('[visitas] no se ha podido confirmar al cliente:', fallo);
    }

    return res.json({ ok: true, data: { avisado, ...(avisado ? {} : { fallo }) } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Se mueve una visita a otra hora.
 *
 * Es lo que pasa cuando el concesionario dice «ese día no, pero el jueves sí».
 * Antes había que cancelar y esperar a que el cliente volviera a pedir hora, con
 * lo que eso tiene de que no vuelva.
 *
 * La hora nueva la escribe el trabajador, no se elige de una lista: el
 * concesionario dice una hora concreta y no tiene por qué estar publicada. Se
 * crea como hueco del ERP, que es lo que es —una hora que ha puesto una persona—.
 *
 * Queda confirmada: quien tenía que aprobarla ya lo ha hecho, y ha sido él quien
 * ha propuesto esta. Al cliente se le manda el calendario y el enlace a su cita,
 * porque se la hemos movido sin preguntarle.
 */
/**
 * Poner una visita en otra hora y dejarla confirmada.
 *
 * Es lo que pasa cuando el concesionario dice «ese día no, pero el jueves sí», y
 * también cuando el cliente contesta con una de las que le propusimos. Antes
 * había que cancelar y esperar a que el cliente volviera a pedir hora, con lo que
 * eso tiene de que no vuelva.
 *
 * La hora nueva no se elige de una lista: el concesionario dice una hora concreta
 * y no tiene por qué estar publicada. Se crea como hueco del ERP, que es lo que
 * es —una hora que ha puesto una persona—.
 *
 * Queda confirmada: quien tenía que aprobarla ya lo ha hecho, y ha sido él quien
 * ha propuesto esta.
 *
 * Vive fuera de la ruta porque no la llama solo la Agenda: cuando WhatsApp esté
 * conectado, el cliente pulsará un botón en su móvil y quien aplique esa hora
 * será el webhook. Lo que pasa tiene que ser exactamente lo mismo por los dos
 * caminos, y eso solo se sostiene si el camino es uno.
 */
export async function aplicaHoraElegida(
  bookingId: string,
  startsAt: string,
  opciones: { actor: string; laEligioElCliente?: boolean; endsAt?: string; por?: string }
): Promise<
  | { ok: true; avisado: boolean; fallo?: string }
  | { ok: false; codigo: number; error: string }
> {
  const { actor, laEligioElCliente = false, endsAt = '', por = 'respuesta del cliente' } = opciones;

  if (!startsAt) return { ok: false, codigo: 400, error: 'falta la hora nueva' };
  const inicio = new Date(startsAt);
  if (Number.isNaN(inicio.getTime())) return { ok: false, codigo: 400, error: 'la hora nueva no se entiende' };
  if (inicio.getTime() < Date.now()) return { ok: false, codigo: 400, error: 'esa hora ya ha pasado' };
  // Una hora sin final se toma como una hora de duración, que es lo que dura
  // una visita en todos los huecos que genera el sistema.
  const fin = endsAt || new Date(inicio.getTime() + 3600000).toISOString();

  try {
    const actual = await query(
      `SELECT id, offer_id, vehicle_title, starts_at, ends_at, buyer_email, buyer_name,
              availability_id, token_buyer, status
         FROM vehicle_visit_bookings WHERE id = $1`,
      [bookingId]
    );
    if (!actual.rows.length) return { ok: false, codigo: 404, error: 'no_encontrada' };
    const reserva = actual.rows[0];
    if (reserva.status === 'cancelled') {
      return { ok: false, codigo: 409, error: 'esa visita está cancelada' };
    }
    const horaAnterior = String(reserva.starts_at);

    // Nadie más a esa hora con ese coche.
    //
    // El hueco se crea si no existe, así que sin esta comprobación se podían
    // poner dos visitas al mismo coche a la misma hora sin que nada se quejara,
    // y eso se descubre cuando se presentan los dos.
    const ocupada = await query(
      `SELECT id FROM vehicle_visit_bookings
        WHERE offer_id = $1 AND starts_at = $2 AND id != $3 AND status IN ('pending','confirmed')
        LIMIT 1`,
      [reserva.offer_id, inicio.toISOString(), bookingId]
    );
    if (ocupada.rows.length) {
      return { ok: false, codigo: 409, error: 'ya hay otra visita a ese coche a esa hora' };
    }

    // El hueco de la hora nueva. Si ya existe uno libre a esa hora se aprovecha,
    // y si no se crea: así no se llena la tabla de duplicados cuando se mueve una
    // visita a un hueco que ya estaba publicado.
    const existente = await query(
      `SELECT id FROM vehicle_visit_availability
        WHERE offer_id = $1 AND starts_at = $2 AND status = 'available' LIMIT 1`,
      [reserva.offer_id, inicio.toISOString()]
    );
    const nuevoHueco = existente.rows.length
      ? existente.rows[0].id
      : (await query(
          `INSERT INTO vehicle_visit_availability (offer_id, starts_at, ends_at, source, status)
           VALUES ($1, $2, $3, 'erp', 'available') RETURNING id`,
          [reserva.offer_id, inicio.toISOString(), fin]
        )).rows[0].id;

    await query(`UPDATE vehicle_visit_availability SET status = 'booked' WHERE id = $1`, [nuevoHueco]);
    // El de antes vuelve a estar libre: si no, la hora que se deja se pierde.
    if (reserva.availability_id) {
      await query(`UPDATE vehicle_visit_availability SET status = 'available' WHERE id = $1`, [reserva.availability_id]);
    }

    // Se borran las marcas de aviso: la cita es otra, y si no se limpian nadie
    // recibiría el recordatorio de la víspera porque ya se dio por mandado.
    const movida = await query(
      `UPDATE vehicle_visit_bookings
          SET availability_id = $2, starts_at = $3, ends_at = $4,
              status = 'confirmed', updated_at = NOW(),
              reminder_sent_at = NULL, reminder_day_of_sent_at = NULL, followup_sent_at = NULL
        WHERE id = $1
        RETURNING id, offer_id, vehicle_title, starts_at, ends_at, buyer_email, buyer_name,
                  meeting_place, meeting_contact`,
      [bookingId, nuevoHueco, inicio.toISOString(), fin]
    );

    const nueva = movida.rows[0] as Reserva & { meeting_place: string | null; meeting_contact: string | null };

    // No es lo mismo moverla nosotros que confirmarle la que ha elegido él.
    // Cambia el rastro y cambia lo que se le dice: a quien ha contestado «la 2»
    // por WhatsApp no se le escribe «hemos movido tu visita», se le confirma.
    if (laEligioElCliente) {
      await apunta(bookingId, 'cliente_respondio', 'cliente', { eligio: inicio.toISOString(), por });
      await apunta(bookingId, 'confirmada', actor, { por });
    } else {
      await apunta(bookingId, 'movida', actor, { de: horaAnterior, a: inicio.toISOString() });
    }
    let avisado = true;
    let fallo = '';
    try {
      if (!nueva.buyer_email) throw new Error('la reserva no tiene correo del cliente');
      const enlace = reserva.token_buyer
        ? `${config.PUBLIC_SITE_URL.replace(/\/$/, '')}/mi-cita?id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(String(reserva.token_buyer))}`
        : '';
      const { subject, html } = laEligioElCliente
        ? correoDeConfirmacion(nueva, nueva.meeting_place || '', nueva.meeting_contact || '')
        : correoDeCambioDeHora(nueva, horaAnterior, enlace);
      await enviar({
        to: nueva.buyer_email,
        subject,
        alClienteSiempre: true,
        html,
        attachments: [{
          filename: 'visita-popcar.ics',
          content: Buffer.from(calendarioDeLaCita(nueva)).toString('base64'),
        }],
      });
    } catch (e) {
      avisado = false;
      fallo = e instanceof Error ? e.message : String(e);
      console.error('[visitas] no se ha podido avisar del cambio de hora:', fallo);
    }

    return { ok: true, avisado, ...(avisado ? {} : { fallo }) };
  } catch (e: any) {
    return { ok: false, codigo: 500, error: e.message };
  }
}

/** La Agenda mueve una visita a otra hora. */
visitsRouter.post('/visit-bookings/:bookingId/reprogramar', requireRole(ROLES), async (req, res) => {
  const r = await aplicaHoraElegida(
    req.params.bookingId,
    String(req.body?.startsAt ?? '').trim(),
    {
      actor: quien(req as never),
      laEligioElCliente: req.body?.laEligioElCliente === true,
      endsAt: String(req.body?.endsAt ?? '').trim(),
    }
  );
  if (!r.ok) return res.status(r.codigo).json({ ok: false, error: r.error });
  return res.json({ ok: true, data: { avisado: r.avisado, ...(r.avisado ? {} : { fallo: r.fallo }) } });
});

/**
 * Los pasos que se pueden apuntar a mano desde la Agenda.
 *
 * Confirmar, mover y cancelar dejan su rastro solos porque cambian algo. Estos
 * dos no cambian nada en la base: son cosas que ha hecho una persona por
 * teléfono, y si no se apuntan no existen para nadie más.
 */
const PASOS_A_MANO: Record<string, true> = {
  concesionario_contactado: true,
  horas_propuestas: true,
  concesionario_avisado: true,
  // Una nota de quien lleva la cita. Va como paso y no como un campo editable a
  // propósito: así queda quién la escribió y cuándo, y nadie pisa la de otro al
  // guardar. Lo que se apunta de una gestión no se corrige, se añade.
  nota: true,
};

/**
 * El concesionario no puede a esa hora, pero propone otras.
 *
 * En vez de mover la cita por nuestra cuenta y decirle al cliente dónde tiene
 * que estar, se le pregunta. La cita se queda pendiente hasta que conteste: no
 * se le promete nada que no haya elegido él.
 *
 * Se intenta mandar por WhatsApp. Si no está configurado —o Meta lo rechaza— se
 * devuelve el texto para que lo mande una persona. El paso queda apuntado en los
 * dos casos, con cuál de las dos cosas pasó.
 */
visitsRouter.post('/visit-bookings/:bookingId/proponer', requireRole(ROLES), async (req, res) => {
  const { bookingId } = req.params;
  // Fechas de verdad, no texto: es lo que permite aplicarlas cuando el cliente
  // elija una, sin que nadie las vuelva a teclear.
  const horas = (Array.isArray(req.body?.horas) ? req.body.horas : [])
    .map((h: unknown) => String(h ?? '').trim())
    .filter((h: string) => h && !Number.isNaN(new Date(h).getTime()) && new Date(h).getTime() > Date.now())
    .slice(0, 6);

  if (!horas.length) {
    return res.status(400).json({ ok: false, error: 'no has puesto ninguna hora válida y futura' });
  }

  try {
    const r = await query(
      `SELECT id, offer_id, vehicle_title, starts_at, ends_at, buyer_name, buyer_phone,
              buyer_email, token_buyer, status
         FROM vehicle_visit_bookings WHERE id = $1`,
      [bookingId]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'no_encontrada' });
    const b = r.rows[0];
    // A una cancelada no se le proponen horas: el correo le diría que elija
    // para una visita que ya no existe.
    if (b.status === 'cancelled') {
      return res.status(409).json({ ok: false, error: 'esa visita está cancelada' });
    }

    const texto = mensajeDeOtrasHoras(
      String(b.vehicle_title || 'vehículo'),
      String(b.buyer_name || '').split(' ')[0],
      horas
    );

    await apunta(bookingId, 'horas_propuestas', quien(req as never), { horas });

    // Con botones cuando caben: el cliente pulsa y la hora se aplica sola, sin
    // que nadie lea el WhatsApp y lo teclee. Con más de tres, Meta no admite
    // botones y sale el texto numerado de siempre.
    const envio = await mandaOpciones(
      String(b.buyer_phone || ''),
      texto,
      horas.map((h: string) => ({ id: botonDeHora(bookingId, h), texto: etiquetaDeHora(h) }))
    );
    if (envio.enviado) {
      await apunta(bookingId, 'whatsapp_enviado', quien(req as never), { horas });
    }

    // Y el correo, siempre. WhatsApp puede no estar conectado, puede no tener
    // teléfono, o puede no leerlo: el correo con las horas pinchables es el
    // camino que funciona hoy, y el que cierra la cita sin que nadie teclee.
    let correo = false;
    let falloCorreo = '';
    try {
      if (!b.buyer_email) throw new Error('la reserva no tiene correo del cliente');
      if (!b.token_buyer) throw new Error('la reserva no tiene enlace propio');
      const sitio = config.PUBLIC_SITE_URL.replace(/\/$/, '');
      const { subject, html } = correoDeOtrasHoras(b as Reserva, horas, (h: string) =>
        `${sitio}/elegir-hora?id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(String(b.token_buyer))}&h=${encodeURIComponent(h)}`
      );
      await enviar({ to: String(b.buyer_email), subject, alClienteSiempre: true, html });
      correo = true;
      await apunta(bookingId, 'correo_propuesta', 'sistema', { a: b.buyer_email, horas });
    } catch (e) {
      falloCorreo = e instanceof Error ? e.message : String(e);
      console.error('[visitas] no se ha podido mandar el correo con las horas:', falloCorreo);
    }

    // El texto se devuelve siempre, salga o no: si salió, quien lo mandó quiere
    // saber qué se ha dicho en su nombre.
    return res.json({
      ok: true,
      data: {
        enviado: envio.enviado,
        motivo: envio.motivo,
        texto,
        telefono: b.buyer_phone || '',
        correo,
        falloCorreo,
        email: b.buyer_email || '',
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

visitsRouter.post('/visit-bookings/:bookingId/paso', requireRole(ROLES), async (req, res) => {
  const { bookingId } = req.params;
  const evento = String(req.body?.evento ?? '').trim();
  if (!PASOS_A_MANO[evento]) return res.status(400).json({ ok: false, error: 'ese paso no se apunta a mano' });

  const existe = await query(`SELECT id FROM vehicle_visit_bookings WHERE id = $1`, [bookingId]);
  if (!existe.rows.length) return res.status(404).json({ ok: false, error: 'no_encontrada' });

  const nota = String(req.body?.nota ?? '').trim().slice(0, 1000);
  // Una nota vacía no es un paso: sería una línea del rastro que no dice nada.
  if (evento === 'nota' && !nota) {
    return res.status(400).json({ ok: false, error: 'la nota está vacía' });
  }
  await apunta(bookingId, evento, quien(req as never), nota ? { nota } : {});
  return res.json({ ok: true });
});

/** El rastro de una visita, en orden. */
visitsRouter.get('/visit-bookings/:bookingId/pasos', requireRole(ROLES), async (req, res) => {
  // Un identificador que no es un UUID no es una cita que no existe: es una
  // consulta que Postgres no puede ni ejecutar, y salia un 500 como si el
  // servidor estuviera roto.
  if (!ES_UUID.test(req.params.bookingId)) {
    return res.status(400).json({ ok: false, error: 'ese identificador no es una cita' });
  }
  try {
    const r = await query(
      `SELECT evento, actor, datos, created_at
         FROM visit_booking_events WHERE booking_id = $1 ORDER BY created_at ASC`,
      [req.params.bookingId]
    );
    return res.json({ ok: true, data: { pasos: r.rows } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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
    await apunta(bookingId, 'cancelada', quien(req as never), motivo ? { motivo } : {});

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

    return res.json({ ok: true, data: { avisado, ...(avisado ? {} : { fallo }) } });
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
             b.meeting_place, b.meeting_contact,
             a.source AS slot_source,
             -- Quién vende y dónde está su teléfono.
             --
             -- Al vendedor hay que llamarle a mano, siempre, y la Agenda no decía
             -- ni quién era: había que ir a buscar la oferta. De un concesionario o
             -- un profesional, el vendedor es un nombre y el teléfono está en el
             -- anuncio de origen. De un particular, es su correo.
             o.seller, o.seller_type, o.source_url, o.seller_phone, o.seller_contact
      FROM vehicle_visit_bookings b
      -- LEFT: una visita puede quedarse sin hueco si alguien lo borra, y con
      -- JOIN normal desaparecia de la Agenda sin que nadie lo notara.
      LEFT JOIN vehicle_visit_availability a ON a.id = b.availability_id
      -- LEFT también: una oferta puede haberse despublicado y la visita sigue.
      LEFT JOIN moveadvisor_marketplace_vo_offers o ON o.id = b.offer_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let pi = 1;
    if (status) { sql += ` AND b.status = $${pi++}`; params.push(status); }
    if (from)   { sql += ` AND b.starts_at >= $${pi++}`; params.push(from); }
    if (to)     { sql += ` AND b.starts_at <= $${pi++}`; params.push(to); }
    sql += ' ORDER BY b.starts_at ASC LIMIT 200';
    const r = await query(sql, params);
    return res.json({ ok: true, data: { bookings: r.rows } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Se apunta dónde es la visita y por quién hay que preguntar.
 *
 * Se piden al confirmar, pero muchas veces no se saben todavía: el concesionario
 * dice que sí por teléfono y la dirección concreta llega después. Sin esto, ese
 * dato se quedaba en la cabeza del que llamó y el cliente no lo recibía nunca.
 *
 * Vale para una cita ya confirmada y también para una pendiente. Y se puede
 * cambiar: una dirección mal apuntada tiene que poder corregirse.
 *
 * Escribir al cliente es una decisión de quien lo apunta, no automática. Si la
 * cita todavía está pendiente no se le escribe: aún no se le ha prometido nada.
 */
visitsRouter.post('/visit-bookings/:bookingId/lugar', requireRole(ROLES), async (req, res) => {
  const { bookingId } = req.params;
  const donde        = String(req.body?.donde ?? '').trim().slice(0, 200);
  const preguntarPor = String(req.body?.preguntarPor ?? '').trim().slice(0, 120);
  const avisar       = req.body?.avisar === true;
  if (!donde && !preguntarPor) return res.status(400).json({ ok: false, error: 'no hay nada que apuntar' });

  try {
    const r = await query(
      `UPDATE vehicle_visit_bookings
          SET meeting_place = $2, meeting_contact = $3, updated_at = NOW()
        WHERE id = $1 AND status != 'cancelled'
        RETURNING id, offer_id, vehicle_title, starts_at, ends_at, buyer_email, buyer_name, status`,
      [bookingId, donde, preguntarPor]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'no_encontrada' });

    const reserva = r.rows[0] as Reserva & { status: string };
    await apunta(bookingId, 'lugar', quien(req as never), { donde, preguntarPor });

    // Al cliente solo se le escribe si la cita está confirmada y le han dicho
    // que se le escriba. Mandarle la dirección de algo que todavía no es suyo
    // se lee como una confirmación, y no lo es.
    if (!avisar || reserva.status !== 'confirmed') {
      return res.json({ ok: true, data: { avisado: false, escrito: false } });
    }

    let avisado = true;
    let fallo = '';
    try {
      if (!reserva.buyer_email) throw new Error('la reserva no tiene correo del cliente');
      const { subject, html } = correoDeLugar(reserva, donde, preguntarPor);
      await enviar({ to: reserva.buyer_email, subject, alClienteSiempre: true, html });
      await apunta(bookingId, 'lugar_avisado', 'sistema', { a: reserva.buyer_email });
    } catch (e) {
      avisado = false;
      fallo = e instanceof Error ? e.message : String(e);
      console.error('[visitas] no se ha podido mandar el sitio al cliente:', fallo);
    }
    return res.json({ ok: true, data: { avisado, escrito: true, ...(avisado ? {} : { fallo }) } });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
