/**
 * Las facturas que sabemos que van a llegar.
 *
 * Lo que se sostiene aquí es cuándo nace una línea y cuándo deja de ser una
 * espera. Las dos reglas existen por el mismo motivo: una lista de esperas que
 * nadie cierra deja de mirarse, y entonces vuelve a no haber nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  seEsperaFactura, diasEsperando, hayQueReclamarla, comoSeCuenta,
  DIAS_PARA_RECLAMAR, ESPERADA,
} from './facturas-esperadas.js';

const HOY = new Date('2026-09-20T12:00:00Z');
const haceDias = (n: number) => new Date(HOY.getTime() - n * 86400000).toISOString();

describe('cuándo se espera una factura', () => {
  const PERITAJE = { proveedor: 'checkdenwagen', importe: 289, hecho: true };

  test('con el servicio hecho, proveedor e importe', () => {
    assert.equal(seEsperaFactura(PERITAJE), true);
  });

  test('sin hacer, no falta ninguna factura', () => {
    // Nadie puede facturar lo que todavía no ha hecho. Una línea antes de la
    // visita sería una deuda inventada.
    assert.equal(seEsperaFactura({ ...PERITAJE, hecho: false }), false);
    assert.equal(seEsperaFactura({ proveedor: 'checkdenwagen', importe: 289 }), false);
  });

  test('sin proveedor no hay a quién reclamarle', () => {
    assert.equal(seEsperaFactura({ ...PERITAJE, proveedor: '  ' }), false);
  });

  test('y sin importe, la línea no diría cuánto', () => {
    // Una fila sin cifra engorda la lista sin poder sumarse: no sirve para
    // decidir nada y estorba para leer las que sí.
    assert.equal(seEsperaFactura({ ...PERITAJE, importe: null }), false);
    assert.equal(seEsperaFactura({ ...PERITAJE, importe: 0 }), false);
    assert.equal(seEsperaFactura({ ...PERITAJE, importe: 'a consultar' }), false);
  });
});

describe('cuándo deja de ser una espera', () => {
  test('dentro de plazo, se espera y punto', () => {
    assert.equal(hayQueReclamarla(haceDias(3), HOY), false);
    assert.equal(diasEsperando(haceDias(3), HOY), 3);
  });

  test('pasado el plazo, hay que reclamarla', () => {
    // Si no vencen, en tres meses hay cuarenta líneas de coches entregados y
    // la pantalla se vuelve ruido.
    assert.equal(hayQueReclamarla(haceDias(DIAS_PARA_RECLAMAR + 1), HOY), true);
  });

  test('una fecha que no se entiende no dispara una reclamación', () => {
    assert.equal(diasEsperando('lo que sea', HOY), 0);
    assert.equal(hayQueReclamarla(null, HOY), false);
  });
});

describe('cómo se cuenta', () => {
  test('con los días que lleva', () => {
    assert.equal(comoSeCuenta(289, haceDias(3), HOY), '289 € · esperando desde hace 3 días');
    assert.equal(comoSeCuenta(289, haceDias(1), HOY), '289 € · esperando desde hace 1 día');
    assert.equal(comoSeCuenta(289, haceDias(0), HOY), '289 € · esperando desde hoy');
  });

  test('y pasado el plazo lo dice a la cara', () => {
    assert.match(comoSeCuenta(289, haceDias(15), HOY), /reclámala/);
  });

  test('el estado tiene nombre propio, distinto de los de una factura', () => {
    // Si compartiera estado con las recibidas, alguien pagaría contra una
    // línea que nadie ha emitido.
    assert.equal(ESPERADA, 'esperada');
    assert.ok(!['pending', 'sent', 'pending_payment', 'paid', 'cancelled'].includes(ESPERADA));
  });
});
