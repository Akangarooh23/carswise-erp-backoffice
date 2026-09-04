/**
 * Lo que ha costado el coche, y lo que se ha ganado.
 *
 * Lo que se comprueba: que el coste sume lo que está repartido por tres sitios,
 * que un coche sin vender no tenga margen —tiene coste— y que el resumen por
 * origen no mezcle lo que todavía está de camino.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  costeDelCoche, margenDelCoche, margenPorOrigen,
  cuentaDeUnaImportacion, quePasaConSuDinero,
} from './coste.js';

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

/**
 * Y la cuenta de una importación, que no es una compraventa.
 *
 * En el stock el coche es nuestro: coste y venta son lo que parecen. En una
 * importación **el coche no es nuestro** —los 16.890 € del Kia son dinero del
 * cliente camino de un concesionario alemán, y los 1.420 € del impuesto camino
 * de Hacienda— y meterlos en «lo que cuesta el coche» da un número que no
 * significa nada.
 *
 * Son dos cuentas. La del cliente tiene que cuadrar: puso 21.500 y tienen que
 * salir 21.500. La nuestra es el servicio menos lo que gastamos, todo en base
 * porque el IVA soportado se deduce.
 */
describe('la cuenta de una importación', () => {
  const KIA = {
    escrow: { coche: 16890, fee: 3000, impuesto: 1420, garantia: 190 },
    costes: [
      { total: 289, iva: 21, que: 'nuestro' as const, regimen: 'intracomunitario' as const },
      { total: 890, iva: 21, que: 'nuestro' as const, regimen: 'intracomunitario' as const },
      { total: 484, iva: 21, que: 'nuestro' as const, regimen: 'nacional' as const },
      { total: 119.07, iva: 21, que: 'nuestro' as const, regimen: 'nacional' as const },
    ],
  };

  test('lo que puso y a dónde va', () => {
    const c = cuentaDeUnaImportacion(KIA);
    assert.equal(c.deposito, 21500);
    assert.equal(c.aTerceros, 18500, 'coche, impuesto y garantía');
    assert.equal(c.ingreso, 3000);
  });

  test('y cuadra, que es la única pregunta de esa cuenta', () => {
    assert.equal(cuentaDeUnaImportacion(KIA).descuadre, 0);
    assert.equal(quePasaConSuDinero(cuentaDeUnaImportacion(KIA)), null);
  });

  test('el margen es el servicio menos lo nuestro, en base', () => {
    // 289 + 890 tal cual —vienen sin IVA— más 400 y 98,4 quitado el 21 %.
    const c = cuentaDeUnaImportacion(KIA);
    assert.equal(c.coste, 1677.4);
    assert.equal(c.margen, 1322.6);
    assert.equal(c.porcentaje, 44.1);
  });

  test('el coche no cuenta como coste nuestro', () => {
    // Es el error que da un margen sin sentido: 16.890 € que no son nuestros.
    assert.ok(cuentaDeUnaImportacion(KIA).coste < 2000);
  });

  test('y el IVA que se deduce no es ni coste ni margen', () => {
    assert.equal(cuentaDeUnaImportacion(KIA).ivaSoportado, 104.67);
  });

  test('lo que ha costado de verdad manda sobre lo que se estimó', () => {
    // El impuesto se cobró estimado y la gestoría escribe el real. Si sale más
    // barato, ese dinero es del cliente.
    const c = cuentaDeUnaImportacion({ ...KIA, impuestoReal: 1180 });
    assert.equal(c.aTerceros, 18260);
    assert.equal(c.descuadre, 240);
    assert.match(quePasaConSuDinero(c) ?? '', /Sobran 240,00 €.*devolvérselos/);
  });

  test('y si sale más caro, lo estamos poniendo nosotros', () => {
    const c = cuentaDeUnaImportacion({ ...KIA, impuestoReal: 1687.5 });
    assert.equal(c.descuadre, -267.5);
    assert.match(quePasaConSuDinero(c) ?? '', /Faltan 267,50 €.*poniendo nosotros/);
  });

  test('mientras no se sepa el real, se usa lo cobrado', () => {
    // Decir que descuadra porque todavía no ha llegado un papel sería un aviso
    // falso todos los días hasta que llegue.
    assert.equal(cuentaDeUnaImportacion({ ...KIA, impuestoReal: null }).descuadre, 0);
    assert.equal(cuentaDeUnaImportacion({ ...KIA, impuestoReal: '' }).descuadre, 0);
  });

  test('lo mismo con el precio del coche, que sale de su factura', () => {
    const c = cuentaDeUnaImportacion({ ...KIA, precioProveedor: 16750 });
    assert.equal(c.descuadre, 140);
  });

  test('las líneas sin desglosar se cuentan y viajan con el margen', () => {
    // Un margen calculado con cuatro líneas sin IVA conocido no es un margen:
    // es una estimación por lo bajo, porque cuentan enteras como base.
    const c = cuentaDeUnaImportacion({
      ...KIA, costes: [{ total: 253, que: 'nuestro' as const }],
    });
    assert.equal(c.sinDesglosar, 1);
    assert.equal(c.coste, 253);
  });

  test('un suplido entre los costes no cuesta nada', () => {
    const c = cuentaDeUnaImportacion({
      ...KIA,
      costes: [...KIA.costes, { total: 1420, iva: 0, que: 'suplido' as const, regimen: 'exento' as const }],
    });
    assert.equal(c.coste, 1677.4, 'el impuesto no es coste nuestro');
  });

  test('sin servicio cobrado no se inventa un porcentaje', () => {
    // Dividir entre cero da Infinity, y eso acaba impreso en una pantalla.
    const c = cuentaDeUnaImportacion({ escrow: { coche: 16890 }, costes: [] });
    assert.equal(c.porcentaje, null);
  });
});
