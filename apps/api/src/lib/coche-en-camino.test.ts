/**
 * El correo de «tu coche ya viene de camino».
 *
 * Lo que sostiene este correo es una sola cosa: **que no crea que llega a su
 * casa**. «Tu coche va de camino» se lee como «esta semana lo tengo», y lo que
 * pasa es que va a Zaragoza a matricularse. Entre lo que imagina y lo que
 * ocurre hay varias semanas, y ese hueco se llena de llamadas.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { correoDeCocheEnCamino } from './coche-en-camino.js';

const ANA = {
  nombre: 'Ana',
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  entregaEstimada: '2026-10-15',
  destino: 'Avenida Cataluña 103, 50014, Zaragoza (Aragón)',
  panel: 'https://popcar.tech/panel/solicitudes',
};

describe('lo que no puede faltar', () => {
  test('dice que NO va a su domicilio', () => {
    // Es la frase por la que existe el correo.
    const { html } = correoDeCocheEnCamino(ANA);
    assert.match(html, /No va a tu domicilio todavía/);
  });

  test('y dice adónde va, con el motivo', () => {
    const { html } = correoDeCocheEnCamino(ANA);
    assert.match(html, /Zaragoza/);
    assert.match(html, /a nuestras instalaciones/);
    assert.match(html, /matricularse antes de/);
  });

  test('los cuatro pasos que quedan, en orden', () => {
    // Sin esto, «va de camino» y silencio es lo que hace que llame.
    const { html } = correoDeCocheEnCamino(ANA);
    assert.match(html, /matriculación española/);
    assert.match(html, /ITV de homologación/);
    assert.match(html, /preparación/);
    assert.match(html, /quedar para la entrega/);
  });

  test('y que no tiene que hacer nada', () => {
    assert.match(correoDeCocheEnCamino(ANA).html, /No tienes que hacer nada ahora/);
  });

  test('con su nombre y su coche', () => {
    const { subject, html } = correoDeCocheEnCamino(ANA);
    assert.match(html, /Ana/);
    assert.match(html, /Kia Sorento/);
    assert.match(subject, /Kia Sorento/);
  });
});

describe('las fechas, solo las que existen', () => {
  test('si le dimos una, se repite tal cual y se dice que es estimación', () => {
    // Es la que él tiene en la cabeza: callarla no la borra.
    const { html } = correoDeCocheEnCamino(ANA);
    assert.match(html, /15 de octubre de 2026/);
    assert.match(html, /sigue siendo una estimación/);
  });

  test('y si no hay, no se inventa ninguna', () => {
    // Un plazo puesto para rellenar el hueco es la fecha que nos reclaman.
    const { html } = correoDeCocheEnCamino({ ...ANA, entregaEstimada: null });
    assert.ok(!html.includes('Te lo esperamos para'));
    assert.match(html, /No te damos una fecha antes de tenerla/);
  });

  test('una fecha ilegible se trata como que no hay', () => {
    const { html } = correoDeCocheEnCamino({ ...ANA, entregaEstimada: 'el mes que viene' });
    assert.ok(!html.includes('Te lo esperamos para'));
  });
});

describe('lo que este correo no dice', () => {
  test('ni precios ni importes', () => {
    // El coche está pagado y el depósito repartido: hablar de dinero aquí solo
    // abre una conversación que no toca.
    const { html } = correoDeCocheEnCamino(ANA);
    assert.ok(!/\d[\d.,]*\s*€/.test(html.replace(/<[^>]+>/g, '')));
  });

  test('sin nombre saluda igual, no con un hueco', () => {
    const { html } = correoDeCocheEnCamino({ ...ANA, nombre: null });
    assert.match(html, /Hola <strong>cliente<\/strong>/);
  });

  test('sin destino apuntado, Zaragoza por defecto', () => {
    // Nunca «tu coche va a », que es lo que se lee como un error nuestro. Se
    // mira el texto sin etiquetas: entre «Va a» y el destino hay una celda.
    const { html } = correoDeCocheEnCamino({ ...ANA, destino: '  ' });
    const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(texto, /Va a Zaragoza, a nuestras instalaciones/);
    assert.match(texto, /El camión lo deja en Zaragoza/);
  });
});
