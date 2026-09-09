/**
 * Un coche que vendemos nosotros no se publica a medias.
 *
 * En la pantalla el botón sale apagado cuando faltan puertas, pero un botón
 * apagado es una pista y no una regla: la promesa de que un anuncio nuestro
 * lleva informe de estado y se puede visitar tiene que sostenerse también
 * cuando la llamada llega de otro sitio.
 *
 * Y al revés: un particular que publica su propio IDCar no nos ha encargado
 * nada. Si el portero le pidiera papeles, habríamos roto lo que ya funcionaba
 * para arreglar lo que todavía no existe.
 *
 * Se comprueba sobre la fuente y no con una base falsa porque lo que hay que
 * proteger es **el orden**: que la comprobación esté antes de escribir en el
 * marketplace. Una base de mentira diría que sí aunque el portero estuviera
 * puesto después de publicar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const leer = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\r\n/g, '\n');

const IDCARS = leer('idcars.ts');
const ENCARGOS = leer('encargos.ts');

/** Lo que hace el endpoint de publicar, de principio a fin. */
const PUBLICAR = (() => {
  const desde = IDCARS.indexOf("idcarsRouter.post('/idcars/:id/publish'");
  assert.ok(desde > 0, 'no encuentro el endpoint de publicar');
  const siguiente = IDCARS.indexOf('idcarsRouter.', desde + 20);
  return IDCARS.slice(desde, siguiente > 0 ? siguiente : undefined);
})();

describe('publicar un coche con encargo', () => {
  test('el portero está puesto', () => {
    assert.match(PUBLICAR, /porQueNoSePuedePublicar\(/);
  });

  test('y se comprueba ANTES de tocar el marketplace', () => {
    /*
     * El fallo que esto caza: dejar la comprobación al final, después de que la
     * oferta ya esté escrita. Entonces el coche sale publicado igual y la única
     * diferencia es que la respuesta dice que no.
     */
    const portero = PUBLICAR.indexOf('porQueNoSePuedePublicar(');
    const escribe = PUBLICAR.search(/INSERT INTO moveadvisor_marketplace_vo_offers|UPDATE moveadvisor_marketplace_vo_offers/);
    assert.ok(escribe > 0, 'este endpoint ya no escribe en el marketplace; revisa la prueba');
    assert.ok(portero < escribe, 'se publica antes de comprobar si se puede');
  });

  test('y si dice que no, se corta ahí', () => {
    assert.match(
      PUBLICAR,
      /const noPuede = await porQueNoSePuedePublicar\([\s\S]{0,80}if \(noPuede\)[\s\S]{0,200}return;/,
      'el portero contesta pero nadie le hace caso',
    );
  });

  test('el motivo llega a la pantalla, para poder llamar al cliente', () => {
    // Un «no» pelado obliga a ir a buscar qué falta. El texto ya viene hecho.
    assert.match(PUBLICAR, /detail: noPuede/);
  });
});

describe('el portero', () => {
  test('sin encargo no pide nada', () => {
    /*
     * Es la mitad de la regla y la que se rompe sin darse cuenta: los IDCars
     * que ya se publican hoy no tienen encargo, y pedirles seis fotos y un
     * informe dejaría de publicar coches que se publicaban.
     */
    assert.match(
      ENCARGOS,
      /if \(!r\.rows\.length\) return '';/,
      'sin encargo debería devolver cadena vacía y no comprobar nada',
    );
  });

  test('mira las cuatro puertas contra lo que hay ahora, no contra una copia', () => {
    // Las puertas no se guardan: si se leyeran de una columna, la de las
    // franjas nunca volvería a cerrarse al gastarse los huecos.
    assert.match(ENCARGOS, /lasPuertas\(await loQueHayDe\(vehicleId\)\)/);
  });

  test('devuelve la frase y no un sí o un no', () => {
    // Al otro lado hay alguien que tiene que llamar y decir qué falta.
    assert.match(ENCARGOS, /loQueLeFalta\(puertas\)\.join/);
  });
});
