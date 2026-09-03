/**
 * ¿Llegó como salió?
 *
 * Lo que se sostiene aquí es un plazo. En un CMR los daños visibles se reservan
 * **en el acto**, por escrito en la carta de porte, y los que no se ven dentro
 * de **siete días**. Si el conductor se va con el albarán firmado y sin
 * reservas, se presume que el coche llegó bien y el golpe lo pagamos nosotros.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_PARA_RECLAMAR, faltaPorMirarAlLlegar, puedeDarsePorEntregado,
  diasQueQuedan, sePuedeReclamar, queHacerAlLlegar, anotaLaLlegada,
} from './llego-como-salio.js';

const HOY = new Date('2026-09-20T12:00:00Z');
const LLEGÓ = '2026-09-18T09:00:00Z';

describe('no se da por entregado sin mirarlo', () => {
  test('sin contestar, falta lo único que no se consigue después', () => {
    // Con el camión delante es el único momento en que se puede.
    assert.deepEqual(faltaPorMirarAlLlegar({}), ['Decir si ha llegado como salió']);
    assert.equal(puedeDarsePorEntregado({}), false);
    assert.equal(puedeDarsePorEntregado(null), false);
  });

  test('un sí basta: lo que importa es que alguien lo miró', () => {
    // No es un formulario largo a propósito.
    assert.deepEqual(faltaPorMirarAlLlegar({ conforme: true }), []);
    assert.equal(puedeDarsePorEntregado({ conforme: true }), true);
  });

  test('un no sin decir qué no sirve de nada', () => {
    // Quien lo lea dentro de un mes tiene que saber qué apareció.
    assert.deepEqual(faltaPorMirarAlLlegar({ conforme: false }), ['Apuntar qué ha aparecido']);
    assert.equal(puedeDarsePorEntregado({ conforme: false, danos: '   ' }), false);
    assert.equal(puedeDarsePorEntregado({ conforme: false, danos: 'Golpe en la aleta' }), true);
  });
});

describe('los siete días del CMR', () => {
  test('están donde dice la norma', () => {
    assert.equal(DIAS_PARA_RECLAMAR, 7);
  });

  test('dos días después de llegar, quedan cinco', () => {
    assert.equal(diasQueQuedan(LLEGÓ, HOY), 5);
    assert.equal(sePuedeReclamar(LLEGÓ, HOY), true);
  });

  test('al octavo día ya no hay plazo', () => {
    const tarde = new Date('2026-09-26T12:00:00Z');
    assert.equal(diasQueQuedan(LLEGÓ, tarde), -1);
    assert.equal(sePuedeReclamar(LLEGÓ, tarde), false);
  });

  test('sin fecha de entrega no se inventa un plazo', () => {
    // Todavía no ha llegado: decir que quedan siete días sería contar desde un
    // día que no existe.
    assert.equal(diasQueQuedan(null, HOY), null);
    assert.equal(diasQueQuedan('cuando sea', HOY), null);
    assert.equal(sePuedeReclamar(null, HOY), true);
  });
});

describe('lo que se le dice a quien está mirando el coche', () => {
  test('sin contestar, que lo mire con el camión delante', () => {
    assert.match(queHacerAlLlegar({}, LLEGÓ, HOY), /con el camión todavía delante/);
  });

  test('conforme, se acabó', () => {
    assert.equal(queHacerAlLlegar({ conforme: true }, LLEGÓ, HOY), 'Llegó como salió.');
  });

  test('con daños y sin reserva, lo primero es la carta de porte', () => {
    // Es lo que no se puede hacer después: el conductor ya se ha ido.
    const dice = queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, LLEGÓ, HOY);
    assert.match(dice, /carta de porte/);
    assert.match(dice, /quedan 5 días/);
  });

  test('con la reserva puesta, reclamar, y con los días delante', () => {
    const dice = queHacerAlLlegar(
      { conforme: false, danos: 'Golpe', reservaEnAlbaran: true }, LLEGÓ, HOY
    );
    assert.match(dice, /reclámaselo por escrito/);
    assert.match(dice, /quedan 5 días/);
  });

  test('un solo día se dice en singular', () => {
    const casi = new Date('2026-09-24T12:00:00Z');
    assert.match(queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, LLEGÓ, casi), /queda 1 día/);
  });

  test('pasado el plazo se dice que lo pagamos nosotros', () => {
    // Es la verdad, y esconderla hace que se reclame igual y se pierda el tiempo.
    const tarde = new Date('2026-09-30T12:00:00Z');
    const dice = queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, LLEGÓ, tarde);
    assert.match(dice, /ya se ha pasado/);
    assert.match(dice, /lo pagamos nosotros/);
  });

  test('y sin fecha de entrega no se prometen días', () => {
    const dice = queHacerAlLlegar({ conforme: false, danos: 'Golpe' }, null, HOY);
    assert.match(dice, /carta de porte/);
    assert.ok(!/quedan? \d/.test(dice));
  });
});

describe('quién lo miró', () => {
  test('se guarda con lo apuntado', () => {
    // Una reserva sin nombre no la sostiene nadie tres semanas después.
    const l = anotaLaLlegada({ conforme: true }, { danos: 'Nada' }, 'Ana', HOY);
    assert.equal(l.mirado_por, 'Ana');
    assert.equal(l.mirado_el, HOY.toISOString());
    assert.equal(l.conforme, true);
    assert.equal(l.danos, 'Nada');
  });

  test('y lo nuevo manda sobre lo viejo', () => {
    const l = anotaLaLlegada({ conforme: true }, { conforme: false, danos: 'Golpe' }, 'Ana', HOY);
    assert.equal(l.conforme, false);
  });
});
