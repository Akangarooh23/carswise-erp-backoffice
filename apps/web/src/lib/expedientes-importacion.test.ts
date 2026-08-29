/**
 * Las reglas de un expediente de importación.
 *
 * Lo que se comprueba aquí no es cómo se pinta la pantalla: es lo que no se
 * puede hacer todavía —pedir un coche sin fianza, dar una fecha de entrega
 * antes de que haya pedido— y cuánto dinero de clientes tenemos cobrado sin
 * entregar, que es la cifra que nadie puede mirar mal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAPAS, QUE_TOCA, siguienteEtapa, puedePedirlo, puedeDarFecha,
  agrupaPorEtapa, fueraDelCamino, resumen, diasDesde,
  type Expediente,
} from './expedientes-importacion.js';

function exp(parcial: Partial<Expediente> & { status: string }): Expediente {
  return {
    id: 'imp-1',
    user_email: 'cliente@ejemplo.es',
    title: 'Volkswagen Golf',
    created_at: '2026-08-01T10:00:00Z',
    meta: {},
    ...parcial,
  };
}

const CON_FIANZA = { deposit_quoted: 1019, deposit_paid_at: '2026-08-10T10:00:00Z' };

describe('el camino de un expediente', () => {
  test('cada etapa lleva a la siguiente', () => {
    assert.equal(siguienteEtapa('Pendiente'), 'Contactado');
    assert.equal(siguienteEtapa('Fianza pagada'), 'Pedido a Alemania');
    assert.equal(siguienteEtapa('En trámites'), 'Entregado');
  });

  test('entregado es el final', () => {
    assert.equal(siguienteEtapa('Entregado'), null);
  });

  test('un estado que no es del camino no lleva a ninguna parte', () => {
    assert.equal(siguienteEtapa('Cancelado'), null);
  });

  test('cada etapa dice qué hay que hacer', () => {
    for (const e of ETAPAS) {
      assert.ok(QUE_TOCA[e] && QUE_TOCA[e].length > 3,
        `«${e}» sin decir qué toca: la columna no sirve de nada`);
    }
  });
});

describe('lo que no se puede hacer todavía', () => {
  test('sin fianza no se pide el coche a Alemania', () => {
    assert.equal(puedePedirlo(exp({ status: 'Contactado' })), false,
      'pedirlo nos compromete con dinero, y lo que cubre eso es la fianza');
  });

  test('con la fianza cobrada, sí', () => {
    assert.equal(puedePedirlo(exp({ status: 'Fianza pagada', meta: CON_FIANZA })), true);
  });

  test('no hay fecha de entrega antes del pedido', () => {
    assert.equal(puedeDarFecha('Pendiente'), false);
    assert.equal(puedeDarFecha('Fianza pagada'), false,
      'la fecha la da el vendedor al aceptar el pedido: antes es inventada');
  });

  test('y desde el pedido en adelante, sí', () => {
    assert.equal(puedeDarFecha('Pedido a Alemania'), true);
    assert.equal(puedeDarFecha('En transporte'), true);
    assert.equal(puedeDarFecha('Entregado'), true);
  });
});

describe('el reparto por etapas', () => {
  const lista = [
    exp({ id: 'a', status: 'Pendiente' }),
    exp({ id: 'b', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'c', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'd', status: 'Cancelado' }),
  ];

  test('cada uno cae en su columna', () => {
    const m = agrupaPorEtapa(lista);
    assert.equal(m.get('En transporte')!.length, 2);
    assert.equal(m.get('Pendiente')!.length, 1);
    assert.equal(m.get('Entregado')!.length, 0);
  });

  test('lo cancelado no se cuela en ninguna etapa, pero no se pierde', () => {
    const m = agrupaPorEtapa(lista);
    const enElTablero = [...m.values()].flat().map((x) => x.id);
    assert.ok(!enElTablero.includes('d'));
    assert.deepEqual(fueraDelCamino(lista).map((x) => x.id), ['d']);
  });
});

describe('el resumen de arriba', () => {
  const lista = [
    exp({ id: 'a', status: 'Pendiente' }),
    exp({ id: 'b', status: 'En transporte', meta: CON_FIANZA }),
    exp({ id: 'c', status: 'Entregado', meta: CON_FIANZA }),
    exp({ id: 'd', status: 'Cancelado', meta: CON_FIANZA }),
  ];

  test('en marcha es lo que sigue abierto, sin los entregados', () => {
    assert.equal(resumen(lista).enMarcha, 2);
  });

  test('cuenta los que esperan la fianza', () => {
    assert.equal(resumen(lista).sinFianza, 1);
  });

  test('el dinero comprometido es el cobrado de coches sin entregar', () => {
    assert.equal(resumen(lista).comprometido, 1019,
      'el entregado ya no se debe, y el cancelado tampoco está en marcha');
  });

  test('una fianza devuelta deja de estar comprometida', () => {
    const conDevolucion = [exp({
      status: 'En transporte',
      meta: { ...CON_FIANZA, deposit_refunded_at: '2026-08-20T10:00:00Z' },
    })];
    assert.equal(resumen(conDevolucion).comprometido, 0,
      'contarla sería decir que debemos dinero que ya hemos devuelto');
  });

  test('los entregados se cuentan aparte', () => {
    assert.equal(resumen(lista).entregados, 1);
  });
});

describe('cuánto lleva esperando', () => {
  test('los días desde que lo pidió', () => {
    assert.equal(diasDesde('2026-08-01T10:00:00Z', new Date('2026-08-11T10:00:00Z')), 10);
  });

  test('sin fecha, no se inventa un número', () => {
    assert.equal(diasDesde(null), null);
    assert.equal(diasDesde('lo que sea'), null);
  });
});
