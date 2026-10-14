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
import { losParados, DIAS_PARA_PARADO, SQL_ANALISIS_DE_PORTALES } from './recalcula-los-kpis.js';

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

/**
 * La pantalla de Portales lee lo guardado, y eso hay que protegerlo.
 *
 * El 13-oct-2026 esa pantalla llevaba semanas diciendo «No se pudo cargar el
 * análisis». La consulta tardaba entre 72 y 113 segundos sobre 2,6 millones de
 * ofertas y la función de Vercel corta a los 30. No hay índice que lo arregle
 * -el que se probó, con las cinco columnas dentro, midió 162 segundos, siete
 * veces peor-: contar todas las filas es leerlas todas.
 *
 * Así que se cuentan de madrugada y la pantalla lee once filas. Lo que se
 * comprueba aquí es lo que haría que eso volviera a romperse en silencio.
 */
describe('el análisis de portales, que ahora se guarda', () => {
  test('la pantalla y la tarea cuentan lo mismo', async () => {
    /*
     * Dos copias del mismo cálculo acaban dando dos cifras, y el día que
     * difieran hay que decidir cuál vale. La ruta no tiene su propia consulta:
     * lee lo que guardó esta.
     */
    const fuente = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../routes/analisis.ts', import.meta.url), 'utf8'));
    /*
     * Se mira por las columnas del recuento —«inactivos» y «alemanas» solo
     * salen de él— y no por el nombre de la tabla: en ese mismo fichero hay
     * otra consulta sobre `moveadvisor_market_offers`, la de importación, que
     * es estrecha, va por índice y tiene que seguir en vivo.
     */
    assert.ok(!/AS +inactivos/.test(fuente), 'la ruta ha vuelto a contar los portales ella misma');
    assert.ok(!/AS +alemanas/.test(fuente), 'la ruta ha vuelto a contar los portales ella misma');
    assert.match(SQL_ANALISIS_DE_PORTALES, /AS +inactivos/);
    assert.match(fuente, /KPI\.portalesAnalisis/);
  });

  test('y es un solo recorrido para los dos números', () => {
    /*
     * «Portales parados» es un trozo del análisis: `portal` y la última fecha.
     * Eran dos consultas recorriendo la misma tabla de 4,4 GB, una detrás de
     * otra, en la misma tarea nocturna.
     */
    assert.match(SQL_ANALISIS_DE_PORTALES, /MAX\(last_checked_at\)/);
    assert.match(SQL_ANALISIS_DE_PORTALES, /GROUP BY 1/);
  });

  test('se mira last_checked_at y no updated_at', () => {
    // Lo que importa no es que la pasada arrancara, sino que comprobara algo.
    assert.ok(!/updated_at/.test(SQL_ANALISIS_DE_PORTALES));
  });
});
