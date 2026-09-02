/**
 * Dónde acaba el dinero de una peritación.
 *
 * Los 289 € del perito tienen que llegar a dos sitios distintos, y son dos
 * preguntas distintas: **cuánto cuesta este coche** —el gasto del pedido, de
 * donde sale el margen— y **a quién le debemos dinero** —las facturas recibidas,
 * que es donde se paga—. Estaba solo apuntado en la peritación, que no contesta
 * ninguna de las dos.
 *
 * Y hay un desfase que hace falta cubrir: el perito va y cobra **antes** de que
 * exista el pedido, porque el pedido nace al liberar el pago. Si el gasto solo
 * se apuntara al registrar su factura, esos 289 € no llegarían nunca.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PERITACIONES = readFileSync(new URL('./peritaciones.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const PEDIDOS = readFileSync(new URL('./pedidos.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const FACTURAS = readFileSync(new URL('./provider-billing.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('la factura del perito llega a los dos sitios', () => {
  test('al gasto del coche', () => {
    assert.match(PERITACIONES, /Peritación en Alemania/);
    assert.match(PERITACIONES, /INSERT INTO erp_gastos_pedido/);
  });

  test('y a facturas recibidas, que es donde se paga', () => {
    // El gasto dice lo que cuesta el coche; esto, a quién le debemos dinero.
    assert.match(PERITACIONES, /apuntaFacturaRecibida\(\{/);
  });

  test('sin duplicar: apuntarla dos veces la corrige', () => {
    // Corregir el importe de una factura no puede crear una segunda ni sumar
    // el coste del coche dos veces.
    assert.match(PERITACIONES, /SELECT id FROM erp_gastos_pedido WHERE pedido_id = \$1 AND concepto/);
    assert.match(FACTURAS, /SELECT id FROM moveadvisor_provider_invoices/);
    assert.match(FACTURAS, /UPDATE moveadvisor_provider_invoices/);
  });
});

describe('el desfase entre la peritación y el pedido', () => {
  test('el pedido va a buscar la peritación al nacer', () => {
    // El perito cobra antes de que el pedido exista. Sin esto, sus 289 € no
    // llegan nunca a la cuenta de este coche.
    const crear = PEDIDOS.slice(PEDIDOS.indexOf('export async function creaPedidoDeImportacion'));
    assert.match(crear, /FROM erp_peritaciones p/);
    assert.match(crear, /WHERE p\.lead_id = \$2/);
  });

  test('y no lo duplica si ya estaba apuntado', () => {
    const crear = PEDIDOS.slice(PEDIDOS.indexOf('export async function creaPedidoDeImportacion'));
    assert.match(crear, /NOT EXISTS \(/);
  });

  test('solo si hay algo que apuntar', () => {
    // Una peritación sin factura todavía no es un gasto de cero: es un gasto
    // que no se sabe.
    const crear = PEDIDOS.slice(PEDIDOS.indexOf('export async function creaPedidoDeImportacion'));
    assert.match(crear, /p\.coste IS NOT NULL AND p\.coste > 0/);
  });
});
