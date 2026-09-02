import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


/**
 * De qué expediente es cada tramo.
 *
 * El tramo nace del pedido, y se quedaba con `lead_id` a nulo. Eso rompe dos
 * cosas que no se ven hasta que hacen falta: **el segundo tramo se queda sin la
 * dirección del cliente** —sale del expediente, no del pedido— y la orden de
 * recogida no encuentra ningún papel que adjuntar, porque cuelgan del
 * expediente también.
 *
 * Y una tercera que sí se vio: un tramo sin expediente no aparece al buscar los
 * de un coche, así que sobrevive a un borrado y se queda huérfano apuntando a un
 * pedido que ya no existe.
 */
describe('el tramo sabe de qué expediente es', () => {
  const FUENTE = readFileSync(new URL('./transportes.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');

  test('se guarda al abrirlo', () => {
    const abrir = FUENTE.slice(FUENTE.indexOf('export async function abreTransporteDePedido'));
    assert.match(abrir, /INSERT INTO erp_transportes \(id, pedido_id, lead_id,/);
  });

  test('y sale del pedido, no de quien llama', () => {
    // Quien llama ya lo sabe, pero uno de los dos sitios acabaría olvidándoselo.
    const abrir = FUENTE.slice(FUENTE.indexOf('export async function abreTransporteDePedido'));
    assert.match(abrir, /SELECT lead_id FROM erp_pedidos WHERE id = \$1/);
  });

  test('la orden de recogida cuenta con él para los papeles', () => {
    // Los papeles del coche pueden estar en tres cajones: el expediente, el
    // pedido y el propio tramo. La ficha y el COC se suben en el pedido, así
    // que mirando solo uno la lista sale vacía justo cuando existen.
    assert.match(FUENTE, /\{ ambito: 'lead', id: t\.lead_id/);
    assert.match(FUENTE, /\{ ambito: 'pedido', id: t\.pedido_id/);
    assert.match(FUENTE, /\{ ambito: 'transporte', id: req\.params\.id \}/);
  });
});
