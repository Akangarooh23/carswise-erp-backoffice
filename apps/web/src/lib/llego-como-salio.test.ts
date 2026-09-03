/**
 * La pantalla y el servidor piden lo mismo al llegar el coche.
 *
 * Están duplicados —los dos lados se compilan por separado—, así que lo que hay
 * que sostener es que **coinciden**. Si la pantalla dejara marcar «Entregado»
 * con algo que el servidor rechaza, el botón parecería roto; y si pidiera de
 * más, no se podría cerrar un tramo que el servidor sí acepta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  faltaPorMirarAlLlegar, queHacerAlLlegar, diasQueQuedan, DIAS_PARA_RECLAMAR,
  type LlegoComoSalio,
} from './llego-como-salio.js';
import {
  faltaPorMirarAlLlegar as faltaEnLaApi,
  queHacerAlLlegar as diceLaApi,
  diasQueQuedan as diasDeLaApi,
  DIAS_PARA_RECLAMAR as PLAZO_DE_LA_API,
} from '../../../api/src/lib/llego-como-salio.js';

const HOY = new Date('2026-09-20T12:00:00Z');
const LLEGÓ = '2026-09-18T09:00:00Z';

const CASOS: LlegoComoSalio[] = [
  {},
  { conforme: true },
  { conforme: false },
  { conforme: false, danos: 'Golpe en la aleta trasera izquierda' },
  { conforme: false, danos: 'Golpe', reservaEnAlbaran: true },
  { conforme: false, danos: '   ' },
];

describe('las dos mitades', () => {
  test('piden lo mismo para poder cerrar el tramo', () => {
    for (const c of CASOS) {
      assert.deepEqual(faltaPorMirarAlLlegar(c), faltaEnLaApi(c), JSON.stringify(c));
    }
  });

  test('y dicen lo mismo, con plazo y sin él', () => {
    for (const c of CASOS) {
      for (const cuando of [LLEGÓ, null, '2026-09-01T09:00:00Z']) {
        assert.equal(queHacerAlLlegar(c, cuando, HOY), diceLaApi(c, cuando, HOY), JSON.stringify(c));
      }
    }
  });

  test('y cuentan los mismos días', () => {
    assert.equal(DIAS_PARA_RECLAMAR, PLAZO_DE_LA_API);
    assert.equal(diasQueQuedan(LLEGÓ, HOY), diasDeLaApi(LLEGÓ, HOY));
    assert.equal(diasQueQuedan(null, HOY), diasDeLaApi(null, HOY));
  });
});

describe('el plural, que es lo que se lee', () => {
  test('un día es «queda 1 día»', () => {
    // «quedan 1 día» es de las cosas que hacen dudar de todo lo demás.
    const casi = new Date('2026-09-24T12:00:00Z');
    assert.match(queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, LLEGÓ, casi), /queda 1 día\./);
  });

  test('y varios, «quedan 5 días»', () => {
    assert.match(queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, LLEGÓ, HOY), /quedan 5 días\./);
  });
});
