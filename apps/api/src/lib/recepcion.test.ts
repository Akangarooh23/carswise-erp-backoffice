/**
 * Mirar el coche al llegar.
 *
 * Lo que se comprueba: que no se dé por recibido sin leer los kilómetros y
 * contar las llaves —los dos datos que pierden valor con el tiempo—, que decir
 * «no es lo que compramos» obligue a escribir qué se reclama, y que una
 * diferencia rara de kilómetros salte.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  faltaPorMirar, puedeDarsePorRecibido, reclamacionCompleta,
  diferenciaDeKm, kmSospechosos, anota,
} from './recepcion.js';

describe('lo mínimo antes de darlo por recibido', () => {
  test('sin nada mirado, faltan los dos', () => {
    assert.deepEqual(faltaPorMirar({}).length, 2);
    assert.equal(puedeDarsePorRecibido(null), false);
  });

  test('con kilómetros pero sin contar llaves, todavía no', () => {
    assert.equal(puedeDarsePorRecibido({ km: 84000 }), false,
      'una segunda llave cuesta cientos de euros: se cuenta delante de quien lo trae');
  });

  test('con los dos, sí', () => {
    assert.equal(puedeDarsePorRecibido({ km: 84000, llaves: 2 }), true);
  });

  test('cero llaves es un dato, no un hueco', () => {
    assert.equal(puedeDarsePorRecibido({ km: 84000, llaves: 0 }), true,
      'venir sin llaves es una respuesta, y de las importantes');
  });

  test('cero kilómetros también', () => {
    assert.equal(puedeDarsePorRecibido({ km: 0, llaves: 2 }), true);
  });
});

describe('cuando no es lo que se compró', () => {
  test('decirlo sin decir qué se reclama no vale', () => {
    assert.equal(reclamacionCompleta({ conforme: false }), false,
      'quien lo lea en un mes tiene que saber qué se pidió');
    assert.equal(reclamacionCompleta({ conforme: false, reclamacion: '   ' }), false);
  });

  test('con la reclamación escrita, sí', () => {
    assert.equal(reclamacionCompleta({ conforme: false, reclamacion: 'Falta la segunda llave' }), true);
  });

  test('si está conforme no hay nada que reclamar', () => {
    assert.equal(reclamacionCompleta({ conforme: true }), true);
    assert.equal(reclamacionCompleta({}), true);
  });
});

describe('los kilómetros que dijeron y los que marca', () => {
  test('la diferencia se calcula', () => {
    assert.equal(diferenciaDeKm(80000, 84000), 4000);
    assert.equal(diferenciaDeKm(80000, 79000), -1000);
  });

  test('sin uno de los dos, no se inventa', () => {
    assert.equal(diferenciaDeKm(null, 84000), null);
    assert.equal(diferenciaDeKm(80000, null), null);
  });

  test('unos pocos de más se explican con el traslado', () => {
    assert.equal(kmSospechosos(80000, 81000), false);
  });

  test('diez mil de más, no', () => {
    assert.equal(kmSospechosos(80000, 90000), true);
  });

  test('y menos de los prometidos es peor: nadie se equivoca a su favor', () => {
    assert.equal(kmSospechosos(80000, 75000), true);
  });
});

describe('quién lo miró', () => {
  test('queda con su nombre y su fecha', () => {
    const r = anota({}, { km: 84000, llaves: 2 }, 'Ana', new Date('2026-08-30T10:00:00Z'));
    assert.equal(r.km, 84000);
    assert.equal(r.revisado_por, 'Ana');
    assert.match(String(r.revisado_el), /^2026-08-30/);
  });

  test('anotar algo nuevo no borra lo de antes', () => {
    const primera = anota({}, { km: 84000, llaves: 2, danos: 'Golpe en la puerta' }, 'Ana');
    const segunda = anota(primera, { observaciones: 'Sin libro' }, 'Miguel');
    assert.equal(segunda.danos, 'Golpe en la puerta');
    assert.equal(segunda.observaciones, 'Sin libro');
    assert.equal(segunda.revisado_por, 'Miguel');
  });
});
