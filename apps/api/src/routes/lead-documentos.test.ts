/**
 * Los papeles de un expediente.
 *
 * Lo que se comprueba aquí es lo que hace que esto no sea un agujero: qué
 * ficheros se aceptan, que no se puedan colgar de un expediente inventado, y que
 * el documento se sirva **por esta ruta con sesión** y no por su dirección
 * pública en el almacén. Son papeles con matrícula, nombre y dirección de una
 * persona.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const LEAD = 'imp-1';
interface Fila { [k: string]: unknown }

const queryOriginal = pg.Pool.prototype.query;
const fetchOriginal = globalThis.fetch;
let servidor: Server;
let base: string;
let pase: string;

/** Las consultas que se han hecho. */
let consultas: string[] = [];
/** Lo guardado, y lo que se ha mandado al almacén. */
let documentos: Fila[] = [];
let existeElLead = true;
let alAlmacen: { metodo: string; url: string }[] = [];

function reinicia() {
  consultas = [];
  documentos = [];
  existeElLead = true;
  alAlmacen = [];
}

before(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'clave-de-mentira';

  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '');
    consultas.push(t.replace(/\s+/g, ' '));
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) => Promise.resolve({ rows, rowCount: rows.length } as never);

    if (/FROM moveadvisor_market_leads/i.test(t)) return responde(existeElLead ? [{ id: LEAD }] : []);
    if (/INSERT INTO erp_lead_documentos/i.test(t)) {
      const fila = { id: `doc-${documentos.length + 1}`, lead_id: p[0], nombre: p[1], tipo: p[2], ruta: p[3], tamano: p[4], subido_por: p[5], created_at: '2026-08-30' };
      documentos.push(fila);
      return responde([fila]);
    }
    if (/SELECT nombre, tipo, ruta FROM erp_lead_documentos/i.test(t)) {
      return responde(documentos.filter((d) => d.id === p[0] && d.lead_id === p[1]));
    }
    if (/DELETE FROM erp_lead_documentos/i.test(t)) {
      const fuera = documentos.filter((d) => d.id === p[0] && d.lead_id === p[1]);
      documentos = documentos.filter((d) => !fuera.includes(d));
      return responde(fuera);
    }
    if (/FROM erp_lead_documentos/i.test(t)) return responde(documentos.filter((d) => d.lead_id === p[0]));
    return responde([]);
  } as never;

  globalThis.fetch = (async (url: unknown, opciones?: unknown) => {
    const u = String(url);
    if (u.includes('supabase')) {
      alAlmacen.push({ metodo: String((opciones as { method?: string })?.method || 'GET'), url: u });
      return { ok: true, status: 200, text: async () => '', arrayBuffer: async () => new ArrayBuffer(3) };
    }
    return (fetchOriginal as never as typeof fetch)(u as never, opciones as never);
  }) as never;

  const { leadDocumentosRouter } = await import('./lead-documentos.js');
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', leadDocumentosRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'apicazo@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  globalThis.fetch = fetchOriginal;
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

const PDF = Buffer.from('%PDF-1.4 de mentira').toString('base64');

describe('los papeles de un expediente', { concurrency: 1 }, () => {
  test('se sube un PDF y queda en la lista', async () => {
    const r = await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'permiso-circulacion.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    assert.equal(r.codigo, 200);
    const lista = await api(`/leads/${LEAD}/documentos`);
    assert.equal((lista.cuerpo.data as Fila[]).length, 1);
  });

  test('el nombre no puede escaparse de su carpeta', async () => {
    await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: '../../otro/sitio.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    const ruta = String(documentos[0]?.ruta ?? '');
    const carpeta = `expedientes/${LEAD}/`;
    assert.ok(ruta.startsWith(carpeta), `no cuelga de su expediente: ${ruta}`);
    // Los puntos pueden quedarse en el nombre; lo que no puede quedarse es la
    // barra, que es lo que convierte «..» en un salto de carpeta.
    assert.ok(!ruta.slice(carpeta.length).includes('/'),
      `el nombre añade carpetas: ${ruta}`);
  });

  test('un ejecutable no es un documento del coche', async () => {
    const r = await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'cosa.exe', tipo: 'application/x-msdownload', contenido_base64: PDF,
    });
    assert.equal(r.codigo, 400);
    assert.equal(documentos.length, 0);
  });

  test('ni un .html, que el almacén sirve por su dirección', async () => {
    const r = await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'pagina.html', tipo: 'text/html', contenido_base64: PDF,
    });
    assert.equal(r.codigo, 400);
  });

  test('no se cuelgan papeles de un expediente que no existe', async () => {
    existeElLead = false;
    const r = await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'factura.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    assert.equal(r.codigo, 404);
    assert.equal(alAlmacen.length, 0, 'ni siquiera se sube: sería un fichero de nadie');
  });

  test('el documento se sirve por aquí, no por la dirección del almacén', async () => {
    await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'ficha.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    const lista = await api(`/leads/${LEAD}/documentos`);
    const doc = (lista.cuerpo.data as Fila[])[0];
    const elListado = consultas.find((c) => /SELECT id, nombre/i.test(c));
    assert.ok(elListado && !/\bruta\b/.test(elListado.split('FROM')[0]),
      'el listado no pide la ruta del almacén: quien la tenga se salta la sesión');

    const r = await fetch(`${base}/leads/${LEAD}/documentos/${doc.id}`, { headers: { Authorization: `Bearer ${pase}` } });
    assert.equal(r.status, 200);
    assert.match(String(r.headers.get('content-type')), /application\/pdf/);
  });

  test('sin sesión no se ve nada', async () => {
    await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'ficha.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    const doc = documentos[0];
    const r = await fetch(`${base}/leads/${LEAD}/documentos/${doc.id}`);
    assert.equal(r.status, 401);
  });

  test('el de otro expediente no se sirve', async () => {
    await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'ficha.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    const doc = documentos[0];
    const r = await api(`/leads/otro-expediente/documentos/${doc.id}`);
    assert.equal(r.codigo, 404);
  });

  test('quitarlo lo borra también del almacén', async () => {
    await api(`/leads/${LEAD}/documentos`, 'POST', {
      nombre: 'ficha.pdf', tipo: 'application/pdf', contenido_base64: PDF,
    });
    const doc = documentos[0];
    const r = await api(`/leads/${LEAD}/documentos/${doc.id}`, 'DELETE');
    assert.equal(r.codigo, 200);
    assert.ok(alAlmacen.some((x) => x.metodo === 'DELETE'),
      'un papel con datos de alguien que ya nadie mira no se queda ahí');
  });
});
