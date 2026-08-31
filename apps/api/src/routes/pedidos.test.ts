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
import { papelesEsperados } from '../lib/documentos.js';

interface Fila { [k: string]: unknown }

const queryOriginal = pg.Pool.prototype.query;
let servidor: Server;
let base: string;
let pase: string;

/** La tabla, simulada. */
let pedidos: Fila[] = [];
let historial: Fila[] = [];
let ofertas: Fila[] = [];
/** Los papeles subidos, que es lo que mira la puerta de «En camino». */
let documentos: Fila[] = [];
/** Los tramos de transporte: un pedido no está en camino si nadie lo ha recogido. */
let transportes: Fila[] = [];
let siguiente = 1;

/** Sube los imprescindibles de ese origen, para poder mover el coche. */
function conSusPapeles(pedidoId: string, origen: string) {
  for (const papel of papelesEsperados(origen).filter((x) => x.imprescindible)) {
    documentos.push({ ambito: 'pedido', ambito_id: pedidoId, papel: papel.papel });
  }
}

/** Alguien lo ha recogido: es lo que hace que un pedido esté de verdad en camino. */
function yaLoHanRecogido(pedidoId: string) {
  transportes.push({ pedido_id: pedidoId, estado: 'Recogido' });
}

/** Todo lo que hace falta para mover el coche, menos los papeles. */
const COMPRA_PAGADA = { factura_proveedor: 'RE-1', factura_pagada_el: '2026-09-02' };

function reinicia() {
  pedidos = [];
  historial = [];
  ofertas = [{ id: 'of-1', dealer_name: 'Autohaus Müller', price: '9000' }];
  documentos = [];
  transportes = [];
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
      if (fila.recepcion === undefined) fila.recepcion = {};
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
          const esJson = col === 'comprobaciones' || col === 'recepcion';
          fila[col] = esJson && typeof v === 'string' ? JSON.parse(v) : v;
        }
        else if (/NOW\(\)/.test(val)) fila[col] = '2026-08-30T10:00:00Z';
      }
      return responde([fila]);
    }
    if (/^SELECT papel FROM erp_documentos/i.test(t)) return responde(documentos.filter((d) => d.ambito_id === p[0]));
    if (/FROM erp_transportes/i.test(t)) {
      const ids = (p[0] ?? []) as string[];
      return responde(transportes.filter((x) => ids.includes(String(x.pedido_id))));
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

describe('mirar el coche al llegar', { concurrency: 1 }, () => {
  /** Un pedido al que solo le falta mirarlo: pagado, con papeles y recogido. */
  async function pedidoListo() {
    const alta = await api('/pedidos', 'POST', {
      origen: 'concesionario', vehiculo_titulo: 'Peugeot 208', proveedor: 'Autos Paco',
      importe: 9000,
    });
    const id = (alta.cuerpo.data as Fila).id as string;
    conSusPapeles(id, 'concesionario');
    yaLoHanRecogido(id);
    await api(`/pedidos/${id}`, 'PATCH', COMPRA_PAGADA);
    return id;
  }

  test('no se da por recibido sin leer los kilómetros ni contar las llaves', async () => {
    const id = await pedidoListo();
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Recibido', nota: 'ha llegado' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'falta_mirar_el_coche');
    assert.equal((r.cuerpo.faltan as unknown[]).length, 2);
  });

  test('con lo mirado, sí, y queda quién lo miró', async () => {
    const id = await pedidoListo();
    const r = await api(`/pedidos/${id}`, 'PATCH', {
      estado: 'Recibido', nota: 'ha llegado',
      recepcion: { km: 84000, llaves: 2, danos: 'Arañazo en el paragolpes' },
    });
    assert.equal(r.codigo, 200);
    const fila = pedidos.find((x) => x.id === id)!;
    const rec = fila.recepcion as Record<string, unknown>;
    assert.equal(rec.km, 84000);
    assert.equal(rec.llaves, 2);
    assert.equal(rec.revisado_por, 'Ana');
  });

  test('decir que no es lo que se compró obliga a decir qué se reclama', async () => {
    const id = await pedidoListo();
    const r = await api(`/pedidos/${id}`, 'PATCH', {
      recepcion: { km: 84000, llaves: 1, conforme: false },
    });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'falta_la_reclamacion');
  });

  test('con la reclamación escrita se guarda', async () => {
    const id = await pedidoListo();
    const r = await api(`/pedidos/${id}`, 'PATCH', {
      recepcion: { km: 84000, llaves: 1, conforme: false, reclamacion: 'Falta la segunda llave' },
    });
    assert.equal(r.codigo, 200);
    const rec = pedidos.find((x) => x.id === id)!.recepcion as Record<string, unknown>;
    assert.match(String(rec.reclamacion), /segunda llave/);
  });

  test('anotar algo después no borra lo de antes', async () => {
    const id = await pedidoListo();
    await api(`/pedidos/${id}`, 'PATCH', { recepcion: { km: 84000, llaves: 2 } });
    await api(`/pedidos/${id}`, 'PATCH', { recepcion: { observaciones: 'Sin libro de mantenimiento' } });
    const rec = pedidos.find((x) => x.id === id)!.recepcion as Record<string, unknown>;
    assert.equal(rec.km, 84000);
    assert.match(String(rec.observaciones), /Sin libro/);
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

/**
 * Las puertas de cada fase, desde fuera.
 *
 * Que la regla esté escrita no basta: lo que cuenta es que la ruta no deje
 * pasar. Y que no pida cosas antes de tiempo, que es la forma de conseguir que
 * alguien escriba un número cualquiera para poder seguir.
 */
describe('no se pasa de fase sin lo que hace falta', { concurrency: 1 }, () => {
  async function nuevo(extra: Record<string, unknown> = {}) {
    const alta = await api('/pedidos', 'POST', {
      origen: 'concesionario', vehiculo_titulo: 'Peugeot 208', proveedor: 'Autos Paco',
      ...extra,
    });
    return (alta.cuerpo.data as Fila).id as string;
  }

  test('confirmar sin importe no se puede', async () => {
    const id = await nuevo();
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'dicen que sí' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'sin_importe');
  });

  test('un importe de cero tampoco es un precio cerrado', async () => {
    const id = await nuevo({ importe: 0 });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'dicen que sí' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'sin_importe');
  });

  test('con importe, sí', async () => {
    const id = await nuevo({ importe: 9000 });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'dicen que sí' });
    assert.equal(r.codigo, 200);
    assert.equal((r.cuerpo.data as Fila).estado, 'Confirmado');
  });

  test('el importe puede llegar en el mismo cambio', async () => {
    const id = await nuevo();
    const r = await api(`/pedidos/${id}`, 'PATCH', {
      estado: 'Confirmado', nota: 'cerrado en 9.000', importe: 9000,
    });
    assert.equal(r.codigo, 200);
  });

  test('confirmar no pide papeles: llegan en momentos distintos', async () => {
    const id = await nuevo({ importe: 9000 });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'sin papeles todavía' });
    assert.equal(r.codigo, 200, 'la factura llega con el pedido, la ficha la devuelve la gestoría');
  });

  test('mover el coche sin sus papeles, no', async () => {
    const id = await nuevo({ importe: 9000 });
    await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'cerrado' });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'faltan_papeles');
    // Los imprescindibles de un concesionario: factura, permiso y ficha técnica.
    assert.deepEqual(r.cuerpo.faltan, ['Factura', 'Permiso de circulación', 'Ficha técnica']);
  });

  test('con papeles, pagado y recogido, sí', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    yaLoHanRecogido(id);
    await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'cerrado' });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 200);
  });

  test('los convenientes no hacen falta para moverlo', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    yaLoHanRecogido(id);
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 200, 'el contrato y las cargas son convenientes, no imprescindibles');
  });

  test('sin pagar la compra no se mueve: seguiría siendo del vendedor', async () => {
    const id = await nuevo({ importe: 9000 });
    conSusPapeles(id, 'concesionario');
    yaLoHanRecogido(id);
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'compra_sin_pagar');
    assert.deepEqual(r.cuerpo.faltan, ['El número de la factura del vendedor', 'Que esté pagada']);
  });

  test('sin que nadie lo haya recogido tampoco: nadie lo está moviendo', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'transporte_sin_salir');
  });

  test('un transporte contratado pero sin recoger no basta', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    transportes.push({ pedido_id: id, estado: 'Contratado' });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'transporte_sin_salir');
  });

  test('uno ya entregado sí: haber llegado es haber salido', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    transportes.push({ pedido_id: id, estado: 'Entregado' });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'ya está aquí' });
    assert.equal(r.codigo, 200);
  });

  test('el transporte de otro coche no cuenta', async () => {
    const id = await nuevo({ importe: 9000, ...COMPRA_PAGADA });
    conSusPapeles(id, 'concesionario');
    transportes.push({ pedido_id: 'otro-pedido', estado: 'Recogido' });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'sale el lunes' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'transporte_sin_salir');
  });

  test('confirmar no pide ni pago ni transporte', async () => {
    const id = await nuevo({ importe: 9000 });
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Confirmado', nota: 'dicen que sí' });
    assert.equal(r.codigo, 200, 'todavía no hay nada que pagar ni nada que mover');
  });

  test('el atajo no salta las puertas', async () => {
    const id = await nuevo({ importe: 9000 });
    // De Borrador a «En camino» de una vez, sin haber subido nada.
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'En camino', nota: 'que salga ya' });
    assert.equal(r.codigo, 409);
    assert.equal(r.cuerpo.error, 'faltan_papeles');
  });

  test('cancelar no pide nada: no es avanzar', async () => {
    const id = await nuevo();
    const r = await api(`/pedidos/${id}`, 'PATCH', { estado: 'Cancelado', nota: 'se lo han vendido a otro' });
    assert.equal(r.codigo, 200);
  });

  test('la lista dice lo que falta para cada fase, sin tener que intentarlo', async () => {
    await nuevo();
    const r = await api('/pedidos');
    const fila = (r.cuerpo.data as Fila[])[0];
    const falta = fila.falta_por_estado as Record<string, string[]>;
    assert.deepEqual(falta['Pedido'], []);
    assert.deepEqual(falta['Confirmado'], ['Por cuánto se ha cerrado']);
    assert.ok(falta['En camino'].includes('Factura'));
    assert.ok(falta['Recibido'].includes('Los kilómetros que marca'));
  });
});
