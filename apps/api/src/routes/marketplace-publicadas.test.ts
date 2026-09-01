/**
 * Filtrar la tabla de importación por publicadas o por publicar.
 *
 * Son 700 publicadas de 25.498 ofertas alemanas. Sin este filtro, ver solo lo
 * que el cliente ve significa pasar páginas hasta encontrarlas, y eso no es
 * buscar: es rendirse.
 *
 * Se comprueba sobre el SQL que sale, no sobre un simulacro que decida por su
 * cuenta: si la condición no está en el WHERE, la consulta devuelve la tabla
 * entera y la pantalla enseñaría de todo diciendo que está filtrada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FUENTE = readFileSync(
  join(import.meta.dirname, 'marketplace.ts'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('el filtro de publicadas en importación', () => {
  test('se lee el parámetro que manda la pantalla', () => {
    assert.match(FUENTE, /const publicada = s\('published'\)/);
  });

  test('«publicadas» filtra por las que están publicadas', () => {
    assert.match(FUENTE, /publicada === 'true'[\s\S]{0,120}import_published, FALSE\) = TRUE/);
  });

  test('«por publicar» filtra por las que no lo están', () => {
    // Con COALESCE, porque hay filas antiguas con el campo a nulo: sin él se
    // quedarían fuera de las dos listas y no habría forma de verlas.
    assert.match(FUENTE, /publicada === 'false'[\s\S]{0,120}import_published, FALSE\) = FALSE/);
  });

  test('sin el parámetro no se filtra nada', () => {
    // «Todas» tiene que seguir enseñando las 25.498.
    const trozo = FUENTE.slice(FUENTE.indexOf("const publicada = s('published')"));
    const hastaElWhere = trozo.slice(0, trozo.indexOf('const where'));
    assert.ok(!/else\s*\{/.test(hastaElWhere),
      'hay una rama por defecto: «Todas» estaría filtrando por algo');
  });

  test('no se toca import_published desde el filtro', () => {
    // Filtrar es mirar. Lo que decide qué se publica es el ahorro real, y lo
    // recalcula el script del catálogo, no una consulta de listado.
    const trozo = FUENTE.slice(FUENTE.indexOf("const publicada = s('published')"), FUENTE.indexOf('const where'));
    assert.ok(!/UPDATE|SET /i.test(trozo));
  });
});

/**
 * Activar o retirar varias ofertas de golpe.
 *
 * Retirar veinte coches de una campaña abriendo cada uno y guardando es veinte
 * veces el mismo gesto: se acaba no haciendo, y quedan publicados coches que ya
 * no están a la venta.
 */
describe('la acción en bloque de la tabla de ofertas', () => {
  const BLOQUE = FUENTE.slice(
    FUENTE.indexOf("marketplaceRouter.post('/marketplace/offers/bulk'"),
    FUENTE.indexOf('// ── Portal stats')
  );

  test('existe, y solo para quien puede tocar el catálogo', () => {
    assert.ok(BLOQUE.length > 0, 'no está el endpoint');
    assert.match(BLOQUE, /requireRole\(\['admin', 'operations'\]\)/);
  });

  test('solo acepta activar o desactivar', () => {
    // Sin esto, cualquier palabra en `action` decidiría el valor booleano.
    assert.match(BLOQUE, /\['activate', 'deactivate'\]\.includes/);
  });

  test('sin ofertas no hace nada', () => {
    // Una lista vacía con un UPDATE mal montado es un UPDATE sin WHERE.
    assert.match(BLOQUE, /if \(!limpios\.length\)/);
    assert.match(BLOQUE, /sin_ofertas/);
  });

  test('hay un tope, para que un fallo no se lleve la tabla por delante', () => {
    assert.match(BLOQUE, /limpios\.length > 500/);
  });

  test('los identificadores van como parámetro, no pegados al SQL', () => {
    // Pegar una lista que llega del navegador dentro de la consulta es abrir la
    // puerta a que la lista traiga algo más que identificadores.
    assert.match(BLOQUE, /id = ANY\(\$2::text\[\]\)/);
    assert.ok(!/\$\{limpios/.test(BLOQUE), 'los ids se están interpolando en el SQL');
  });

  test('toca is_active y nada más', () => {
    // `import_published` lo decide el ahorro real del cliente y lo recalcula el
    // script del catálogo. No una persona con veinte casillas marcadas.
    assert.match(BLOQUE, /SET is_active = \$1/);
    assert.ok(!/import_published/.test(BLOQUE),
      'la acción en bloque estaría decidiendo qué se publica');
  });

  test('se quitan repetidos y vacíos de lo que llega', () => {
    assert.match(BLOQUE, /new Set\(/);
    assert.match(BLOQUE, /\.filter\(Boolean\)/);
  });
});
