/**
 * El puente con el asesor, en la ruta.
 *
 * Las facturas viven en dos tablas y no en una, y eso no es un descuido: las que
 * emitimos a un cliente por un servicio salen de la pasarela con su propia
 * serie, y las de proveedores viven aparte. Mirando una sola, al asesor le falta
 * la mitad del trimestre — y la mitad que falta es siempre la misma.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./contabilidad.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('de dónde salen las facturas', () => {
  test('de las dos tablas donde viven', () => {
    assert.match(FUENTE, /FROM moveadvisor_provider_invoices i/);
    assert.match(FUENTE, /FROM moveadvisor_user_invoices/);
  });

  test('y con el NIF del proveedor, que el asesor necesita', () => {
    // Sin NIF, una factura recibida no se puede anotar: hay que buscarlo, y
    // buscarlo es teclear.
    assert.match(FUENTE, /LEFT JOIN erp_proveedores p ON p\.nombre = i\.provider_name/);
  });

  test('el tipo se convierte: la columna lo guarda en tanto por uno', () => {
    // 0,21 en la base y 21 aquí. Sin convertirlo, el resumen daría un IVA del
    // 0,21 % y nadie lo miraría dos veces.
    assert.match(FUENTE, /Number\(f\.tipo\) \* 100/);
  });

  test('una esperada viaja marcada, no escondida', () => {
    // No es un apunte contable, pero quien mira el trimestre tiene que saber
    // cuántas faltan por llegar antes de darlo por cerrado.
    assert.match(FUENTE, /pendiente: nt\(f\.status\) === 'esperada'/);
  });
});

describe('el periodo', () => {
  test('sin fechas, el trimestre en el que estamos', () => {
    // «Todo» sería un fichero con dos años dentro: eso no se abre, se archiva.
    assert.match(FUENTE, /ahora\?\.trimestre \?\? 1/);
  });

  test('y un trimestre inventado en la dirección no cuela', () => {
    assert.match(FUENTE, /pedido >= 1 && pedido <= 4/);
  });
});

describe('el fichero', () => {
  test('se descarga, no se manda solo', () => {
    // Quien lo manda tiene que haber mirado antes lo que falta. Un envío
    // automático se convierte en un fichero que llega todos los trimestres con
    // los mismos huecos.
    assert.match(FUENTE, /Content-Disposition/);
    assert.doesNotMatch(FUENTE, /enviar\(/);
  });

  test('con BOM, que si no un Excel español lo abre mal', () => {
    assert.match(FUENTE, /Con BOM/);
  });

  test('y solo lo ve un administrador', () => {
    // Es el dinero entero de la empresa, no el de un coche.
    assert.equal((FUENTE.match(/requireRole\(\['admin'\]\)/g) ?? []).length, 2);
  });
});
