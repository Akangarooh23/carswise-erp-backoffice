/**
 * Que una cuota tecleada tenga que cuadrar con la factura.
 *
 * Una factura de gestoría lleva varios tipos y por eso se puede escribir su
 * cuota a mano. Lo que hace que eso no sea inventarse un número es que la
 * propia consulta exige que **base + cuota sumen el total**: sin esa condición,
 * cualquier cifra entra y el trimestre no cierra por catorce céntimos.
 *
 * Es una comprobación sobre el fichero a sabiendas de que es débil —la
 * condición vive en el SQL y no se puede llamar sin una base delante—. Lo que
 * la justifica es lo que cuesta el fallo: un IVA deducido de más no lo ve nadie
 * hasta que llega una paralela.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./provider-billing.ts', import.meta.url), 'utf8');

/** Solo el trozo del endpoint, para no cazar coincidencias de otros. */
const DESGLOSE = FUENTE.slice(FUENTE.indexOf("/invoices/:id/desglose'"));

describe('la cuota de una factura con varios tipos', () => {
  test('el guardado exige que base y cuota sumen el total', () => {
    assert.match(DESGLOSE, /ABS\(COALESCE\(\$5::numeric, base_amount\) \+ \$6::numeric - invoice_amount\) <= 0\.02/);
  });

  test('y con un céntimo de margen, que una factura de diez líneas no cuadra al céntimo', () => {
    // Y no exacto: las gestorías redondean línea a línea.
    assert.doesNotMatch(DESGLOSE, /- invoice_amount\) = 0/);
  });

  test('sin cuota, la condición no estorba', () => {
    // Si no, corregir solo el régimen de una factura sin base guardada fallaría
    // por una comparación que no viene a cuento.
    assert.match(DESGLOSE, /\$6::numeric IS NULL/);
  });

  test('la cuota solo vale en las nacionales', () => {
    // Una intracomunitaria no lleva IVA dentro: su cuota es la que nos
    // autorrepercutimos, y esa vive en su propia columna.
    assert.match(DESGLOSE, /suRegimen === 'nacional' \? suCuota : null/);
  });

  test('y el total no se toca desde aquí', () => {
    // Es lo que pone el papel. Si está mal, la factura está mal y lo que toca
    // es una rectificativa, no cuadrarlo desde una pantalla.
    assert.doesNotMatch(DESGLOSE, /SET[\s\S]*?invoice_amount\s*=/);
  });

  test('cuando no guarda, se dice si es que no cuadra o que no existe', () => {
    // «No encontrada» delante de una factura que se está viendo en pantalla es
    // el mensaje que hace perder media hora.
    assert.match(DESGLOSE, /no_cuadra/);
    assert.match(DESGLOSE, /not_found/);
  });
});
