/**
 * La costura con WhatsApp.
 *
 * Lo que importa aquí es que cuando no está configurado lo diga en vez de fallar
 * raro, y que un teléfono tecleado por una persona llegue a Meta como Meta lo
 * quiere. Lo segundo es lo que hace que un mensaje se pierda sin ruido.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { estaConfigurado, comoLoQuiereMeta, manda, comoBotones, loQuePulso, botonDeHora, firmaValida } from './whatsapp.js';

const antes = { t: process.env.WHATSAPP_TOKEN, p: process.env.WHATSAPP_PHONE_ID };
before(() => { delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_ID; });
after(() => {
  if (antes.t) process.env.WHATSAPP_TOKEN = antes.t;
  if (antes.p) process.env.WHATSAPP_PHONE_ID = antes.p;
});

describe('si está configurado', () => {
  test('sin las dos variables, no', () => {
    assert.equal(estaConfigurado(), false);
    process.env.WHATSAPP_TOKEN = 'x';
    assert.equal(estaConfigurado(), false, 'con una sola tampoco: faltaría desde qué número');
    delete process.env.WHATSAPP_TOKEN;
  });

  test('con las dos, sí', () => {
    process.env.WHATSAPP_TOKEN = 'x';
    process.env.WHATSAPP_PHONE_ID = '1';
    assert.equal(estaConfigurado(), true);
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
  });

  test('una variable en blanco no cuenta como puesta', () => {
    process.env.WHATSAPP_TOKEN = '   ';
    process.env.WHATSAPP_PHONE_ID = '1';
    assert.equal(estaConfigurado(), false);
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
  });
});

describe('el teléfono, como lo quiere Meta', () => {
  test('un móvil español sin prefijo se lo lleva', () => {
    assert.equal(comoLoQuiereMeta('600123456'), '34600123456');
  });

  test('con espacios y guiones, igual', () => {
    assert.equal(comoLoQuiereMeta('600 12 34 56'), '34600123456');
    assert.equal(comoLoQuiereMeta('600-123-456'), '34600123456');
  });

  test('si ya trae prefijo no se le pone otro', () => {
    assert.equal(comoLoQuiereMeta('+34600123456'), '34600123456');
    assert.equal(comoLoQuiereMeta('34600123456'), '34600123456');
  });

  test('un extranjero se deja como está', () => {
    assert.equal(comoLoQuiereMeta('+351912345678'), '351912345678');
  });

  test('sin teléfono, cadena vacía y no una llamada a ninguna parte', () => {
    assert.equal(comoLoQuiereMeta(''), '');
    assert.equal(comoLoQuiereMeta('   '), '');
  });
});

describe('mandar', () => {
  test('sin configurar lo dice, y no revienta', async () => {
    const r = await manda('600123456', 'hola');
    assert.equal(r.enviado, false);
    assert.match(r.motivo ?? '', /no está configurado/);
  });

  test('configurado pero sin teléfono, tampoco', async () => {
    process.env.WHATSAPP_TOKEN = 'x';
    process.env.WHATSAPP_PHONE_ID = '1';
    const r = await manda('', 'hola');
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
    assert.equal(r.enviado, false);
    assert.match(r.motivo ?? '', /teléfono/);
  });
});

describe('las horas como botones', () => {
  test('cada botón vuelve con la cita y la hora dentro', () => {
    const id = botonDeHora('b-1', '2026-09-16T08:00:00.000Z');
    const leido = loQuePulso({
      entry: [{ changes: [{ value: { messages: [{ from: '34600000000', interactive: { button_reply: { id, title: 'mar, 16 10:00' } } }] } }] }],
    });
    assert.deepEqual(leido, { bookingId: 'b-1', hora: '2026-09-16T08:00:00.000Z', telefono: '34600000000' });
  });

  test('los títulos no pasan de veinte caracteres', () => {
    const m = comoBotones('34600000000', 'texto', [
      { id: 'elige|b|h', texto: 'un texto larguísimo que no cabe de ninguna manera' },
    ]);
    assert.ok(m.interactive.action.buttons[0].reply.title.length <= 20, 'Meta rechaza el mensaje entero si se pasa');
  });

  test('de todo lo demás que manda Meta no se hace nada', () => {
    assert.equal(loQuePulso({}), null);
    assert.equal(loQuePulso({ entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }] }), null);
    assert.equal(
      loQuePulso({ entry: [{ changes: [{ value: { messages: [{ from: '34', text: { body: 'la 2' } }] } }] }] }),
      null,
      'contestar escribiendo no mueve una cita sola'
    );
  });

  test('un identificador que no hemos puesto nosotros no vale', () => {
    const suelto = (id: string) =>
      loQuePulso({ entry: [{ changes: [{ value: { messages: [{ from: '34', interactive: { button_reply: { id } } }] } }] }] });
    assert.equal(suelto('otra|cosa|distinta'), null);
    assert.equal(suelto('elige|b-1|el jueves'), null, 'una hora que no se entiende no se aplica');
    assert.equal(suelto('elige|b-1'), null);
  });
});

describe('la firma de lo que manda Meta', () => {
  const cuerpo = Buffer.from(JSON.stringify({ entry: [{ id: '1' }] }), 'utf8');
  const firmaDe = (secreto: string) =>
    'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');

  test('sin secreto configurado se deja pasar, como antes', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    assert.equal(firmaValida(cuerpo, undefined), true);
  });

  test('con secreto, la buena pasa', () => {
    process.env.WHATSAPP_APP_SECRET = 'un-secreto';
    assert.equal(firmaValida(cuerpo, firmaDe('un-secreto')), true);
    delete process.env.WHATSAPP_APP_SECRET;
  });

  test('con secreto, una firma de otro no pasa', () => {
    process.env.WHATSAPP_APP_SECRET = 'un-secreto';
    assert.equal(firmaValida(cuerpo, firmaDe('otro-secreto')), false, 'si no, cualquiera que sepa una cita y una hora la da por elegida');
    assert.equal(firmaValida(cuerpo, undefined), false, 'sin firma tampoco');
    assert.equal(firmaValida(cuerpo, 'sha256=corta'), false);
    assert.equal(firmaValida(undefined, firmaDe('un-secreto')), false, 'sin cuerpo no hay nada que comprobar');
    delete process.env.WHATSAPP_APP_SECRET;
  });

  test('el cuerpo cambiado invalida la firma', () => {
    process.env.WHATSAPP_APP_SECRET = 'un-secreto';
    const firma = firmaDe('un-secreto');
    assert.equal(firmaValida(Buffer.from('{"entry":[{"id":"2"}]}', 'utf8'), firma), false);
    delete process.env.WHATSAPP_APP_SECRET;
  });
});
