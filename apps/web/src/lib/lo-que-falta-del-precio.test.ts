/**
 * El mensaje de «falta el precio» con el precio escrito en la casilla.
 *
 * Lo que pasó: 17.900 escritos en el campo, «Guardar» sin pulsar, y el bloque
 * de abajo diciendo «falta acordar el precio de salida» con el número a dos
 * centímetros. Eso se lee como un error del programa, y lo siguiente es venir a
 * preguntar por qué no deja mandar el documento.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loQueFaltaEnPantalla } from './lo-que-falta-del-precio.js';

const FALTA = 'Falta acordar el precio de salida';

describe('con algo escrito y sin guardar', () => {
  test('se dice que lo que falta es guardar', () => {
    const m = loQueFaltaEnPantalla(FALTA, '17900', null);
    assert.match(m, /17\.900 €/);
    assert.match(m, /Guardar/);
  });

  test('y con un precio guardado distinto, también', () => {
    // Cambió la cifra después de guardarla: lo que se mandaría es la vieja.
    const m = loQueFaltaEnPantalla(FALTA, '18500', '17900');
    assert.match(m, /18\.500 €/);
  });
});

describe('y cuando no es eso', () => {
  test('con lo escrito ya guardado, se dice lo que falta de verdad', () => {
    // Aquí el precio no es el problema: será el taller, o el mandato.
    assert.equal(
      loQueFaltaEnPantalla('Antes tiene que pasar por el taller', '17900', '17900'),
      'Antes tiene que pasar por el taller',
    );
  });

  test('con la casilla vacía, la frase del servidor', () => {
    assert.equal(loQueFaltaEnPantalla(FALTA, '', null), FALTA);
    assert.equal(loQueFaltaEnPantalla(FALTA, '  ', null), FALTA);
  });

  test('con un cero o algo que no es un número, igual', () => {
    // Un cero no es un precio, y «mucho» tampoco.
    assert.equal(loQueFaltaEnPantalla(FALTA, '0', null), FALTA);
    assert.equal(loQueFaltaEnPantalla(FALTA, 'mucho', null), FALTA);
  });

  test('y si no falta nada, no se dice nada', () => {
    // Cadena vacía, igual que la del servidor: quien la use las trata igual.
    assert.equal(loQueFaltaEnPantalla('', '17900', null), '');
  });
});

describe('y está enchufado en la pantalla', () => {
  test('la ficha del encargo lo usa', () => {
    /*
     * Puede estar perfecto y no llegar a la pantalla, que es donde se leyó el
     * mensaje confuso.
     */
    const FICHA = readFileSync(
      join(import.meta.dirname, '..', 'pages', 'idcar', 'EncargoDeVenta.tsx'), 'utf8',
    ).replace(/\r\n/g, '\n');
    assert.match(FICHA, /loQueFaltaEnPantalla\(clausula\.falta, precio, datos\.encargo\?\.precio_referencia\)/);
  });
});
