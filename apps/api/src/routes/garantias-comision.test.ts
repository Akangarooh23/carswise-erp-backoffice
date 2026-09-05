/**
 * La garantía se vende por cuenta de quien la da, no se compra para revender.
 *
 * Lo aclaró el asesor: somos **comisionistas**. El proveedor pone el precio y
 * se lo cobra al cliente; nosotros no adquirimos nada, no provisionamos nada, y
 * lo que ganamos es la comisión que él nos paga.
 *
 * Antes el producto se guardaba con `precio` y `coste` —190 y 120—, que es el
 * modelo de comprar para revender. Con eso, la línea de la garantía en la
 * factura del cliente llevaba 70 € de margen nuestro dentro de un concepto que
 * dice «pagado en tu nombre», y un suplido con margen dentro no es un suplido.
 *
 * Esto se comprueba leyendo el SQL de la ruta y no contra una base: lo que hay
 * que fijar es qué columna se lee y cuál dejó de leerse, y eso está escrito ahí.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./garantias.ts', import.meta.url), 'utf8');

describe('el catálogo de garantías habla de comisión, no de coste', () => {
  test('lo que se lee de cada producto es su comisión', () => {
    const campos = FUENTE.slice(FUENTE.indexOf('const CAMPOS'), FUENTE.indexOf('function nt('));
    assert.match(campos, /comision::numeric AS comision/);
    assert.ok(!/coste::numeric/.test(campos),
      'sigue leyéndose el coste: eso dice que la compramos para revenderla');
  });

  test('y lo que se guarda al crearla, también', () => {
    assert.match(FUENTE, /importe\(req\.body\?\.comision\)/);
    assert.ok(!/importe\(req\.body\?\.coste\)/.test(FUENTE));
  });

  test('y lo que se deja modificar', () => {
    assert.match(FUENTE, /for \(const campo of \['precio', 'comision'\] as const\)/);
  });

  test('la columna nueva se crea sola, como el resto del esquema', () => {
    // Nadie corre migraciones a mano en este proyecto.
    assert.match(FUENTE, /ADD COLUMN IF NOT EXISTS comision NUMERIC\(10,2\)/);
  });

  test('y las que ya estaban conservan lo que dejaban', () => {
    /*
     * `precio - coste` no afirma que el proveedor pague eso: mantiene el número
     * que había hasta que haya contrato. Dejarlas a cero diría que la garantía
     * no deja nada, que es más falso que lo anterior.
     */
    assert.match(FUENTE, /SET comision = GREATEST\(0, precio - coste\)/);
    assert.match(FUENTE, /WHERE comision IS NULL AND coste IS NOT NULL/,
      'sin ese WHERE, cada arranque pisaría la comisión que alguien haya escrito');
  });

  test('la columna vieja no se borra', () => {
    // Borrar una columna con datos es de las cosas que no se deshacen. Se queda
    // sin usar, que no estorba.
    assert.ok(!/DROP COLUMN/.test(FUENTE));
  });
});
