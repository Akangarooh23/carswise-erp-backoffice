/**
 * Dar de alta la misma empresa en otra dirección.
 *
 * Modrive SL con sedes en Madrid y Barcelona: un CIF, tres filas, tres
 * teléfonos. Lo que hay que proteger es que las tres sigan siendo **un solo
 * acreedor** para Hacienda, porque el 347 se presenta por NIF y con la suma del
 * año: dos importes de 2.400 € donde va uno de 4.800 cruzan el umbral de los
 * 3.005,06 € por el lado que no toca.
 *
 * `matriz_id` ya existía y significaba otra cosa —un grupo de sociedades, cada
 * una con su CIF—, así que lo que se comprueba sobre todo es que las dos cosas
 * no se confundan y que lo que ya estaba siga significando lo que significaba.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

type Fila = Record<string, unknown>;

let servidor: Server;
let base: string;
let pase: string;
const queryOriginal = pg.Pool.prototype.query;

/** Las filas de proveedores, como las ve la base. */
let filas: Fila[] = [];
/** Lo que se ha llegado a guardar: el SQL del UPDATE y sus valores. */
let guardados: { sql: string; valores: unknown[] }[] = [];

function reinicia() {
  filas = [
    { id: 'PRV-1', nombre: 'Modrive SL',        matriz_id: null,    relacion: null,     nif: 'B11111111' },
    { id: 'PRV-2', nombre: 'Modrive Madrid',    matriz_id: 'PRV-1', relacion: 'sede',   nif: '' },
    { id: 'PRV-3', nombre: 'Astara Fleet',      matriz_id: 'PRV-4', relacion: 'filial', nif: 'B22222222' },
    { id: 'PRV-4', nombre: 'Astara Group',      matriz_id: null,    relacion: null,     nif: 'B33333333' },
    // Una de las que ya estaban: cuelga de un grupo y no dice de qué manera.
    { id: 'PRV-5', nombre: 'Vieja del grupo',   matriz_id: 'PRV-4', relacion: null,     nif: 'B44444444' },
  ];
  guardados = [];
}

before(async () => {
  reinicia();
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String(sql);
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) => Promise.resolve({ rows, rowCount: rows.length } as never);

    if (/UPDATE erp_proveedores SET/i.test(t)) {
      guardados.push({ sql: t, valores: p });
      const id = String(p[p.length - 1]);
      const fila = filas.find((f) => f.id === id);
      return responde(fila ? [{ ...fila }] : []);
    }
    if (/SELECT id, matriz_id, relacion, nif FROM erp_proveedores WHERE id/i.test(t)) {
      const fila = filas.find((f) => f.id === String(p[0]));
      return responde(fila ? [{ ...fila }] : []);
    }
    if (/SELECT id, matriz_id FROM erp_proveedores/i.test(t)) {
      return responde(filas.map((f) => ({ id: f.id, matriz_id: f.matriz_id })));
    }
    return responde([]);
  } as never;

  const { proveedoresRouter } = await import('./proveedores.js');
  const app = express();
  app.use(express.json());
  app.use('/api', proveedoresRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'ana@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => reinicia());

async function cambia(id: string, cuerpo: unknown) {
  const r = await fetch(`${base}/proveedores/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pase },
    body: JSON.stringify(cuerpo),
  });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; detail?: string; error?: string } };
}

/** Qué se ha escrito en una columna, si es que se ha escrito. */
function loGuardado(columna: string): unknown {
  const g = guardados[guardados.length - 1];
  if (!g) return undefined;
  const m = new RegExp(`${columna} = \\$(\\d+)`).exec(g.sql);
  return m ? g.valores[Number(m[1]) - 1] : undefined;
}

describe('marcar una fila como sede', () => {
  test('se guarda, y sin NIF propio', async () => {
    const r = await cambia('PRV-2', { matriz_id: 'PRV-1', relacion: 'sede' });
    assert.equal(r.codigo, 200);
    assert.equal(loGuardado('matriz_id'), 'PRV-1');
  });

  test('una sede con NIF propio no entra', async () => {
    // Si lo tiene, o no es una sede o el NIF está mal. Guardarlo sería el mismo
    // dato en dos sitios, y el día que cambie cambiaría solo uno.
    const r = await cambia('PRV-2', { relacion: 'sede', nif: 'B11111111' });
    assert.equal(r.codigo, 400);
    assert.match(String(r.cuerpo.detail), /no tiene NIF propio/);
    assert.equal(guardados.length, 0);
  });

  test('ni ponerle el NIF después a una que ya es sede', async () => {
    // La regla se comprueba sobre cómo queda la fila, no sobre lo que llega:
    // por separado, los dos cambios acaban en el mismo sitio.
    const r = await cambia('PRV-2', { nif: 'B11111111' });
    assert.equal(r.codigo, 400);
    assert.equal(guardados.length, 0);
  });

  test('ni marcar sede una que ya tiene NIF', async () => {
    const r = await cambia('PRV-3', { relacion: 'sede' });
    assert.equal(r.codigo, 400);
    assert.equal(guardados.length, 0);
  });

  test('una relación inventada tampoco', async () => {
    const r = await cambia('PRV-2', { relacion: 'sucursal' });
    assert.equal(r.codigo, 400);
    assert.equal(guardados.length, 0);
  });
});

describe('sin matriz no hay relación', () => {
  test('quitar el grupo limpia la relación en vez de dar error', async () => {
    /*
     * La pantalla manda siempre el desplegable, también cuando se acaba de
     * quitar el grupo. Rechazarlo por «sede de nadie» sería negarse a guardar
     * un proveedor independiente por un campo que ni se ve.
     */
    const r = await cambia('PRV-2', { matriz_id: '', relacion: 'sede' });
    assert.equal(r.codigo, 200);
    assert.equal(loGuardado('relacion'), null);
    assert.equal(loGuardado('matriz_id'), null);
  });

  test('y guardar un independiente con el desplegable en «filial» no falla', async () => {
    const r = await cambia('PRV-1', { matriz_id: '', relacion: 'filial', telefono: '976000111' });
    assert.equal(r.codigo, 200);
  });
});

describe('lo que ya estaba sigue significando lo mismo', () => {
  test('una fila colgada sin relación se puede seguir editando', async () => {
    // Antes «colgar» solo quería decir grupo. Esas filas se quedan sin relación
    // a propósito, y tocar otra cosa suya no puede obligarlas a elegir.
    const r = await cambia('PRV-5', { telefono: '910000000' });
    assert.equal(r.codigo, 200);
    assert.equal(loGuardado('relacion'), undefined, 'le ha puesto una relación que nadie ha elegido');
  });

  test('y una filial de verdad conserva su NIF', async () => {
    const r = await cambia('PRV-3', { relacion: 'filial', nif: 'B22222222' });
    assert.equal(r.codigo, 200);
  });
});
