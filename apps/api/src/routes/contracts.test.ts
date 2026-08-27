/**
 * Un número de contrato no se puede repetir.
 *
 * Dos contratos llamándose igual no es un fallo de formato: son dos documentos
 * distintos con el mismo nombre, y a partir de ahí no se sabe cuál es cuál en
 * ninguna conversación, ni con el cliente ni con quien lleve las cuentas.
 *
 * La numeración se rehizo dos veces. Contaba filas —`COUNT(*) + 1`—, que da el
 * número correcto solo mientras no se borre nada: en cuanto falta un contrato,
 * el siguiente repite uno ya emitido. Y llevaba el prefijo de la marca
 * anterior.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prefijoContrato, siguienteContrato } from './contracts.js';

describe('cómo se llama un contrato', () => {
  test('la serie es la de PopCar y lleva el año', () => {
    assert.equal(prefijoContrato(2026), 'PC-RENT-2026-');
  });

  test('el primero del año es el 001', () => {
    assert.equal(siguienteContrato(0, 2026), 'PC-RENT-2026-001');
  });

  test('el siguiente va detrás del último emitido, no del número de contratos', () => {
    // Con siete contratos de los que se borró uno, el último emitido sigue
    // siendo el 7: el siguiente es el 8, no el 7 otra vez.
    assert.equal(siguienteContrato(7, 2026), 'PC-RENT-2026-008');
  });

  test('los números van alineados a tres dígitos', () => {
    assert.equal(siguienteContrato(8, 2026), 'PC-RENT-2026-009');
    assert.equal(siguienteContrato(98, 2026), 'PC-RENT-2026-099');
  });

  test('pasar de mil crece en vez de repetirse', () => {
    // Una serie anual de renting no llega a mil, pero si llegara, más vale un
    // número desalineado que uno repetido.
    assert.equal(siguienteContrato(999, 2026), 'PC-RENT-2026-1000');
  });

  test('cada año empieza por su cuenta', () => {
    assert.equal(siguienteContrato(0, 2027), 'PC-RENT-2027-001');
    assert.notEqual(siguienteContrato(0, 2027), siguienteContrato(0, 2026));
  });
});

describe('la serie no se pisa a sí misma', () => {
  test('mil números seguidos son mil números distintos', () => {
    const vistos = new Set<string>();
    for (let ultimo = 0; ultimo < 1000; ultimo++) vistos.add(siguienteContrato(ultimo, 2026));
    assert.equal(vistos.size, 1000);
  });

  test('el prefijo del año actual es el que se usa por defecto', () => {
    assert.ok(siguienteContrato(0).startsWith(prefijoContrato()));
  });
});
