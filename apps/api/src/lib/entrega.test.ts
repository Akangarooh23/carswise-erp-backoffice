/**
 * Entregar el coche, y la garantía que empieza ese día.
 *
 * Lo que se comprueba: que no se cierre una entrega sin los kilómetros de salida
 * ni la firma, que falte un papel no lo impida —a veces la ficha llega después—
 * y que la garantía se calcule al entregar y se quede quieta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUE_SE_ENTREGA, faltaPorEntregar, puedeCerrarseLaEntrega, faltaParaCerrar,
  garantiaHasta, garantiaEnVigor, diasDeGarantia,
} from './entrega.js';

describe('lo que se le da al cliente', () => {
  test('la lista cubre lo que se lleva puesto', () => {
    const claves = QUE_SE_ENTREGA.map((x) => x.clave);
    assert.ok(claves.includes('permiso'));
    assert.ok(claves.includes('ficha_tecnica'));
    assert.ok(claves.includes('llaves'), 'la segunda llave es lo que más se olvida');
    assert.ok(claves.includes('garantia'));
  });

  test('sin marcar nada, falta todo', () => {
    assert.equal(faltaPorEntregar({}).length, QUE_SE_ENTREGA.length);
  });

  test('lo marcado deja de faltar', () => {
    const falta = faltaPorEntregar({ entregado: { permiso: true, llaves: true } });
    assert.ok(!falta.some((x) => x.clave === 'permiso'));
    assert.ok(falta.some((x) => x.clave === 'ficha_tecnica'));
  });
});

describe('cerrar la entrega', () => {
  test('hacen falta los kilómetros y la firma', () => {
    assert.equal(puedeCerrarseLaEntrega({}), false);
    assert.deepEqual(faltaParaCerrar({}).length, 2);
    assert.equal(puedeCerrarseLaEntrega({ km_salida: 84200 }), false, 'sin firma no hay entrega');
    assert.equal(puedeCerrarseLaEntrega({ firmado: true }), false, 'sin kilómetros no hay punto de partida');
  });

  test('con las dos, sí', () => {
    assert.equal(puedeCerrarseLaEntrega({ km_salida: 84200, firmado: true }), true);
  });

  test('que falte un papel no lo impide', () => {
    assert.equal(puedeCerrarseLaEntrega({ km_salida: 84200, firmado: true, entregado: {} }), true,
      'a veces se entrega el coche y la ficha llega después: se ve lo que falta, pero no bloquea');
  });
});

describe('la garantía', () => {
  test('se calcula desde el día de la entrega', () => {
    assert.equal(garantiaHasta(new Date('2026-08-30T10:00:00Z'), 12), '2027-08-30');
    assert.equal(garantiaHasta(new Date('2026-08-30T10:00:00Z'), 6), '2027-02-28');
  });

  test('sigue en vigor hasta su fecha', () => {
    assert.equal(garantiaEnVigor('2027-08-30', new Date('2026-12-01')), true);
    assert.equal(garantiaEnVigor('2026-08-01', new Date('2026-12-01')), false);
  });

  test('sin fecha guardada no hay garantía que sostener', () => {
    assert.equal(garantiaEnVigor(null), false,
      'si no está apuntada, el día que alguien llame no habrá forma de saber si está dentro');
  });

  test('se sabe cuántos días le quedan', () => {
    assert.equal(diasDeGarantia('2026-09-09', new Date('2026-08-30T00:00:00Z')), 10);
    assert.ok((diasDeGarantia('2026-08-01', new Date('2026-08-30T00:00:00Z')) ?? 0) < 0);
  });
});
