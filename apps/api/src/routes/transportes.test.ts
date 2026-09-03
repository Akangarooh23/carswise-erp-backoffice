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

describe('los tramos que faltan', () => {
  /**
   * El tramo nace con el pedido, pero los pedidos anteriores a esa regla se
   * quedaron sin él. Y sin tramo no hay dónde preguntarle al vendedor por la
   * recogida —que es lo que el expediente pide—, así que un coche pagado sin
   * tramo es trabajo que no aparece en ninguna pantalla.
   */
  const fuente = readFileSync('apps/api/src/routes/transportes.ts', 'utf8');

  test('se abren mirando lo que hay, no confiando en que se crearon', () => {
    assert.match(fuente, /export async function abreLosTramosQueFalten/);
    assert.match(fuente, /LEFT JOIN erp_transportes t ON t\.pedido_id = pe\.id AND t\.tramo = 1/);
    assert.match(fuente, /t\.id IS NULL/);
  });

  test('solo importaciones, y ninguna cancelada', () => {
    // Un pedido de concesionario se recoge de otra manera, y uno cancelado no
    // se trae: abrirle un tramo sería inventar trabajo.
    const trozo = fuente.slice(fuente.indexOf('abreLosTramosQueFalten'));
    assert.match(trozo, /pe\.origen = 'importacion'/);
    assert.match(trozo, /pe\.estado <> 'Cancelado'/);
  });

  test('y se abren al mirar los transportes', () => {
    assert.match(fuente, /await abreLosTramosQueFalten\(\)\.catch/);
  });
});
