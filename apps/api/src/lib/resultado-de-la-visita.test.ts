/**
 * Cerrar una visita: cuándo se puede y cuándo no.
 *
 * El fallo que se quiere evitar no es el de un dato mal escrito, es el de
 * cerrar una visita que todavía no ha pasado — repasando la agenda de la semana
 * y pulsando de más—. Eso deja escrito que alguien no fue a una cita que aún no
 * ha llegado, y ese apunte ya no se distingue de uno de verdad.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULTADOS, COMO_ACABO, esResultado, sePuedeCerrar, estaSinCerrar, PORQUE_NO_SE_CIERRA,
} from './resultado-de-la-visita.js';

const AHORA = new Date('2026-09-06T12:00:00Z');
const AYER = '2026-09-05T10:00:00Z';
const MANANA = '2026-09-07T10:00:00Z';

const visita = (x: Partial<{ status: string | null; starts_at: string; resultado: string | null }> = {}) => ({
  status: 'confirmed', starts_at: AYER, resultado: null, ...x,
});

describe('los tres finales', () => {
  test('son tres, y cada uno se lee', () => {
    assert.deepEqual([...RESULTADOS], ['no_fue', 'fue', 'compro']);
    for (const r of RESULTADOS) assert.ok(COMO_ACABO[r], `«${r}» no se sabe leer`);
  });

  test('«fue» y «compró» son distintos', () => {
    // Si fueran lo mismo no se podría calcular la conversión: cuántos de los
    // que van se lo quedan.
    assert.notEqual(COMO_ACABO.fue, COMO_ACABO.compro);
  });

  test('lo que no es un final no cuela', () => {
    assert.ok(esResultado('compro'));
    for (const malo of ['vendido', 'FUE', '', null, undefined, 3, {}]) {
      assert.equal(esResultado(malo), false, `«${String(malo)}» ha colado`);
    }
  });
});

describe('cuándo se puede cerrar', () => {
  test('una confirmada que ya empezó, sí', () => {
    assert.deepEqual(sePuedeCerrar(visita(), AHORA), { si: true });
  });

  test('justo al empezar, también', () => {
    // Quien iba a ir ya ha aparecido o no. No hay que esperar a que acabe.
    const justo = sePuedeCerrar(visita({ starts_at: AHORA.toISOString() }), AHORA);
    assert.equal(justo.si, true);
  });

  test('una que todavía no ha empezado, no', () => {
    const r = sePuedeCerrar(visita({ starts_at: MANANA }), AHORA);
    assert.equal(r.si, false);
    assert.equal(r.porque, PORQUE_NO_SE_CIERRA.todaviaNo);
  });

  test('una pendiente de confirmar, tampoco', () => {
    // Nunca se le prometió al cliente, así que no hubo visita que cerrar.
    const r = sePuedeCerrar(visita({ status: 'pending' }), AHORA);
    assert.equal(r.si, false);
    assert.equal(r.porque, PORQUE_NO_SE_CIERRA.sinConfirmar);
  });

  test('una cancelada, tampoco, y lo dice con su motivo', () => {
    const r = sePuedeCerrar(visita({ status: 'cancelled' }), AHORA);
    assert.equal(r.si, false);
    assert.equal(r.porque, PORQUE_NO_SE_CIERRA.cancelada);
  });

  test('una fecha que no se entiende no abre la puerta', () => {
    // Antes de comparar hay que poder leer la fecha. Un NaN en una comparación
    // es siempre falso, y «no ha empezado» es la respuesta segura.
    assert.equal(sePuedeCerrar(visita({ starts_at: 'el jueves' }), AHORA).si, false);
  });
});

describe('las que esperan a que alguien las cierre', () => {
  test('la que ya pasó y no tiene resultado', () => {
    assert.equal(estaSinCerrar(visita(), AHORA), true);
  });

  test('la que ya tiene resultado, no', () => {
    assert.equal(estaSinCerrar(visita({ resultado: 'fue' }), AHORA), false);
  });

  test('ni la de mañana, ni la cancelada, ni la pendiente', () => {
    assert.equal(estaSinCerrar(visita({ starts_at: MANANA }), AHORA), false);
    assert.equal(estaSinCerrar(visita({ status: 'cancelled' }), AHORA), false);
    assert.equal(estaSinCerrar(visita({ status: 'pending' }), AHORA), false);
  });
});
