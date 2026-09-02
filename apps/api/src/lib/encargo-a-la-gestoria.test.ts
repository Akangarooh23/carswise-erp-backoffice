/**
 * El encargo que se le manda a la gestoría.
 *
 * Dos cosas hacen que este correo sirva y las dos se comprueban aquí.
 *
 * Que dice **a nombre de quién se matricula**, que es lo que más caro sale
 * equivocado: el coche es del cliente desde Alemania, y una matriculación a
 * nombre de PopCar son dos cambios de titularidad en vez de uno.
 *
 * Y que pide **el importe real del impuesto**. El cliente pagó una estimación, y
 * hasta que la gestoría no diga lo que costó de verdad no se le puede devolver
 * ni cobrar la diferencia. Ese dato no llega solo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeEncargoALaGestoria, faltaParaElEncargo, direccionDelTitular,
} from './encargo-a-la-gestoria.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  bastidor: 'KNAPM81ABL5123456',
  matricula: 'M-AW 1234',
  tramites: [
    { id: 'TRA-2026-001', tipo: 'Impuesto de matriculación' },
    { id: 'TRA-2026-002', tipo: 'ITV de homologación' },
    { id: 'TRA-2026-003', tipo: 'Matriculación de importación' },
  ],
  titular: {
    nombre: 'Ana Picazo Haase',
    nif: '06609510T',
    direccion: 'Calle Mauricio Legendre 45 G2B',
    cp: '28046',
    provincia: 'MADRID',
  },
};

describe('lo que lleva el encargo', () => {
  test('se matricula a nombre del cliente, y se dice', () => {
    const { html } = correoDeEncargoALaGestoria(CASO);
    assert.match(html, /Se matricula a nombre del cliente/);
    assert.match(html, /no del nuestro/);
    assert.match(html, /Ana Picazo Haase/);
    assert.match(html, /06609510T/);
  });

  test('y se pide el importe real del impuesto', () => {
    // Sin esa cifra no se puede liquidar con el cliente, y no llega sola.
    const { html } = correoDeEncargoALaGestoria(CASO);
    assert.match(html, /importe real del impuesto de matriculación/);
    assert.match(html, /pagó una estimación/);
  });

  test('los tres trámites, con su referencia cada uno', () => {
    const { html } = correoDeEncargoALaGestoria(CASO);
    assert.match(html, /Impuesto de matriculación/);
    assert.match(html, /ITV de homologación/);
    assert.match(html, /Matriculación de importación/);
    assert.match(html, /TRA-2026-003/);
  });

  test('y va uno solo, no tres: es el mismo coche', () => {
    // Tres correos seguidos del mismo Kia se contestan una vez, preguntando
    // cuál es cuál.
    const { subject } = correoDeEncargoALaGestoria(CASO);
    assert.match(subject, /Kia Sorento/);
    assert.ok(!subject.includes('Impuesto'), 'el asunto es del coche, no de un trámite');
  });

  test('el coche, con su bastidor y su matrícula de origen', () => {
    const { html } = correoDeEncargoALaGestoria(CASO);
    assert.match(html, /KNAPM81ABL5123456/);
    assert.match(html, /M-AW 1234/);
  });

  test('sin matrícula, se dice; no se deja el hueco', () => {
    const { html } = correoDeEncargoALaGestoria({ ...CASO, matricula: null });
    assert.match(html, /todavía no la tenemos/);
  });

  test('sin bastidor, esa fila no sale', () => {
    // Una fila «Bastidor:» vacía se lee como un dato que falta por copiar.
    const { html } = correoDeEncargoALaGestoria({ ...CASO, bastidor: null });
    assert.ok(!html.includes('Bastidor'));
  });

  test('lo que teclea el cliente no se cuela como HTML', () => {
    const { html } = correoDeEncargoALaGestoria({
      ...CASO, titular: { ...CASO.titular, nombre: '<img src=x onerror=1>' },
    });
    assert.ok(!html.includes('<img'));
    assert.match(html, /&lt;img/);
  });
});

describe('lo que hace falta antes de mandarlo', () => {
  test('con todo, no falta nada', () => {
    assert.deepEqual(faltaParaElEncargo(CASO), []);
  });

  test('sin NIF no se manda: la matrícula saldría mal', () => {
    assert.deepEqual(
      faltaParaElEncargo({ ...CASO, titular: { ...CASO.titular, nif: '' } }),
      ['su NIF']
    );
  });

  test('sin trámites abiertos tampoco', () => {
    assert.deepEqual(faltaParaElEncargo({ ...CASO, tramites: [] }), ['los trámites']);
  });

  test('y si falta todo, se dice todo', () => {
    assert.deepEqual(
      faltaParaElEncargo({ vehiculo: '', tramites: [], titular: {} }),
      ['qué coche es', 'los trámites', 'a nombre de quién se matricula', 'su NIF']
    );
  });
});

describe('el domicilio del titular', () => {
  test('calle, código postal y provincia', () => {
    assert.equal(
      direccionDelTitular(CASO.titular),
      'Calle Mauricio Legendre 45 G2B, 28046 MADRID'
    );
  });

  test('sin dirección no se queda una coma suelta', () => {
    assert.equal(direccionDelTitular({ cp: '28046', provincia: 'MADRID' }), '28046 MADRID');
    assert.equal(direccionDelTitular({}), '');
  });
});
