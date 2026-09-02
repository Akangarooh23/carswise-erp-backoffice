/**
 * Los papeles que se adjuntan a un correo a un proveedor.
 *
 * Lo que se comprueba aquí es lo que no se puede corregir con otro correo. Un
 * cuerpo mal escrito se arregla escribiendo otra vez; un DNI equivocado que sale
 * de aquí ya está fuera.
 *
 * Las consultas se miran en el propio fichero y no ejecutándolas: lo que hay que
 * fijar es que **nunca se pida un papel solo por su identificador**, y eso está
 * escrito en el `WHERE`. Montar una base de datos de mentira para comprobar un
 * `WHERE` es más máquina para menos certeza.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { traeLosAdjuntos, NoSePuedenAdjuntar, TOPE_DE_ADJUNTOS } from './adjuntos-del-correo.js';

const FUENTE = readFileSync(new URL('./adjuntos-del-correo.ts', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('de dónde salen los papeles', () => {
  test('siempre del expediente, no del identificador suelto', () => {
    // Con el identificador suelto se podría adjuntar el papel de otro cliente:
    // los identificadores no son secretos, y este correo sale fuera.
    const traer = FUENTE.slice(FUENTE.indexOf('export async function traeLosAdjuntos'));
    assert.match(traer, /WHERE ambito = \$1 AND ambito_id = \$2 AND id::text = ANY\(\$3\)/);
  });

  test('y la lista de los que se pueden elegir, también', () => {
    const listar = FUENTE.slice(
      FUENTE.indexOf('export async function papelesQueSePuedenAdjuntar'),
      FUENTE.indexOf('export class NoSePuedenAdjuntar')
    );
    assert.match(listar, /WHERE ambito = \$1 AND ambito_id = \$2/);
  });

  test('si falta alguno de los elegidos, no sale el correo', () => {
    // Mandarlo sin él sería mandar un encargo al que le falta justo el papel
    // que hacía falta, y nadie se enteraría hasta que lo reclamen.
    assert.match(FUENTE, /if \(filas\.length !== ids\.length\)/);
    assert.match(FUENTE, /Alguno de los papeles ya no está/);
  });

  test('y si uno no se puede leer del almacén, tampoco', () => {
    assert.match(FUENTE, /if \(!bajada\.ok\) throw new NoSePuedenAdjuntar/);
  });
});

describe('sin nada elegido', () => {
  test('no se adjunta nada, y da igual lo que llegue', async () => {
    // Lo que viene del navegador puede ser cualquier cosa. Ninguna de esas
    // cosas puede acabar en una consulta.
    assert.deepEqual(await traeLosAdjuntos('lead', 'imp-1', []), []);
    assert.deepEqual(await traeLosAdjuntos('lead', 'imp-1', undefined), []);
    assert.deepEqual(await traeLosAdjuntos('lead', 'imp-1', 'no es una lista'), []);
    assert.deepEqual(await traeLosAdjuntos('lead', 'imp-1', { id: 1 }), []);
  });
});

describe('el tope de lo que se manda de una vez', () => {
  test('está donde se dijo', () => {
    // Un correo de veinte megas lo rebota media España. Se corta antes y se
    // dice, en vez de mandarlo y que se pierda en el buzón de alguien.
    assert.equal(TOPE_DE_ADJUNTOS, 8 * 1024 * 1024);
    assert.match(FUENTE, /if \(pesan > TOPE_DE_ADJUNTOS\)/);
  });

  test('y se dice cuánto pesan, no solo que se pasan', () => {
    assert.match(FUENTE, /Los papeles pesan \$\{/);
  });
});

describe('el fallo que se le cuenta a quien pulsó', () => {
  test('se distingue de uno cualquiera', () => {
    // Uno se le cuenta —«ese papel ya no está»— y el otro es un 500.
    const e = new NoSePuedenAdjuntar('lo que sea');
    assert.ok(e instanceof Error);
    assert.ok(e instanceof NoSePuedenAdjuntar);
    assert.equal(e.message, 'lo que sea');
  });
});
