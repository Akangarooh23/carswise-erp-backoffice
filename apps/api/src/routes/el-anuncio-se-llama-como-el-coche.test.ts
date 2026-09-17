/**
 * El anuncio se llama marca + modelo + versión, no como lo llame su dueño.
 *
 * `title` en el garaje es el **alias**: «Prueba», «el de mi madre», «Coche
 * familiar». Sirve para reconocerlo entre los suyos y no tiene nada que ver con
 * lo que tiene que leer un comprador — y era lo que salía en la ficha pública.
 * El coche de la primera prueba se anunció como «Prueba».
 *
 * Y es la misma regla que ya usaba el listado del marketplace, que sí lo hacía
 * bien: estaban escritas las dos y decían cosas distintas del mismo coche.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IDCARS = readFileSync(join(import.meta.dirname, 'idcars.ts'), 'utf8').replace(/\r\n/g, '\n');
const PUBLICAR = (() => {
  const desde = IDCARS.indexOf("idcarsRouter.post('/idcars/:id/publish'");
  assert.ok(desde > 0, 'no encuentro el endpoint de publicar');
  const siguiente = IDCARS.indexOf('idcarsRouter.', desde + 20);
  return IDCARS.slice(desde, siguiente > 0 ? siguiente : undefined);
})();

describe('cómo se llama el anuncio', () => {
  test('se construye con marca, modelo y versión', () => {
    assert.match(PUBLICAR, /const titulo = \[brand, model, version\]/);
  });

  test('y es eso lo que se escribe, no el alias', () => {
    /*
     * Las dos ramas: la del coche que se publica por primera vez y la del que
     * ya estaba puesto. La segunda es la que más importa, porque es la que
     * arregla los que ya salieron mal.
     */
    const usos = PUBLICAR.match(/titulo \|\| `\$\{brand\} \$\{model\} \$\{year\}`/g) ?? [];
    assert.equal(usos.length, 2, 'alguna de las dos ramas sigue escribiendo el alias');
    assert.doesNotMatch(PUBLICAR, /\n\s+title \|\| `\$\{brand\}/);
  });

  test('el alias solo se usa si no hay ni marca ni modelo', () => {
    // Y ese coche no se puede publicar de todas formas: publicar los exige.
    assert.match(PUBLICAR, /\.join\(' '\) \|\| String\(title \?\? ''\)\.trim\(\)/);
  });

  test('y la versión se guarda en el anuncio', () => {
    /*
     * Es la mitad de lo que distingue un coche de otro: un T-Roc «R-Line 1.5
     * eTSI» no es el mismo coche que un T-Roc a secas, y el que compara dos
     * anuncios necesita verlo.
     */
    assert.match(PUBLICAR, /version = \$13/);
    assert.match(PUBLICAR, /\(id, title, brand, model, version,/);
  });
});
