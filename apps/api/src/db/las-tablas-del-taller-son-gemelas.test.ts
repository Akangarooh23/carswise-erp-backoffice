/**
 * Las tablas del taller están declaradas en dos sitios, y tienen que decir lo
 * mismo.
 *
 * Las reservas las escribe PopCar y los cierres el ERP, sobre las mismas dos
 * tablas de la misma base. Cada repositorio las crea con su `CREATE TABLE IF
 * NOT EXISTS`: la que arranca primero crea, y la otra no hace nada.
 *
 * Ahí está el peligro. Si alguien añade una columna aquí y no allí, quien
 * arranque primero decide qué tablas hay, y la otra aplicación se encuentra con
 * una columna que no existe — o peor, no se encuentra con nada y falla solo
 * cuando toca esa fila. Un `IF NOT EXISTS` no avisa de que la tabla que ya
 * estaba no es la que él iba a crear.
 *
 * Esta prueba compara las dos declaraciones. Necesita el repositorio de PopCar
 * al lado; si no está, lo dice y no finge que ha comprobado algo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const EL_OTRO = join(RAIZ, '..', 'Mobility-Advisor', 'lib', 'huecos-del-taller.js');
const ESTE = join(RAIZ, 'apps', 'api', 'src', 'db', 'schema.ts');

/**
 * Las tablas, reducidas a lo que importa: nombre, columnas y tipos.
 *
 * Se normaliza el texto porque las dos declaraciones no están escritas igual
 * —una lleva `await query(...)` alrededor y comentarios distintos— y lo que se
 * compara es lo que la base acaba teniendo, no cómo está escrito.
 */
function lasColumnasDe(fuente: string, tabla: string): string[] {
  const desde = fuente.indexOf(`CREATE TABLE IF NOT EXISTS ${tabla} (`);
  if (desde < 0) return [];
  const cuerpo = fuente.slice(desde + `CREATE TABLE IF NOT EXISTS ${tabla} (`.length);
  const hasta = cuerpo.indexOf(')');
  return cuerpo
    .slice(0, hasta)
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim().replace(/,$/, ''))
    .filter(Boolean)
    .map((l) => l.replace(/\s+/g, ' '));
}

/** Los índices que se declaran sobre esa tabla, con su condición. */
function losIndicesDe(fuente: string, tabla: string): string[] {
  const salida: string[] = [];
  const re = /CREATE UNIQUE INDEX IF NOT EXISTS (\w+)\s+ON (\w+) \(([^)]+)\)\s*(WHERE [^;`\n]+)?/g;
  for (const m of fuente.matchAll(re)) {
    if (m[2] !== tabla) continue;
    salida.push(`${m[1]} (${m[3].replace(/\s+/g, ' ').trim()}) ${(m[4] ?? '').replace(/\s+/g, ' ').trim()}`.trim());
  }
  return salida.sort();
}

const TABLAS = ['moveadvisor_workshop_reservations', 'moveadvisor_workshop_blocks'];

describe('las tablas del taller, aquí y en PopCar', () => {
  const hayGemelo = existsSync(EL_OTRO);
  const este = readFileSync(ESTE, 'utf8').replace(/\r\n/g, '\n');

  test('aquí están declaradas las dos', () => {
    // Si esto falla, lo de abajo compararía dos listas vacías y pasaría.
    for (const tabla of TABLAS) {
      assert.ok(lasColumnasDe(este, tabla).length > 3, `${tabla} no se declara en schema.ts`);
      assert.ok(losIndicesDe(este, tabla).length > 0, `${tabla} no lleva indice unico`);
    }
  });

  test('y dicen lo mismo que las de PopCar', { skip: hayGemelo ? false : 'no está el repositorio de PopCar al lado' }, () => {
    const otro = readFileSync(EL_OTRO, 'utf8').replace(/\r\n/g, '\n');

    for (const tabla of TABLAS) {
      assert.deepEqual(
        lasColumnasDe(este, tabla),
        lasColumnasDe(otro, tabla),
        `las columnas de ${tabla} no coinciden con las de PopCar`
      );
      assert.deepEqual(
        losIndicesDe(este, tabla),
        losIndicesDe(otro, tabla),
        `los indices de ${tabla} no coinciden con los de PopCar`
      );
    }
  });
});
