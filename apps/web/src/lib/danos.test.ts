/**
 * El espejo de los daños en la pantalla.
 *
 * Está duplicado del lado de la API a propósito —los dos lados se compilan por
 * separado—, así que lo que hay que sostener es que **cuentan igual**. Si un
 * día uno de los dos deja de contar las partidas sin valorar, el total de la
 * pantalla y el del expediente dirán cosas distintas sobre el mismo coche.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { PARTIDAS_HABITUALES, resumenDeDanos, comoSeCuenta, type Dano } from './danos.js';
import {
  PARTIDAS_HABITUALES as DE_LA_API,
  resumenDeDanos as resumenDeLaApi,
  comoSeCuenta as comoLoCuentaLaApi,
} from '../../../api/src/lib/danos-del-coche.js';

/** Como llegan de la API: los números vienen de Postgres como cadenas. */
const DANOS: Dano[] = [
  { id: '1', pieza: 'Paragolpes delantero', coste: '480.00', notas: '' },
  { id: '2', pieza: 'Faro izquierdo', coste: '610.50', notas: 'roto el anclaje' },
  { id: '3', pieza: 'Aleta trasera izquierda', coste: null, notas: '' },
];

describe('lo que suman en la pantalla', () => {
  test('los importes llegan como texto de Postgres y se suman igual', () => {
    assert.deepEqual(resumenDeDanos(DANOS), { cuantas: 3, total: 1090.5, sinValorar: 1 });
  });

  test('una partida sin valorar no cuenta como cero', () => {
    assert.deepEqual(
      resumenDeDanos([{ id: '1', pieza: 'Capó', coste: null, notas: '' }]),
      { cuantas: 1, total: 0, sinValorar: 1 }
    );
  });

  test('y una cadena vacía tampoco', () => {
    // Un input que se deja en blanco llega así, no como null.
    assert.deepEqual(
      resumenDeDanos([{ id: '1', pieza: 'Capó', coste: '', notas: '' }]),
      { cuantas: 1, total: 0, sinValorar: 1 }
    );
  });
});

describe('el espejo con la API', () => {
  test('las partidas habituales son las mismas, y en el mismo orden', () => {
    // Dos listas parecidas darían dos formas de escribir la misma pieza.
    assert.deepEqual([...PARTIDAS_HABITUALES], [...DE_LA_API]);
  });

  test('el recuento sale igual de los dos lados', () => {
    const aqui = resumenDeDanos(DANOS);
    const alli = resumenDeLaApi(DANOS.map((d) => ({
      pieza: d.pieza,
      coste: d.coste === null ? null : Number(d.coste),
    })));
    assert.deepEqual(aqui, alli);
  });

  test('y la frase también, incluida la de sin valorar', () => {
    for (const r of [
      { cuantas: 3, total: 1240, sinValorar: 0 },
      { cuantas: 5, total: 1240, sinValorar: 2 },
      { cuantas: 2, total: 0, sinValorar: 2 },
      { cuantas: 0, total: 0, sinValorar: 0 },
      { cuantas: 1, total: 300, sinValorar: 0 },
    ]) {
      assert.equal(comoSeCuenta(r), comoLoCuentaLaApi(r));
    }
  });
});
