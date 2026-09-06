import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  lineaDelIngreso, lineaDelGasto, serieDe,
  NOMBRE_DEL_INGRESO, NOMBRE_DEL_GASTO, ORDEN_DE_INGRESOS, ORDEN_DE_GASTOS,
} from './lineas-de-negocio.js';

describe('de qué línea es cada ingreso', () => {
  test('la venta de un coche lo dice ella misma, y manda sobre la serie', () => {
    // Lleva serie VTA, pero si algún día la numeran distinta sigue siendo venta.
    assert.equal(lineaDelIngreso({ numero: 'CW-2026-0001', tipo: 'vehicle_sale' }), 'venta');
  });

  test('la comisión de una garantía es comisión, no venta', () => {
    assert.equal(lineaDelIngreso({ tipo: 'warranty_commission' }), 'comisiones');
  });

  test('el fee de importación va por su serie', () => {
    assert.equal(lineaDelIngreso({ numero: 'SRV-2026-0001', delCliente: true }), 'importacion');
  });

  test('los informes, por la suya · las dos series conviven', () => {
    assert.equal(lineaDelIngreso({ numero: 'CW-2026-7Q6OK8', delCliente: true }), 'informes');
    assert.equal(lineaDelIngreso({ numero: 'TAS-2026-0001', delCliente: true }), 'informes');
  });

  test('una cuota del plan es suscripción aunque la pasarela la numere a su manera', () => {
    // La tabla de facturación al cliente solo tiene tres cosas dentro y dos
    // llevan serie. Lo que queda es una cuota.
    assert.equal(lineaDelIngreso({ numero: 'GZNNTAHZ-0001', delCliente: true }), 'suscripciones');
    assert.equal(lineaDelIngreso({ numero: 'SUBS-2026-0001', delCliente: true }), 'suscripciones');
  });

  test('y lo que no se sabe de dónde viene se dice, no se reparte', () => {
    assert.equal(lineaDelIngreso({ numero: 'XXX-2026-0001' }), 'otros');
    assert.equal(lineaDelIngreso({}), 'otros');
  });
});

describe('y en qué se va cada gasto', () => {
  test('según el tipo con el que está dado de alta el proveedor', () => {
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['perito'] }), 'peritacion');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['transportista'] }), 'transporte');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['gestoria'] }), 'gestoria');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['vendedor'] }), 'compra');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['garantia'] }), 'garantia');
  });

  test('no se clasifica por lo que ponga el concepto', () => {
    // Esta es la regla: el día que alguien escriba «porte» en vez de
    // «transporte», el número no se puede mover de sitio solo.
    assert.equal(lineaDelGasto({ tiposDelProveedor: null }), 'otros');
    assert.equal(lineaDelGasto({ tiposDelProveedor: [] }), 'otros');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['otro'] }), 'otros');
  });

  test('un proveedor con dos sombreros va al más específico', () => {
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['transportista', 'perito'] }), 'peritacion');
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['transportista', 'vendedor'] }), 'compra');
  });

  test('da igual cómo esté escrito el tipo', () => {
    assert.equal(lineaDelGasto({ tiposDelProveedor: ['Transportista'] }), 'transporte');
  });
});

describe('la serie', () => {
  test('sale del número, en mayúsculas y con guion o barra', () => {
    assert.equal(serieDe('SRV-2026-0001'), 'SRV');
    assert.equal(serieDe('srv-2026-0001'), 'SRV');
    assert.equal(serieDe('TAS/2026/1'), 'TAS');
  });

  test('un número sin serie no inventa una', () => {
    assert.equal(serieDe('20260001'), '');
    assert.equal(serieDe(null), '');
    assert.equal(serieDe(''), '');
  });
});

describe('todas las líneas tienen nombre y sitio', () => {
  // Sin esto, añadir una línea al tipo y olvidarse de nombrarla pinta
  // «undefined» en el panel, que es peor que no pintar nada.
  test('cada línea de ingreso se llama de alguna manera y sale en el orden', () => {
    for (const l of ORDEN_DE_INGRESOS) assert.ok(NOMBRE_DEL_INGRESO[l], `falta el nombre de ${l}`);
    assert.equal(ORDEN_DE_INGRESOS.length, Object.keys(NOMBRE_DEL_INGRESO).length);
  });

  test('y cada línea de gasto', () => {
    for (const l of ORDEN_DE_GASTOS) assert.ok(NOMBRE_DEL_GASTO[l], `falta el nombre de ${l}`);
    assert.equal(ORDEN_DE_GASTOS.length, Object.keys(NOMBRE_DEL_GASTO).length);
  });
});
