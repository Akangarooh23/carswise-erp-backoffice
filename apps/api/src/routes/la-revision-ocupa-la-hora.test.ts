/**
 * Dar cita a un taller le ocupa esa hora, y le da de alta como proveedor.
 *
 * ## Lo que había
 *
 * «Taller» significaba tres cosas que no se hablaban entre sí: el directorio
 * del que el cliente elige en PopCar (55.718 talleres, y donde está su agenda),
 * Proveedores —con quién se factura, con **cero** talleres dados de alta— y el
 * nombre tecleado a mano en la revisión del encargo. El desplegable de esa
 * pantalla salía de Proveedores, así que estaba vacío y se veía exactamente
 * igual que un campo de texto libre.
 *
 * Así, la única revisión apuntada decía «Norauto Alcobendas» escrito a mano: no
 * era ningún taller en concreto, no ocupaba hora en la agenda de nadie, y la
 * factura de los 60 € no tenía a quién ir.
 *
 * ## Lo que se fija aquí
 *
 * Que al dar la cita se le ocupe la hora **antes** de apuntar la revisión, que
 * si esa hora ya la tiene otro no se dé la cita, y que mover la cita mueva la
 * hora cogida en vez de dejar la vieja bloqueada y la nueva libre.
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

/** Cómo está el mundo en cada prueba. */
let laHoraEstaCogida: boolean;
let elTallerYaEsProveedor: boolean;
let laRevisionRevienta: boolean;
/** La revisión que ya existe, para las de mover la cita. */
let citaGuardada: string | null;
let tallerGuardado: string;
/** Lo que se ha escrito. */
let escrituras: { sql: string; valores: unknown[] }[] = [];

const TALLER = { id: '18', name: 'Norauto', address: 'C/ Alcalá 120', city: 'Madrid', postcode: '28009', province: 'Madrid', phone: '910000000' };

function reinicia() {
  laHoraEstaCogida = false;
  elTallerYaEsProveedor = false;
  laRevisionRevienta = false;
  citaGuardada = '2026-10-05T10:00:00.000Z';
  tallerGuardado = '18';
  escrituras = [];
}

before(async () => {
  reinicia();

  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String(sql);
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) => Promise.resolve({ rows, rowCount: rows.length } as never);

    if (/CREATE TABLE|CREATE UNIQUE INDEX|ALTER TABLE/i.test(t)) return responde([]);

    // El taller del directorio.
    if (/FROM workshop_locations/i.test(t)) {
      return responde(String(p[0]) === TALLER.id ? [{ ...TALLER }] : []);
    }

    // Ocuparle la hora.
    if (/INSERT INTO moveadvisor_workshop_reservations/i.test(t)) {
      escrituras.push({ sql: t, valores: p });
      if (laHoraEstaCogida) {
        const choque = Object.assign(new Error('duplicate key'), { code: '23505' });
        return Promise.reject(choque);
      }
      return responde([]);
    }
    if (/UPDATE moveadvisor_workshop_reservations/i.test(t)) {
      escrituras.push({ sql: t, valores: p });
      return responde([]);
    }

    // Proveedores.
    if (/SELECT id, tipos FROM erp_proveedores/i.test(t)) {
      return responde(elTallerYaEsProveedor ? [{ id: 'PRV-9', tipos: ['taller'] }] : []);
    }
    if (/INSERT INTO erp_proveedores/i.test(t)) {
      escrituras.push({ sql: t, valores: p });
      return responde([]);
    }
    // El numero de la serie del proveedor nuevo: PRV-2026-004.
    if (/AS ultimo/i.test(t)) return responde([{ ultimo: 3 }]);

    // La revisión.
    if (/SELECT taller_id, cita_at FROM erp_revisiones_taller/i.test(t)) {
      return responde([{ taller_id: tallerGuardado, cita_at: citaGuardada }]);
    }
    if (/INSERT INTO erp_revisiones_taller/i.test(t)) {
      escrituras.push({ sql: t, valores: p });
      if (laRevisionRevienta) return Promise.reject(new Error('la base se ha caido'));
      return responde([{ id: 'rev-1', taller: p[3], taller_id: p[4] }]);
    }
    if (/UPDATE erp_revisiones_taller/i.test(t)) {
      escrituras.push({ sql: t, valores: p });
      return responde([{ id: 'rev-1' }]);
    }

    return responde([]);
  } as never;

  const { revisionesTallerRouter } = await import('./revisiones-taller.js');
  const app = express();
  app.use(express.json());
  app.use('/api', revisionesTallerRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'ana@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => reinicia());

async function daCita(cuerpo: unknown) {
  const r = await fetch(`${base}/revisiones-taller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pase },
    body: JSON.stringify(cuerpo),
  });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; error?: string; detail?: string } };
}

async function mueveLaCita(cuerpo: unknown) {
  const r = await fetch(`${base}/revisiones-taller/rev-1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pase },
    body: JSON.stringify(cuerpo),
  });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; error?: string } };
}

const LA_CITA = {
  vehicle_id: 'veh-1',
  taller: 'Norauto',
  taller_id: TALLER.id,
  direccion: 'C/ Alcalá 120, Madrid',
  cita_at: '2026-10-06T11:00:00.000Z',
};

const deLas = (re: RegExp) => escrituras.filter((e) => re.test(e.sql));

describe('dar cita a un taller del directorio', () => {
  test('le ocupa la hora en su agenda', async () => {
    const r = await daCita(LA_CITA);

    assert.equal(r.codigo, 201);
    const ocupada = deLas(/INSERT INTO moveadvisor_workshop_reservations/);
    assert.equal(ocupada.length, 1, 'la hora no se ha ocupado');
    assert.equal(ocupada[0].valores[1], TALLER.id);
  });

  test('y le da de alta como proveedor, que es a quien se le paga', async () => {
    const r = await daCita(LA_CITA);

    assert.equal(r.codigo, 201);
    const alta = deLas(/INSERT INTO erp_proveedores/);
    assert.equal(alta.length, 1, 'el taller no se ha dado de alta');
    assert.equal(alta[0].valores[1], 'Norauto');
    assert.match(alta[0].sql, /ARRAY\['taller'\]/);
  });

  test('si ya era proveedor no se duplica', async () => {
    elTallerYaEsProveedor = true;

    await daCita(LA_CITA);

    assert.equal(deLas(/INSERT INTO erp_proveedores/).length, 0);
  });

  test('el id del taller queda apuntado en la revision', async () => {
    await daCita(LA_CITA);

    const rev = deLas(/INSERT INTO erp_revisiones_taller/)[0];
    // Sin el id, el nombre es texto: ni agenda, ni direccion, ni a quien pagar.
    assert.equal(rev.valores[4], TALLER.id);
  });
});

describe('cuando esa hora ya la tiene otro', () => {
  test('no se da la cita', async () => {
    /*
     * La hora la pide también el cliente desde PopCar, sobre la misma tabla.
     * Quien decide es el índice único de la base, porque entre mirar si está
     * libre y escribirla cabe otra persona haciendo lo mismo.
     */
    laHoraEstaCogida = true;

    const r = await daCita(LA_CITA);

    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'hora_cogida');
  });

  test('y la revision no se apunta', async () => {
    laHoraEstaCogida = true;

    await daCita(LA_CITA);

    // Se coge la hora antes de escribir la fila justo para esto: una revisión
    // dada a una hora que el taller no tiene solo se arregla cerrándola y
    // abriendo otra, y eso apunta una factura de más.
    assert.equal(deLas(/INSERT INTO erp_revisiones_taller/).length, 0);
  });
});

describe('si la revision no llega a escribirse', () => {
  test('la hora se suelta', async () => {
    laRevisionRevienta = true;

    const r = await daCita(LA_CITA);

    assert.equal(r.codigo, 500);
    const soltada = deLas(/UPDATE moveadvisor_workshop_reservations/);
    assert.equal(soltada.length, 1, 'el taller se queda con una hora cogida por una cita que no existe');
    assert.match(soltada[0].sql, /estado = 'cancelled'/);
  });
});

describe('mover la cita', () => {
  test('coge la nueva hora y suelta la vieja, en ese orden', async () => {
    const r = await mueveLaCita({ cita_at: '2026-10-07T12:00:00.000Z' });

    assert.equal(r.codigo, 200);
    const tocadas = escrituras.filter((e) => /moveadvisor_workshop_reservations/.test(e.sql));
    assert.match(tocadas[0].sql, /INSERT/, 'suelta la vieja antes de coger la nueva: cabe que se cuele un cliente');
    assert.match(tocadas[1].sql, /UPDATE/);
  });

  test('si la nueva esta cogida, no se mueve nada', async () => {
    laHoraEstaCogida = true;

    const r = await mueveLaCita({ cita_at: '2026-10-07T12:00:00.000Z' });

    assert.equal(r.codigo, 409);
    assert.equal(deLas(/UPDATE erp_revisiones_taller/).length, 0);
    assert.equal(deLas(/UPDATE moveadvisor_workshop_reservations/).length, 0, 'ha soltado la hora vieja sin tener la nueva');
  });

  test('y guardar sin tocar la cita no mueve la hora', async () => {
    const r = await mueveLaCita({ notas: 'le he llamado' });

    assert.equal(r.codigo, 200);
    assert.equal(escrituras.filter((e) => /moveadvisor_workshop_reservations/.test(e.sql)).length, 0);
  });
});

describe('un taller escrito a mano', () => {
  test('sigue pudiendo apuntarse, sin ocupar hora', async () => {
    /*
     * El coche puede acabar en un taller que no está en el directorio, y
     * obligar a darlo de alta antes de apuntar la revisión sería parar el
     * trabajo por el papeleo.
     */
    const r = await daCita({ ...LA_CITA, taller: 'El taller de Paco', taller_id: '' });

    assert.equal(r.codigo, 201);
    assert.equal(escrituras.filter((e) => /moveadvisor_workshop_reservations/.test(e.sql)).length, 0);
    assert.equal(deLas(/INSERT INTO erp_proveedores/).length, 0);
  });

  test('pero un id que no existe no cuela', async () => {
    const r = await daCita({ ...LA_CITA, taller_id: '999999' });

    assert.equal(r.codigo, 400);
    assert.equal(r.cuerpo.error, 'taller_no_encontrado');
    assert.equal(deLas(/INSERT INTO erp_revisiones_taller/).length, 0);
  });
});
