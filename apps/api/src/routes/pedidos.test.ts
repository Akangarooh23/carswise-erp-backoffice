/**
 * La ruta de pedidos.
 *
 * Lo que importa aquí: que un pedido no se pueda encargar sin proveedor, que
 * cambiar de estado deje su línea en las notas y su rastro, y —sobre todo— que
 * una solicitud de importación no acabe con tres pedidos del mismo coche. La
 * etapa de un expediente se toca varias veces: se pasa, se vuelve atrás, se
 * corrige, y cada vez llama aquí.
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

/** La tabla, simulada. */
let pedidos: Fila[] = [];
let historial: Fila[] = [];
let ofertas: Fila[] = [];
let siguiente = 1;

function reinicia() {
  pedidos = [];
  historial = [];
  ofertas = [{ id: 'of-1', dealer_name: 'Autohaus Müller', price: '9000' }];
  siguiente = 1;
}

before(async () => {
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '').replace(/\s+/g, ' ');
    const p = (params ?? []) as unknown[];
    // Copias, como devuelve Postgres.
    //
    // Devolviendo la fila por referencia, el `UPDATE` le cambiaba también el
    // «antes» a quien lo estaba comparando: el código veía el estado nuevo en los
    // dos lados y se saltaba el rastro. Un fallo del remedo, no del código.
    const responde = (rows: Fila[]) =>
      Promise.resolve({ rows: rows.map((f) => ({ ...f })), rowCount: rows.length } as never);

    if (/CREATE (TABLE|UNIQUE INDEX|INDEX)/i.test(t)) return responde([]);

    if (/FROM moveadvisor_market_offers/i.test(t)) {
      return responde(ofertas.filter((o) => o.id === p[0]));
    }
    // El siguiente número de la serie.
    if (/MAX\(substring/i.test(t)) return responde([{ ultimo: siguiente - 1 }]);

    if (/INSERT INTO erp_pedidos/i.test(t)) {
      const columnas = /\(([^)]+)\)\s*VALUES/i.exec(t)?.[1].split(',').map((c) => c.trim()) ?? [];
      const fila: Fila = {};
      // Los valores literales del SQL (origen y estado en el alta automática).
      const literales = /VALUES \(([^)]*)\)/i.exec(t)?.[1].split(',').map((v) => v.trim()) ?? [];
      let iParam = 0;
      columnas.forEach((c, i) => {
        const v = literales[i] ?? '';
        fila[c] = v.startsWith('$') ? p[iParam++] : v.replace(/'/g, '');
      });
      if (pedidos.some((x) => x.lead_id && x.lead_id === fila.lead_id)) {
        const e = new Error('duplicate key') as Error & { code?: string };
        e.code = '23505';
        return Promise.reject(e);
      }
      // Los valores por defecto de la tabla, que aquí no los pone nadie.
      if (!fila.estado) fila.estado = 'Borrador';
      if (fila.comprobaciones === undefined) fila.comprobaciones = {};
      if (fila.notas === undefined) fila.notas = '';
      pedidos.push(fila);
      siguiente += 1;
      return responde([]);
    }
    if (/INSERT INTO erp_pedido_history/i.test(t)) {
      historial.push({ pedido_id: p[0], operador: p[1] });
      return responde([]);
    }
    if (/UPDATE erp_pedidos/i.test(t)) {
      const fila = pedidos.find((x) => x.id === p[p.length - 1]);
      if (!fila) return responde([]);
      const asignaciones = /SET (.*) WHERE/i.exec(t)?.[1].split(',').map((x) => x.trim()) ?? [];
      for (const a of asignaciones) {
        const [col, val] = a.split('=').map((x) => x.trim());
        if (val.startsWith('$')) {
          const v = p[Number(val.slice(1)) - 1];
          fila[col] = col === 'comprobaciones' && typeof v === 'string' ? JSON.parse(v) : v;
        }
        else if (/NOW\(\)/.test(val)) fila[col] = '2026-08-30T10:00:00Z';
      }
      return responde([fila]);
    }
    if (/FROM erp_pedido_history/i.test(t)) return responde(historial.filter((h) => h.pedido_id === p[0]));
    if (/FROM erp_pedidos WHERE id = \$1/i.test(t)) return responde(pedidos.filter((x) => x.id === p[0]));
    if (/SELECT id FROM erp_pedidos WHERE lead_id/i.test(t)) return responde(pedidos.filter((x) => x.lead_id === p[0]));
    if (/FROM erp_pedidos/i.test(t)) return responde(pedidos);
    return responde([]);
  } as never;

  const { pedidosRouter } = await import('./pedidos.js');
  const app = express();
  app.use(express.json());
  app.use('/api', pedidosRouter);
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

describe('pedidos', { concurrency: 1 }, () => {
describe('los pedidos', { concurrency: 1 }, () => {
  test('se crea uno y lleva su número de serie', async () => {
    const r = await api('/pedidos', 'POST', { origen: 'concesionario', vehiculo_titulo: 'Peugeot 208' });
    assert.equal(r.codigo, 200);
    assert.match(String((r.cuerpo.data as Fila).id), /^PED-\d{4}-\d{3}$/);
  });

  test('un origen inventado no se acepta', async () => {
    const r = await api('/pedidos', 'POST', { origen: 'subasta', vehiculo_titulo: 'Peugeot 208' });
    assert.equal(r.codigo, 400);
  });

  test('un pedido es de un coche concreto', async () => {
    const r = await api('/pedidos', 'POST', { origen: 'stock', vehiculo_titulo: '' });
    assert.equal(r.codigo, 400);
  });

  test('no se encarga sin decir a quién', async () => {
    const alta = await api('/pedidos', 'POST', { origen: 'stock', vehiculo_titulo: 'Peugeot 208' });
    const id = (alta.cuerpo.data as Fila).id;
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'va' });
    assert.equal(r.codigo, 409);
    assert.match(String(r.cuerpo.error), /sin_proveedor/);
  });

  test('con proveedor sí, y queda la fecha del pedido', async () => {
    const alta = await api('/pedidos', 'POST', { origen: 'stock', vehiculo_titulo: 'Peugeot 208', proveedor: 'Autos Paco' });
    const id = (alta.cuerpo.data as Fila).id;
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'encargado por teléfono' });
    assert.equal(r.codigo, 200);
    const fila = pedidos.find((x) => x.id === id)!;
    assert.equal(fila.estado, 'Pedido');
    assert.ok(fila.fecha_pedido, 'la fecha de verdad, para saber luego cuánto tardó');
  });

  test('el cambio de estado deja su línea en las notas y su rastro', async () => {
    const alta = await api('/pedidos', 'POST', { origen: 'stock', vehiculo_titulo: 'Peugeot 208', proveedor: 'Autos Paco' });
    const id = (alta.cuerpo.data as Fila).id;
    await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'encargado por teléfono' });
    const fila = pedidos.find((x) => x.id === id)!;
    assert.match(String(fila.notas), /Borrador → Pedido/);
    assert.match(String(fila.notas), /encargado por teléfono/);
    assert.equal(historial.filter((h) => h.pedido_id === id).length, 1);
  });

  test('un estado que no existe se rechaza', async () => {
    const alta = await api('/pedidos', 'POST', { origen: 'stock', vehiculo_titulo: 'Peugeot 208', proveedor: 'Autos Paco' });
    const id = (alta.cuerpo.data as Fila).id;
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Entregado' });
    assert.equal(r.codigo, 400);
  });
});

describe('comprarle a un particular', { concurrency: 1 }, () => {
  async function creaDeParticular() {
    const r = await api('/pedidos', 'POST', {
      origen: 'particular', vehiculo_titulo: 'Golf', proveedor: 'Juan Pérez',
    });
    return (r.cuerpo.data as Fila).id as string;
  }

  test('no se encarga sin haber mirado lo que no se arregla después', async () => {
    const id = await creaDeParticular();
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'va' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'faltan_comprobaciones');
    assert.equal((r.cuerpo.faltan as unknown[]).length, 4);
  });

  test('con las cuatro puestas, sí', async () => {
    const id = await creaDeParticular();
    for (const clave of ['informe_dgt', 'firma_el_titular', 'sin_deudas', 'itv_en_vigor']) {
      await api(`/pedidos/${id}`, 'PATCH', { comprobacion: clave, ok: true });
    }
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'encargado' });
    assert.equal(r.codigo, 200);
  });

  test('se guarda quién comprobó cada cosa', async () => {
    const id = await creaDeParticular();
    await api(`/pedidos/${id}`, 'PATCH', { comprobacion: 'informe_dgt', ok: true });
    const fila = pedidos.find((x) => x.id === id)!;
    const c = fila.comprobaciones as Record<string, { ok: boolean; por: string }>;
    assert.equal(c.informe_dgt.ok, true);
    assert.equal(c.informe_dgt.por, 'Ana', 'el día que aparezca un embargo, esa es la pregunta');
  });

  test('desmarcar una vuelve a cerrar la puerta', async () => {
    const id = await creaDeParticular();
    for (const clave of ['informe_dgt', 'firma_el_titular', 'sin_deudas', 'itv_en_vigor']) {
      await api(`/pedidos/${id}`, 'PATCH', { comprobacion: clave, ok: true });
    }
    await api(`/pedidos/${id}`, 'PATCH', { comprobacion: 'informe_dgt', ok: false });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'va' });
    assert.equal(r.codigo, 409);
  });

  test('cancelarlo no exige comprobar nada', async () => {
    const id = await creaDeParticular();
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Cancelado', nota: 'no sigue' });
    assert.equal(r.codigo, 200,
      'renunciar a comprar no puede pedir requisitos: es justo lo contrario');
  });

  test('a un concesionario esta puerta no le afecta', async () => {
    const alta = await api('/pedidos', 'POST', {
      origen: 'concesionario', vehiculo_titulo: 'Golf', proveedor: 'Autos Paco',
    });
    const id = (alta.cuerpo.data as Fila).id;
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Pedido', nota: 'encargado' });
    assert.equal(r.codigo, 200);
  });
});

describe('el pedido que nace de una importación', { concurrency: 1 }, () => {
  test('se crea con el proveedor y el precio de la oferta', async () => {
    const { creaPedidoDeImportacion } = await import('./pedidos.js');
    const id = await creaPedidoDeImportacion({
      leadId: 'imp-1', vehiculoTitulo: 'SEAT Ateca', vehiculoId: 'of-1',
      clienteEmail: 'Cliente@Ejemplo.es', creadoPor: 'Ana',
    });
    const fila = pedidos.find((x) => x.id === id)!;
    assert.equal(fila.origen, 'importacion');
    assert.equal(fila.estado, 'Pedido');
    assert.equal(fila.proveedor, 'Autohaus Müller');
    assert.equal(Number(fila.importe), 9000, 'lo que cobra el vendedor, no lo que paga el cliente');
    assert.equal(fila.cliente_email, 'cliente@ejemplo.es');
  });

  test('llamarlo dos veces no crea dos pedidos del mismo coche', async () => {
    const { creaPedidoDeImportacion } = await import('./pedidos.js');
    const datos = {
      leadId: 'imp-1', vehiculoTitulo: 'SEAT Ateca', vehiculoId: 'of-1',
      clienteEmail: 'cliente@ejemplo.es', creadoPor: 'Ana',
    };
    const primero = await creaPedidoDeImportacion(datos);
    const segundo = await creaPedidoDeImportacion(datos);
    assert.equal(segundo, primero, 'la etapa se toca varias veces: no puede dejar tres pedidos');
    assert.equal(pedidos.length, 1);
  });

  test('sin oferta publicada se crea igual, sin proveedor', async () => {
    const { creaPedidoDeImportacion } = await import('./pedidos.js');
    ofertas = [];
    const id = await creaPedidoDeImportacion({
      leadId: 'imp-2', vehiculoTitulo: 'SEAT Ateca', vehiculoId: 'ya-no-esta',
      clienteEmail: 'cliente@ejemplo.es', creadoPor: 'Ana',
    });
    const fila = pedidos.find((x) => x.id === id)!;
    assert.equal(fila.proveedor, '');
    assert.ok(id, 'que la oferta ya no esté no puede impedir registrar el pedido');
  });
});
});
