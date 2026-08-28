/**
 * El correo que recibe alguien cuando le cancelan la visita.
 *
 * Hasta ahora no recibía nada: cancelar desde el ERP solo tocaba la base, y
 * quien había reservado se presentaba igual. La única defensa era acordarse de
 * escribirle a mano.
 *
 * Lo que se comprueba aquí es que el correo sirva para lo único que tiene que
 * servir: que quien lo lea sepa qué visita se ha caído y pueda pedir otra sin
 * escribir a nadie.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { correoDeCancelacion, correoDeConfirmacion, correoDeCambioDeHora, calendarioDeLaCita, mensajeDeOtrasHoras } from './visits.js';

const reserva = {
  id: 'b-1',
  offer_id: 'erp-123',
  vehicle_title: 'Toyota C-HR 1.8 125H Advance',
  starts_at: '2026-09-15T10:00:00.000Z',
  buyer_email: 'cliente@example.com',
  buyer_name: 'Juan',
};

describe('el correo de cancelación', () => {
  test('dice qué coche era, en el asunto', () => {
    const { subject } = correoDeCancelacion(reserva, '');
    assert.ok(subject.includes('Toyota C-HR'), 'sin el coche, quien tiene varias visitas no sabe cuál se ha caído');
    assert.ok(subject.toLowerCase().includes('cancelado'));
  });

  test('lleva el día y la hora que se han caído', () => {
    const { html } = correoDeCancelacion(reserva, '');
    assert.ok(html.includes('septiembre'), 'la fecha va en palabras, no en ISO');
    assert.ok(/1[012]:00/.test(html), 'y con su hora');
  });

  test('ofrece pedir otra hora, con enlace al anuncio', () => {
    const { html } = correoDeCancelacion(reserva, '');
    assert.ok(html.includes('/marketplace-vo/erp-123'), 'el enlace lleva a esa oferta, no al listado');
    assert.ok(html.includes('Pedir otra hora'));
  });

  test('el motivo sale si se da, y no estorba si no', () => {
    const con = correoDeCancelacion(reserva, 'El coche ya se ha vendido').html;
    const sin = correoDeCancelacion(reserva, '').html;
    assert.ok(con.includes('El coche ya se ha vendido'));
    assert.ok(!sin.includes('Motivo'), 'sin motivo no se enseña un hueco vacío');
  });

  test('el motivo se escapa: lo escribe una persona', () => {
    const { html } = correoDeCancelacion(reserva, '<script>alert(1)</script>');
    assert.ok(!html.includes('<script>'), 'lo que teclea alguien no puede llegar como etiqueta');
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('sin nombre no saluda en falso', () => {
    const { html } = correoDeCancelacion({ ...reserva, buyer_name: null }, '');
    assert.ok(!html.includes('Hola ,'), 'ni «Hola ,» ni «Hola null»');
    assert.ok(!html.includes('null'));
  });

  test('sin título del coche no deja el hueco', () => {
    const { subject, html } = correoDeCancelacion({ ...reserva, vehicle_title: null }, '');
    assert.ok(!subject.includes('null'));
    assert.ok(html.includes('el vehículo'));
  });

  test('va en tablas y con estilos a mano, que es lo que aguanta en Gmail', () => {
    const { html } = correoDeCancelacion(reserva, 'x');
    assert.ok(html.includes('<table'));
    assert.ok(!/<style[\s>]/i.test(html), 'Gmail quita las hojas de estilo');
    assert.ok(!/display:\s*(flex|grid)/i.test(html), 'ningún cliente de correo entiende flex ni grid');
  });
});

describe('el correo de confirmación', () => {
  test('dice que está confirmada y de qué coche', () => {
    const { subject, html } = correoDeConfirmacion(reserva);
    assert.ok(subject.includes('confirmada'));
    assert.ok(subject.includes('Toyota C-HR'));
    assert.ok(html.includes('septiembre'));
  });

  test('sin nombre no saluda en falso', () => {
    const { html } = correoDeConfirmacion({ ...reserva, buyer_name: null });
    assert.ok(!html.includes('Hola ,'));
    assert.ok(!html.includes('null'));
  });
});

describe('el calendario que se adjunta al confirmar', () => {
  test('es un calendario que un cliente de correo entiende', () => {
    const ics = calendarioDeLaCita(reserva);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
    assert.ok(ics.includes('\r\n'), 'el formato exige retorno de carro, no solo salto');
  });

  test('lleva la hora de la cita, en el formato del calendario', () => {
    const ics = calendarioDeLaCita(reserva);
    assert.ok(ics.includes('DTSTART:20260915T100000Z'));
  });

  test('si no viene el final, dura una hora', () => {
    const ics = calendarioDeLaCita({ ...reserva, ends_at: undefined });
    assert.ok(ics.includes('DTEND:20260915T110000Z'));
  });

  test('el identificador va contra popcar.tech, no contra la marca vieja', () => {
    const ics = calendarioDeLaCita(reserva);
    assert.ok(ics.includes('UID:b-1@popcar.tech'));
    assert.ok(!/carswise/i.test(ics));
  });
});

describe('el correo de cuando se mueve la visita', () => {
  const ANTES = '2026-09-15T10:00:00.000Z';
  const nueva = { ...reserva, starts_at: '2026-09-18T16:00:00.000Z' };

  test('el asunto avisa de que cambia, no parece una cita nueva', () => {
    const { subject } = correoDeCambioDeHora(nueva, ANTES, '');
    assert.ok(/cambia de hora/i.test(subject));
    assert.ok(subject.includes('Toyota C-HR'));
  });

  test('lleva las dos horas: la que era y la que es', () => {
    const { html } = correoDeCambioDeHora(nueva, ANTES, '');
    assert.ok(html.includes('Ahora es'), 'sin la nueva no sirve de nada');
    assert.ok(html.includes('Antes era'), 'sin la vieja, quien lo lee no sabe que ha cambiado');
    assert.ok(/18 de septiembre/.test(html));
    assert.ok(/15 de septiembre/.test(html));
  });

  test('ofrece elegir otra, porque se la hemos movido sin preguntar', () => {
    const { html } = correoDeCambioDeHora(nueva, ANTES, 'https://www.popcar.tech/mi-cita?id=b-1&token=t');
    assert.ok(html.includes('elige otra'));
    assert.ok(html.includes('/mi-cita?id=b-1'));
  });

  test('sin enlace no deja un botón roto', () => {
    const { html } = correoDeCambioDeHora(nueva, ANTES, '');
    assert.ok(!html.includes('elige otra'));
  });

  test('el calendario que se adjunta lleva la hora nueva', () => {
    assert.ok(calendarioDeLaCita(nueva).includes('DTSTART:20260918T160000Z'));
  });
});

describe('el WhatsApp de las otras horas', () => {
  // Fechas de verdad: es lo que luego se puede aplicar sin volver a teclear.
  const horas = ['2026-09-04T10:00:00.000Z', '2026-09-04T17:00:00.000Z', '2026-09-05T12:00:00.000Z'];

  test('dice que la suya no ha podido ser, no solo las nuevas', () => {
    const m = mensajeDeOtrasHoras('Toyota C-HR', 'Juan', horas);
    assert.match(m, /no ha podido ser/);
    assert.match(m, /Toyota C-HR/);
  });

  test('las horas van numeradas, para poder contestar «la 2»', () => {
    const m = mensajeDeOtrasHoras('Toyota C-HR', 'Juan', horas);
    // La hora se enseña en la del cliente, no en UTC: las 10:00 de un ISO de
    // verano son las 12:00 aquí, y decirle 10:00 sería citarle dos horas antes.
    assert.match(m, /1\. viernes, 4 de septiembre a las \d\d:\d\d/);
    assert.match(m, /3\. sábado, 5 de septiembre/);
  });

  test('deja salida si ninguna le sirve', () => {
    assert.match(mensajeDeOtrasHoras('x', 'Juan', horas), /ninguna te sirve/);
  });

  test('sin nombre no saluda en falso', () => {
    const m = mensajeDeOtrasHoras('x', '', horas);
    assert.ok(!m.includes('Hola ,'));
    assert.ok(m.startsWith('Hola,'));
  });

  test('va en texto plano: es WhatsApp, no un correo', () => {
    const m = mensajeDeOtrasHoras('x', 'Juan', horas);
    assert.ok(!m.includes('<'), 'nada de etiquetas');
    assert.ok(!m.includes('&nbsp;'));
  });
});
