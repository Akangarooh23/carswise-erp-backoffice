/**
 * Cuándo se suelta el dinero de un cliente.
 *
 * Esto no es una comprobación técnica: es la promesa entera del producto. El
 * cliente deposita veinte mil euros y lo que le vendemos es que nadie los toca
 * hasta que uno de los nuestros ha visto el coche en Alemania.
 *
 * Si esta lógica se rompe en silencio, lo que se rompe es la razón de existir
 * del servicio. Por eso está en su propio fichero, sin base de datos ni
 * pantalla, y tiene más pruebas de las que su tamaño sugiere.
 */
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  ESTADOS_DEPOSITO, TRANSICIONES,
  sePuedeLiberar, PORQUE_NO_SE_LIBERA, transicionValida,
} from './escrow.js';

describe('liberar el dinero', () => {
  test('solo si alguien nuestro ha visto el coche', () => {
    assert.deepEqual(
      sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true }),
      { puede: true, motivo: null }
    );
  });

  test('sin verificar, no', () => {
    // Es la única condición además de que el dinero esté, y es la que sostiene
    // todo lo demás.
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: false });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_verificar');
  });

  test('si no ha depositado, tampoco: no hay nada que soltar', () => {
    const r = sePuedeLiberar({ estado: 'pendiente', verificadoEnAlemania: true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_pagar');
  });

  test('sin estado guardado se trata como pendiente', () => {
    // Una fila vieja, de antes de que existiera el depósito, no puede parecer
    // que tiene dinero dentro.
    assert.equal(sePuedeLiberar({ estado: null, verificadoEnAlemania: true }).motivo, 'sin_pagar');
    assert.equal(sePuedeLiberar({}).motivo, 'sin_pagar');
  });

  test('y no se libera dos veces', () => {
    // Un segundo clic con el dinero ya enviado es un segundo pago al vendedor.
    const r = sePuedeLiberar({ estado: 'liberado', verificadoEnAlemania: true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'ya_liberado');
  });

  test('ni se libera lo que ya se devolvió', () => {
    const r = sePuedeLiberar({ estado: 'devuelto', verificadoEnAlemania: true });
    assert.equal(r.motivo, 'ya_devuelto');
  });

  test('cada negativa se puede explicar, no solo apagar un botón', () => {
    // Quien lo intenta tiene que saber qué le falta. Un botón gris no dice nada
    // y acaba en una llamada preguntando por qué.
    for (const m of ['sin_pagar', 'sin_verificar', 'ya_liberado', 'ya_devuelto'] as const) {
      assert.ok(PORQUE_NO_SE_LIBERA[m], `falta el motivo ${m}`);
    }
    assert.match(PORQUE_NO_SE_LIBERA.sin_verificar, /Alemania/);
  });
});

describe('los estados del depósito', () => {
  test('son cuatro y no hay más', () => {
    assert.deepEqual([...ESTADOS_DEPOSITO], ['pendiente', 'retenido', 'liberado', 'devuelto']);
  });

  test('se deposita antes de retener', () => {
    assert.equal(transicionValida('pendiente', 'retenido'), true);
    assert.equal(transicionValida('pendiente', 'liberado'), false,
      'se estaría soltando dinero que nadie ha ingresado');
  });

  test('de retenido se sale por los dos lados', () => {
    assert.equal(transicionValida('retenido', 'liberado'), true);
    assert.equal(transicionValida('retenido', 'devuelto'), true);
  });

  test('liberado y devuelto son finales', () => {
    // El dinero ya se movió. Cambiar el estado después no lo trae de vuelta, y
    // dejarlo cambiar esconde lo que pasó de verdad.
    assert.deepEqual([...TRANSICIONES.liberado], []);
    assert.deepEqual([...TRANSICIONES.devuelto], []);
  });

  test('un estado inventado no vale', () => {
    assert.equal(transicionValida('retenido', 'medio_liberado'), false);
    assert.equal(transicionValida('cualquier_cosa', 'liberado'), false);
  });
});

/**
 * Y que la ruta lo use de verdad, no solo que exista.
 */
describe('el portero está puesto en la ruta', () => {
  const RUTA = new URL('../routes/leads.ts', import.meta.url);
  const FUENTE = readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

  test('la liberación pasa por sePuedeLiberar', () => {
    assert.match(FUENTE, /sePuedeLiberar\(\{/);
  });

  test('y se mira lo guardado, no lo que venga en la petición', () => {
    // Quien pulsa el botón no puede traer consigo el permiso para pulsarlo.
    assert.match(FUENTE, /SELECT escrow_estado, verificado_alemania_at FROM moveadvisor_market_leads/);
  });

  test('si no se puede, se contesta con el motivo', () => {
    assert.match(FUENTE, /PORQUE_NO_SE_LIBERA\[veredicto\.motivo\]/);
  });

  test('y no se escribe nada cuando no se puede', () => {
    // El `return` después del 409: sin él, se contestaría que no y se soltaría
    // el dinero igual.
    const bloque = FUENTE.slice(FUENTE.indexOf('if (libera_deposito)'), FUENTE.indexOf("if (!sets.length)"));
    const noPuede = bloque.slice(bloque.indexOf('if (!veredicto.puede)'));
    assert.match(noPuede.slice(0, 400), /return;/);
    assert.ok(noPuede.indexOf('return;') < noPuede.indexOf('escrow_liberado_at'),
      'se estaría soltando el dinero después de haber contestado que no');
  });
});
