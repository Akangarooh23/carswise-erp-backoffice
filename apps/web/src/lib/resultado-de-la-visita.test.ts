/**
 * Que la pantalla y el servidor digan lo mismo sobre cómo acabó una visita.
 *
 * Están escritos dos veces porque el navegador no puede importar del servidor.
 * El fallo que se busca es el de siempre con las copias: se añade un final en
 * la API, se olvida aquí, y la Agenda enseña `no_contesto` en crudo. O peor al
 * revés: sale un botón que el servidor rechaza con un 400 que nadie entiende.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESULTADOS, COMO_ACABO, comoAcabo, TONO, sePuedeCerrar, estaSinCerrar,
} from './resultado-de-la-visita.js';
import {
  RESULTADOS as RESULTADOS_API,
  COMO_ACABO as COMO_ACABO_API,
  sePuedeCerrar as sePuedeCerrarEnLaApi,
  estaSinCerrar as estaSinCerrarEnLaApi,
} from '../../../api/src/lib/resultado-de-la-visita.js';

const AHORA = new Date('2026-09-06T12:00:00Z');
const AYER = '2026-09-05T10:00:00Z';
const MANANA = '2026-09-07T10:00:00Z';

describe('la pantalla y el servidor, de acuerdo', () => {
  test('los mismos finales y en el mismo orden', () => {
    assert.deepEqual([...RESULTADOS], [...RESULTADOS_API]);
  });

  test('y leídos igual', () => {
    assert.deepEqual(COMO_ACABO, COMO_ACABO_API);
  });

  test('cada uno tiene su color', () => {
    for (const r of RESULTADOS) assert.ok(TONO[r], `«${r}» sin color`);
  });

  test('la puerta se abre y se cierra a la vez en los dos sitios', () => {
    const casos = [
      { status: 'confirmed', starts_at: AYER },
      { status: 'confirmed', starts_at: MANANA },
      { status: 'pending', starts_at: AYER },
      { status: 'cancelled', starts_at: AYER },
      { status: null, starts_at: AYER },
      { status: 'confirmed', starts_at: 'el jueves' },
    ];
    for (const c of casos) {
      assert.equal(
        sePuedeCerrar(c, AHORA), sePuedeCerrarEnLaApi(c, AHORA).si,
        `no coinciden con ${c.status} / ${c.starts_at}`,
      );
      assert.equal(estaSinCerrar(c, AHORA), estaSinCerrarEnLaApi(c, AHORA));
    }
  });
});

describe('cómo se lee en pantalla', () => {
  test('un final conocido, con su frase', () => {
    assert.equal(comoAcabo('compro'), 'Fue y se lo quedó');
  });

  test('y lo que no se conoce no enseña una clave cruda', () => {
    // Preferimos no decir nada a enseñar «no_contesto» en medio de la lista.
    for (const malo of ['no_contesto', '', null, undefined]) {
      assert.equal(comoAcabo(malo), '');
    }
  });
});
