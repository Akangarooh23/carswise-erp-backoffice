/**
 * La garantía de una importación, al entregar el coche.
 *
 * **PopCar no la da.** No le vendemos el coche: se lo vende el concesionario
 * alemán, y es él quien le debe la garantía legal europea de dos años. Poner
 * doce meses nuestros por defecto era del modelo anterior, y escribirlo en el
 * documento de entrega sería prometer algo que no damos.
 *
 * Lo que sí damos es lo que de verdad se compra aquí: **reclamamos nosotros**.
 * Un particular que compra una vez en Alemania no tiene forma de presionar a un
 * concesionario de otro país, en otro idioma y con otro derecho de consumo.
 * Nosotros traemos coches todas las semanas y hablamos con esa gente todas las
 * semanas. Eso no cabe en una fecha de fin, así que va escrito.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { garantiaDeUnaImportacion } from './entrega.js';

describe('sin garantía contratada', () => {
  const g = garantiaDeUnaImportacion(null);

  test('la que hay es la del vendedor alemán', () => {
    assert.equal(g.de, 'vendedor_aleman');
  });

  test('y no se inventa una fecha de fin', () => {
    // Una fecha de fin de una garantía que no damos es una promesa. Y peor: una
    // que el cliente enseñaría el día que algo se rompa.
    assert.equal(g.meses, null);
    assert.equal(g.producto, null);
  });

  test('pero se dice lo que sí damos', () => {
    assert.match(g.loQueDamos, /legal de dos años/i);
    assert.match(g.loQueDamos, /lo hacemos nosotros/i);
  });
});

describe('con una garantía contratada', () => {
  const g = garantiaDeUnaImportacion({ nombre: 'Mecánica 24 meses', meses: 24 });

  test('la pone la aseguradora, no nosotros', () => {
    assert.equal(g.de, 'aseguradora');
    assert.equal(g.producto, 'Mecánica 24 meses');
    assert.equal(g.meses, 24);
  });

  test('y aun así reclamamos nosotros', () => {
    // Es la mitad del producto: la póliza la puede vender cualquiera, quien le
    // ahorra la discusión en alemán somos nosotros.
    assert.match(g.loQueDamos, /Mecánica 24 meses/);
    assert.match(g.loQueDamos, /lo hacemos nosotros/i);
  });
});

describe('lo que no cuela', () => {
  test('un producto sin meses no es una garantía', () => {
    const g = garantiaDeUnaImportacion({ nombre: 'Algo', meses: 0 });
    assert.equal(g.de, 'vendedor_aleman');
  });

  test('ni unos meses sin producto', () => {
    const g = garantiaDeUnaImportacion({ nombre: '', meses: 24 });
    assert.equal(g.de, 'vendedor_aleman');
  });

  test('en ninguno de los dos casos se pone PopCar', () => {
    for (const caso of [null, { nombre: 'X', meses: 12 }, { nombre: '', meses: 0 }]) {
      assert.notEqual(garantiaDeUnaImportacion(caso).de, 'popcar');
    }
  });
});
