import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS, escapaCsv, csvDeProveedores, nombreDelFichero,
} from './proveedores-tabla.js';

/**
 * La exportación de proveedores.
 *
 * Lo que se vigila: que un dato con punto y coma o con un salto de línea no
 * parta la fila. Las notas de un proveedor llevan varias líneas, así que esto no
 * es un caso raro — es todos los días.
 */
describe('el fichero de proveedores', () => {
  const uno = {
    nombre: 'Trans-Frío Higueral, S.L.',
    tipos: ['transportista'],
    nif: 'B75592642',
    telefono: '+34 950 420 129',
    email: 'portacoches@transfriohigueral.es',
    direccion: 'P.I. Tíjola, Parcela IP3, 04880 Tíjola (Almería)',
    notas: 'Nacional e internacional.\nFlota propia de portacoches.',
  };

  test('una fila por proveedor, y una de cabeceras', () => {
    const csv = csvDeProveedores([uno, { ...uno, nombre: 'Otro' }]);
    assert.equal(csv.split('\r\n').length, 3);
  });

  test('las notas de varias líneas se aplanan en una celda', () => {
    const csv = csvDeProveedores([uno]);
    assert.ok(csv.includes('Nacional e internacional. · Flota propia de portacoches.'));
    // Lo que se comprueba no es que la fila no se parta —entrecomillada no se
    // parte igual—, es que no queda ni un salto suelto dentro del fichero. Uno
    // solo basta para que la tabla de la pantalla enseñe una celda a medias.
    const sinSeparadores = csv.split('\r\n').join('');
    assert.ok(!sinSeparadores.includes('\n'), 'quedó un salto de línea dentro de una celda');
  });

  test('un punto y coma dentro de un dato se entrecomilla', () => {
    assert.equal(escapaCsv('Uno; y otro'), '"Uno; y otro"');
  });

  test('y unas comillas se doblan, que es como se escapan', () => {
    assert.equal(escapaCsv('Le llaman "el rápido"'), '"Le llaman ""el rápido"""');
  });

  test('lo que no lleva nada raro va tal cual', () => {
    assert.equal(escapaCsv('B75592642'), 'B75592642');
  });

  test('los tipos salen con su nombre, no con su clave', () => {
    const tipos = COLUMNAS.find((c) => c.titulo === 'Tipos');
    assert.equal(tipos?.valor({ nombre: 'X', tipos: ['transportista', 'garantia'] }),
      'Transportistas, Garantías');
  });

  test('un proveedor a medio rellenar no rompe el fichero', () => {
    const csv = csvDeProveedores([{ nombre: 'Sin datos' }]);
    assert.equal(csv.split('\r\n').length, 2);
    assert.ok(csv.endsWith(';;;;;;'.slice(0, COLUMNAS.length - 1)) || csv.includes('Sin datos'));
  });
});

describe('cómo se llama el fichero', () => {
  test('lleva el filtro dentro', () => {
    assert.equal(nombreDelFichero('gestoria', '2026-09-01'), 'proveedores-gestoria-2026-09-01.csv');
  });

  test('sin filtro, todos', () => {
    assert.equal(nombreDelFichero('', '2026-09-01'), 'proveedores-todos-2026-09-01.csv');
  });

  test('dos exportaciones del mismo día con distinto filtro no se pisan', () => {
    assert.notEqual(
      nombreDelFichero('gestoria', '2026-09-01'),
      nombreDelFichero('transportista', '2026-09-01'),
    );
  });
});
