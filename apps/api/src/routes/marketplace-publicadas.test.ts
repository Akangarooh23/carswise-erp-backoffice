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
