/**
 * Las reglas de un pedido.
 *
 * Lo que se comprueba aquí es lo que no puede pasar: encargar un coche sin
 * decir a quién, y avanzar por un camino que no existe. Los estados son los
 * mismos para todos los orígenes —Alemania, un concesionario, un renting—
 * porque encargar es lo mismo en los tres.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_PEDIDO, QUE_TOCA_PEDIDO, ORIGENES_PEDIDO, ETIQUETA_ORIGEN, CANCELADO,
  esEstadoValido, esOrigenPedido, siguienteEstado, puedeEncargarse, notaDelCambio,
} from './pedidos.js';

describe('el camino de un pedido', () => {
  test('cada estado lleva al siguiente', () => {
    assert.equal(siguienteEstado('Borrador'), 'Pedido');
    assert.equal(siguienteEstado('Pedido'), 'Confirmado');
    assert.equal(siguienteEstado('En camino'), 'Recibido');
  });

  test('recibido es el final', () => {
    assert.equal(siguienteEstado('Recibido'), null);
  });

  test('cancelado no lleva a ninguna parte', () => {
    assert.equal(siguienteEstado(CANCELADO), null);
    assert.ok(esEstadoValido(CANCELADO), 'pero es un estado que se puede poner');
  });

  test('un estado inventado no vale', () => {
    assert.equal(esEstadoValido('En proceso'), false);
    assert.equal(esEstadoValido('Entregado'), false,
      'entregar es del expediente del cliente, no del pedido al proveedor');
  });

  test('cada estado dice qué toca hacer', () => {
    for (const e of ESTADOS_PEDIDO) {
      assert.ok(QUE_TOCA_PEDIDO[e]?.length > 3, `«${e}» sin decir qué toca`);
    }
  });
});

describe('de dónde viene el coche', () => {
  test('los cinco orígenes valen', () => {
    for (const o of ORIGENES_PEDIDO) assert.ok(esOrigenPedido(o));
  });

  test('y cada uno tiene nombre para la pantalla', () => {
    for (const o of ORIGENES_PEDIDO) {
      assert.ok(ETIQUETA_ORIGEN[o]?.length > 2, `«${o}» sin etiqueta`);
    }
  });

  test('uno inventado no', () => {
    assert.equal(esOrigenPedido('subasta'), false);
  });
});

describe('sin proveedor no hay pedido', () => {
  test('encargarlo exige saber a quién', () => {
    assert.equal(puedeEncargarse({ proveedor: '' }), false,
      'un coche esperando sin saber a quién reclamar');
    assert.equal(puedeEncargarse({ proveedor: '   ' }), false);
    assert.equal(puedeEncargarse({ proveedor: null }), false);
  });

  test('con proveedor, sí', () => {
    assert.equal(puedeEncargarse({ proveedor: 'Autohaus Müller' }), true);
  });
});

describe('la nota de un cambio', () => {
  const CUANDO = new Date('2026-08-30T10:00:00Z');

  test('dice de dónde a dónde, y se suma a lo que había', () => {
    const previas = '[29 ago 2026 · Borrador → Pedido] Encargado por teléfono';
    const r = notaDelCambio(previas, 'Pedido', 'Confirmado', 'Confirman para el 12', CUANDO);
    assert.ok(r.startsWith(previas), 'lo de antes no se pisa');
    assert.match(r, /Pedido → Confirmado/);
    assert.match(r, /Confirman para el 12/);
  });

  test('sin texto no se escribe nada', () => {
    assert.equal(notaDelCambio('lo de antes', 'Pedido', 'Confirmado', '  ', CUANDO), 'lo de antes');
  });
});
