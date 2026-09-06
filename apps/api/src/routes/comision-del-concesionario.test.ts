/**
 * Emitir el fee del concesionario: cuándo se puede y qué factura sale.
 *
 * Es la primera vez que esta línea genera dinero, y la factura tiene que
 * cuadrar desde el primer día. Ya pasó con la garantía: se guardó el precio de
 * venta en la base y la comisión en el total, y salió una factura cuyo total
 * era menor que su base — en el desglose aparecía un ingreso de 190 € donde se
 * ganaban 70.
 *
 * Se levanta el router de verdad con la base simulada: lo que importa no es que
 * Postgres funcione, es qué se le manda a guardar.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

type Fila = Record<string, unknown>;

const VISITA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let servidor: Server;
let base: string;
let pase: string;
const queryOriginal = pg.Pool.prototype.query;

/** La visita, como la ve la base. */
let visita: Fila;
/** Lo que se ha llegado a insertar. */
let insertadas: { sql: string; valores: unknown[] }[] = [];
/** Si ya hay una factura de esta venta. */
let yaFacturada = false;

function reinicia() {
  visita = {
    id: VISITA,
    vehicle_title: 'Toyota C-HR 1.8 Advance',
    buyer_name: 'Juan',
    buyer_email: 'juan@ejemplo.es',
    resultado: 'compro',
    proveedor: 'Modrive',
    precio: 18500,
  };
  insertadas = [];
  yaFacturada = false;
}

before(async () => {
  reinicia();
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String(sql);
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) => Promise.resolve({ rows, rowCount: rows.length } as never);

    if (/INSERT INTO moveadvisor_provider_invoices/i.test(t)) {
      insertadas.push({ sql: t, valores: p });
      return responde([]);
    }
    // ¿Ya está emitida?
    if (/SELECT id FROM moveadvisor_provider_invoices/i.test(t) && /dealer_commission/i.test(t)) {
      return responde(yaFacturada ? [{ id: 'FE-2026-0001' }] : []);
    }
    // El siguiente número de la serie.
    if (/moveadvisor_provider_invoices/i.test(t) && /MAX|COUNT/i.test(t)) return responde([{ n: 0 }]);
    // La visita.
    if (/FROM vehicle_visit_bookings/i.test(t)) {
      if (/WHERE b\.id = \$1/.test(t)) return responde(String(p[0]) === VISITA ? [{ ...visita }] : []);
      return responde([{ ...visita, date: '2026-09-05' }]);
    }
    return responde([]);
  } as never;

  const { providerBillingRouter } = await import('./provider-billing.js');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', providerBillingRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'ana@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '10m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

beforeEach(() => reinicia());

async function emite(cuerpo: unknown) {
  const r = await fetch(`${base}/provider-billing/dealer-commissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pase },
    body: JSON.stringify(cuerpo),
  });
  return { codigo: r.status, cuerpo: (await r.json()) as { ok: boolean; data?: Fila; error?: string } };
}

/**
 * Los valores de la última factura insertada, por nombre de columna.
 *
 * No vale con emparejar columnas y parámetros por posición: en el INSERT hay
 * literales entre los `$n` —el tipo y el régimen van escritos a mano—, así que
 * la columna quinta no es el quinto parámetro. Se lee la lista de VALUES y cada
 * hueco se resuelve por lo que es.
 */
function laFactura() {
  const { sql, valores } = insertadas[insertadas.length - 1];
  const columnas = (/\(([^)]*?)\)\s*VALUES/is.exec(sql) ?? [, ''])[1]
    .split(',').map((c) => c.trim());
  const puestos = (/VALUES\s*\(([\s\S]*?)\)\s*$/i.exec(sql.trim()) ?? [, ''])[1]
    .split(',').map((v) => v.trim());
  assert.equal(columnas.length, puestos.length, 'el INSERT no cuadra columnas con valores');

  const fuera: Record<string, unknown> = {};
  columnas.forEach((c, i) => {
    const v = puestos[i];
    const param = /^\$(\d+)$/.exec(v);
    fuera[c] = param ? valores[Number(param[1]) - 1] : v.replace(/^'|'$/g, '');
  });
  return fuera;
}

describe('la factura que sale', () => {
  test('se emite con el fee de 200 €, IVA dentro', async () => {
    const r = await emite({ booking_id: VISITA });
    assert.equal(r.codigo, 201);
    assert.equal(r.cuerpo.data?.invoice_amount, 200);

    const f = laFactura();
    assert.equal(f.invoice_amount, 200);
    assert.equal(f.base_amount, 165.29);
    assert.equal(f.iva_rate, 0.21);
    assert.equal(f.regimen, 'nacional');
  });

  test('la base es menor que el total, que es el fallo de la garantía', async () => {
    await emite({ booking_id: VISITA });
    const f = laFactura();
    assert.ok(
      Number(f.base_amount) < Number(f.invoice_amount),
      'la base no puede ser mayor que el total: eso no es una factura',
    );
  });

  test('base más cuota suman el total', async () => {
    await emite({ booking_id: VISITA });
    const f = laFactura();
    const cuota = Math.round(Number(f.invoice_amount) * Number(f.iva_rate) / (1 + Number(f.iva_rate)) * 100) / 100;
    assert.equal(Math.round((Number(f.base_amount) + cuota) * 100) / 100, Number(f.invoice_amount));
  });

  test('se la lleva el concesionario, no el cliente', async () => {
    // El fee lo paga quien vendió el coche. El cliente va de dato, para poder
    // reconstruir de qué venta salió.
    await emite({ booking_id: VISITA });
    const f = laFactura();
    assert.equal(f.provider_name, 'Modrive');
    assert.equal(f.customer_name, 'Juan');
    assert.equal(f.type, 'dealer_commission');
  });

  test('y queda atada a la visita, para no emitirla dos veces', async () => {
    await emite({ booking_id: VISITA });
    assert.equal(laFactura().contract_id, VISITA);
  });

  test('el concepto dice el coche y por cuánto se vendió', async () => {
    await emite({ booking_id: VISITA });
    const notas = String(laFactura().notes);
    assert.match(notas, /Toyota C-HR/);
    assert.match(notas, /18500\.00 €/);
  });

  test('se puede emitir por otro importe, que el fee es provisional', async () => {
    // No hay contrato con los concesionarios todavía. Los 200 € se proponen; si
    // uno paga otra cosa, se emite lo que paga.
    const r = await emite({ booking_id: VISITA, amount: 350 });
    assert.equal(r.codigo, 201);
    assert.equal(laFactura().invoice_amount, 350);
    assert.equal(laFactura().base_amount, 289.26);
  });
});

describe('cuándo no se emite', () => {
  test('si la visita no acabó en venta', async () => {
    for (const resultado of ['fue', 'no_fue', null]) {
      reinicia();
      visita.resultado = resultado;
      const r = await emite({ booking_id: VISITA });
      assert.equal(r.codigo, 409, `con resultado «${resultado}» se ha emitido`);
      assert.equal(insertadas.length, 0);
    }
  });

  test('si no consta quién vende', async () => {
    // Sin concesionario no hay a quién facturar, y una factura con el proveedor
    // en blanco no se cobra.
    visita.proveedor = '   ';
    const r = await emite({ booking_id: VISITA });
    assert.equal(r.codigo, 409);
    assert.equal(insertadas.length, 0);
  });

  test('si ya está emitida', async () => {
    yaFacturada = true;
    const r = await emite({ booking_id: VISITA });
    assert.equal(r.codigo, 409);
    assert.match(String(r.cuerpo.error), /ya_emitida/);
    assert.equal(insertadas.length, 0);
  });

  test('si la visita no existe', async () => {
    const r = await emite({ booking_id: '00000000-0000-0000-0000-000000000000' });
    assert.equal(r.codigo, 404);
    assert.equal(insertadas.length, 0);
  });

  test('y sin decir de qué visita', async () => {
    const r = await emite({});
    assert.equal(r.codigo, 400);
    assert.equal(insertadas.length, 0);
  });
});
