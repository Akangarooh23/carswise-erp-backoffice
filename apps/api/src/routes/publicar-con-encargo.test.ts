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

describe('la sexta puerta, que es la nuestra', () => {
  /*
   * Las cinco anteriores son cosas del cliente: su coche, sus papeles, su
   * tasación, su informe, sus horas. Con solo esas, un coche al que no ha
   * mirado ningún mecánico sale publicado con un anuncio que dice que está
   * comprobado — el mismo fallo que se tapó con el informe de estado, pero en
   * la parte que ponemos nosotros.
   */
  const PORTERO = (() => {
    const desde = ENCARGOS.indexOf('export async function porQueNoSePuedePublicar');
    assert.ok(desde > 0, 'no encuentro el portero');
    const siguiente = ENCARGOS.indexOf('\nexport ', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('el portero pregunta también al taller', () => {
    assert.match(PORTERO, /porQueElTallerNoDeja\(vehicleId\)/);
  });

  test('y no dice que sí antes de preguntarle', () => {
    /*
     * El fallo que esto caza: dejar la llamada al taller después del
     * `return ''` de las cinco puertas. Entonces la comprobación existe, se ve
     * en el código y no se ejecuta nunca.
     */
    const taller = PORTERO.indexOf('porQueElTallerNoDeja(');
    const dicheQueSi = PORTERO.lastIndexOf("return '';");
    assert.ok(dicheQueSi > 0, 'el portero ya no devuelve cadena vacía; revisa la prueba');
    assert.ok(taller < dicheQueSi, 'se da el visto bueno antes de preguntar al taller');
  });

  test('y le hace caso a lo que conteste', () => {
    // Un `await` cuyo resultado no se mira es una comprobación decorativa.
    assert.match(PORTERO, /if \(taller\) return/);
  });

  test('el aviso de «listo para el taller» se apaga cuando el taller contesta', () => {
    /*
     * Si se contara con `sePuedePublicar` a secas, un coche ya revisado y ya
     * publicado seguiría saliendo como pendiente el resto de su vida, y una
     * lista de pendientes que no se vacía nunca se deja de mirar.
     */
    assert.match(ENCARGOS, /sePuedePublicar\(puertas\) && sigueEsperandoAlTaller\(taller\)/);
  });

  test('y el coche que el taller tumba no se queda callado', () => {
    // No está comprobado, pero tampoco espera a nadie: lo que necesita es una
    // llamada al cliente, así que tiene su propia línea.
    assert.match(ENCARGOS, /elTallerLoTumbo\(taller\)/);
  });
});
