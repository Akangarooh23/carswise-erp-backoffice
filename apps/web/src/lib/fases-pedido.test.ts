import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LO_DE_CADA_FASE, toca } from './fases-pedido.js';

/**
 * Lo que se enseña en cada fase.
 *
 * Lo que se comprueba aquí no es la maqueta: es que no se pida antes de tiempo
 * algo que solo se puede saber después. Un campo obligatorio a destiempo se
 * rellena con lo primero que sirva para pasar.
 */
describe('cada fase enseña lo suyo', () => {
  test('un coche que sigue en Alemania no pide kilómetros ni llaves', () => {
    assert.equal(toca('alLlegar', 'Borrador'), false);
    assert.equal(toca('alLlegar', 'Pedido'), false);
    assert.equal(toca('alLlegar', 'Confirmado'), false);
  });

  test('pero sí en cuanto viene de camino: se rellena el día que llega', () => {
    assert.equal(toca('alLlegar', 'En camino'), true);
    assert.equal(toca('alLlegar', 'Recibido'), true);
  });

  test('para confirmar, lo que hace falta es el precio, no los papeles', () => {
    assert.equal(toca('datos', 'Pedido'), true);
    assert.equal(toca('papeles', 'Pedido'), false);
  });

  test('los papeles salen cuando ya sirven para algo: moverlo', () => {
    assert.equal(toca('papeles', 'Confirmado'), true);
    assert.equal(toca('papeles', 'En camino'), true);
  });

  test('a nombre de quién va se decide pronto, no al final', () => {
    assert.equal(toca('titular', 'Pedido'), true);
    assert.equal(toca('titular', 'Recibido'), false, 'a esas alturas ya está decidido');
  });

  test('lo que cuesta dejarlo listo, cuando está aquí', () => {
    assert.equal(toca('gastos', 'Confirmado'), false);
    assert.equal(toca('gastos', 'Recibido'), true);
  });

  test('con «ver todo» sale hasta lo que no toca', () => {
    assert.equal(toca('alLlegar', 'Pedido', true), true);
    assert.equal(toca('gastos', 'Borrador', true), true);
  });

  test('un estado que no conocemos no enseña nada, pero no rompe', () => {
    assert.equal(toca('datos', 'Inventado'), false);
    assert.equal(toca('datos', 'Inventado', true), true);
  });

  test('todas las fases del camino están contempladas', () => {
    for (const e of ['Borrador', 'Pedido', 'Confirmado', 'En camino', 'Recibido', 'Cancelado']) {
      assert.ok(LO_DE_CADA_FASE[e]?.length, `${e} no enseña nada`);
    }
  });
});
