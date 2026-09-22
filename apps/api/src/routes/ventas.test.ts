/**
 * La lista de ventas en curso.
 *
 * Lo que se protege aquí: que traiga solo las vivas, que el paso de cada una
 * salga de la misma regla que la ficha del coche, que el recuento de las
 * pestañas cuente todas y no las filtradas, y que el DNI del comprador no
 * asome en una lista que va a estar abierta en media oficina.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { config } from '../config.js';

interface Venta {
  paso: string | null;
  que_toca: string;
  comprador: string;
  precio: number | null;
  dias: number | null;
  coche: string;
}

const haceDias = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

/** Lo que devuelve la base en la prueba de turno. */
let filas: Record<string, unknown>[] = [];
/** El SQL que se ha ejecutado, para mirar qué se pidió. */
let consultas: string[] = [];

const queryOriginal = pg.Pool.prototype.query;
let servidor: ReturnType<express.Express['listen']>;
let base = '';
let pase = '';

before(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pg.Pool.prototype as any).query = function (sql: unknown, params?: unknown[]) {
    const t = String(typeof sql === 'string' ? sql : (sql as { text: string }).text).replace(/\s+/g, ' ');
    consultas.push(t);
    if (/FROM erp_encargos_venta/i.test(t)) {
      // Copiadas: si se devuelven por referencia, una prueba se contamina con
      // lo que le hizo la anterior.
      return Promise.resolve({ rows: filas.map((f) => ({ ...f })), rowCount: filas.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };

  const { ventasRouter } = await import('./ventas.js');
  const app = express();
  app.use(express.json());
  app.use('/api', ventasRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  const puerto = (servidor.address() as { port: number }).port;
  base = `http://127.0.0.1:${puerto}/api`;
  pase = jwt.sign({ sub: 'apicazo@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(() => {
  pg.Pool.prototype.query = queryOriginal;
  servidor?.close();
});

beforeEach(() => {
  consultas = [];
  filas = [
    {
      id: 'e-1', vehicle_id: 'v-1', venta_estado: 'en_curso', venta_financia: true,
      financiacion_estado: 'en_estudio', financiacion_entidad: null, financiacion_importe: null,
      financiacion_decidida_at: null, venta_iniciada_at: haceDias(9),
      comprador_nombre: 'Sergio', comprador_email: 'sergio@example.com', comprador_telefono: '600000000',
      precio_venta: '17900.00', precio_referencia: '17500.00',
      cliente_nombre: 'Ana', cliente_email: 'ana@example.com',
      plate: '8888LXR', brand: 'Volkswagen', model: 'T-Roc', year: 2022,
    },
    {
      id: 'e-2', vehicle_id: 'v-2', venta_estado: 'en_curso', venta_financia: false,
      financiacion_estado: null, financiacion_entidad: null, financiacion_importe: null,
      financiacion_decidida_at: null, venta_iniciada_at: haceDias(1),
      comprador_nombre: 'Marta', comprador_email: 'marta@example.com', comprador_telefono: '',
      precio_venta: null, precio_referencia: '9500.00',
      cliente_nombre: 'Luis', cliente_email: 'luis@example.com',
      plate: '1234ABC', brand: 'Seat', model: 'León', year: 2019,
    },
  ];
});

async function pide(camino: string) {
  const r = await fetch(base + camino, { headers: { authorization: `Bearer ${pase}` } });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; data: Venta[]; meta?: { cuenta: Record<string, number> } } };
}

describe('las ventas en curso', { concurrency: 1 }, () => {
  test('salen con su paso y con la frase de qué toca', async () => {
    const r = await pide('/ventas');
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.cuerpo.data.map((v) => v.paso), ['financiacion_en_estudio', 'esperando_ingreso']);
    assert.match(r.cuerpo.data[0]!.que_toca, /hasta que la entidad conteste/);
    assert.match(r.cuerpo.data[1]!.que_toca, /importe del coche/);
  });

  test('solo las vivas y solo las que están en curso', async () => {
    await pide('/ventas');
    const sql = consultas.find((c) => /FROM erp_encargos_venta/i.test(c))!;
    assert.match(sql, /e\.cerrado_at IS NULL/);
    assert.match(sql, /e\.venta_estado = \$1/);
  });

  test('arriba la que lleva más tiempo esperando', async () => {
    await pide('/ventas');
    const sql = consultas.find((c) => /FROM erp_encargos_venta/i.test(c))!;
    assert.match(sql, /ORDER BY e\.venta_iniciada_at ASC/);
  });

  test('el precio llega como número, aunque Postgres lo dé como texto', async () => {
    const r = await pide('/ventas');
    assert.equal(r.cuerpo.data[0]!.precio, 17900);
    // Sin precio de venta acordado vale el de referencia.
    assert.equal(r.cuerpo.data[1]!.precio, 9500);
  });

  test('y los días que lleva parada', async () => {
    const r = await pide('/ventas');
    assert.equal(r.cuerpo.data[0]!.dias, 9);
  });

  test('filtrar por paso no cambia el recuento de las pestañas', async () => {
    const r = await pide('/ventas?paso=esperando_ingreso');
    assert.deepEqual(r.cuerpo.data.map((v) => v.comprador), ['Marta']);
    assert.equal(r.cuerpo.meta?.cuenta.todas, 2);
    assert.equal(r.cuerpo.meta?.cuenta.financiacion_en_estudio, 1);
  });

  test('el DNI del comprador no sale en la lista', async () => {
    const r = await pide('/ventas');
    assert.ok(!JSON.stringify(r.cuerpo).includes('comprador_dni'));
    const sql = consultas.find((c) => /FROM erp_encargos_venta/i.test(c))!;
    assert.ok(!/comprador_dni/.test(sql), 'ni se pide a la base');
    assert.ok(!/SELECT \*/.test(sql), 'SELECT * traería los testigos de firma');
  });

  test('buscar mira comprador, matrícula y coche', async () => {
    await pide('/ventas?q=t-roc');
    const sql = consultas.find((c) => /FROM erp_encargos_venta/i.test(c))!;
    assert.match(sql, /comprador_nombre/);
    assert.match(sql, /v\.plate/);
    assert.match(sql, /v\.brand/);
  });

  test('sin pase no se entra', async () => {
    const r = await fetch(base + '/ventas');
    assert.equal(r.status, 401);
  });
});

describe('la pantalla', () => {
  const PAGINA = readFileSync(join(process.cwd(), 'apps/web/src/pages/VentasPage.tsx'), 'utf8').replace(/\r\n/g, '\n');

  test('entra a la ficha del coche, que es donde están los botones', () => {
    assert.match(PAGINA, /to=\{`\/idcars\/\$\{f\.vehicle_id\}`\}/);
  });

  test('usa el mismo semáforo que la ficha, no un cuarto esquema de color', () => {
    assert.match(PAGINA, /financiacion_en_estudio: 'bg-amber-50 text-amber-800 border-amber-200'/);
    assert.match(PAGINA, /financiacion_denegada: 'bg-red-50 text-red-700 border-red-200'/);
  });

  test('cuando está vacía explica por qué puede estarlo', () => {
    assert.match(PAGINA, /Ninguna venta esperando/);
    assert.match(PAGINA, /quiero comprarlo/);
  });

  test('y el aviso del panel ya no manda a la lista de coches', () => {
    const PENDIENTES = readFileSync(join(process.cwd(), 'apps/api/src/lib/pendientes.ts'), 'utf8');
    const trozo = PENDIENTES.slice(PENDIENTES.indexOf("clave: 'ventas_financiacion_denegada'"), PENDIENTES.indexOf("clave: 'encargos_vendidos'"));
    assert.ok(!trozo.includes("a: '/idcars'"), 'algún aviso de venta sigue apuntando a /idcars');
    assert.match(trozo, /a: '\/ventas'/);
  });
});
