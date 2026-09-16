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
 * En un encargo el precio lo acordamos nosotros con él y queda firmado, así que
 * manda ése. Se comprueba sobre la fuente: probarlo de verdad pide tres tablas,
 * y lo que se protege es que las tres escrituras salgan del mismo sitio.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RUTA = readFileSync(join(import.meta.dirname, 'encargos.ts'), 'utf8').replace(/\r\n/g, '\n');

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

  test('y se le pone al coche', () => {
    /*
     * Es lo que mira el listado del marketplace: sin precio, el coche no sale
     * aunque esté publicado y su ficha se abra.
     */
    assert.match(PRECIO, /UPDATE moveadvisor_user_vehicles SET price = \$2/);
  });

  test('y al anuncio, si ya está puesto', () => {
    // Lo que lee la ficha del coche, que es a donde llega el que viene de
    // Wallapop o de coches.net.
    assert.match(PRECIO, /UPDATE moveadvisor_marketplace_vo_offers[\s\S]{0,80}SET price = \$2/);
    assert.match(PRECIO, /idcar-\$\{cocheId\}/);
  });
});

describe('y con cuidado', () => {
  test('sin precio no se escribe nada', () => {
    /*
     * Un encargo puede guardarse solo para marcar la cláusula, sin tocar la
     * cifra. Sin esta condición, eso pondría el precio del coche a cero y lo
     * sacaría del listado.
     */
    assert.match(PRECIO, /if \(precio && precio > 0\) \{/);
  });

  test('los coches sin encargo no se tocan', () => {
    /*
     * Ese precio es del dueño y lo pone en su panel. Aquí solo se llega desde
     * un encargo vivo: la consulta de arriba ya lo exige.
     */
    assert.match(PRECIO, /SELECT \* FROM erp_encargos_venta WHERE id = \$1 AND cerrado_at IS NULL/);
  });

  test('y si una falla, no se cae la respuesta', () => {
    // Lo peor que queda es lo de antes —dos cifras distintas— y se arregla
    // volviendo a darle a Guardar.
    const escrituras = PRECIO.split('UPDATE moveadvisor_').slice(1);
    assert.equal(escrituras.length, 2, 'esperaba las dos escrituras de fuera');
    for (const e of escrituras) assert.match(e.slice(0, 400), /\.catch\(/);
  });
});

describe('y al publicar, manda el acordado', () => {
  /*
   * Lo otro solo actúa al pulsar Guardar, y eso es «de ahora en adelante»: el
   * coche que ya estaba publicado se quedaba con el precio de hace un mes hasta
   * que alguien se acordara de tocarlo.
   *
   * Peor todavía: con el precio del panel vacío, publicar fallaba con «falta el
   * precio» aunque hubiera un papel firmado a 17.900 €.
   */
  const IDCARS = readFileSync(join(import.meta.dirname, 'idcars.ts'), 'utf8').replace(/\r\n/g, '\n');
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
    const RUTA_ENC = readFileSync(join(import.meta.dirname, 'encargos.ts'), 'utf8');
    assert.match(RUTA_ENC, /export async function elPrecioAcordadoDe[\s\S]{0,600}cerrado_at IS NULL/);
    assert.match(RUTA_ENC, /Number\.isFinite\(precio\) && precio > 0 \? precio : null/);
  });
});
