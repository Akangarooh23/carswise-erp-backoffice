/**
 * El flujo entero de una visita, de punta a punta, en el lado del ERP.
 *
 * Las otras pruebas de visitas miran piezas sueltas: cómo queda un correo, qué
 * devuelve una ruta. Esta recorre el camino como lo recorre una persona —llega
 * una visita, se llama a quien tiene el coche, se proponen horas, se aplica la
 * que eligió, se confirma— y comprueba lo que va quedando por detrás: el estado
 * de la cita, el rastro y lo que sale hacia el cliente.
 *
 * Se hace dos veces, una por sección del marketplace: **concesionario** y
 * **ex-renting**. El camino es el mismo código, y precisamente por eso hay que
 * recorrerlo con los dos: lo que cambia es quién vende —un nombre de empresa que
 * no es una dirección de correo— y de ahí salen los fallos.
 *
 * Se levanta un servidor de verdad con el router de verdad. Lo simulado es solo
 * la base y el envío de correo: ni se escribe en Postgres ni sale ningún correo.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// ── Las dos secciones que se recorren ────────────────────────────────────────
const SECCIONES = [
  {
    nombre: 'concesionario',
    oferta: 'erp-9',
    vende: 'Modrive',
    tipo: 'concesionario',
    // Un concesionario tiene su anuncio publicado, con su teléfono dentro.
    origen: 'https://www.modrive.com/coches-ocasion/peugeot-rifter',
  },
  {
    nombre: 'ex-renting',
    oferta: 'astara-1c4pjdcwxpp039070',
    vende: 'Astara',
    tipo: 'professional',
    // El «origen» de un ex-renting es un informe de inspección, no un anuncio.
    origen: 'https://cdn-prod.dekra-starfleet.com/secure/iop-bli/reports/05bc91cc',
  },
];

// Un UUID de verdad: las rutas no consultan con un identificador que Postgres
// no puede ni leer, y con 'b-1' el rastro contestaba 400.
const CITA = '3f1a6f5e-9c2b-4d7a-8e10-5b6c7d8e9f01';
const CLIENTE = 'cliente@example.com';
const HORA_PEDIDA = '2026-09-15T08:00:00.000Z';
/** Una hora que ya paso, para las visitas que se cierran. */
const AYER = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
const OTRAS_HORAS = ['2026-09-17T08:00:00.000Z', '2026-09-18T14:00:00.000Z'];

// ── El estado que va guardando la base simulada ─────────────────────────────
interface Fila { [k: string]: unknown }
let seccion = SECCIONES[0];
let reserva: Fila;
let pasos: { evento: string; actor: string; datos: Fila }[] = [];
/** Si la oferta sigue en el escaparate. */
let ofertaPublicada = true;
/** Y si la fila de la oferta existe siquiera: pudo borrarse. */
let ofertaExiste = true;
/** Los telefonos apuntados, por vendedor. */
let vendedores: Record<string, { telefono: string; contacto: string | null }> = {};
let correos: { to: string; subject: string; conCalendario: boolean }[] = [];

const queryOriginal = pg.Pool.prototype.query;
const fetchOriginal = globalThis.fetch;
let servidor: Server;
let base: string;
let pase: string;

function reinicia() {
  reserva = {
    id: CITA,
    offer_id: seccion.oferta,
    vehicle_title: 'Toyota C-HR',
    starts_at: HORA_PEDIDA,
    ends_at: '2026-09-15T09:00:00.000Z',
    buyer_email: CLIENTE,
    buyer_name: 'Juan',
    buyer_phone: '600000000',
    status: 'pending',
    availability_id: 's-vieja',
    token_buyer: 't-buena',
    meeting_place: '',
    meeting_contact: '',
    seller: seccion.vende,
    seller_type: seccion.tipo,
    source_url: seccion.origen,
    seller_phone: '910000000',
    seller_contact: 'Sergio',
    resultado: null,
  };
  pasos = [];
  correos = [];
  ofertaPublicada = true;
  ofertaExiste = true;
  vendedores = {};
}

before(async () => {
  // ── La base, simulada ─────────────────────────────────────────────────────
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '');
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) => Promise.resolve({ rows, rowCount: rows.length } as never);

    // Los pasos del rastro.
    if (/INSERT INTO visit_booking_events/i.test(t)) {
      const m = t.match(/VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4\)/);
      if (m) pasos.push({ evento: String(p[1]), actor: String(p[2]), datos: JSON.parse(String(p[3])) });
      else {
        const inline = t.match(/VALUES\s*\(\$1,'([a-z_]+)','([a-z_]+)'/i);
        pasos.push({ evento: inline?.[1] ?? '?', actor: inline?.[2] ?? '?', datos: JSON.parse(String(p[1] ?? '{}')) });
      }
      return responde([]);
    }
    if (/FROM visit_booking_events/i.test(t)) {
      if (/datos/i.test(t) && /horas_propuestas/i.test(t)) {
        const ultima = [...pasos].reverse().find((x) => x.evento === 'horas_propuestas');
        return responde(ultima ? [{ datos: ultima.datos }] : []);
      }
      return responde(pasos.map((x) => ({ ...x, created_at: new Date().toISOString() })));
    }

    // ¿Hay otra visita a esa hora? Nunca, en esta historia.
    if (/SELECT id FROM vehicle_visit_bookings/i.test(t) && /id != /i.test(t)) return responde([]);

    // La reserva.
    if (/FROM vehicle_visit_bookings/i.test(t) && /SELECT/i.test(t)) {
      if (/status = 'pending'/i.test(t) && reserva.status !== 'pending') return responde([]);
      if (/status != 'cancelled'/i.test(t) && reserva.status === 'cancelled') return responde([]);
      return responde([{ ...reserva }]);
    }
    if (/UPDATE vehicle_visit_bookings/i.test(t)) {
      if (/status = 'confirmed'/i.test(t)) reserva.status = 'confirmed';
      if (/status = 'cancelled'/i.test(t)) reserva.status = 'cancelled';
      if (/meeting_place = \$2/.test(t)) { reserva.meeting_place = p[1]; reserva.meeting_contact = p[2]; }
      if (/resultado = \$2/.test(t)) reserva.resultado = p[1];
      if (/starts_at = \$3/.test(t)) { reserva.starts_at = p[2]; reserva.ends_at = p[3]; }
      if (/availability_id = \$1/.test(t)) { reserva.starts_at = p[1]; reserva.ends_at = p[2]; }
      return responde([{ ...reserva }]);
    }

    // El numero de serie del proveedor nuevo. Sin esto, la ruta revienta
    // con un 500 y el fallo no dice de que.
    if (/FROM erp_proveedores/i.test(t) && /MAX\(substring/i.test(t)) return responde([{ ultimo: 0 }]);
    // El telefono de quien vende, que ahora va a su ficha de proveedor.
    if (/SELECT id FROM erp_proveedores WHERE clave/i.test(t)) {
      const ya = vendedores[String(p[0])];
      return responde(ya ? [{ id: 'PRV-' + String(p[0]) }] : []);
    }
    if (/INSERT INTO erp_proveedores/i.test(t)) {
      // La clave es el segundo parametro; el nombre, el primero.
      vendedores[String(p[2])] = { telefono: String(p[3]), contacto: (p[4] ? String(p[4]) : null) };
      return responde([]);
    }
    if (/UPDATE erp_proveedores/i.test(t) && /telefono = \$2/.test(t)) {
      const clave = String(p[0]).replace(/^PRV-/, '');
      vendedores[clave] = { telefono: String(p[1]), contacto: (p[2] ? String(p[2]) : vendedores[clave]?.contacto ?? null) };
      return responde([]);
    }
    if (/FROM vehicle_visit_bookings b/i.test(t) && /o\.seller/i.test(t) && /WHERE b\.id/i.test(t)) {
      return responde([{ seller: reserva.seller }]);
    }

    // El escaparate: si el coche ya no esta, se quita de la vista.
    if (/UPDATE moveadvisor_marketplace_vo_offers/i.test(t) && /is_active = FALSE/i.test(t)) {
      if (!ofertaExiste) return Promise.resolve({ rows: [], rowCount: 0 } as never);
      ofertaPublicada = false;
      return Promise.resolve({ rows: [], rowCount: 1 } as never);
    }

    // Los huecos.
    if (/SELECT id FROM vehicle_visit_availability/i.test(t)) return responde([]);
    if (/INSERT INTO vehicle_visit_availability/i.test(t)) return responde([{ id: 's-nueva' }]);
    return responde([]);
  } as never;

  // ── El correo, interceptado ───────────────────────────────────────────────
  // Solo se intercepta el correo. Todo lo demás sigue saliendo de verdad: si no,
   // esta prueba se interceptaba a sí misma —sus llamadas al servidor no llegaban
   // al servidor— y todo contestaba 200 con el cuerpo vacío.
  globalThis.fetch = (async (url: unknown, opciones: { body?: string }) => {
    if (!String(url).includes('resend.com')) return (fetchOriginal as typeof fetch)(url as string, opciones as RequestInit);
    const cuerpo = JSON.parse(String(opciones?.body ?? '{}'));
    correos.push({
      to: String(cuerpo.to),
      subject: String(cuerpo.subject),
      conCalendario: Array.isArray(cuerpo.attachments) && cuerpo.attachments.length > 0,
    });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  }) as never;
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'clave-de-mentira';

  const { visitsRouter } = await import('./visits.js');
  const app = express();
  app.use(express.json());
  app.use('/api', visitsRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'apicazo@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  globalThis.fetch = fetchOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => reinicia());

/** Una llamada a la API, como la hace la Agenda. */
async function api(camino: string, cuerpo?: unknown) {
  const r = await fetch(base + camino, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pase },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string } };
}

const nombres = () => pasos.map((x) => x.evento);
const alCliente = () => correos.filter((c) => c.to.includes(CLIENTE));

for (const s of SECCIONES) {
  describe(`el flujo entero de una visita — ${s.nombre}`, () => {
    before(() => { seccion = s; });

    test('1 · llega pendiente y se apunta que se ha hablado con quien vende', async () => {
      reserva.status = 'pending';
      const r = await api(`/visit-bookings/${CITA}/paso`, { evento: 'concesionario_contactado' });
      assert.equal(r.codigo, 200);
      assert.ok(nombres().includes('concesionario_contactado'));
    });

    test('2 · se le proponen otras horas, y antes se puede leer lo que va a leer', async () => {
      const vista = await api(`/visit-bookings/${CITA}/proponer/vista`, { horas: OTRAS_HORAS });
      assert.equal(vista.codigo, 200);
      const d = vista.cuerpo.data as { correo: string; texto: string; email: string };
      assert.ok(d.correo.includes('elegir-hora'), 'el correo lleva los botones para elegir');
      assert.ok(!/concesionario/i.test(d.texto), 'el WhatsApp no da por hecho quién vende');
      assert.equal(d.email, CLIENTE);
      assert.equal(correos.length, 0, 'mirar no manda nada');
      assert.equal(pasos.length, 0, 'ni deja rastro');
    });

    test('3 · al enviarlas, salen y quedan apuntadas', async () => {
      const r = await api(`/visit-bookings/${CITA}/proponer`, { horas: OTRAS_HORAS });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.correo, true, 'el correo con las horas ha salido');
      assert.ok(nombres().includes('horas_propuestas'));
      assert.ok(nombres().includes('correo_propuesta'));
      assert.equal(alCliente().length, 1);
      assert.equal(reserva.status, 'pending', 'proponer no confirma nada');
    });

    test('4 · el cliente elige una y la visita queda confirmada, con su calendario', async () => {
      await api(`/visit-bookings/${CITA}/proponer`, { horas: OTRAS_HORAS });
      correos = [];
      const r = await api(`/visit-bookings/${CITA}/reprogramar`, {
        startsAt: OTRAS_HORAS[1], laEligioElCliente: true,
      });
      assert.equal(r.codigo, 200);
      assert.equal(reserva.status, 'confirmed');
      assert.equal(reserva.starts_at, OTRAS_HORAS[1], 'y a la hora que eligió él');
      assert.ok(nombres().includes('cliente_respondio'));
      assert.ok(nombres().includes('confirmada'));
      const suyo = alCliente()[0];
      assert.ok(suyo, 'tiene que enterarse');
      assert.ok(/confirmada/i.test(suyo.subject));
      assert.ok(suyo.conCalendario, 'ahora sí: la cita es cierta');
    });

    test('5 · se apunta dónde es y por quién preguntar, y se le manda', async () => {
      reserva.status = 'confirmed';
      const r = await api(`/visit-bookings/${CITA}/lugar`, {
        donde: 'Calle Mauricio Legendre 45', preguntarPor: 'Sergio', avisar: true,
      });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.avisado, true);
      assert.equal(reserva.meeting_place, 'Calle Mauricio Legendre 45');
      assert.ok(nombres().includes('lugar'));
      const suyo = alCliente()[0];
      assert.ok(!suyo.conCalendario, 'la hora no ha cambiado: no se le manda el calendario otra vez');
    });

    test('6 · y el rastro cuenta la historia entera, en orden', async () => {
      await api(`/visit-bookings/${CITA}/paso`, { evento: 'concesionario_contactado' });
      await api(`/visit-bookings/${CITA}/proponer`, { horas: OTRAS_HORAS });
      await api(`/visit-bookings/${CITA}/reprogramar`, { startsAt: OTRAS_HORAS[0], laEligioElCliente: true });
      await api(`/visit-bookings/${CITA}/paso`, { evento: 'concesionario_avisado' });

      const r = await api(`/visit-bookings/${CITA}/pasos`);
      const leidos = (r.cuerpo.data?.pasos as { evento: string }[]).map((x) => x.evento);
      for (const paso of ['concesionario_contactado', 'horas_propuestas', 'cliente_respondio', 'confirmada', 'concesionario_avisado']) {
        assert.ok(leidos.includes(paso), `falta «${paso}» en el rastro`);
      }
    });

    test('7 · si se cancela, se le dice con el motivo', async () => {
      reserva.status = 'confirmed';
      const r = await api(`/visit-bookings/${CITA}/cancel`, { motivo: 'El coche ya no está' });
      assert.equal(r.codigo, 200);
      assert.equal(reserva.status, 'cancelled');
      assert.ok(nombres().includes('cancelada'));
      const suyo = alCliente()[0];
      assert.ok(/cancelad/i.test(suyo.subject));
    });

    test('8 · a quien vende no se le escribe nunca', async () => {
      await api(`/visit-bookings/${CITA}/proponer`, { horas: OTRAS_HORAS });
      await api(`/visit-bookings/${CITA}/reprogramar`, { startsAt: OTRAS_HORAS[0], laEligioElCliente: true });
      const fuera = correos.filter((c) => !c.to.includes(CLIENTE));
      for (const c of fuera) {
        assert.ok(!new RegExp(s.vende, 'i').test(c.to), `se le ha escrito a ${s.vende}, y a quien vende se le llama a mano`);
      }
    });

    test('9 · una visita que todavia no ha pasado no se puede cerrar', async () => {
      // El boton no sale en pantalla, pero la regla la tiene que cumplir el
      // servidor: nadie deja escrito que alguien no fue a una cita que aun no
      // ha llegado.
      reserva.status = 'confirmed';
      const r = await api(`/visit-bookings/${CITA}/resultado`, { resultado: 'no_fue' });
      assert.equal(r.codigo, 409);
      assert.match(String(r.cuerpo.error), /todavia no ha empezado|todavía no ha empezado/);
      assert.equal(reserva.resultado ?? null, null);
    });

    test('10 · cuando ya ha pasado se cierra, y se puede corregir', async () => {
      reserva.status = 'confirmed';
      reserva.starts_at = AYER;

      const fue = await api(`/visit-bookings/${CITA}/resultado`, { resultado: 'fue' });
      assert.equal(fue.codigo, 200);
      assert.equal(reserva.resultado, 'fue');

      // Corregirlo deja las dos cosas en el rastro: lo que se dice ahora y lo
      // que decia antes. Si solo quedara lo nuevo, dos lineas seguidas se leen
      // como dos visitas distintas.
      const compro = await api(`/visit-bookings/${CITA}/resultado`, { resultado: 'compro' });
      assert.equal(compro.codigo, 200);
      assert.equal(reserva.resultado, 'compro');

      const cierres = pasos.filter((x) => x.evento === 'resultado');
      assert.equal(cierres.length, 2);
      assert.equal(cierres[0].datos.resultado, 'fue');
      assert.equal(cierres[1].datos.resultado, 'compro');
      assert.equal(cierres[1].datos.antes, 'fue');
    });

    test('11 · un final inventado no entra', async () => {
      reserva.status = 'confirmed';
      reserva.starts_at = AYER;
      const r = await api(`/visit-bookings/${CITA}/resultado`, { resultado: 'vendido' });
      assert.equal(r.codigo, 400);
      assert.equal(reserva.resultado ?? null, null);
    });

    test('12 · una cancelada no se cierra: no hubo visita', async () => {
      reserva.status = 'cancelled';
      reserva.starts_at = AYER;
      const r = await api(`/visit-bookings/${CITA}/resultado`, { resultado: 'no_fue' });
      assert.equal(r.codigo, 409);
      assert.equal(reserva.resultado ?? null, null);
    });

    test('13 · cancelar no quita el anuncio si no se pide', async () => {
      // Se cancela por mil motivos —el cliente no puede, el taller cierra ese
      // dia— y quitar el escaparate por eso seria una decision que nadie ha
      // tomado.
      reserva.status = 'confirmed';
      const r = await api(`/visit-bookings/${CITA}/cancel`, { motivo: 'El cliente no puede' });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.anuncioQuitado, false);
      assert.equal(ofertaPublicada, true);
      assert.ok(!nombres().includes('anuncio_quitado'));
    });

    test('14 · y si el coche ya no esta, lo quita y lo apunta', async () => {
      reserva.status = 'confirmed';
      const r = await api(`/visit-bookings/${CITA}/cancel`, {
        motivo: 'El coche ya no esta', quitarElAnuncio: true,
      });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.anuncioQuitado, true);
      assert.equal(ofertaPublicada, false, 'el anuncio sigue publicado');
      assert.ok(nombres().includes('anuncio_quitado'), 'no queda en el rastro');
      // Y al cliente se le avisa igual: quitar el anuncio no es motivo para
      // dejar de contarle que su visita se ha caido.
      assert.ok(/cancelad/i.test(alCliente()[0].subject));
    });

    test('15 · y si la oferta ya no existe, lo dice en vez de darlo por hecho', async () => {
      // Un anuncio que se cree quitado y sigue puesto trae la siguiente visita
      // al mismo coche. Si no se ha podido, hay que mandar a quitarlo a mano.
      reserva.status = 'confirmed';
      ofertaExiste = false;
      const r = await api(`/visit-bookings/${CITA}/cancel`, {
        motivo: 'El coche ya no esta', quitarElAnuncio: true,
      });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.anuncioQuitado, false);
      assert.ok(!nombres().includes('anuncio_quitado'));
    });

    test('16 · el telefono se apunta del vendedor, no del coche', async () => {
      // Un concesionario con cuarenta coches necesitaba el telefono cuarenta
      // veces, y la primera visita a cada coche nuevo se quedaba sin a quien
      // llamar.
      const r = await api(`/visit-bookings/${CITA}/telefono-del-vendedor`, {
        telefono: '976 000 111', contacto: 'Marta',
      });
      assert.equal(r.codigo, 200);
      assert.equal(r.cuerpo.data?.vendedor, s.vende);
      const suyo = vendedores[s.vende.toLowerCase()];
      assert.ok(suyo, 'no ha quedado guardado en la ficha del vendedor');
      assert.equal(suyo.telefono, '976 000 111');
      assert.equal(suyo.contacto, 'Marta');
      assert.ok(nombres().includes('telefono_del_vendedor'));
    });

    test('17 · sin telefono no se guarda nada', async () => {
      const r = await api(`/visit-bookings/${CITA}/telefono-del-vendedor`, { telefono: '   ' });
      assert.equal(r.codigo, 400);
      assert.equal(vendedores[s.vende.toLowerCase()], undefined);
    });

    test('18 · y si no se sabe quien vende, se dice en vez de guardarlo en el aire', async () => {
      // Con el nombre vacio se guardaria una fila que luego saldria en todas
      // las ofertas que tampoco tienen vendedor.
      reserva.seller = null;
      const r = await api(`/visit-bookings/${CITA}/telefono-del-vendedor`, { telefono: '976 000 111' });
      assert.equal(r.codigo, 409);
      assert.equal(Object.keys(vendedores).length, 0);
    });
  });
}
