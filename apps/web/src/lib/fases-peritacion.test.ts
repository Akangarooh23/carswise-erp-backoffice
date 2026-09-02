/**
 * Qué se enseña en cada momento de una peritación.
 *
 * Lo que se sostiene aquí es que **la fase la marca el correo, no el estado**.
 * El estado se puede arrastrar a mano en el tablero; lo que habilita apuntar lo
 * que cobra el perito y avisar al vendedor del día es que se le haya pedido de
 * verdad. Si se separan, el ERP ofrece mandar una cita que no ha confirmado
 * nadie.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { faseDeLaPeritacion, QUE_TOCA_AHORA } from './fases-peritacion.js';

describe('por dónde va', () => {
  test('recién nacida: hay que elegir perito y mandar el encargo', () => {
    assert.equal(faseDeLaPeritacion({ estado: 'Por encargar' }), 0);
    assert.equal(faseDeLaPeritacion({ estado: 'Por encargar', encargo_enviado_at: null }), 1 - 1);
  });

  test('con el encargo mandado, se pasa a esperar su respuesta', () => {
    assert.equal(
      faseDeLaPeritacion({ estado: 'Encargada', encargo_enviado_at: '2026-09-02T10:00:00Z' }),
      1
    );
  });

  test('y lo que manda es el correo, no el estado', () => {
    // Alguien puede arrastrar la tarjeta a «Encargada» sin haber mandado nada.
    // Si eso abriera el aviso al vendedor, saldría una cita que no ha
    // confirmado ningún perito.
    assert.equal(faseDeLaPeritacion({ estado: 'Encargada', encargo_enviado_at: null }), 0);
  });

  test('hecha es hecha, aunque el encargo no conste', () => {
    // Al revés sí: si ya ha ido y ha dicho lo que vio, no hay nada que esperar.
    assert.equal(faseDeLaPeritacion({ estado: 'Hecha', encargo_enviado_at: null }), 2);
  });

  test('un estado que no existe no adelanta nada', () => {
    assert.equal(faseDeLaPeritacion({ estado: 'Cancelada' }), 0);
  });
});

describe('lo que toca ahora', () => {
  test('hay una frase para cada fase, y ninguna vacía', () => {
    for (const fase of [0, 1, 2] as const) {
      assert.ok(QUE_TOCA_AHORA[fase].trim().length > 20, `fase ${fase} sin explicar`);
    }
  });

  test('la de esperar dice las dos cosas que se esperan', () => {
    // Que pueda ir ese día y cuánto cobra: son las dos que trae su respuesta.
    assert.match(QUE_TOCA_AHORA[1], /puede ir/);
    assert.match(QUE_TOCA_AHORA[1], /cobra/);
  });
});
