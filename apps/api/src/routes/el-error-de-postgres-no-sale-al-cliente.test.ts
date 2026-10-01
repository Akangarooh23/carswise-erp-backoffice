/**
 * El mensaje de un error no se le devuelve a quien llama.
 *
 * ## Lo que pasaba
 *
 * Cuarenta y tres respuestas de `apps/api` metían el mensaje del error en el cuerpo:
 *
 *     res.status(500).json({ ok: false, error: (err as Error).message });
 *
 * Si ese error viene de Postgres, lo que llega al navegador es su texto. Medido
 * contra la base que corre:
 *
 *     column "columna_inventada" does not exist      (42703)
 *     relation "tabla_que_no_existe" does not exist  (42P01)
 *
 * O sea nombres de columna y de tabla: revelación del esquema.
 *
 * **Y lo que NO es**, porque conviene no exagerarlo: no es una fuga de datos. El valor
 * que provocó el fallo va en `.detail`, no en `.message` —comprobado con una violación
 * de unicidad en una tabla temporal—, y aquí nadie devuelve `.detail`.
 *
 * ## Por qué esta prueba y no «arreglarlo y ya»
 *
 * Porque el arreglo ya existía antes de las 43. `falloInterno()` en `lib/fallos.ts`
 * manda un código estable al cliente, el mensaje al registro y el detalle **solo fuera
 * de producción**, y **116 rutas ya lo usaban**. Las 43 eran justo las que no.
 *
 * Así que lo que falta no es el arreglo, es el trinquete: que la 44ª no entre sin que
 * nadie se dé cuenta. El ERP no tiene lint ni CI (§30.4), así que este fichero es el
 * único sitio donde esto se puede comprobar solo.
 *
 * ## Las catorce excepciones, y por qué cada una
 *
 * No todo mensaje en una respuesta es una fuga. Se dejan dentro, con su motivo:
 *
 *  - Los once `409 { error: 'adjuntos', detail: e.message }` de `leads`,
 *    `peritaciones` y `transportes`: ese `catch` captura **una clase propia**,
 *    `NoSePuedenAdjuntar`, y **relanza todo lo demás**. El mensaje está escrito para
 *    que lo lea una persona, y cambiarlo por un código sería una regresión.
 *  - `personal.ts`, el `400` con `parsed.error.issues[0]?.message`: validación de Zod,
 *    también para leer.
 *
 * El criterio que las distingue no es el nombre del fichero: es que el mensaje venga
 * de un error **propio y tipado**, no de lo que caiga. Por eso la prueba no permite
 * `(err as Error).message` en ningún sitio, que es la forma de «lo que caiga».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AQUI = join(process.cwd(), 'apps', 'api', 'src', 'routes');

function losFicheros(): string[] {
  return readdirSync(AQUI).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

/**
 * El texto sin comentarios, para no contar lo que está explicado y no ejecutado.
 *
 * **Conservando los saltos de línea.** La primera versión cambiaba un comentario de
 * bloque por un solo espacio, así que se comía sus saltos y todos los números de línea
 * de debajo salían desplazados: la prueba señaló `datos.ts:137`, que es un `});`.
 * Un número de línea equivocado en un fallo de prueba manda a quien lo lee al sitio
 * que no es, y eso es peor que no darlo.
 */
function sinComentarios(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, (_l, blanco) => blanco);
}

describe('el mensaje del error no viaja en la respuesta', () => {
  test('ninguna ruta devuelve `(err as Error).message` en el cuerpo', () => {
    /*
     * Ésta es la forma peligrosa y no tiene excepciones legítimas: el `as Error` dice
     * «no sé qué es esto» y aun así lo publica. Un error propio se reconoce con
     * `instanceof` y se trata, como hace el de los adjuntos.
     */
    const culpables: string[] = [];
    for (const f of losFicheros()) {
      const texto = sinComentarios(readFileSync(join(AQUI, f), 'utf8'));
      const re = /res\s*\.status\([^)]*\)\s*\.json\([^;]*\(\s*\w+\s+as\s+Error\s*\)\s*\.message/g;
      for (const m of texto.matchAll(re)) {
        const linea = texto.slice(0, m.index).split('\n').length;
        culpables.push(`${f}:${linea}`);
      }
    }
    assert.deepEqual(
      culpables,
      [],
      'estas respuestas publican el mensaje de un error sin tipar; usa falloInterno(res, codigo, err):\n  ' +
        culpables.join('\n  ')
    );
  });

  test('y el resto de mensajes en respuestas no pasa de catorce', () => {
    /*
     * Un techo que solo puede bajar, como los otros trinquetes del proyecto. Las
     * catorce están nombradas arriba y cada una tiene su motivo; la quince habrá que
     * justificarla, que es justo el punto.
     *
     * Se cuenta `.message` dentro del argumento de un `res.json(...)`. Es aproximado
     * —no empareja paréntesis— y por eso es un techo y no una lista exacta.
     */
    const TECHO = 14;
    const sitios: string[] = [];
    for (const f of losFicheros()) {
      const texto = sinComentarios(readFileSync(join(AQUI, f), 'utf8'));
      const re = /res\s*(?:\.status\([^)]*\))?\s*\.json\(\s*\{[^;]{0,400}?\.message/g;
      for (const m of texto.matchAll(re)) {
        const linea = texto.slice(0, m.index).split('\n').length;
        sitios.push(`${f}:${linea}`);
      }
    }
    assert.ok(
      sitios.length <= TECHO,
      `había ${TECHO} mensajes en respuestas y ahora hay ${sitios.length}. ` +
        `Si el nuevo viene de un error propio y tipado, baja el techo y di por qué; ` +
        `si viene de lo que caiga, usa falloInterno().\n  ${sitios.join('\n  ')}`
    );
  });

  test('falloInterno sigue tapando el detalle en producción', () => {
    /*
     * Todo lo de arriba se apoya en que `falloInterno` no publique el mensaje. Si
     * alguien le quitara la condición de `NODE_ENV`, las 116 rutas que lo usan
     * empezarían a filtrar a la vez y los dos trinquetes de arriba seguirían verdes.
     *
     * Así que se comprueba la pieza en la que confían, no solo a quienes la llaman.
     */
    const fuente = readFileSync(join(process.cwd(), 'apps', 'api', 'src', 'lib', 'fallos.ts'), 'utf8');
    const fn = fuente.slice(fuente.indexOf('export function falloInterno'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}') + 2);

    assert.match(cuerpo, /NODE_ENV/, 'falloInterno tiene que mirar el entorno');
    assert.match(cuerpo, /'production'|"production"/, 'y distinguir producción');
    assert.ok(
      /production'\s*\?\s*\{\s*\}/.test(cuerpo) || /production"\s*\?\s*\{\s*\}/.test(cuerpo),
      'en producción el detalle tiene que ser {}: el mensaje no sale'
    );
    assert.match(cuerpo, /console\.error/, 'y el mensaje tiene que ir al registro, que para eso se guarda');
  });
});
