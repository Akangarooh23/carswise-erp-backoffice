/**
 * Un manual de ejecución se lee con el ERP abierto al lado.
 *
 * Su promesa es que cada caja verde —lo que se hace en el ERP— diga en qué
 * pantalla está. Una caja que solo dice «encargar la peritación» obliga a
 * buscar el botón, y ese rato es justo lo que el manual venía a ahorrar. Peor
 * aún: en pantalla esas cajas se pliegan, así que una caja sin `@` ni siquiera
 * se puede pinchar, y quien la mira no distingue «aquí no hay más» de «esto
 * está sin escribir».
 *
 * Esto no lo puede comprobar el intérprete de markdown, que hace bien su
 * trabajo con lo que le den. Es una regla del documento, y por eso se comprueba
 * sobre los documentos de verdad —todos los que haya, no una lista escrita a
 * mano que se queda corta en cuanto se añade el siguiente—.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { interpreta, type Paso, type Bloque } from './markdown.js';

const desdeAqui = (rel: string) =>
  new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CARPETA = desdeAqui('../../../../docs/ejecucion/');
const SIDEBAR = desdeAqui('../components/layout/Sidebar.tsx');

const losManuales = readdirSync(CARPETA).filter((f) => f.endsWith('.md'));

/**
 * Las pantallas que hay, sacadas del menú.
 *
 * Escritas a mano se quedan viejas: se renombra «Agenda» y el manual sigue
 * mandando a un sitio que ya no se llama así, con la prueba en verde. El menú
 * es la lista de verdad, así que es la que se usa.
 */
const PANTALLAS = [...readFileSync(SIDEBAR, 'utf8').matchAll(/label:\s*'([^']+)'/g)]
  .map((m) => m[1]);

const enTexto = (trozos: { texto: string }[] | undefined) =>
  (trozos ?? []).map((t) => t.texto).join('');

const esCaja = (p: Paso): p is Extract<Paso, { tipo: 'paso' }> => p.tipo === 'paso';

/** Los flujos de un documento, cada uno con sus cajas. */
function losFlujos(fuente: string): Extract<Paso, { tipo: 'paso' }>[][] {
  return interpreta(fuente)
    .filter((b: Bloque): b is Extract<Bloque, { tipo: 'flujo' }> => b.tipo === 'flujo')
    .map((b) => b.pasos.filter(esCaja));
}

describe('los manuales de ejecución', () => {
  test('hay alguno, y se leen', () => {
    assert.ok(losManuales.length > 0, 'docs/ejecucion está vacío');
  });

  test('el menú tiene pantallas que nombrar', () => {
    // Si el menú cambiara de forma, PANTALLAS quedaría vacío y la comprobación
    // de abajo pasaría siempre sin mirar nada.
    assert.ok(PANTALLAS.length > 10, `solo ${PANTALLAS.length} pantallas leídas del menú`);
    assert.ok(PANTALLAS.includes('Agenda'));
  });

  for (const fichero of losManuales) {
    const fuente = readFileSync(join(CARPETA, fichero), 'utf8');
    const flujos = losFlujos(fuente);
    const cajas = flujos.flat();

    describe(fichero, () => {
      test('tiene cajas', () => {
        assert.ok(cajas.length > 0, 'ningún flujo con cajas');
      });

      test('cada caja del ERP dice en qué pantalla se hace', () => {
        const mudas = cajas
          .filter((c) => c.actor === 'erp' && !c.donde)
          .map((c) => enTexto(c.trozos));
        assert.deepEqual(mudas, [], `cajas del ERP sin «@ pantalla»:\n  ${mudas.join('\n  ')}`);
      });

      test('y ninguna dice la pantalla en blanco', () => {
        const vacias = cajas
          .filter((c) => c.donde && !enTexto(c.donde).trim())
          .map((c) => enTexto(c.trozos));
        assert.deepEqual(vacias, [], `cajas con «@» sin nada detrás:\n  ${vacias.join('\n  ')}`);
      });

      /*
       * El `+` es lo que hay que teclear, y a veces la respuesta honrada es
       * «nada, sale solo». Eso se escribe, no se calla: una caja que no dice
       * qué datos pide se lee igual que una a la que se le olvidó decirlo.
       */
      test('y la mayoría dice también qué datos se meten', () => {
        const delErp = cajas.filter((c) => c.actor === 'erp');
        const conDatos = delErp.filter((c) => c.mete).length;
        assert.ok(
          conDatos >= Math.ceil(delErp.length / 2),
          `solo ${conDatos} de ${delErp.length} cajas del ERP dicen qué se mete`,
        );
      });

      /*
       * El primer flujo es el resumen, y es lo primero que se ve. Si sus cajas
       * no se abren, nadie descubre que las demás lo hacen: el resumen es donde
       * se aprende que esto se pincha.
       */
      test('el resumen de arriba se puede pinchar entero', () => {
        const sinAbrir = flujos[0]
          .filter((c) => !c.donde)
          .map((c) => enTexto(c.trozos));
        assert.deepEqual(sinAbrir, [], `cajas del resumen que no se abren:\n  ${sinAbrir.join('\n  ')}`);
      });

      test('las pantallas que nombra existen en el menú', () => {
        const raras = cajas
          .filter((c) => c.donde)
          .map((c) => enTexto(c.donde))
          .filter((d) => !PANTALLAS.some((p) => d.includes(p)));
        assert.deepEqual(raras, [], `«@» que no nombra ninguna pantalla del menú:\n  ${raras.join('\n  ')}`);
      });
    });
  }
});
