/**
 * La ruta de tarifas.
 *
 * Lo que importa aquí: que no se pueda guardar una tarifa sin precio —dejaría un
 * corredor que parece cubierto y no lo está—, que la estimación diga de quién es
 * cada precio, y que una tarifa caducada no se aplique en silencio.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

interface Fila { [k: string]: unknown }

const queryOriginal = pg.Pool.prototype.query;
let servidor: Server;
let base: string;
let pase: string;

let proveedores: Fila[] = [];
let tarifas: Fila[] = [];
let serie = 0;

function reinicia() {
  proveedores = [
    { id: 'PRV-1', nombre: 'Trans-Frío Higueral, S.L.' },
    { id: 'PRV-2', nombre: 'Becker Solutions, S.L.' },
  ];
  tarifas = [];
  serie = 0;
}

before(async () => {
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '').replace(/\s+/g, ' ');
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) =>
      Promise.resolve({ rows: rows.map((f) => ({ ...f })), rowCount: rows.length } as never);

    if (/CREATE (TABLE|INDEX)/i.test(t)) return responde([]);
    if (/MAX\(substring/i.test(t)) return responde([{ ultimo: serie }]);

    if (/FROM erp_proveedores WHERE id/i.test(t)) {
      return responde(proveedores.filter((x) => x.id === p[0]));
    }

    if (/INSERT INTO erp_tarifas_transporte/i.test(t)) {
      tarifas.push({
        id: p[0], proveedor_id: p[1], origen_pais: p[2], origen_zona: p[3],
        destino_pais: p[4], destino_zona: p[5],
        precio_1: p[6], precio_2_3: p[7], precio_4_8: p[8],
        dias_transito: p[9], vigente_hasta: p[10], notas: p[11],
      });
      serie += 1;
      return responde([]);
    }

    if (/DELETE FROM erp_tarifas_transporte/i.test(t)) {
      const fuera = tarifas.filter((x) => x.id === p[0] && x.proveedor_id === p[1]);
      tarifas = tarifas.filter((x) => !(x.id === p[0] && x.proveedor_id === p[1]));
      return responde(fuera);
    }

    if (/FROM erp_tarifas_transporte/i.test(t)) {
      // Con el nombre del proveedor, como hace el LEFT JOIN de verdad.
      const con = (x: Fila) => ({
        ...x, proveedor: proveedores.find((v) => v.id === x.proveedor_id)?.nombre ?? null,
      });
      if (/WHERE t.id = \$1/i.test(t)) return responde(tarifas.filter((x) => x.id === p[0]).map(con));
      if (/WHERE t.proveedor_id = \$1/i.test(t)) return responde(tarifas.filter((x) => x.proveedor_id === p[0]).map(con));
      if (/origen_pais = \$1 AND t.destino_pais = \$2/i.test(t)) {
        return responde(tarifas.filter((x) => x.origen_pais === p[0] && x.destino_pais === p[1]).map(con));
      }
      return responde(tarifas.map(con));
    }

    return responde([]);
  } as never;

  const { tarifasRouter } = await import('./tarifas.js');
  const app = express();
  app.use(express.json());
  app.use('/api', tarifasRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'apicazo@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => reinicia());

async function api(camino: string, metodo = 'GET', cuerpo?: unknown) {
  const r = await fetch(base + camino, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pase}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { codigo: r.status, cuerpo: (await r.json().catch(() => ({}))) as Fila };
}

describe('guardar una tarifa', { concurrency: 1 }, () => {
  test('la de Alemania a España, con sus tres tramos', async () => {
    const r = await api('/proveedores/PRV-1/tarifas', 'POST', {
      origen_pais: 'DE', destino_pais: 'ES',
      precio_1: 900, precio_2_3: 750, precio_4_8: 620, dias_transito: 7,
    });
    assert.equal(r.codigo, 200);
    const t = r.cuerpo.data as Fila;
    assert.equal(t.proveedor_id, 'PRV-1');
    assert.equal(t.proveedor, 'Trans-Frío Higueral, S.L.', 'una tarifa sin dueño no se enseña');
    assert.ok(String(t.id).startsWith('TRF-'));
  });

  test('sin ningún precio no se guarda', async () => {
    const r = await api('/proveedores/PRV-1/tarifas', 'POST', { origen_pais: 'DE', destino_pais: 'ES' });
    assert.equal(r.codigo, 400);
    assert.equal(r.cuerpo.error, 'sin_precio');
    assert.equal(tarifas.length, 0, 'un corredor que parece cubierto y no lo está es peor que no tenerlo');
  });

  test('un precio de cero tampoco es un precio', async () => {
    const r = await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 0 });
    assert.equal(r.codigo, 400);
    assert.equal(r.cuerpo.error, 'sin_precio');
  });

  test('de un proveedor que no existe, no', async () => {
    const r = await api('/proveedores/PRV-inventado/tarifas', 'POST', { precio_1: 900 });
    assert.equal(r.codigo, 404);
  });

  test('el país se guarda en dos letras, se escriba como se escriba', async () => {
    await api('/proveedores/PRV-1/tarifas', 'POST', { origen_pais: ' de ', destino_pais: 'es', precio_1: 900 });
    assert.equal(tarifas[0].origen_pais, 'DE');
    assert.equal(tarifas[0].destino_pais, 'ES');
  });

  test('se pueden quitar, y solo las suyas', async () => {
    const alta = await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 900 });
    const id = (alta.cuerpo.data as Fila).id as string;

    const ajena = await api(`/proveedores/PRV-2/tarifas/${id}`, 'DELETE');
    assert.equal(ajena.codigo, 404, 'la tarifa de uno no la borra el otro');

    const suya = await api(`/proveedores/PRV-1/tarifas/${id}`, 'DELETE');
    assert.equal(suya.codigo, 200);
    assert.equal(tarifas.length, 0);
  });
});

describe('lo que costaría traerlo', { concurrency: 1 }, () => {
  test('sin tarifas cargadas no se inventa un precio', async () => {
    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES');
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.cuerpo.data, []);
  });

  test('dice cuánto y de quién', async () => {
    await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 880 });
    await api('/proveedores/PRV-2/tarifas', 'POST', { precio_1: 950 });

    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES');
    const opciones = r.cuerpo.data as { precio: number; tarifa: Fila }[];
    assert.equal(opciones.length, 2);
    assert.equal(opciones[0].precio, 880, 'la más barata primero');
    assert.equal(opciones[0].tarifa.proveedor, 'Trans-Frío Higueral, S.L.');
  });

  test('la del corredor concreto gana a la general, aunque sea más cara', async () => {
    await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 850 });
    await api('/proveedores/PRV-2/tarifas', 'POST', { origen_zona: 'Múnich', precio_1: 900 });

    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES&origen_zona=munich');
    const opciones = r.cuerpo.data as { precio: number }[];
    assert.equal(opciones[0].precio, 900);
  });

  test('la de Múnich no sale para un coche de Hamburgo', async () => {
    await api('/proveedores/PRV-2/tarifas', 'POST', { origen_zona: 'Múnich', precio_1: 900 });
    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES&origen_zona=Hamburgo');
    assert.deepEqual(r.cuerpo.data, []);
  });

  test('con varios coches, el tramo que toca y el total', async () => {
    await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 900, precio_2_3: 750 });
    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES&coches=3');
    const [mejor] = r.cuerpo.data as { precio: number; total: number }[];
    assert.equal(mejor.precio, 750);
    assert.equal(mejor.total, 2250);
  });

  test('una caducada no se aplica, y se dice cuántas se han quedado fuera', async () => {
    await api('/proveedores/PRV-1/tarifas', 'POST', { precio_1: 880, vigente_hasta: '2020-01-01' });
    const r = await api('/tarifas/estimacion?origen_pais=DE&destino_pais=ES');
    assert.deepEqual(r.cuerpo.data, []);
    assert.equal(r.cuerpo.caducadas, 1, 'un hueco raro tiene que poder explicarse');
  });
});
