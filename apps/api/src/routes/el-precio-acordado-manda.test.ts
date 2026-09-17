/**
 * Un coche, un precio.
 *
 * Del mismo coche había **tres** cifras y ninguna se hablaba con las otras:
 *
 *   · la acordada con él y firmada, en `erp_encargos_venta.precio_referencia`;
 *   · la que el dueño escribió en su panel, en `moveadvisor_user_vehicles.price`;
 *   · y la que se congeló en el escaparate el día que se publicó, en
 *     `moveadvisor_marketplace_vo_offers.price`.
 *
 * Lo que se vio: papel firmado a 17.900 € y el anuncio en marcha a 16.600, el de
 * hacía un mes. Y como el precio del coche estaba en blanco, ese mismo coche no
 * salía en el listado del marketplace —que lo exige— aunque su ficha se abriera
 * desde el enlace de Wallapop.
 *
 * En un encargo el precio lo acordamos nosotros con él y **lo firma**, así que
 * manda ése — y solo cuando lo ha firmado. Guardar una cifra nueva en el ERP no
 * cambia el anuncio: si cambiara, un anuncio vivo saldría con un precio que el
 * dueño no ha aceptado. El anuncio coge el precio al publicar (que exige el
 * papel firmado con esa cifra) y cuando el dueño sube firmado el papel nuevo,
 * que eso lo hace PopCar.
 *
 * Se comprueba sobre la fuente: probarlo de verdad pide tres tablas, y lo que
 * se protege es de dónde salen las escrituras.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RUTA = readFileSync(join(import.meta.dirname, 'encargos.ts'), 'utf8').replace(/\r\n/g, '\n');
const IDCARS = readFileSync(join(import.meta.dirname, 'idcars.ts'), 'utf8').replace(/\r\n/g, '\n');

/** Lo que hace el endpoint del precio, de principio a fin. */
const PRECIO = (() => {
  const desde = RUTA.indexOf("'/encargos/:id/precio'");
  assert.ok(desde > 0, 'no encuentro el endpoint del precio');
  const siguiente = RUTA.indexOf('encargosRouter.', desde + 20);
  return RUTA.slice(desde, siguiente > 0 ? siguiente : undefined);
})();

describe('al acordar el precio', () => {
  test('se guarda en el encargo', () => {
    assert.match(PRECIO, /UPDATE erp_encargos_venta[\s\S]{0,200}precio_referencia = \$4/);
  });

  test('pero no se lleva al anuncio mientras no lo firme', () => {
    /*
     * Se llevaba, y así el anuncio de un coche vivo cambiaba a una cifra que
     * el dueño no había aceptado por escrito.
     */
    assert.doesNotMatch(PRECIO, /UPDATE moveadvisor_marketplace_vo_offers/);
    assert.doesNotMatch(PRECIO, /UPDATE moveadvisor_user_vehicles/);
  });

  test('y los coches sin encargo no se tocan', () => {
    // Aquí solo se llega desde un encargo vivo: la consulta de arriba lo exige.
    assert.match(PRECIO, /SELECT \* FROM erp_encargos_venta WHERE id = \$1 AND cerrado_at IS NULL/);
  });
});

describe('al publicar, el precio firmado llega al coche', () => {
  test('que es lo que mira el listado del marketplace', () => {
    // Sin precio en el coche, no sale en el listado aunque su ficha se abra.
    assert.match(IDCARS, /if \(acordado !== null\) \{\s*await query\(\s*`UPDATE moveadvisor_user_vehicles SET price = \$2/);
  });

  test('y si falla, el anuncio sigue publicado', () => {
    const trozo = IDCARS.slice(IDCARS.indexOf('if (acordado !== null) {'));
    assert.match(trozo.slice(0, 400), /\.catch\(/);
  });
});

describe('y al publicar, manda el acordado', () => {
  /*
   * Con el precio del panel vacío, publicar fallaba con «falta el precio»
   * aunque hubiera un papel firmado a 17.900 €. Y el portero de publicar ya
   * exige que el acordado sea el firmado, así que el acordado es el firmado.
   */
  const PUBLICAR = (() => {
    const desde = IDCARS.indexOf("idcarsRouter.post('/idcars/:id/publish'");
    assert.ok(desde > 0, 'no encuentro el endpoint de publicar');
    const siguiente = IDCARS.indexOf('idcarsRouter.', desde + 20);
    return IDCARS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('se pregunta por el acordado', () => {
    assert.match(PUBLICAR, /await elPrecioAcordadoDe\(req\.params\.id\)/);
  });

  test('y gana al del panel', () => {
    assert.match(PUBLICAR, /const price = acordado \?\? v\.price/);
  });

  test('se pregunta antes de exigir que haya precio', () => {
    /*
     * Al revés no serviría de nada: publicar se caería con «falta el precio»
     * antes de mirar si hay uno acordado, que es justo el caso que esto arregla.
     */
    const pregunta = PUBLICAR.indexOf('elPrecioAcordadoDe(');
    const exige = PUBLICAR.indexOf("missing.push('precio')");
    assert.ok(pregunta > 0 && exige > 0, 'falta alguno de los dos');
    assert.ok(pregunta < exige, 'se exige el precio antes de mirar el acordado');
  });

  test('sin encargo, el precio sigue siendo el del dueño', () => {
    // `elPrecioAcordadoDe` devuelve null y el `??` deja pasar el del panel.
    assert.match(RUTA, /export async function elPrecioAcordadoDe[\s\S]{0,600}cerrado_at IS NULL/);
    assert.match(RUTA, /Number\.isFinite\(precio\) && precio > 0 \? precio : null/);
  });
});
