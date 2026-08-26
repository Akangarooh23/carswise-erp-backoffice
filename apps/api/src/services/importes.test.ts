/**
 * Una factura tiene que sumar exactamente lo que se cobró.
 *
 * De un cobro de 10,00 € la factura decía 9,99: la base se redondea a 8,26, el
 * IVA se calculaba sobre ella —8,26 × 0,21 = 1,7346, que redondea a 1,73— y
 * 8,26 + 1,73 son 9,99.
 *
 * En una factura eso no es un redondeo inocente: es un documento que dice que
 * se cobró algo distinto de lo que se cobró, y que no cuadra con el cargo de la
 * tarjeta ni con el extracto de Stripe.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { importes } from './invoice-pdf.js';

/** Una línea de factura por su base imponible. */
const linea = (amount: number) => ({ description: 'Concepto', amount });

/** De lo que pagó el cliente a la base, como hacen las rutas. */
const base = (total: number) => Math.round((total / 1.21) * 100) / 100;

describe('cuando el precio de cara al cliente es el total', () => {
  test('los 10 € del informe de mercado salen como 10 €', () => {
    const r = importes({ lines: [linea(base(10))], totalCobrado: 10 });
    assert.deepEqual(r, { base: 8.26, ivaAmt: 1.74, total: 10 });
  });

  test('los 6,99 € de la suscripción salen como 6,99 €', () => {
    const r = importes({ lines: [linea(base(6.99))], totalCobrado: 6.99 });
    assert.equal(r.total, 6.99);
    assert.equal(r.base + r.ivaAmt, 6.99);
  });

  test('base más IVA da el total, cobre lo que cobre', () => {
    // Los importes que más se pierden por el redondeo son los pequeños: se
    // recorren de céntimo en céntimo hasta 30 €, y también un coche.
    const importesPosibles: number[] = [];
    for (let c = 1; c <= 3000; c++) importesPosibles.push(c / 100);
    importesPosibles.push(20100, 14500, 389, 253.5);

    const fallan = importesPosibles.filter((t) => {
      const r = importes({ lines: [linea(base(t))], totalCobrado: t });
      return Math.round((r.base + r.ivaAmt) * 100) !== Math.round(t * 100);
    });
    assert.deepEqual(fallan, [], 'estos importes no cuadran');
  });

  test('varias líneas también cuadran', () => {
    const r = importes({ lines: [linea(24.79), linea(9.09)], totalCobrado: 40.99 });
    assert.equal(r.base, 33.88);
    assert.equal(r.ivaAmt, 7.11);
    assert.equal(r.total, 40.99);
  });
});

describe('cuando lo que se conoce es la base', () => {
  // Es el caso de las facturas de proveedor: el importe pactado es sin IVA y el
  // total se calcula sumándolo.
  test('el total sale de sumar el IVA a la base', () => {
    const r = importes({ lines: [linea(100)] });
    assert.deepEqual(r, { base: 100, ivaAmt: 21, total: 121 });
  });

  test('y sigue cuadrando con decimales', () => {
    const r = importes({ lines: [linea(8.26)] });
    assert.equal(Math.round((r.base + r.ivaAmt) * 100), Math.round(r.total * 100));
  });

  test('un tipo de IVA distinto se respeta', () => {
    const r = importes({ lines: [linea(100)], ivaRate: 0.1 });
    assert.deepEqual(r, { base: 100, ivaAmt: 10, total: 110 });
  });
});

describe('los casos raros no descuadran', () => {
  test('una factura a cero', () => {
    assert.deepEqual(importes({ lines: [linea(0)], totalCobrado: 0 }), { base: 0, ivaAmt: 0, total: 0 });
  });

  test('sin líneas no hay base', () => {
    assert.equal(importes({ lines: [] }).total, 0);
  });
});
