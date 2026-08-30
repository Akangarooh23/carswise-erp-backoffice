/**
 * Lo que ha costado el coche, y lo que se ha ganado.
 *
 * Lo que se comprueba: que el coste sume lo que está repartido por tres sitios,
 * que un coche sin vender no tenga margen —tiene coste— y que el resumen por
 * origen no mezcle lo que todavía está de camino.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { costeDelCoche, margenDelCoche, margenPorOrigen } from './coste.js';

describe('lo que cuesta un coche', () => {
  test('suma el proveedor, el transporte, la gestoría y el reacondicionado', () => {
    const c = costeDelCoche({
      precioProveedor: 9000,
      transportes: [{ coste: 450 }, { coste: 120 }],
      tramites: [{ coste: 1200 }, { coste: 180 }],
      gastos: [{ importe: 620 }, { importe: 240 }],
    });
    assert.equal(c.total, 11810);
  });

  test('sin el reacondicionado el margen sale optimista', () => {
    const sinTaller = costeDelCoche({ precioProveedor: 9000 });
    const conTaller = costeDelCoche({ precioProveedor: 9000, gastos: [{ importe: 860 }] });
    assert.equal(conTaller.total - sinTaller.total, 860,
      'un coche que llega con las ruedas gastadas lleva mil euros encima');
  });

  test('lo que todavía no hay suma cero, pero sale la línea', () => {
    const c = costeDelCoche({ precioProveedor: 9000 });
    assert.equal(c.total, 9000);
    assert.equal(c.partidas.length, 4,
      'decir «transporte: 0» es más honesto que esconder la línea');
    assert.equal(c.partidas.find((p) => /transporte/i.test(p.concepto))?.importe, 0);
  });

  test('un pedido sin precio no rompe la suma', () => {
    assert.equal(costeDelCoche({ transportes: [{ coste: 450 }] }).total, 450);
  });

  test('los importes que vienen como texto se cuentan igual', () => {
    assert.equal(costeDelCoche({ precioProveedor: '9000.00', tramites: [{ coste: '180.50' }] }).total, 9180.5);
  });
});

describe('lo que se gana', () => {
  test('venta menos coste, con su porcentaje sobre la venta', () => {
    const m = margenDelCoche(10950, 13500)!;
    assert.equal(m.margen, 2550);
    assert.equal(m.porcentaje, 18.9);
  });

  test('un coche sin vender no tiene margen: tiene coste', () => {
    assert.equal(margenDelCoche(10950, null), null);
    assert.equal(margenDelCoche(10950, 0), null,
      'un margen negativo enorme porque aún no se ha cobrado sería peor que no enseñar nada');
  });

  test('perder dinero también se ve', () => {
    const m = margenDelCoche(14000, 13000)!;
    assert.equal(m.margen, -1000);
  });
});

describe('dónde se gana', () => {
  const coches = [
    { origen: 'importacion', coste: 10950, venta: 13500 },
    { origen: 'importacion', coste: 9000, venta: 10500 },
    { origen: 'particular', coste: 6000, venta: 8000 },
    { origen: 'concesionario', coste: 12000 },
  ];

  test('agrupa por origen y da el margen medio', () => {
    const r = margenPorOrigen(coches);
    assert.equal(r.importacion.coches, 2);
    assert.equal(r.importacion.margen, 4050);
    assert.equal(r.importacion.medio, 2025);
    assert.equal(r.particular.margen, 2000);
  });

  test('lo que no se ha vendido no cuenta', () => {
    const r = margenPorOrigen(coches);
    assert.equal(r.concesionario, undefined,
      'mezclarlo daría un número que baja según se compra, y eso no dice si el camino es bueno');
  });

  test('sin nada vendido, el resumen está vacío', () => {
    assert.deepEqual(margenPorOrigen([{ origen: 'importacion', coste: 9000 }]), {});
  });
});
