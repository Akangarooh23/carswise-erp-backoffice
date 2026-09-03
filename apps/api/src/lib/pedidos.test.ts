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
  faltaParaLlegarA, faltaPorEstado, alMenos, importeAcordado,
  estadoQueLeToca,
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

/**
 * Las puertas de cada fase.
 *
 * Cada cosa se pide en el estado que la define, no antes: pedir los kilómetros
 * de un coche que sigue en Alemania solo consigue que alguien escriba un número
 * para poder pasar, y entonces hay un dato falso donde antes había un hueco
 * honesto.
 */
describe('qué falta para llegar a cada fase', () => {
  // Un pedido al que no le falta ninguno de sus propios datos.
  const listo = {
    proveedor: 'Autohero GmbH', importe: 14310,
    factura_proveedor: 'RE-2026-4471', factura_pagada_el: '2026-09-02',
  };

  test('sin proveedor no se encarga', () => {
    assert.deepEqual(faltaParaLlegarA('Pedido', { importe: 100 }), ['A quién se le encarga']);
  });

  test('sin importe no se confirma', () => {
    assert.deepEqual(
      faltaParaLlegarA('Confirmado', { proveedor: 'Autohero GmbH' }),
      ['Por cuánto se ha cerrado']
    );
  });

  test('un importe de cero no es un precio cerrado', () => {
    assert.deepEqual(faltaParaLlegarA('Confirmado', { proveedor: 'X', importe: 0 }),
      ['Por cuánto se ha cerrado']);
    assert.deepEqual(faltaParaLlegarA('Confirmado', { proveedor: 'X', importe: '' }),
      ['Por cuánto se ha cerrado']);
  });

  test('confirmar no pide papeles: llegan en momentos distintos', () => {
    assert.deepEqual(faltaParaLlegarA('Confirmado', listo, { papeles: ['COC'] }), []);
  });

  test('pero mover el coche sí', () => {
    assert.deepEqual(faltaParaLlegarA('En camino', listo, { papeles: ['COC'] }), ['COC']);
  });

  test('confirmar tampoco pide mirar un coche que no ha llegado', () => {
    assert.deepEqual(
      faltaParaLlegarA('Confirmado', listo, { recepcion: ['Los kilómetros que marca'] }),
      []
    );
  });

  test('darlo por recibido sí', () => {
    assert.deepEqual(
      faltaParaLlegarA('Recibido', listo, { recepcion: ['Los kilómetros que marca'] }),
      ['Los kilómetros que marca']
    );
  });

  test('el atajo exige lo mismo que ir paso a paso', () => {
    // De Borrador a «En camino» de una vez: sin esto, saltar sería la forma de
    // saltarse las puertas.
    assert.deepEqual(
      faltaParaLlegarA('En camino', {}, { papeles: ['COC'], comprobaciones: ['Mirar cargas'] }),
      [
        'A quién se le encarga', 'Mirar cargas', 'Por cuánto se ha cerrado', 'COC',
        'El número de la factura del vendedor', 'Que esté pagada',
      ]
    );
  });

  test('mover un coche sin pagarlo, no: sigue siendo del vendedor', () => {
    assert.deepEqual(
      faltaParaLlegarA('En camino', { proveedor: 'X', importe: 100 }),
      ['El número de la factura del vendedor', 'Que esté pagada']
    );
  });

  test('la factura sin pagar tampoco vale', () => {
    assert.deepEqual(
      faltaParaLlegarA('En camino', { ...listo, factura_pagada_el: null }),
      ['Que esté pagada']
    );
  });

  test('pagada sin número de factura tampoco: sería un cargo sin concepto', () => {
    assert.deepEqual(
      faltaParaLlegarA('En camino', { ...listo, factura_proveedor: '  ' }),
      ['El número de la factura del vendedor']
    );
  });

  test('confirmar no pide ni factura ni pago: todavía no hay nada que pagar', () => {
    assert.deepEqual(faltaParaLlegarA('Confirmado', { proveedor: 'X', importe: 100 }), []);
  });

  test('sin nadie que lo haya recogido no está en camino', () => {
    assert.deepEqual(
      faltaParaLlegarA('En camino', listo, { transporteSinSalir: true }),
      ['Que alguien lo haya recogido: el transporte, contratado y de camino']
    );
  });

  test('y para confirmarlo no hace falta transporte: aún no hay qué mover', () => {
    assert.deepEqual(faltaParaLlegarA('Confirmado', listo, { transporteSinSalir: true }), []);
  });

  test('un borrador no pide nada: para eso existe', () => {
    assert.deepEqual(faltaParaLlegarA('Borrador', {}, { papeles: ['COC'] }), []);
  });

  test('cancelar no pide nada: no es avanzar', () => {
    assert.deepEqual(faltaParaLlegarA('Cancelado', {}, { papeles: ['COC'] }), []);
  });

  test('con todo, no falta nada', () => {
    assert.deepEqual(faltaParaLlegarA('Recibido', listo), []);
  });
});

describe('lo que falta, fase por fase', () => {
  test('cada estado con lo suyo, para poder enseñarlo antes de intentarlo', () => {
    const mapa = faltaPorEstado({ proveedor: '', importe: null }, {
      papeles: ['COC'], recepcion: ['Cuántas llaves vienen'],
    });
    assert.deepEqual(mapa['Borrador'], []);
    assert.deepEqual(mapa['Pedido'], ['A quién se le encarga']);
    assert.deepEqual(mapa['Confirmado'], ['A quién se le encarga', 'Por cuánto se ha cerrado']);
    assert.ok(mapa['En camino'].includes('COC'));
    assert.ok(mapa['Recibido'].includes('Cuántas llaves vienen'));
  });
});

describe('el punto del camino', () => {
  test('llegar a un estado es haber pasado por los de antes', () => {
    assert.equal(alMenos('Recibido', 'Confirmado'), true);
    assert.equal(alMenos('Pedido', 'Confirmado'), false);
    assert.equal(alMenos('Confirmado', 'Confirmado'), true);
    assert.equal(alMenos('Cancelado', 'Pedido'), false, 'cancelar no es avanzar');
  });

  test('un precio es un número mayor que cero', () => {
    assert.equal(importeAcordado(14310), true);
    assert.equal(importeAcordado('14310'), true);
    assert.equal(importeAcordado(0), false);
    assert.equal(importeAcordado(null), false);
    assert.equal(importeAcordado('no sé'), false);
  });
});

describe('el estado que le toca a un pedido por lo que ya se sabe', () => {
  test('pagado al vendedor: nadie paga un coche sin confirmar', () => {
    // Se quedaba en «Pedido · esperando que lo acepten» con la compra pagada,
    // su factura apuntada y el camión contratado. El tablero contaba una
    // historia de hace tres semanas.
    assert.equal(estadoQueLeToca('Pedido', { compraPagada: true }), 'Confirmado');
  });

  test('recogido: un coche en un camión va de camino', () => {
    assert.equal(estadoQueLeToca('Pedido', { yaRecogido: true }), 'En camino');
    assert.equal(estadoQueLeToca('Confirmado', { yaRecogido: true }), 'En camino');
  });

  test('recogido manda sobre pagado: es el hecho más avanzado', () => {
    assert.equal(estadoQueLeToca('Pedido', { compraPagada: true, yaRecogido: true }), 'En camino');
  });

  test('sin hechos nuevos no se mueve', () => {
    assert.equal(estadoQueLeToca('Pedido', {}), null);
    assert.equal(estadoQueLeToca('Confirmado', { compraPagada: true }), null);
  });

  test('un borrador no avanza solo', () => {
    // Ahí es donde se prepara mientras se comprueba lo que no se arregla
    // después: un embargo no se soluciona una vez pagado.
    assert.equal(estadoQueLeToca('Borrador', { compraPagada: true, yaRecogido: true }), null);
  });

  test('y nunca retrocede', () => {
    assert.equal(estadoQueLeToca('En camino', { compraPagada: true }), null);
    assert.equal(estadoQueLeToca('Recibido', { yaRecogido: true }), null);
    assert.equal(estadoQueLeToca('Cancelado', { compraPagada: true, yaRecogido: true }), null);
  });
});
