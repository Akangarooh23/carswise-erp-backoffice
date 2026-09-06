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
 * sobre los documentos de verdad.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { interpreta, type Paso } from './markdown.js';

const CARPETA = new URL('../../../../docs/ejecucion/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const losManuales = readdirSync(CARPETA).filter((f) => f.endsWith('.md'));

const enTexto = (trozos: { texto: string }[] | undefined) =>
  (trozos ?? []).map((t) => t.texto).join('');

/** Todas las cajas de todos los flujos de un documento. */
function lasCajas(fuente: string): Extract<Paso, { tipo: 'paso' }>[] {
  return interpreta(fuente)
    .flatMap((b) => (b.tipo === 'flujo' ? b.pasos : []))
    .filter((p): p is Extract<Paso, { tipo: 'paso' }> => p.tipo === 'paso');
}

describe('los manuales de ejecución', () => {
  test('hay alguno, y se leen', () => {
    assert.ok(losManuales.length > 0, 'docs/ejecucion está vacío');
  });

  for (const fichero of losManuales) {
    const fuente = readFileSync(join(CARPETA, fichero), 'utf8');
    const cajas = lasCajas(fuente);

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
    });
  }
});

describe('el flujo de importación, que es el primero', () => {
  const fuente = readFileSync(join(CARPETA, 'flujo-de-importacion.md'), 'utf8');
  const cajas = lasCajas(fuente);

  test('el resumen de arriba también se puede pinchar', () => {
    // Es la primera pantalla que se ve, y la que enseña que las cajas se
    // abren. Si el resumen es de adorno, nadie descubre que las demás lo hacen.
    const primeras = cajas.slice(0, 8);
    const conPantalla = primeras.filter((c) => c.donde).length;
    assert.equal(conPantalla, 8, 'el resumen tiene cajas que no se abren');
  });

  test('las pantallas que nombra son pantallas del ERP', () => {
    const PANTALLAS = [
      'Importaciones', 'Peritaciones', 'Transportes', 'Gestoría', 'Proveedores',
      'Facturación proveedores', 'Comisiones', 'Dashboard', 'Marketplace VO',
    ];
    const raras = cajas
      .filter((c) => c.donde)
      .map((c) => enTexto(c.donde))
      .filter((d) => !PANTALLAS.some((p) => d.includes(p)));
    assert.deepEqual(raras, [], `«@» que no nombra ninguna pantalla conocida:\n  ${raras.join('\n  ')}`);
  });
});
