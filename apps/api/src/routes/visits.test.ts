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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { correoDeCancelacion, correoDeConfirmacion, correoDeCambioDeHora, correoDeLugar, correoDeOtrasHoras, calendarioDeLaCita, mensajeDeOtrasHoras } from './visits.js';

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

describe('lo que se le dice al cliente para cambiar o cancelar', () => {
  test('le manda a su panel, no a contestar el correo', () => {
    const { html } = correoDeConfirmacion(reserva, 'Calle Mauricio Legendre 45', 'Sergio');
    assert.ok(html.includes('Solicitudes'), 'ahí tiene los botones de cambiar la hora y de cancelar');
    assert.ok(!html.includes('responde a este correo'), 'pedirle que conteste un correo es pedirle que espere a que alguien lo lea');
  });
});

describe('el correo de dónde es la visita', () => {
  test('lleva la dirección y por quién preguntar', () => {
    const { subject, html } = correoDeLugar(reserva, 'Calle Mauricio Legendre 45', 'Sergio Casares');
    assert.ok(subject.includes('Toyota C-HR'));
    assert.ok(html.includes('Calle Mauricio Legendre 45'));
    assert.ok(html.includes('Sergio Casares'));
  });

  test('no vuelve a decir que está confirmada', () => {
    const { subject, html } = correoDeLugar(reserva, 'Calle Mauricio Legendre 45', '');
    assert.ok(!subject.toLowerCase().includes('confirmada'), 'ya lo estaba; repetirlo hace dudar de si son dos citas');
    assert.ok(!html.includes('BEGIN:VCALENDAR'));
  });

  test('mantiene el día y la hora que ya tenía', () => {
    const { html } = correoDeLugar(reserva, 'Un sitio', '');
    assert.ok(html.includes('septiembre'));
    assert.ok(/1[012]:00/.test(html), 'la hora no cambia, y quien lo lee tiene que verlo');
  });
});
describe('el correo con las horas para elegir', () => {
  const horas = ['2026-09-16T08:00:00.000Z', '2026-09-17T14:00:00.000Z'];
  const enlaceDe = (h: string) => `https://www.popcar.tech/elegir-hora?id=b-1&token=t&h=${encodeURIComponent(h)}`;

  test('lleva un botón por cada hora, con su enlace', () => {
    const { html } = correoDeOtrasHoras(reserva, horas, enlaceDe);
    for (const h of horas) {
      assert.ok(html.includes(encodeURIComponent(h)), 'sin el enlace, el botón no lleva a ninguna parte');
    }
    assert.equal(html.split('elegir-hora').length - 1, horas.length, 'un botón por hora, ni uno más');
  });

  test('las horas van en la del cliente, no en la del servidor', () => {
    const { html } = correoDeOtrasHoras(reserva, ['2026-09-16T08:00:00.000Z'], enlaceDe);
    assert.ok(html.includes('10:00'), 'las 08:00 UTC de septiembre son las 10:00 en España');
    assert.ok(!html.includes('>08:00'), 'la hora del servidor en un correo hace que el cliente venga dos horas antes');
  });

  test('dice qué pasa al pinchar, y qué hacer si ninguna vale', () => {
    const { html } = correoDeOtrasHoras(reserva, horas, enlaceDe);
    assert.ok(/confirmada/i.test(html), 'quien pincha tiene que saber que con eso se cierra la cita');
    assert.ok(html.includes('Solicitudes'), 'y si ninguna le vale, dónde cancelarla o pedir otro día');
  });

  test('sin ninguna hora no inventa botones', () => {
    const { html } = correoDeOtrasHoras(reserva, [], enlaceDe);
    assert.ok(!html.includes('elegir-hora'));
  });
});

describe('todas las rutas contestan con la misma forma', () => {
  /**
   * Esto mira el código, no una respuesta de verdad, y hay que saberlo: prueba
   * que la regla está escrita, no que el servidor la cumpla a la primera. Vale
   * igual, porque el fallo que hubo era exactamente ese —una ruta escrita de
   * otra manera— y no daba error en ninguna parte: la pantalla se quedaba en
   * blanco y el botón de copiar copiaba «undefined».
   */
  test('lo que devuelven va en data, sin excepciones', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const aqui = url.fileURLToPath(new URL('./visits.ts', import.meta.url));
    const fuente = fs.readFileSync(aqui, 'utf8');

    const sueltas = [...fuente.matchAll(/res\.json\(\{\s*ok:\s*true,\s*([a-zA-Z_]+)\s*:/g)]
      .map((m) => m[1])
      .filter((clave) => clave !== 'data');

    assert.deepEqual(sueltas, [], `estas rutas devuelven algo fuera de data: ${sueltas.join(', ')}`);
  });
});

describe('a quien tiene el coche no se le llama concesionario siempre', () => {
  test('el WhatsApp de las otras horas no da por hecho quién vende', () => {
    const texto = mensajeDeOtrasHoras('Toyota C-HR', 'Juan', ['2026-09-16T08:00:00.000Z']);
    assert.ok(!/concesionario/i.test(texto), 'el marketplace ya tiene particulares, y vendrán importación, renting y portales');
    assert.ok(/quien tiene el coche/i.test(texto));
  });

  test('el correo con las horas tampoco', () => {
    const { html } = correoDeOtrasHoras(reserva, ['2026-09-16T08:00:00.000Z'], () => 'https://x/y');
    assert.ok(!/concesionario/i.test(html));
  });
});

describe('ver lo que se le manda antes de mandarlo', () => {
  /** El cuerpo de una ruta, para poder mirar qué hace y qué no. */
  function cuerpoDeLaRuta(camino: string): string {
    const fuente = readFileSync(fileURLToPath(new URL('./visits.ts', import.meta.url)), 'utf8');
    const desde = fuente.indexOf(`visitsRouter.post('${camino}'`);
    assert.ok(desde > 0, `no encuentro la ruta ${camino}`);
    const hasta = fuente.indexOf('\n});', desde);
    return fuente.slice(desde, hasta);
  }

  test('la vista previa no manda nada y no apunta nada', () => {
    const cuerpo = cuerpoDeLaRuta('/visit-bookings/:bookingId/proponer/vista');
    assert.ok(!/\benviar\(/.test(cuerpo), 'si manda el correo, no es una vista previa: es el envío');
    assert.ok(!/\bmanda(Opciones)?\(/.test(cuerpo), 'ni el WhatsApp');
    assert.ok(!/\bapunta\(/.test(cuerpo), 'y no deja rastro: un intento que no fue no es un paso de la cita');
    assert.ok(!/UPDATE |INSERT /i.test(cuerpo), 'ni escribe en la base');
  });

  test('la de mandar sí manda, y apunta', () => {
    const cuerpo = cuerpoDeLaRuta('/visit-bookings/:bookingId/proponer');
    assert.ok(/\benviar\(/.test(cuerpo));
    assert.ok(/\bapunta\(/.test(cuerpo));
  });
});
