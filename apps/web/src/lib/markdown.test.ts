/**
 * El intérprete del markdown que enseña la pantalla de Manual.
 *
 * Solo entiende lo que escribimos en `docs/`. Lo que se comprueba aquí es que
 * no se coma nada —una tabla mal leída deja al trabajador sin la mitad de la
 * información y no se nota— y que el texto del documento no pueda acabar
 * interpretado como otra cosa.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { interpreta, trozos, tituloDe } from './markdown.js';

describe('el formato dentro de una línea', () => {
  test('la negrita', () => {
    assert.deepEqual(trozos('hay **cita** hoy'), [
      { tipo: 'texto', texto: 'hay ' },
      { tipo: 'fuerte', texto: 'cita' },
      { tipo: 'texto', texto: ' hoy' },
    ]);
  });

  test('el código, que en estos documentos son nombres de tabla', () => {
    const t = trozos('vive en `vehicle_visit_bookings`');
    assert.deepEqual(t[1], { tipo: 'codigo', texto: 'vehicle_visit_bookings' });
  });

  test('los enlaces, con su destino', () => {
    const t = trozos('ver [el flujo](docs/flujos.md) entero');
    assert.deepEqual(t[1], { tipo: 'enlace', texto: 'el flujo', url: 'docs/flujos.md' });
  });

  test('un asterisco suelto no se come el resto de la línea', () => {
    const t = trozos('5 * 3 sigue siendo texto');
    assert.equal(t.length, 1);
    assert.equal(t[0].tipo, 'texto');
  });

  test('lo que parece una etiqueta se queda en texto', () => {
    // No se genera HTML: quien pinta recibe texto, así que no hay nada que
    // interpretar. Esta prueba fija que siga siendo así.
    const t = trozos('<script>alert(1)</script>');
    assert.equal(t.length, 1);
    assert.equal(t[0].tipo, 'texto');
    assert.equal((t[0] as { texto: string }).texto, '<script>alert(1)</script>');
  });
});

describe('los bloques', () => {
  test('los títulos, con su nivel', () => {
    const b = interpreta('# Uno\n\n## Dos\n\n### Tres');
    assert.deepEqual(b.map((x) => x.tipo), ['titulo', 'titulo', 'titulo']);
    assert.deepEqual(b.map((x) => (x as { nivel: number }).nivel), [1, 2, 3]);
  });

  test('un párrafo partido en varias líneas se junta', () => {
    const b = interpreta('una frase\nque sigue abajo');
    assert.equal(b.length, 1);
    assert.equal((b[0] as { trozos: { texto: string }[] }).trozos[0].texto, 'una frase que sigue abajo');
  });

  test('una tabla, con su cabecera y sus filas', () => {
    const b = interpreta('| Quién | Qué recibe |\n|---|---|\n| Cliente | El `.ics` |\n| Taller | Nada |');
    assert.equal(b.length, 1);
    const t = b[0] as { tipo: string; cabecera: unknown[]; filas: unknown[][] };
    assert.equal(t.tipo, 'tabla');
    assert.equal(t.cabecera.length, 2);
    assert.equal(t.filas.length, 2, 'perder una fila de una tabla no se nota al leer');
  });

  test('la tabla se corta donde acaba, no se traga lo de después', () => {
    const b = interpreta('| A | B |\n|---|---|\n| 1 | 2 |\n\nUn párrafo suelto.');
    assert.deepEqual(b.map((x) => x.tipo), ['tabla', 'parrafo']);
  });

  test('una lista, con sus puntos', () => {
    const b = interpreta('- uno\n- dos\n- tres');
    assert.equal((b[0] as { puntos: unknown[] }).puntos.length, 3);
  });

  test('un punto que sigue en la línea de abajo no se parte en dos', () => {
    const b = interpreta('- esto es un punto\n  que continúa aquí\n- y este es otro');
    const puntos = (b[0] as { puntos: { texto: string }[][] }).puntos;
    assert.equal(puntos.length, 2);
    assert.ok(puntos[0][0].texto.includes('que continúa aquí'));
  });

  test('el separador', () => {
    assert.deepEqual(interpreta('---').map((x) => x.tipo), ['separador']);
  });

  test('las líneas en blanco no dejan párrafos vacíos', () => {
    assert.equal(interpreta('\n\n\nhola\n\n\n').length, 1);
  });
});

describe('el nombre del documento', () => {
  test('sale del primer título', () => {
    assert.equal(tituloDe('# Flujos entre PopCar y el ERP\n\ntexto', 'x'), 'Flujos entre PopCar y el ERP');
  });

  test('si no hay título, se usa el nombre del fichero', () => {
    assert.equal(tituloDe('sin título\n', 'flujos.md'), 'flujos.md');
  });
});

describe('el documento de verdad', () => {
  test('se lee entero, sin tragarse las tablas', () => {
    // Una muestra con la forma real de docs/flujos.md.
    const doc = [
      '# Flujos entre PopCar y el ERP', '', 'Qué pasa cuando un cliente hace algo.', '',
      '## 1. Visita a una oferta', '', '### Por dónde pasa', '',
      '| Paso | Dónde |', '|---|---|', '| Botón | `SlotPicker.js` |', '',
      'La reserva se hace **dentro de una transacción**.', '', '---', '',
      '- **Solo las confirmadas.** Recordar una cita que no hemos dado', '  es peor que no decir nada.',
    ].join('\n');
    const b = interpreta(doc);
    assert.deepEqual(b.map((x) => x.tipo), [
      'titulo', 'parrafo', 'titulo', 'titulo', 'tabla', 'parrafo', 'separador', 'lista',
    ]);
  });
});
