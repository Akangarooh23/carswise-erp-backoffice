/**
 * La comisión del concesionario, que es una factura y tiene que cuadrar.
 *
 * El fallo que se quiere evitar ya pasó una vez con la garantía: se guardó el
 * precio de venta en la base y la comisión en el total, y salió una factura
 * cuyo total era menor que su base. En el desglose aparecía un ingreso de 190 €
 * donde se ganaban 70.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FEE_POR_VENTA, laComision, elConcepto } from './comision-del-concesionario.js';
import { IVA_GENERAL } from './dinero.js';

describe('el fee', () => {
  test('son 200 € por coche vendido', () => {
    assert.equal(FEE_POR_VENTA, 200);
  });

  test('y lleva el IVA dentro', () => {
    // Es como se acuerdan estas cosas —«nos pagas 200 por coche»— y como está
    // ya la comisión de la garantía. Si fuera sin IVA, el total serían 242.
    const c = laComision();
    assert.equal(c.total, 200);
    assert.ok(c.base < c.total, 'la base no puede ser mayor que el total');
  });
});

describe('cómo se parte', () => {
  test('200 € son 165,29 de base y 34,71 de IVA', () => {
    assert.deepEqual(laComision(200), { total: 200, base: 165.29, cuota: 34.71, iva: 21 });
  });

  test('la base y la cuota suman el total, siempre', () => {
    /*
     * Aquí está el fallo que se busca. Sacando la cuota como `base * 0,21`,
     * los dos redondeos se separan un céntimo en algunos importes y la factura
     * deja de sumar. El guardián de provider-billing admite dos céntimos de
     * holgura, así que no saltaría: la factura quedaría mal y en silencio.
     */
    for (let total = 1; total <= 1000; total += 0.37) {
      const c = laComision(Math.round(total * 100) / 100);
      assert.equal(
        Math.round((c.base + c.cuota) * 100) / 100, c.total,
        `${c.base} + ${c.cuota} no suman ${c.total}`,
      );
    }
  });

  test('el tipo es el general', () => {
    assert.equal(laComision().iva, IVA_GENERAL);
  });

  test('todo sale con dos decimales', () => {
    for (const t of [200, 33.33, 1, 999.99]) {
      const c = laComision(t);
      for (const [campo, v] of Object.entries(c)) {
        if (campo === 'iva') continue;
        assert.equal(Math.round(v * 100) / 100, v, `${campo} tiene más de dos decimales: ${v}`);
      }
    }
  });
});

describe('el concepto', () => {
  test('dice qué coche y por cuánto se vendió', () => {
    const c = elConcepto('Toyota C-HR 1.8 Advance', 18500);
    assert.match(c, /Toyota C-HR/);
    assert.match(c, /18500\.00 €/);
  });

  test('sin precio, no se lo inventa', () => {
    const c = elConcepto('Toyota C-HR', null);
    assert.doesNotMatch(c, /€/);
    assert.match(c, /Toyota C-HR/);
  });

  test('y sin coche tampoco deja el hueco en blanco', () => {
    // «Comisión por venta ·  · …» delata que falta algo y no dice qué.
    assert.equal(elConcepto(null), 'Comisión por venta · un coche');
    assert.equal(elConcepto('   '), 'Comisión por venta · un coche');
  });

  test('un precio a cero no se enseña', () => {
    assert.doesNotMatch(elConcepto('Toyota C-HR', 0), /€/);
  });
});
