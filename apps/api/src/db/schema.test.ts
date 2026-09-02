/**
 * Que el esquema sea SQL y no otra cosa.
 *
 * Vive dentro de plantillas de JavaScript, y ahí dentro hay dos caracteres que
 * no son inocentes: una **comilla invertida** cierra la cadena, y `${` empieza
 * una interpolación. Los dos se cuelan escribiendo un comentario SQL con un
 * nombre de columna entre comillas invertidas, como se escribe en cualquier otro
 * sitio del proyecto.
 *
 * Ya pasó una vez en una consulta —un comentario de JavaScript dentro de un
 * literal SQL tumbó el circuito— y esto es la misma familia: el fichero deja de
 * compilar, o peor, compila y manda a Postgres algo que no es lo que se
 * escribió.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

/** Los trozos de SQL: lo que va entre `query(` y su cierre. */
function losSql(fuente: string): string[] {
  const trozos: string[] = [];
  const re = /query\(`([\s\S]*?)`\)/g;
  let m;
  while ((m = re.exec(fuente))) trozos.push(m[1]);
  return trozos;
}

describe('el SQL del esquema', () => {
  test('hay SQL que mirar', () => {
    // Si el extractor dejara de encontrar nada, lo de abajo pasaría sin
    // comprobar nada.
    assert.ok(losSql(FUENTE).length > 3, 'no se han encontrado las consultas');
  });

  test('ningún comentario lleva comillas invertidas', () => {
    // Una comilla invertida cierra la plantilla de JavaScript: lo que viene
    // detrás deja de ser SQL y el fichero ni compila.
    for (const sql of losSql(FUENTE)) {
      for (const linea of sql.split('\n')) {
        const comentario = linea.indexOf('--');
        if (comentario < 0) continue;
        assert.ok(!linea.slice(comentario).includes('`'),
          `comilla invertida en un comentario SQL: ${linea.trim()}`);
      }
    }
  });

  test('ni un ${ que no sea una interpolación de verdad', () => {
    // Dentro de una plantilla, `${` abre una expresión de JavaScript. En un
    // comentario SQL eso no es un comentario: es código.
    for (const sql of losSql(FUENTE)) {
      for (const linea of sql.split('\n')) {
        const comentario = linea.indexOf('--');
        if (comentario < 0) continue;
        assert.ok(!linea.slice(comentario).includes('${'),
          `interpolación en un comentario SQL: ${linea.trim()}`);
      }
    }
  });
});

describe('las columnas de los avisos a proveedores', () => {
  test('existen, porque `meta` no es una columna y no se le puede escribir', () => {
    // `meta` se arma en el SELECT con un jsonb_build_object. El UPDATE que le
    // escribía fallaba en silencio: el correo salía y la pantalla seguía
    // diciendo que no se había mandado.
    for (const col of [
      'factura_vendedor_pedida_at', 'factura_vendedor_pedida_a',
      'encargo_gestoria_enviado_at', 'encargo_gestoria_enviado_a',
    ]) {
      assert.match(FUENTE, new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`), `falta ${col}`);
    }
  });
});
