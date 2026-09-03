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

import { faseDeLaPeritacion, queTocaAhora, QUE_TOCA_AHORA } from './fases-peritacion.js';

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

describe('lo que toca ahora, dentro de «Encargada»', () => {
  // Caben tres momentos muy distintos, y con una sola frase para los tres la
  // pantalla seguía diciendo «esperando su respuesta» después de apuntar lo que
  // había contestado. Un cartel que no cambia se deja de leer.
  const ENCARGADA = { estado: 'Encargada', encargo_enviado_at: '2026-09-02T10:00:00Z' };

  test('recién mandado el encargo, se espera su respuesta', () => {
    assert.match(queTocaAhora(ENCARGADA), /Esperando su respuesta/);
  });

  test('con su precio apuntado, toca confirmarle el día al vendedor', () => {
    assert.match(queTocaAhora({ ...ENCARGADA, coste: 289 }), /Confírmale ahora el día/);
  });

  test('avisado el vendedor, ya solo se espera la visita', () => {
    assert.match(
      queTocaAhora({ ...ENCARGADA, coste: 289, cita_avisada_at: '2026-09-03T10:00:00Z' }),
      /esperando la visita/
    );
  });

  test('un coste de cero no cuenta como respuesta', () => {
    // Se guardaba 0,00 € con el campo en blanco. Si contara, la pantalla diría
    // que ha confirmado sin que nadie haya dicho nada.
    assert.match(queTocaAhora({ ...ENCARGADA, coste: 0 }), /Esperando su respuesta/);
    assert.match(queTocaAhora({ ...ENCARGADA, coste: '' }), /Esperando su respuesta/);
  });

  test('sin encargo mandado, lo que toca es mandarlo', () => {
    assert.match(queTocaAhora({ estado: 'Encargada' }), /mándale el encargo/);
  });

  test('hecha y sin factura, se dice que es lo único que falta', () => {
    // Decía «apunta lo que vio, sus daños, su informe y su factura» con las
    // tres primeras ya hechas. Enumerar lo hecho obliga a repasar los cuatro
    // para descubrir cuál falta, que es lo que el cartel debería ahorrar.
    const hecha = { estado: 'Hecha', encargo_enviado_at: '2026-09-02T10:00:00Z', coste: 289 };
    assert.match(queTocaAhora(hecha), /Solo falta su factura/);
    assert.match(queTocaAhora(hecha), /Pídesela/);
  });

  test('y si ya se le ha pedido, que se espera a que llegue', () => {
    assert.match(
      queTocaAhora({ estado: 'Hecha', coste: 289, factura_pedida_at: '2026-09-09T10:00:00Z' }),
      /Ya se le ha pedido/
    );
  });

  test('con la factura apuntada, no queda nada aquí', () => {
    assert.match(
      queTocaAhora({ estado: 'Hecha', coste: 289, factura_numero: 'PE-DE-0001' }),
      /Nada pendiente/
    );
  });
});
