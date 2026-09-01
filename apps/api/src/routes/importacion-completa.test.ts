/**
 * Una importación entera, de la solicitud a la entrega.
 *
 * Las otras pruebas miran piezas: qué devuelve una ruta, qué regla bloquea qué.
 * Esta recorre el camino como lo recorre una persona —llega la solicitud, se
 * cobra la fianza, se pide el coche, se trae, se mira al llegar, se hacen los
 * papeles y se entrega— y comprueba lo que va quedando por detrás.
 *
 * Sirve para lo que ninguna prueba suelta puede: que las piezas **encajen**. Que
 * el pedido nazca cuando debe, que los trámites que se abren sean los del
 * origen, que el coste sume lo que hay repartido en cuatro tablas, y que nada de
 * eso dependa de que alguien se acuerde de hacerlo a mano.
 *
 * Se levanta el ERP de verdad. Lo simulado es solo la base y lo que sale hacia
 * fuera: ni se escribe en Postgres ni se manda ningún correo.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

interface Fila { [k: string]: unknown }

const LEAD = 'imp-integral-1';
const CLIENTE = 'cliente@ejemplo.es';

const queryOriginal = pg.Pool.prototype.query;
const fetchOriginal = globalThis.fetch;
let servidor: Server;
let base: string;
let pase: string;

/** La base, simulada: cada tabla es una lista. */
const tablas: Record<string, Fila[]> = {
  leads: [], pedidos: [], tramites: [], transportes: [], gastos: [], historia: [],
  documentos: [],
};
let serie = 0;
let correos: string[] = [];

function reinicia() {
  for (const k of Object.keys(tablas)) tablas[k] = [];
  serie = 0;
  correos = [];
  tablas.leads.push({
    id: LEAD,
    user_email: CLIENTE,
    lead_type: 'import',
    vehicle_id: 'of-1',
    vehicle_title: 'SEAT Ateca 1.0 TSI',
    status: 'Depósito retenido',
    contact_name: 'Ana',
    erp_notes: '',
    erp_response: '',
    appointment_date: null,
    deposit_quoted: '4887.00',
    deposit_paid_at: '2026-08-30T10:00:00Z',
    delivery_estimate: null,
    entrega: {},
    // Lo que el cliente dijo en su panel: es el destino del segundo tramo.
    entrega_direccion: 'Calle Mauricio Legendre 45 G2B',
    entrega_cp: '28046',
    entrega_ciudad: 'Madrid',
    entrega_provincia: 'Madrid',
  });
}

/** Los valores de un INSERT, emparejados con sus columnas. */
function filaDeInsert(sql: string, p: unknown[]): Fila {
  const columnas = /\(([^)]+)\)\s*VALUES/i.exec(sql)?.[1].split(',').map((c) => c.trim()) ?? [];
  const literales = /VALUES \(([^)]*)\)/i.exec(sql)?.[1].split(',').map((v) => v.trim()) ?? [];
  const fila: Fila = {};
  let iParam = 0;
  columnas.forEach((c, i) => {
    const v = literales[i] ?? '';
    fila[c] = v.startsWith('$') ? p[iParam++] : v.replace(/'/g, '');
  });
  return fila;
}

/** Aplica un SET de un UPDATE sobre una fila. */
function aplicaUpdate(sql: string, p: unknown[], fila: Fila) {
  const asignaciones = /SET (.*?) WHERE/is.exec(sql)?.[1].split(/,(?![^(]*\))/).map((x) => x.trim()) ?? [];
  for (const a of asignaciones) {
    const corte = a.indexOf('=');
    if (corte < 0) continue;
    const col = a.slice(0, corte).trim();
    const val = a.slice(corte + 1).trim();
    if (val.startsWith('$')) {
      const v = p[Number(val.slice(1).match(/^\d+/)?.[0]) - 1];
      // Solo las columnas que de verdad son JSON. Una nota empieza por
      // «[30 ago 2026 · …]» y parece un array: interpretarla revienta.
      const esJson = ['comprobaciones', 'recepcion', 'entrega'].includes(col);
      fila[col] = esJson && typeof v === 'string' ? JSON.parse(v) : v;
    } else if (/NOW\(\)/i.test(val)) {
      fila[col] = '2026-08-30T12:00:00Z';
    } else if (/^'.*'$/.test(val)) {
      fila[col] = val.slice(1, -1);
    } else if (/CASE/i.test(val)) {
      // «status = CASE WHEN … THEN 'X' ELSE status END»: se deja como estaba.
    }
  }
}

before(async () => {
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '').replace(/\s+/g, ' ');
    const p = (params ?? []) as unknown[];
    const responde = (rows: Fila[]) =>
      Promise.resolve({ rows: rows.map((f) => ({ ...f })), rowCount: rows.length } as never);

    if (/CREATE (TABLE|UNIQUE INDEX|INDEX)|ALTER TABLE/i.test(t)) return responde([]);
    if (/MAX\(substring/i.test(t)) return responde([{ ultimo: serie }]);
    if (/COALESCE\(MAX\(tramo\)/i.test(t)) return responde([{ siguiente: 1 }]);

    // ── Solicitudes ──
    if (/FROM moveadvisor_market_leads/i.test(t)) {
      return responde(tablas.leads.filter((x) => !p.length || x.id === p[0]));
    }
    if (/UPDATE moveadvisor_market_leads/i.test(t)) {
      const fila = tablas.leads.find((x) => x.id === p[p.length - 1] || x.id === p[0]);
      if (fila) aplicaUpdate(t, p, fila);
      return responde(fila ? [fila] : []);
    }
    if (/INSERT INTO erp_lead_history/i.test(t)) {
      tablas.historia.push({ lead_id: p[0] });
      return responde([]);
    }

    // Los papeles subidos. Sin ellos no se mueve el coche.
    if (/^SELECT papel FROM erp_documentos/i.test(t)) {
      return responde(tablas.documentos.filter((d) => d.ambito_id === p[0]));
    }

    // ── Pedidos, trámites, transportes, gastos ──
    const destino = /erp_pedidos/i.test(t) ? 'pedidos'
      : /erp_tramites/i.test(t) ? 'tramites'
      : /erp_transportes/i.test(t) ? 'transportes'
      : /erp_gastos_pedido/i.test(t) ? 'gastos' : null;

    if (destino) {
      if (/^INSERT/i.test(t)) {
        const fila = filaDeInsert(t, p);
        if (!fila.id) fila.id = `${destino}-${tablas[destino].length + 1}`;
        if (destino === 'pedidos') {
          fila.estado ??= 'Borrador';
          fila.notas ??= '';
          fila.comprobaciones ??= {};
          fila.recepcion ??= {};
          fila.titularidad ??= 'popcar';
        }
        if (destino === 'tramites') fila.estado ??= 'Pendiente';
        if (destino === 'transportes') fila.estado ??= 'Por organizar';
        tablas[destino].push(fila);
        serie += 1;
        return responde([fila]);
      }
      if (/^UPDATE/i.test(t)) {
        const fila = tablas[destino].find((x) => x.id === p[p.length - 1]);
        if (fila) aplicaUpdate(t, p, fila);
        return responde(fila ? [fila] : []);
      }
      if (/^DELETE/i.test(t)) {
        const fuera = tablas[destino].filter((x) => x.id === p[0]);
        tablas[destino] = tablas[destino].filter((x) => x.id !== p[0]);
        return responde(fuera);
      }
      // SELECT: por id, por pedido, por lead, o todo.
      if (/WHERE id = \$1/i.test(t)) return responde(tablas[destino].filter((x) => x.id === p[0]));
      if (/pedido_id = \$1 AND tipo = \$2|lead_id = \$1 AND tipo = \$2/i.test(t)) {
        const col = /pedido_id/.test(t) ? 'pedido_id' : 'lead_id';
        return responde(tablas[destino].filter((x) => x[col] === p[0] && x.tipo === p[1]));
      }
      // El tramo también, o el segundo viaje parecería que ya existe.
      if (/WHERE pedido_id = \$1 AND tramo = \$2/i.test(t)) {
        return responde(tablas[destino].filter(
          (x) => x.pedido_id === p[0] && Number(x.tramo) === Number(p[1])
        ));
      }
      if (/WHERE pedido_id = \$1/i.test(t)) return responde(tablas[destino].filter((x) => x.pedido_id === p[0]));
      if (/WHERE lead_id = \$1/i.test(t)) return responde(tablas[destino].filter((x) => x.lead_id === p[0]));
      return responde(tablas[destino]);
    }

    if (/moveadvisor_market_offers/i.test(t)) {
      // La ciudad va aquí porque de ahí sale el «desde» del tramo de transporte.
      return responde([{ dealer_name: 'Autohaus Müller', price: '9000', ciudad: 'Múnich' }]);
    }
    return responde([]);
  } as never;

  globalThis.fetch = (async (url: unknown, opciones?: unknown) => {
    const u = String(url);
    if (u.includes('resend.com')) {
      const c = JSON.parse(String((opciones as { body?: string })?.body ?? '{}'));
      correos.push(String(c.subject ?? ''));
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    if (u.includes('popcar.tech') || u.includes('supabase')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    return (fetchOriginal as never as typeof fetch)(u as never, opciones as never);
  }) as never;
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'clave-de-mentira';

  const [{ leadsRouter }, { pedidosRouter }, { tramitesRouter }, { transportesRouter }, { gastosRouter }] =
    await Promise.all([
      import('./leads.js'), import('./pedidos.js'), import('./tramites.js'),
      import('./transportes.js'), import('./gastos.js'),
    ]);

  const app = express();
  app.use(express.json());
  app.use('/api', leadsRouter);
  app.use('/api', pedidosRouter);
  app.use('/api', tramitesRouter);
  app.use('/api', transportesRouter);
  app.use('/api', gastosRouter);
  await new Promise<void>((listo) => { servidor = app.listen(0, listo); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api`;
  pase = jwt.sign({ sub: 'apicazo@popcar.tech', role: 'admin', name: 'Ana' }, config.JWT_SECRET, { expiresIn: '30m' });
});

after(async () => {
  pg.Pool.prototype.query = queryOriginal;
  globalThis.fetch = fetchOriginal;
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

async function api(camino: string, metodo = 'GET', cuerpo?: unknown) {
  const r = await fetch(base + camino, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pase}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { codigo: r.status, cuerpo: (await r.json().catch(() => ({}))) as Fila };
}

const esperaEnvios = () => new Promise((listo) => setTimeout(listo, 60));

describe('una importación de punta a punta', { concurrency: 1 }, () => {
  test('el recorrido entero, paso a paso', async () => {
    reinicia();

    // ── 1. Con la fianza cobrada, se pide el coche a Alemania ──────────────
    const pedirlo = await api(`/leads/${LEAD}`, 'PATCH', {
      status: 'Verificado y pagado', notes: 'Encargado a Autohaus Müller',
    });
    assert.equal(pedirlo.codigo, 200);
    await esperaEnvios();

    const pedido = tablas.pedidos[0];
    assert.ok(pedido, 'al pedirlo a Alemania nace su pedido, sin que nadie lo cree a mano');
    assert.equal(pedido.origen, 'importacion');
    assert.equal(pedido.estado, 'Pedido');
    assert.equal(pedido.proveedor, 'Autohaus Müller');
    assert.equal(Number(pedido.importe), 9000, 'lo que cobra el vendedor, no lo que paga el cliente');
    assert.equal(pedido.lead_id, LEAD);

    // ── 2. El proveedor lo confirma: hay que traerlo ───────────────────────
    const confirmar = await api(`/pedidos/${pedido.id}`, 'PATCH', {
      estado: 'Confirmado', nota: 'Confirmado para el día 12',
    });
    assert.equal(confirmar.codigo, 200);
    await esperaEnvios();

    const transporte = tablas.transportes[0];
    assert.ok(transporte, 'confirmado el pedido, se abre su primer tramo');
    assert.equal(transporte.estado, 'Por organizar');
    // De dónde sale: la ciudad alemana de la oferta, no el nombre del vendedor.
    // Sin ciudad no se puede casar con ninguna tarifa por corredor.
    assert.equal(transporte.desde, 'Múnich',
      'el tramo tiene que salir de una ciudad, no de «Autohaus Müller»');

    // ── 3. El transporte: no se contrata sin decir quién y por cuánto ──────
    const sinDatos = await api(`/transportes/${transporte.id}`, 'PATCH', {
      estado: 'Contratado', nota: 'va',
    });
    assert.equal(sinDatos.codigo, 409, 'un transporte contratado sin transportista es un coche que nadie recoge');

    const contratado = await api(`/transportes/${transporte.id}`, 'PATCH', {
      estado: 'Contratado', nota: 'Transportes Gómez', transportista: 'Transportes Gómez', coste: 620,
    });
    assert.equal(contratado.codigo, 200);
    await api(`/transportes/${transporte.id}`, 'PATCH', { estado: 'Recogido', nota: 'Recogido en Múnich' });
    const entregado = await api(`/transportes/${transporte.id}`, 'PATCH', { estado: 'Entregado', nota: 'Ha llegado' });
    assert.equal(entregado.codigo, 200);
    assert.ok(
      (entregado.cuerpo.faltanFotos as string[]).length > 0,
      'se echan en falta las fotos: sin ellas no hay forma de sostener una reclamación'
    );

    // ── 4. Los papeles: sin ellos el coche no se mueve ─────────────────────
    const sinPapeles = await api(`/pedidos/${pedido.id}`, 'PATCH', {
      estado: 'Recibido', nota: 'llegó',
      recepcion: { km: 84000, llaves: 2 },
    });
    assert.equal(sinPapeles.codigo, 409, 'lo que se mueve sin título es un coche de otro');
    assert.equal(sinPapeles.cuerpo.error, 'faltan_papeles');

    // Se suben. Aquí a mano: el almacén tiene su propia ruta y no cuelga de esta.
    for (const papel of [
      'Ficha del vehículo (parte II)', 'Ficha del vehículo (parte I)',
      'COC (certificado de conformidad)', 'Factura del vendedor',
    ]) {
      tablas.documentos.push({ ambito: 'pedido', ambito_id: pedido.id, papel });
    }

    // ── 5. Y pagado: un coche sin pagar sigue siendo del vendedor ──────────
    const sinPagar = await api(`/pedidos/${pedido.id}`, 'PATCH', {
      estado: 'Recibido', nota: 'llegó',
      recepcion: { km: 84000, llaves: 2 },
    });
    assert.equal(sinPagar.codigo, 409);
    assert.equal(sinPagar.cuerpo.error, 'compra_sin_pagar');

    const pagado = await api(`/pedidos/${pedido.id}`, 'PATCH', {
      factura_proveedor: 'RE-2026-4471', factura_pagada_el: '2026-09-02',
    });
    assert.equal(pagado.codigo, 200);

    // ── 6. Al llegar, hay que mirarlo antes de darlo por recibido ──────────
    const sinMirar = await api(`/pedidos/${pedido.id}`, 'PATCH', { estado: 'Recibido', nota: 'llegó' });
    assert.equal(sinMirar.codigo, 409, 'los kilómetros y las llaves se miran antes de moverlo');

    const recibido = await api(`/pedidos/${pedido.id}`, 'PATCH', {
      estado: 'Recibido', nota: 'Llegó bien',
      recepcion: { km: 84000, llaves: 2, danos: 'Arañazo en el paragolpes' },
    });
    assert.equal(recibido.codigo, 200);
    await esperaEnvios();

    /**
     * Y con el coche aquí se abre el tramo que lo lleva a su casa.
     *
     * Son dos viajes y no uno: de Alemania no puede ir directo, tiene que estar
     * aquí para la ITV de homologación y para matricularlo.
     */
    const tramoDeEntrega = tablas.transportes[1];
    assert.ok(tramoDeEntrega, 'al recibirlo se abre el tramo de entrega');
    assert.equal(tramoDeEntrega.desde, 'Zaragoza',
      'el segundo viaje sale de donde se homologa, no de un sitio sin nombre');
    assert.match(String(tramoDeEntrega.hasta), /Mauricio Legendre/,
      'el destino sale de la dirección que puso el cliente, no de un texto fijo');
    assert.match(String(tramoDeEntrega.hasta), /28046 Madrid/);

    // ── 7. Con el coche aquí, se abren sus papeleos ────────────────────────
    const tipos = tablas.tramites.map((x) => String(x.tipo));
    assert.equal(tipos.length, 3, 'un coche de fuera necesita impuesto, ITV de homologación y matrícula');
    assert.ok(tipos.some((x) => /matriculaci/i.test(x)));
    assert.ok(!tipos.some((x) => /transferencia/i.test(x)),
      'no se transfiere lo que nunca ha estado a nombre de nadie aquí');

    // ── 8. La gestoría: no sale de casa sin decir a quién ──────────────────
    const unTramite = tablas.tramites[0];
    const sinGestoria = await api(`/tramites/${unTramite.id}`, 'PATCH', {
      estado: 'Enviado a gestoría', nota: 'va',
    });
    assert.equal(sinGestoria.codigo, 409);

    for (const tr of tablas.tramites) {
      await api(`/tramites/${tr.id}`, 'PATCH', {
        estado: 'Enviado a gestoría', nota: 'Mandado con la ficha', gestoria: 'Gestoría Ruiz', coste: 400,
      });
      await api(`/tramites/${tr.id}`, 'PATCH', { estado: 'Resuelto', nota: 'Devuelto' });
    }
    assert.ok(tablas.tramites.every((x) => x.estado === 'Resuelto'));

    // ── 9. Lo que se gasta en dejarlo listo ───────────────────────────────
    const gasto = await api(`/pedidos/${pedido.id}/gastos`, 'POST', {
      concepto: 'Neumáticos', importe: 480, proveedor: 'Taller Paco',
    });
    assert.equal(gasto.codigo, 200);
    const sinImporte = await api(`/pedidos/${pedido.id}/gastos`, 'POST', { concepto: 'Limpieza' });
    assert.equal(sinImporte.codigo, 400, 'un gasto sin importe no suma nada al coste');

    // ── 10. Lo que ha costado de verdad ───────────────────────────────────
    const coste = await api(`/pedidos/${pedido.id}/coste`);
    assert.equal(coste.codigo, 200);
    const partidas = (coste.cuerpo.data as { partidas: { concepto: string; importe: number }[]; total: number });
    assert.equal(partidas.total, 9000 + 620 + 1200 + 480,
      'proveedor, transporte, tres trámites a 400 y los neumáticos');
    assert.equal(partidas.partidas.length, 4);

    // ── 11. La entrega, y la garantía que empieza ese día ──────────────────
    const sinFirma = await api(`/leads/${LEAD}/entrega`, 'PATCH', { km_salida: 84200, cerrar: true });
    assert.equal(sinFirma.codigo, 409, 'sin firma no hay entrega: hay un coche que ya no está');

    const cerrada = await api(`/leads/${LEAD}/entrega`, 'PATCH', {
      km_salida: 84200, firmado: true, garantia_meses: 12,
      entregado: { permiso: true, ficha_tecnica: true, llaves: true, factura: true },
      cerrar: true,
    });
    assert.equal(cerrada.codigo, 200);
    const entrega = cerrada.cuerpo.data as { garantia_hasta?: string; fecha?: string };
    assert.ok(entrega.garantia_hasta, 'la garantía se calcula al entregar y se queda quieta');
    assert.ok((cerrada.cuerpo.falta as unknown[]).length > 0,
      'lo que no se le ha dado se ve, aunque no impida cerrar');

    // ── 10. Y el cliente se entera de que ya es suyo ───────────────────────
    correos = [];
    const entregadoLead = await api(`/leads/${LEAD}`, 'PATCH', { status: 'Entregado' });
    assert.equal(entregadoLead.codigo, 200);
    await esperaEnvios();
    assert.ok(correos.some((x) => /ya es tuyo/i.test(x)),
      'era el único paso del recorrido que no avisaba de nada');
  });
});
