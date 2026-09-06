/**
 * El artículo, que parece una tontería hasta que sale en pantalla.
 *
 * La Agenda decía «He llamado a el concesionario» en un botón y «los tienes de
 * la llamada a el concesionario» en un diálogo. Salía de tener el artículo
 * metido dentro del nombre y pegarle la preposición por fuera.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { comoSeLlama, elQueVende, alQueVende } from './quien-vende.js';

describe('cómo se llama quien tiene el coche', () => {
  test('cada tipo de vendedor, con su palabra', () => {
    assert.equal(comoSeLlama('concesionario'), 'concesionario');
    assert.equal(comoSeLlama('particular'), 'particular');
    assert.equal(comoSeLlama('professional'), 'profesional');
  });

  test('y lo que no se reconoce se queda en «vendedor»', () => {
    // Vendrán importación, renting y portales. Ninguno de esos puede dejar el
    // botón en blanco mientras tanto.
    assert.equal(comoSeLlama('importador'), 'vendedor');
    assert.equal(comoSeLlama(null), 'vendedor');
    assert.equal(comoSeLlama(undefined), 'vendedor');
    assert.equal(comoSeLlama(''), 'vendedor');
  });

  test('el nombre viene sin artículo', () => {
    // Si volviera a traerlo, `elQueVende` diría «el el concesionario» y
    // `alQueVende` volvería a la frase de la que venimos.
    for (const tipo of ['concesionario', 'particular', 'professional', null]) {
      assert.doesNotMatch(comoSeLlama(tipo), /^(el|la|al) /, `«${comoSeLlama(tipo)}» trae artículo`);
    }
  });
});

describe('con su artículo', () => {
  test('de sujeto, «el»', () => {
    assert.equal(elQueVende('concesionario'), 'el concesionario');
    assert.equal(elQueVende('particular'), 'el particular');
    assert.equal(elQueVende(null), 'el vendedor');
  });

  test('detrás de «a», «al» — nunca «a el»', () => {
    assert.equal(alQueVende('concesionario'), 'al concesionario');
    assert.equal(alQueVende('professional'), 'al profesional');
    assert.equal(alQueVende(null), 'al vendedor');
  });

  test('y ninguna frase montada con ellos dice «a el»', () => {
    // Como se usan de verdad, que es donde se veía el fallo.
    for (const tipo of ['concesionario', 'particular', 'professional', null]) {
      const frases = [
        `He llamado ${alQueVende(tipo)}`,
        `Los tienes de la llamada ${alQueVende(tipo)}.`,
        `Horas que propone ${elQueVende(tipo)}`,
        `Apuntado que has hablado con ${elQueVende(tipo)}.`,
      ];
      for (const f of frases) assert.doesNotMatch(f, /\ba el\b/, f);
    }
  });
});
