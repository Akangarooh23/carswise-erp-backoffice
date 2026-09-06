import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mediana, elTramo, diasEntre, horasEntre, comoSeDice } from './tiempos.js';

describe('la mediana', () => {
  test('con los leads de verdad, dice lo que suele pasar', () => {
    /*
     * Contestados en 0, 15, 16, 624 y 696 horas. La media son 270 h y no
     * describe ninguno: los dos de junio se quedaron olvidados y arrastran la
     * cifra. La mediana son 16 h, que sí es lo que suele pasar.
     */
    assert.equal(mediana([0, 15, 16, 624, 696]), 16);
  });

  test('con un número par, la de en medio', () => {
    assert.equal(mediana([10, 20, 30, 40]), 25);
  });

  test('no le importa el orden en que lleguen', () => {
    assert.equal(mediana([696, 15, 0, 624, 16]), 16);
  });

  test('sin datos es null, no cero', () => {
    // Cero diría «se contesta al momento» de algo que no ha pasado nunca.
    assert.equal(mediana([]), null);
    assert.equal(mediana(null), null);
  });

  test('y lo que no es un número no cuenta', () => {
    assert.equal(mediana([10, NaN, 30]), 20);
  });
});

describe('un tramo', () => {
  test('lleva lo típico, lo peor y de cuántos sale', () => {
    // Sin «de cuántos», una mediana de un solo caso parece una ley.
    const t = elTramo([0, 15, 16, 624, 696]);
    assert.deepEqual(t, { tipico: 16, peor: 696, casos: 5 });
  });

  test('un tiempo negativo no cuenta: es un dato mal metido', () => {
    assert.equal(elTramo([-5, 10, 20]).casos, 2);
  });

  test('y vacío no inventa nada', () => {
    assert.deepEqual(elTramo([]), { tipico: null, peor: null, casos: 0 });
  });
});

describe('los días entre dos fechas', () => {
  test('el Kia: de la solicitud a la entrega', () => {
    assert.equal(diasEntre('2026-09-02', '2026-09-05'), 3);
  });

  test('y en horas cuando toca', () => {
    assert.equal(horasEntre('2026-09-02T09:00:00Z', '2026-09-03T00:00:00Z'), 15);
  });

  test('una entrega anterior a su solicitud se descarta', () => {
    // Es un dato mal metido, no un tiempo negativo, y restaría de la mediana.
    assert.equal(diasEntre('2026-09-05', '2026-09-02'), null);
  });

  test('y una fecha ilegible no cuenta como cero', () => {
    assert.equal(diasEntre('cuando sea', '2026-09-05'), null);
    assert.equal(diasEntre(null, '2026-09-05'), null);
    assert.equal(horasEntre('2026-09-05', undefined), null);
  });
});

describe('cómo se dice un tiempo', () => {
  test('en horas hasta dos días', () => {
    // «0,3 días» y «7 horas» son el mismo dato y solo uno se entiende.
    assert.equal(comoSeDice(0.3), '7 h');
    assert.equal(comoSeDice(1.5), '36 h');
  });

  test('lo de menos de una hora se dice sin número', () => {
    assert.equal(comoSeDice(0), 'el mismo día');
    assert.equal(comoSeDice(0.02), 'el mismo día');
  });

  test('en días hasta dos meses', () => {
    assert.equal(comoSeDice(3), '3 días');
    assert.equal(comoSeDice(45), '45 días');
  });

  test('y en meses a partir de ahí', () => {
    assert.equal(comoSeDice(82), '3 meses');
  });

  test('sin dato, un guion', () => {
    assert.equal(comoSeDice(null), '–');
    assert.equal(comoSeDice(NaN), '–');
  });
});
