/**
 * Los números caros, y qué pasa cuando no hay nada que calcular.
 *
 * Lo que se busca aquí no es que la cuenta salga: es que un fallo no se
 * convierta en un dato. La tarea corre de noche y nadie la mira; si un día la
 * consulta no trae filas y se guarda un cero, el panel dice «ningún portal
 * parado» y «estamos justo en el precio del mercado» — dos afirmaciones que
 * nadie ha comprobado y que no se distinguen de las de verdad.
 *
 * Un número viejo con su fecha se ve viejo. Un cero recién guardado, no.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { losParados, DIAS_PARA_PARADO } from './recalcula-los-kpis.js';

const AHORA = new Date('2026-09-07T12:00:00Z');
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86400000).toISOString();

describe('los portales parados', () => {
  test('parado es el que lleva más de una semana sin que pasen', () => {
    assert.equal(DIAS_PARA_PARADO, 7);
    const r = losParados([
      { portal: 'coches.net', ultima: haceDias(1) },
      { portal: 'milanuncios', ultima: haceDias(20) },
      { portal: 'wallapop', ultima: haceDias(8) },
    ], AHORA);
    assert.deepEqual(r, { n: 2, de: 3, cuales: ['milanuncios', 'wallapop'] });
  });

  test('justo en el límite todavía no está parado', () => {
    // Siete días clavados es la pasada de hace una semana, no un portal muerto.
    const r = losParados([{ portal: 'coches.net', ultima: haceDias(7) }], AHORA);
    assert.equal(r?.n, 0);
  });

  test('uno que no ha pasado nunca sí lo está', () => {
    const r = losParados([{ portal: 'autocasion', ultima: null }], AHORA);
    assert.deepEqual(r?.cuales, ['autocasion']);
  });

  test('y sin filas no se contesta cero: se contesta nada', () => {
    /*
     * Es la diferencia que importa. Cero portales parados de cero portales es
     * una frase que suena bien y no dice nada, y en el panel se lee igual que
     * «todo en orden». Null hace que la pantalla diga «sin calcular».
     */
    assert.equal(losParados([], AHORA), null);
  });

  test('dice también de cuántos, para que el número se pueda leer', () => {
    // «2 parados» no es lo mismo si hay 3 portales que si hay 40.
    const r = losParados([
      { portal: 'a', ultima: haceDias(30) },
      { portal: 'b', ultima: haceDias(1) },
    ], AHORA);
    assert.equal(r?.de, 2);
  });

  test('una fecha que no se entiende cuenta como que no han pasado', () => {
    // Lo seguro es avisar de más: un portal que sale parado se mira, y uno que
    // se calla porque su fecha estaba rota no lo mira nadie.
    const r = losParados([{ portal: 'raro', ultima: 'el jueves' }], AHORA);
    assert.deepEqual(r?.cuales, ['raro']);
  });
});
