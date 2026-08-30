/**
 * El expediente de importación, por el lado del ERP.
 *
 * Un expediente de importación se maneja desde aquí: se marca la fianza
 * cobrada, se avanza de etapa y se pone la fecha en la que le hemos dicho al
 * cliente que lo tendrá. Todo eso pasa por el mismo `PATCH`, que construye su
 * `UPDATE` a mano juntando trozos.
 *
 * Y ahí había dos huecos sin `$`: `delivery_estimate = 3` en vez de
 * `delivery_estimate = $3`. Postgres no puede meter un número en una fecha, así
 * que guardar la fecha de entrega fallaba **siempre**, y lo mismo las notas de
 * venta. Ninguna prueba lo vio porque el código compila igual: es SQL, no
 * TypeScript.
 *
 * Se levanta el router de verdad y se mira el SQL que sale. Lo simulado es solo
 * la base.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const LEAD = 'imp-1';
const CLIENTE = 'cliente@example.com';

interface Fila { [k: string]: unknown }

const queryOriginal = pg.Pool.prototype.query;
const fetchOriginal = globalThis.fetch;
let servidor: Server;
let base: string;
let pase: string;

/** Las consultas que ha hecho la ruta. */
let consultas: { sql: string; params: unknown[] }[] = [];
/** Lo que ha salido hacia el cliente. */
let correos: { to: string; subject: string; html: string }[] = [];
/** Cómo está el expediente. */
let expediente: Fila;

function reinicia() {
  consultas = [];
  correos = [];
  expediente = {
    id: LEAD,
    user_email: CLIENTE,
    lead_type: 'import',
    vehicle_title: 'Volkswagen Golf VI Trendline',
    contact_name: 'Ana',
    status: 'Fianza pagada',
    erp_notes: '',
    erp_response: '',
    appointment_date: null,
    deposit_quoted: '1019.00',
    deposit_paid_at: '2026-08-29T19:30:00Z',
    delivery_estimate: null,
  };
}

before(async () => {
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '');
    consultas.push({ sql: t.replace(/\s+/g, ' '), params: (params ?? []) as unknown[] });

    /**
     * Postgres, en lo que importa aquí: un hueco sin `$` no es un parámetro.
     *
     * `delivery_estimate = 3` es asignarle el número tres a una fecha, y eso lo
     * rechaza la base. Sin esto, la prueba pasaría con el fallo dentro.
     */
    if (/UPDATE moveadvisor_market_leads/i.test(t)) {
      const malo = /(\w+)\s*=\s*\d+\s*(,|WHERE)/i.exec(t);
      if (malo) {
        return Promise.reject(new Error(
          `column "${malo[1]}" is of type date but expression is of type integer`
        ));
      }
      return Promise.resolve({ rows: [{ ...expediente }], rowCount: 1 } as never);
    }
    if (/FROM moveadvisor_market_leads/i.test(t)) {
      return Promise.resolve({ rows: [{ ...expediente }], rowCount: 1 } as never);
    }
    return Promise.resolve({ rows: [], rowCount: 0 } as never);
  } as never;

  // Nada sale hacia fuera. Ojo: solo lo de fuera. Interceptar todo se traga
  // también las llamadas que esta prueba le hace a su propio servidor, y
  // entonces todo contesta 200 y no se comprueba nada.
  globalThis.fetch = (async (url: unknown, opciones?: unknown) => {
    const u = String(url);
    if (u.includes('resend.com') || u.includes('popcar.tech/api')) {
      if (u.includes('resend.com')) {
        const c = JSON.parse(String((opciones as { body?: string })?.body ?? '{}'));
        correos.push({ to: String(c.to), subject: String(c.subject ?? ''), html: String(c.html ?? '') });
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    return (fetchOriginal as never as typeof fetch)(u, opciones as never);
  }) as never;
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'clave-de-mentira';

  const { leadsRouter } = await import('./leads.js');
  const app = express();
  app.use(express.json());
  app.use('/api', leadsRouter);
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

async function api(camino: string, cuerpo?: unknown, metodo = 'PATCH') {
  const r = await fetch(base + camino, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pase}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { codigo: r.status, cuerpo: await r.json().catch(() => ({})) as Fila };
}

/** El `UPDATE` del expediente. */
function elUpdate() {
  return consultas.find((c) => /UPDATE moveadvisor_market_leads/i.test(c.sql));
}

describe('el expediente de importación', { concurrency: 1 }, () => {
  test('la fecha de entrega se guarda, con el pedido ya hecho', async () => {
    expediente.status = 'Pedido a Alemania';
    const r = await api(`/leads/${LEAD}`, { delivery_estimate: '2026-10-15' });
    assert.equal(r.codigo, 200, `no se ha podido guardar: ${JSON.stringify(r.cuerpo)}`);
    assert.match(elUpdate()!.sql, /delivery_estimate = \$\d+/,
      'sin el $ es un número suelto, y la base lo rechaza: la fecha no se guardaba nunca');
    assert.ok(elUpdate()!.params.includes('2026-10-15'));
  });

  test('y las notas de venta también', async () => {
    const r = await api(`/leads/${LEAD}`, { sale_notes: 'Entregado con dos juegos de llaves' });
    assert.equal(r.codigo, 200);
    assert.match(elUpdate()!.sql, /sale_notes\s+= \$\d+/);
  });

  test('la fianza se marca cobrada con la fecha de hoy', async () => {
    const r = await api(`/leads/${LEAD}`, { deposit_paid: true });
    assert.equal(r.codigo, 200);
    assert.match(elUpdate()!.sql, /deposit_paid_at = NOW\(\)/);
  });

  test('y se puede desmarcar, que a veces es un error', async () => {
    const r = await api(`/leads/${LEAD}`, { deposit_paid: false });
    assert.equal(r.codigo, 200);
    assert.match(elUpdate()!.sql, /deposit_paid_at = NULL/);
  });

  test('una nota interna deja rastro en el historial', async () => {
    const r = await api(`/leads/${LEAD}`, { notes: "Le he llamado, se lo piensa" });
    assert.equal(r.codigo, 200);
    const apunte = consultas.find((c) => /INSERT INTO erp_lead_history/i.test(c.sql));
    assert.ok(apunte, 'sin rastro se ve lo que pone hoy, pero no cuándo lo escribió nadie');
    assert.ok(apunte.params.some((x) => String(x) === 'erp_notes'),
      `el apunte no es de las notas: ${JSON.stringify(apunte.params)}`);
  });

  test('las etapas de importación son estados válidos', async () => {
    for (const etapa of ['Fianza pagada', 'Pedido a Alemania', 'En transporte', 'En trámites', 'Entregado']) {
      reinicia();
      const r = await api(`/leads/${LEAD}`, { status: etapa });
      assert.equal(r.codigo, 200, `«${etapa}» debería valer: ${JSON.stringify(r.cuerpo)}`);
    }
  });

  test('entregarlo se lo dice al cliente', async () => {
    expediente.status = 'En trámites';
    const r = await api(`/leads/${LEAD}`, { status: 'Entregado' });
    assert.equal(r.codigo, 200);
    // El envío no se espera dentro de la ruta: se le da un respiro.
    await new Promise((listo) => setTimeout(listo, 50));
    const suyo = correos.find((c) => c.to.includes(CLIENTE));
    assert.ok(suyo, 'era el único paso del recorrido que no avisaba de nada');
    assert.match(suyo.subject, /ya es tuyo/i);
  });

  test('volver a guardarlo entregado no le manda otro correo', async () => {
    expediente.status = 'Entregado';
    await api(`/leads/${LEAD}`, { status: 'Entregado' });
    await new Promise((listo) => setTimeout(listo, 50));
    assert.equal(correos.filter((c) => /ya es tuyo/i.test(c.subject)).length, 0,
      'ya estaba entregado: no ha pasado nada nuevo que contar');
  });

  test('esto es solo de importación', async () => {
    expediente.lead_type = 'visit';
    expediente.status = 'En trámites';
    await api(`/leads/${LEAD}`, { status: 'Entregado' });
    await new Promise((listo) => setTimeout(listo, 50));
    assert.equal(correos.filter((c) => /ya es tuyo/i.test(c.subject)).length, 0);
  });

  test('no se pone fecha de entrega antes de hacer el pedido', async () => {
    expediente.status = 'Pendiente';
    const r = await api(`/leads/${LEAD}`, { delivery_estimate: '2026-10-15' });
    assert.equal(r.codigo, 409,
      'la fecha la da el vendedor al aceptar el pedido: antes de eso es inventada');
  });
});
