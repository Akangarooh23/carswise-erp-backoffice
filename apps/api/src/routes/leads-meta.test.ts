/**
 * `meta` no es una columna, y ya ha costado dos veces.
 *
 * Se arma en el SELECT que lee la pantalla, con un `jsonb_build_object` que junta
 * campos sueltos. En la tabla no existe. Pero se lee y se escribe por todas
 * partes como si existiera —`x.meta?.deposit_paid_at`— y es facilísimo escribir
 * `l.meta` en una consulta nueva y quedarse tan tranquilo.
 *
 * Las dos veces falló distinto y las dos veces en silencio. Un `UPDATE ... SET
 * meta = ...` con un `.catch()` delante se tragó el fallo: el correo salía y la
 * pantalla decía que no se había mandado. Y un `SELECT l.meta` tumbó la ruta
 * entera con un 500 que en la pantalla se leía como que el botón no hacía nada.
 *
 * Así que se comprueba en el fichero: fuera del `jsonb_build_object` que lo
 * construye, `meta` no aparece en ningún SQL.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

/** Los trozos de SQL del fichero, sin el que construye `meta`. */
function losSql(): string[] {
  const trozos: string[] = [];
  const re = /`([^`]*(?:SELECT|UPDATE|INSERT|DELETE)[\s\S]*?)`/g;
  let m;
  while ((m = re.exec(FUENTE))) {
    const sql = m[1];
    // El que lo arma es el único que puede nombrarlo.
    if (sql.includes('jsonb_build_object')) continue;
    trozos.push(sql);
  }
  return trozos;
}

describe('meta no se usa como columna', () => {
  test('hay SQL que mirar', () => {
    // Sin esto, la comprobación de abajo pasaría sin comprobar nada.
    assert.ok(losSql().length > 5, `solo se han encontrado ${losSql().length} consultas`);
  });

  test('ninguna consulta la selecciona', () => {
    for (const sql of losSql()) {
      assert.ok(!/\bl\.meta\b/.test(sql), `selecciona l.meta: ${sql.slice(0, 90)}`);
      assert.ok(!/,\s*meta\s*(,|\n)/.test(sql), `selecciona meta: ${sql.slice(0, 90)}`);
    }
  });

  test('ni ninguna le escribe', () => {
    // Escribirle no da error de compilación y el UPDATE falla en tiempo de
    // ejecución: es el que se coló con un `.catch()` delante.
    for (const sql of losSql()) {
      assert.ok(!/SET\s+meta\s*=/.test(sql), `escribe en meta: ${sql.slice(0, 90)}`);
    }
  });

  test('y los avisos a proveedores se anotan en sus columnas', () => {
    assert.match(FUENTE, /SET factura_vendedor_pedida_at = NOW\(\)/);
    assert.match(FUENTE, /SET encargo_gestoria_enviado_at = NOW\(\)/);
  });
});
