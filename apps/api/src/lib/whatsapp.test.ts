/**
 * La costura con WhatsApp.
 *
 * Lo que importa aquí es que cuando no está configurado lo diga en vez de fallar
 * raro, y que un teléfono tecleado por una persona llegue a Meta como Meta lo
 * quiere. Lo segundo es lo que hace que un mensaje se pierda sin ruido.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { estaConfigurado, comoLoQuiereMeta, manda } from './whatsapp.js';

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
