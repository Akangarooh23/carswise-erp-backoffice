import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { margenPorCoche, type Coche } from './margen-por-coche.js';
import type { ApunteConLinea } from './cuenta-de-resultados.js';

const KIA: Coche = { id: 'imp-1', vehiculo: 'Kia Sorento 2.4 GDI AWD', estado: 'Entregado' };

/** El fee del servicio: 3.630 € con IVA, atado por el expediente. */
const FEE: ApunteConLinea = {
  numero: 'SRV-2026-0001', fecha: '2026-09-02', sentido: 'emitida', contraparte: 'cliente',
  total: 3630, iva: 21, regimen: 'nacional', contrato: 'imp-1',
};

/** Y el perito, atado por el título del coche: su factura no lleva expediente. */
const PERITO: ApunteConLinea = {
  numero: 'ACD-1', fecha: '2026-09-07', sentido: 'recibida', contraparte: 'checkdenwagen',
  base: 289, total: 289, iva: 0, regimen: 'intracomunitario', vehiculo: 'Kia Sorento 2.4 GDI AWD',
};

describe('el margen de un coche', () => {
  test('junta lo cobrado por el expediente con lo gastado por el título', () => {
    // Son los dos únicos hilos que hay: la factura del servicio no lleva coche
    // y las de proveedor no llevan expediente.
    const r = margenPorCoche([KIA], [FEE, PERITO]);
    assert.equal(r.coches[0].ingreso, 3000);
    assert.equal(r.coches[0].gasto, 289);
    assert.equal(r.coches[0].margen, 2711);
    assert.equal(r.coches[0].porcentaje, 90.37);
    assert.equal(r.coches[0].facturas, 2);
  });

  test('el título se compara sin mayúsculas ni espacios de sobra', () => {
    const r = margenPorCoche([KIA], [{ ...PERITO, vehiculo: '  KIA  Sorento 2.4 GDI AWD ' }]);
    assert.equal(r.coches[0].gasto, 289);
  });

  test('pero no se parece: «Kia Sorento» no es «Kia Sportage»', () => {
    const r = margenPorCoche([KIA], [{ ...PERITO, vehiculo: 'Kia Sportage' }]);
    assert.equal(r.coches[0].gasto, 0);
    assert.equal(r.sinAtribuir.n, 1, 'y se cuenta como huérfana');
  });

  test('un suplido no es ni ingreso ni gasto', () => {
    const r = margenPorCoche([KIA], [FEE, { ...FEE, que: 'suplido', total: 16890 }]);
    assert.equal(r.coches[0].ingreso, 3000);
  });

  test('una factura que no ha llegado es gasto comprometido, no gasto', () => {
    const r = margenPorCoche([KIA], [FEE, { ...PERITO, pendiente: true, base: 400, total: 400 }]);
    assert.equal(r.coches[0].gasto, 0);
    assert.equal(r.coches[0].comprometido, 400);
  });

  test('sin ingreso no hay porcentaje: null, no cero', () => {
    // Un 0 % se lee como que se ingresó algo y no dejó nada.
    const r = margenPorCoche([KIA], [PERITO]);
    assert.equal(r.coches[0].margen, -289);
    assert.equal(r.coches[0].porcentaje, null);
  });

  test('y un coche sin nada atribuido sale igual', () => {
    // Que un expediente en marcha no tenga ni una factura es información.
    const r = margenPorCoche([KIA], []);
    assert.equal(r.coches.length, 1);
    assert.equal(r.coches[0].facturas, 0);
  });
});

describe('lo que no se ata a ningún coche', () => {
  test('se cuenta y se suma, en vez de desaparecer', () => {
    // Un título escrito distinto deja la factura fuera y el margen sale mejor
    // de lo que es. Con los huérfanos al lado, la cifra se puede usar.
    const suelta: ApunteConLinea = {
      numero: 'X-1', fecha: '2026-09-01', sentido: 'recibida', contraparte: 'quien sea',
      base: 890, total: 890, iva: 0, regimen: 'intracomunitario', vehiculo: 'Otro coche',
    };
    const r = margenPorCoche([KIA], [FEE, PERITO, suelta]);
    assert.equal(r.sinAtribuir.n, 1);
    assert.equal(r.sinAtribuir.base, 890);
  });

  test('un ingreso suelto no cuenta como gasto huérfano', () => {
    // Lo que preocupa es el gasto que no llega a ningún coche: infla el margen.
    const r = margenPorCoche([KIA], [{ ...FEE, contrato: 'otro', vehiculo: 'Otro' }]);
    assert.equal(r.sinAtribuir.n, 0);
  });

  test('ni una esperada, que todavía no es un gasto', () => {
    const r = margenPorCoche([KIA], [{ ...PERITO, vehiculo: 'Otro', pendiente: true }]);
    assert.equal(r.sinAtribuir.n, 0);
  });
});

describe('la media', () => {
  test('solo de los entregados', () => {
    /*
     * Un coche a medio camino tiene el fee cobrado y la mitad de las facturas
     * sin llegar: su margen parece enorme. Metido en la media, contesta mal a
     * «cuánto deja una importación».
     */
    const enMarcha: Coche = { id: 'imp-2', vehiculo: 'BMW X1', estado: 'En transporte' };
    const feeDelDos: ApunteConLinea = { ...FEE, numero: 'SRV-2', contrato: 'imp-2', total: 3630 };
    const r = margenPorCoche([KIA, enMarcha], [FEE, PERITO, feeDelDos]);
    assert.equal(r.cuantosEntregados, 1);
    assert.equal(r.medioEntregados, 2711, 'el que va por la mitad no entra');
  });

  test('sin ninguno entregado no hay media', () => {
    const r = margenPorCoche([{ ...KIA, estado: 'En transporte' }], [FEE, PERITO]);
    assert.equal(r.medioEntregados, null);
    assert.equal(r.cuantosEntregados, 0);
  });

  test('y un entregado sin ingreso tampoco cuenta', () => {
    // Sin fee cobrado no es una operación cerrada, es una a medias.
    const r = margenPorCoche([KIA], [PERITO]);
    assert.equal(r.cuantosEntregados, 0);
    assert.equal(r.medioEntregados, null);
  });
});

describe('sin datos', () => {
  test('no revienta', () => {
    assert.deepEqual(margenPorCoche([], []).coches, []);
    assert.equal(margenPorCoche(null, null).medioEntregados, null);
    assert.equal(margenPorCoche(null, null).sinAtribuir.n, 0);
  });
});
