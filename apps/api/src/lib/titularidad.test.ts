/**
 * A nombre de quién va el coche, y el plazo que empieza si va al nuestro.
 *
 * Lo que se comprueba: que la titularidad por defecto sea la que menos cambios
 * de nombre cuesta, y que el plazo de reventa cuente **el último día como
 * bueno** — vender el mismo día del límite está en plazo, y perder la exención
 * por apurar un día sería un error caro.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TITULARIDADES, esTitularidad, titularidadPorDefecto, vigilaElPlazo,
  revenderAntesDe, diasParaRevender, dentroDePlazo, apremia, PLAZO_REVENTA_MESES,
} from './titularidad.js';
import { tramitesQueTocan } from './tramites.js';

describe('a nombre de quién', () => {
  test('solo hay dos sitios donde ponerlo', () => {
    assert.deepEqual([...TITULARIDADES], ['cliente', 'popcar']);
    assert.equal(esTitularidad('gestoria'), false);
  });

  test('por defecto al nuestro, aunque haya un cliente esperando', () => {
    // Lo normal es comprar el coche y luego vendérselo: se recibe, se matricula,
    // se deja a punto y se entrega con nuestra factura. Todo eso sobre un coche
    // que es nuestro.
    assert.equal(titularidadPorDefecto('concesionario', 'cliente@ejemplo.es'), 'popcar');
    assert.equal(titularidadPorDefecto('importacion', 'cliente@ejemplo.es'), 'popcar');
  });

  test('sin cliente, igual: no hay otro sitio donde ponerlo', () => {
    assert.equal(titularidadPorDefecto('concesionario', ''), 'popcar');
    assert.equal(titularidadPorDefecto('particular', null), 'popcar');
    assert.equal(titularidadPorDefecto('stock', 'alguien@ejemplo.es'), 'popcar');
  });

  test('a nombre del cliente sigue existiendo: se elige a mano', () => {
    assert.equal(esTitularidad('cliente'), true);
  });
});

describe('cuántos cambios de nombre salen', () => {
  test('un coche de aquí a nombre del cliente no se transfiere al comprarlo', () => {
    const tocan = tramitesQueTocan('concesionario', 'cliente');
    assert.deepEqual(tocan, [], 'la única transferencia se hace al venderlo');
  });

  test('a nombre nuestro, sí: y luego habrá otra al venderlo', () => {
    assert.deepEqual(tramitesQueTocan('concesionario', 'popcar'), ['Transferencia de titularidad']);
  });

  test('a un particular el impuesto se paga igual: va con la compra', () => {
    const aCliente = tramitesQueTocan('particular', 'cliente');
    assert.deepEqual(aCliente, ['Impuesto de transmisiones'],
      'la transferencia se ahorra; el impuesto de la compra no');
    assert.equal(tramitesQueTocan('particular', 'popcar').length, 2);
  });

  test('una importación se matricula igual, vaya a nombre de quien vaya', () => {
    assert.equal(tramitesQueTocan('importacion', 'cliente').length, 3);
    assert.equal(tramitesQueTocan('importacion', 'popcar').length, 3);
  });
});

describe('el plazo para revender', () => {
  test('solo se vigila si el coche está a nuestro nombre', () => {
    assert.equal(vigilaElPlazo('popcar'), true);
    assert.equal(vigilaElPlazo('cliente'), false, 'no es nuestro: no hay nada que revender a tiempo');
  });

  test('se cuenta desde el día que entra', () => {
    assert.equal(revenderAntesDe(new Date('2026-08-30T10:00:00Z'), 12), '2027-08-30');
  });

  test('y no se desborda de mes', () => {
    assert.equal(revenderAntesDe(new Date('2026-08-31T10:00:00Z'), 6), '2027-02-28');
  });

  test('el último día cuenta: vender ese mismo día está en plazo', () => {
    assert.equal(dentroDePlazo('2026-08-30', new Date('2026-08-30T09:00:00Z')), true,
      'perder la exención por apurar un día sería un error caro');
    assert.equal(diasParaRevender('2026-08-30', new Date('2026-08-30T09:00:00Z')), 0);
  });

  test('pasado, ya no', () => {
    assert.equal(dentroDePlazo('2026-08-30', new Date('2026-08-31T09:00:00Z')), false);
  });

  test('sin plazo puesto no se da nada por vencido', () => {
    assert.equal(dentroDePlazo(null), true);
  });

  test('apremia dos meses antes, para poder bajarlo de precio a tiempo', () => {
    assert.equal(apremia('2026-10-15', new Date('2026-08-30')), true);
    assert.equal(apremia('2027-06-15', new Date('2026-08-30')), false);
  });

  test('el plazo por defecto es un año, pero se guarda en cada pedido', () => {
    assert.equal(PLAZO_REVENTA_MESES, 12);
  });
});
