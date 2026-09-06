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

/*
 * De dónde salen las facturas se comprueba en `apuntes.test.ts`, que es donde
 * vive ahora esa conversión —y allí se comprueba llamándola, no buscando sus
 * líneas en el fichero: un test que busca `Number(f.tipo) * 100` en el código
 * pasa aunque el resultado sea un IVA del 0,21 %.
 */
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
