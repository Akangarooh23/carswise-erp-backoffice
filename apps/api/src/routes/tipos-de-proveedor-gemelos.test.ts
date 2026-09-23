/**
 * Los tipos de proveedor, escritos en dos sitios.
 *
 * El ERP los tiene en `lib/proveedores.ts` y los sirve por
 * `/proveedores/tipos`; la web tiene su propia lista en `ProveedoresPage.tsx`.
 * Son dos copias de lo mismo.
 *
 * Podrían ser una sola pidiéndoselos al servidor, pero es una lista de siete
 * palabras que no cambia nunca: pedirla añade una petición y un estado de carga
 * a una pantalla que ya abre bien. Así que se quedan las dos y las compara
 * esto, que es la misma disciplina que ya se usa con la marca y con las puertas
 * del encargo.
 *
 * Si se separan, la pantalla enseña un tipo que el servidor rechaza —o esconde
 * uno que existe—, y en los dos casos el fallo se ve en la cara del que está
 * dando de alta un proveedor.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIPOS_PROVEEDOR, ETIQUETA_TIPO } from '../lib/proveedores.js';

const PANTALLA = readFileSync(
  join(process.cwd(), 'apps/web/src/pages/ProveedoresPage.tsx'), 'utf8',
);

/** Los pares `['clave', 'Etiqueta']` que la pantalla tiene escritos. */
function losDeLaPantalla(): [string, string][] {
  const m = PANTALLA.match(/const TIPOS = \[([\s\S]*?)\] as const;/);
  assert.ok(m, 'no encuentro la lista de tipos en la pantalla');
  return [...m[1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((x) => [x[1], x[2]]);
}

describe('los tipos de proveedor no se separan', () => {
  test('se leen las dos listas', () => {
    // Si el recorte fallara, las de abajo pasarían sin comparar nada.
    assert.ok(TIPOS_PROVEEDOR.length >= 5, String(TIPOS_PROVEEDOR.length));
    assert.ok(losDeLaPantalla().length >= 5, String(losDeLaPantalla().length));
  });

  test('son las mismas claves, y en el mismo orden', () => {
    /*
     * El orden importa: es el de las pestañas. Uno que cambie de sitio mueve
     * la pestaña a la que la gente ya tiene la mano hecha.
     */
    assert.deepEqual(losDeLaPantalla().map(([clave]) => clave), [...TIPOS_PROVEEDOR]);
  });

  test('y cada una se llama igual en los dos sitios', () => {
    /*
     * En plural en la pantalla y en singular en el servidor, y está bien: allí
     * es una pestaña que agrupa muchos —«Transportistas»— y aquí es el tipo de
     * uno —«Transportista»—. Lo que no puede pasar es que uno se renombre y el
     * otro no, así que se comprueba que el plural empiece por el singular.
     */
    for (const [clave, enPlural] of losDeLaPantalla()) {
      const enSingular = ETIQUETA_TIPO[clave as keyof typeof ETIQUETA_TIPO];
      assert.ok(
        enPlural.startsWith(enSingular.replace(/s$/, '')),
        `«${clave}» se llama «${enPlural}» en la pantalla y «${enSingular}» en el servidor`,
      );
    }
  });
});
