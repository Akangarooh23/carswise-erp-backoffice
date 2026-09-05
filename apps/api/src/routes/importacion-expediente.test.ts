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
import { readFileSync } from 'node:fs';
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
    status: 'Depósito retenido',
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
    expediente.status = 'Verificado y pagado';
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
    for (const etapa of ['Depósito retenido', 'Verificado y pagado', 'En transporte', 'En trámites', 'Entregado']) {
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

/**
 * Y al entregarlo, el coche pasa a ser suyo también en su panel.
 *
 * El día de la entrega el expediente se cerraba y ahí se acababa todo: el
 * cliente tenía un coche y en su panel no tenía nada. Sus papeles se quedaban en
 * nuestros cajones, que son los del ERP y él no ve.
 *
 * Lo que se sostiene aquí: que el alta ocurra, que ocurra **una sola vez**
 * —volver a guardar un expediente entregado no puede dejarle el garaje con dos
 * coches iguales— y que el correo se lo diga, porque un coche dado de alta que
 * él no sabe que existe es lo mismo que no darlo de alta.
 */
describe('el coche entregado entra en su garaje', () => {
  const FUENTE = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const ALTA = FUENTE.slice(
    FUENTE.indexOf('export async function daleSuIdCar'),
    FUENTE.indexOf('function entregadoEmailHtml')
  );

  test('se da de alta al entregar, no antes', () => {
    const bloque = FUENTE.slice(
      FUENTE.indexOf("if (status === 'Entregado' && prev.status !== 'Entregado'"),
      FUENTE.indexOf("if (status === 'Vendido'")
    );
    assert.match(bloque, /daleSuIdCar\(req\.params\.id\)/);
  });

  test('y una sola vez: source_lead_id es la marca', () => {
    assert.match(ALTA, /SELECT id FROM moveadvisor_user_vehicles WHERE source_lead_id = \$1/);
    assert.match(ALTA, /if \(ya\.rows\.length\) return ya\.rows\[0\]\.id;/);
  });

  test('con los papeles de los tres cajones del coche', () => {
    // Están repartidos entre el expediente, el pedido y el de gestoría según
    // por dónde entraron.
    assert.match(ALTA, /d\.ambito = 'lead'/);
    assert.match(ALTA, /d\.ambito = 'pedido'/);
    assert.match(ALTA, /d\.ambito = 'tramite'/);
  });

  test('y solo los que son suyos', () => {
    // El presupuesto del transportista y la factura del perito son papeles de
    // nuestra operación: meterlos en su garaje es darle a leer nuestros costes.
    assert.match(ALTA, /const sitio = dondeVaEnSuPanel\(d\.papel\);/);
    assert.match(ALTA, /if \(!sitio\) continue;/);
  });

  test('sin copiar el fichero, apuntando el que ya está', () => {
    // Duplicar un PDF por cada coche entregado es pagar dos veces por el mismo
    // byte y quedarse con dos copias que pueden acabar diciendo cosas distintas.
    assert.match(ALTA, /urlDelFichero\(base, d\.ruta\)/);
    assert.match(ALTA, /file_content_base64/);
    assert.match(ALTA, /''.\$6,NOW\(\)\)/);
  });

  test('y el mismo fichero no se engancha dos veces', () => {
    // La factura del vendedor está subida en dos sitios del mismo coche.
    assert.match(ALTA, /if \(!url \|\| puestos\.has\(url\)\) continue;/);
  });

  test('el correo se lo dice, con lo que puede hacer desde ahí', () => {
    // Un coche dado de alta que él no sabe que existe es lo mismo que no darlo
    // de alta.
    const correo = FUENTE.slice(
      FUENTE.indexOf('function entregadoEmailHtml'),
      FUENTE.indexOf('function rentingNotifyEmailHtml')
    );
    assert.match(correo, /IdCar/);
    assert.match(correo, /permiso de circulación/);
  });

  test('y si el alta falla, la entrega no se cae', () => {
    // Un coche entregado está entregado aunque el garaje se quede sin dar de
    // alta. Lo que no puede es quedarse callado.
    const bloque = FUENTE.slice(
      FUENTE.indexOf('void daleSuIdCar(req.params.id)'),
      FUENTE.indexOf("if (status === 'Vendido'")
    );
    assert.match(bloque, /\.catch\(\(e: Error\) => console\.error/);
    assert.match(bloque, /\.then\(\(\) => alCliente\(/);
  });
});

/**
 * El expediente se da por entregado cuando el coche llega a su casa.
 *
 * Lo pidió Ana dos veces: marcar el tramo entregado y tener que repetirlo en
 * Importaciones es contar dos veces el mismo hecho. El camión descargó en su
 * puerta; el coche está entregado.
 *
 * Lo que se sostiene aquí son las dos cosas que harían daño al automatizarlo:
 * cerrar el expediente con el impuesto sin ajustar —esa diferencia ya no se
 * recupera— y cerrarlo a medias, con el estado puesto y la garantía sin
 * arrancar, que es un coche entregado sin garantía.
 */
describe('el expediente se cierra cuando llega el coche', () => {
  const FUENTE = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const CIERRE = FUENTE.slice(
    FUENTE.indexOf('export async function daloPorEntregadoSiYaLlego'),
    FUENTE.indexOf('export async function daleSuIdCar')
  );

  test('lo decide el segundo tramo entregado', () => {
    assert.match(CIERRE, /JOIN erp_transportes t ON t\.lead_id = l\.id AND t\.tramo > 1/);
    assert.match(CIERRE, /AND t\.fecha_entrega IS NOT NULL/);
  });

  test('pero no con el impuesto sin liquidar', () => {
    // Es la única puerta que queda, y es de dinero: cerrado el expediente, esa
    // diferencia no se recupera —él ya tiene su coche— o se le queda a él un
    // dinero que era suyo.
    assert.match(CIERRE, /AND l\.liquidacion_at IS NULL\)/);
    assert.match(CIERRE, /impuesto de matriculaci%/);
  });

  test('y sin nada que liquidar, no estorba', () => {
    // Mientras la gestoría no haya escrito el importe no hay nada que ajustar,
    // y bloquear ahí sería no entregar nunca un coche cuya gestoría va lenta.
    assert.match(CIERRE, /AND COALESCE\(p->>'importe', ''\) <> ''/);
  });

  test('la garantía empieza el día que lo tuvo, no hoy', () => {
    // Si esto se recupera tres días después porque nadie miró la pantalla, la
    // garantía empezaría tarde y el cliente tendría tres días menos.
    assert.match(CIERRE, /garantiaHasta\(new Date\(cuando\), cuenta\.meses\)/);
    assert.match(CIERRE, /fecha: previa\.fecha \?\? cuando/);
  });

  test('no se cierra dos veces', () => {
    // El WHERE sobre el estado anterior: sin él, cada pasada le mandaría otra
    // vez el correo de «tu coche ya es tuyo».
    assert.match(CIERRE, /WHERE id = \$1 AND status <> 'Entregado'/);
    assert.match(CIERRE, /if \(!movido\.rows\.length\) continue;/);
  });

  test('y hace lo mismo que la entrega a mano: garaje y correo', () => {
    assert.match(CIERRE, /await daleSuIdCar\(x\.id\)/);
    assert.match(CIERRE, /entregadoEmailHtml\(lead as unknown as Lead\)/);
  });

  test('se mira al abrir Importaciones', () => {
    assert.match(FUENTE, /await daloPorEntregadoSiYaLlego\(\)\.catch/);
  });
});

/**
 * La diferencia del impuesto: cobrada o devuelta, y nada más.
 *
 * Hubo un tercer camino, «asumida», de cuando al primer coche se le comieron
 * 1.071 € de impuesto contra el margen. El asesor lo zanjó: el impuesto es del
 * cliente y se le cobra entero.
 *
 * Se comprueba en el servidor y no en la pantalla porque quitar un botón no
 * cierra nada: el valor se puede mandar igual.
 */
describe('cómo se liquida la diferencia del impuesto', () => {
  const FUENTE = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8');
  const QUE_SE_ACEPTA = FUENTE.split('\n').find((l) => l.includes('.includes(como)')) ?? '';

  test('el servidor solo acepta cobrada o devuelta', () => {
    assert.ok(QUE_SE_ACEPTA, 'no encuentro dónde se validan los valores');
    assert.match(QUE_SE_ACEPTA, /'cobrada'/);
    assert.match(QUE_SE_ACEPTA, /'devuelta'/);
  });

  test('y «asumida» ya no entra ni mandándola a mano', () => {
    assert.ok(!QUE_SE_ACEPTA.includes('asumida'),
      'el impuesto es del cliente: ponerlo nosotros no es una opción del sistema');
  });
});

/**
 * Y que la consulta sea una consulta.
 *
 * El botón «se lo he cobrado» no funcionó la primera vez que se usó: al
 * parámetro le faltaba el `$`, así que se escribía `liquidacion_como = 12` —el
 * número del parámetro, no el parámetro— y Postgres rechazaba la consulta
 * entera porque la columna es de texto. En la pantalla salía «lead_update_failed»
 * y nada más.
 *
 * Llevaba ahí desde que se escribió, y no había fallado nunca porque hasta ese
 * día nadie había liquidado un impuesto. Esto lo vigila para todos los campos,
 * no solo para ese: es un fallo que no se ve leyendo y que solo aparece al
 * usarlo.
 */
describe('los parámetros de la consulta llevan su dólar', () => {
  const FUENTE = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8');

  test('ningún campo se asigna al número del parámetro', () => {
    const sospechosos = FUENTE.split('\n')
      .filter((l) => /sets\.push\(/.test(l))
      // `= ${algo}` sin el dólar delante. Con él sería `= $${algo}`.
      .filter((l) => /[^$]\$\{(values|params)\.length\}/.test(l));
    assert.deepEqual(sospechosos, [],
      'ese campo se escribe como un número y Postgres rechaza la consulta entera');
  });

  test('y el de la liquidación en concreto, que es el que falló', () => {
    assert.match(FUENTE, /liquidacion_como = \$\$\{values\.length\}/);
  });
});

/**
 * Y que el expediente lleve todo lo que la pantalla mira.
 *
 * El bloque de la liquidación se quedó pidiendo cobrar una diferencia que ya
 * estaba cobrada: en la base constaba `liquidacion_at` y en el `meta` que se
 * manda a la pantalla no iba. La pantalla decide qué enseñar mirando ese campo,
 * así que sin él el botón no se apaga nunca.
 *
 * Se vio el día que se liquidó el primer impuesto, que fue también la primera
 * vez que se usó ese bloque. Y no era el único: faltaban otros tres.
 *
 * Es un fallo que no se ve leyendo ninguno de los dos lados por separado —el
 * servidor guarda bien y la pantalla lee bien— y que solo aparece al usarlo.
 * Por eso se comprueba aquí, cruzando los dos.
 */
describe('el expediente lleva lo que la pantalla lee', () => {
  const API = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8');
  const WEB = [
    '../../../web/src/lib/expedientes-importacion.ts',
    '../../../web/src/pages/ImportacionesPage.tsx',
  ].map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');

  /*
   * Y el que lee el meta por un alias, que es donde estaba el hueco.
   *
   * `pasos-de-la-importacion` hace `const m = x.meta ?? {}` y luego lee
   * `m.loQueSea`. Buscando solo por `meta` con interrogante se escapaban esos
   * dieciséis campos: renombrar uno en el servidor no rompía ninguna prueba y
   * el paso se quedaba mudo. Se vio saboteando esta misma comprobación.
   */
  const PASOS = readFileSync(
    new URL('../../../web/src/lib/pasos-de-la-importacion.ts', import.meta.url), 'utf8'
  );

  test('ningún campo del meta se queda sin mandar', () => {
    const pide = new Set([
      ...[...WEB.matchAll(/meta\?\.([a-z_]+)/g)].map((m) => m[1]),
      ...[...PASOS.matchAll(/\bm\.([a-z_]+)/g)].map((m) => m[1]),
    ]);
    // El valor puede ser una columna, un EXISTS o una subconsulta: vale
    // cualquier cosa que empiece por letra o por paréntesis.
    const manda = new Set([...API.matchAll(/'([a-z_]+)',\s*(?:[A-Za-z_]|\()/g)].map((m) => m[1]));
    const faltan = [...pide].filter((k) => !manda.has(k)).sort();
    assert.deepEqual(faltan, [],
      'la pantalla mira estos campos y el servidor no los manda: siempre valdrán nulo');
  });

  test('y la fecha de la liquidación va, que es la que apaga el botón', () => {
    assert.match(API, /'liquidacion_at', liquidacion_at,/);
  });
});
