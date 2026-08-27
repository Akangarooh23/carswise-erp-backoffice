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
import { correoDeCancelacion } from './visits.js';

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
