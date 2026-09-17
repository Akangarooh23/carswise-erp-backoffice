/**
 * El anuncio se llama marca + modelo + versión, no como lo llame su dueño.
 *
 * `title` en el garaje es el **alias**: «Prueba», «el de mi madre», «Coche
 * familiar». Sirve para reconocerlo entre los suyos y no tiene nada que ver con
 * lo que tiene que leer un comprador — y era lo que salía en la ficha pública.
 * El coche de la primera prueba se anunció como «Prueba».
 *
 * La regla vive en `loQueVaAlAnuncio`, que usan publicar y corregir el coche:
 * así las dos puertas por las que se escribe un anuncio dicen lo mismo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loQueVaAlAnuncio } from '../lib/caracteristicas-del-coche.js';

const IDCARS = readFileSync(join(import.meta.dirname, 'idcars.ts'), 'utf8').replace(/\r\n/g, '\n');
const PUBLICAR = (() => {
  const desde = IDCARS.indexOf("idcarsRouter.post('/idcars/:id/publish'");
  assert.ok(desde > 0, 'no encuentro el endpoint de publicar');
  const siguiente = IDCARS.indexOf('idcarsRouter.', desde + 20);
  return IDCARS.slice(desde, siguiente > 0 ? siguiente : undefined);
})();

describe('cómo se llama el anuncio', () => {
  test('se construye con marca, modelo y versión', () => {
    const a = loQueVaAlAnuncio({ title: 'Prueba', brand: 'Volkswagen', model: 'T-Roc', version: 'R-Line 1.5 eTSI' });
    assert.equal(a.title, 'Volkswagen T-Roc R-Line 1.5 eTSI');
  });

  test('el alias solo se usa si no hay ni marca ni modelo', () => {
    assert.equal(loQueVaAlAnuncio({ title: 'Prueba' }).title, 'Prueba');
  });

  test('publicar lo usa en las dos ramas', () => {
    /*
     * La del coche que se publica por primera vez y la del que ya estaba
     * puesto. La segunda es la que más importa: arregla los que salieron mal.
     */
    assert.match(PUBLICAR, /const anuncio = loQueVaAlAnuncio\(v\)/);
    assert.match(PUBLICAR, /await llevaLasCaracteristicasAlAnuncio\(req\.params\.id, anuncio\)/);
    assert.match(PUBLICAR, /anuncio\.title \|\| `\$\{brand\} \$\{model\} \$\{year\}`/);
    assert.doesNotMatch(PUBLICAR, /\n\s+title \|\| `\$\{brand\}/);
  });

  test('y la versión se guarda en el anuncio', () => {
    assert.equal(loQueVaAlAnuncio({ brand: 'VW', model: 'T-Roc', version: 'R-Line' }).version, 'R-Line');
    assert.match(PUBLICAR, /\(id, title, brand, model, version,/);
    assert.match(IDCARS, /title = \$2, brand = \$3, model = \$4, version = \$5/);
  });
});
