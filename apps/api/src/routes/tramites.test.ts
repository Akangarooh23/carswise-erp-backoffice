/**
 * La ruta de gestoría.
 *
 * Lo que importa: que un trámite no salga hacia fuera sin decir a qué gestoría,
 * que quede la fecha de envío —es la que permite reclamar con un número
 * delante—, y que una importación no abra cuatro veces los mismos papeleos. La
 * etapa de un expediente se toca más de una vez.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { readFileSync } from 'node:fs';

interface Fila { [k: string]: unknown }

const queryOriginal = pg.Pool.prototype.query;
let servidor: Server;
let base: string;
let pase: string;

let tramites: Fila[] = [];
let historial: Fila[] = [];
let siguiente = 1;

function reinicia() {
  tramites = [];
  historial = [];
  siguiente = 1;
}

before(async () => {
  pg.Pool.prototype.query = function (sql: unknown, params?: unknown[]) {
    const t = String((typeof sql === 'string' ? sql : (sql as { text?: string })?.text) || '').replace(/\s+/g, ' ');
    const p = (params ?? []) as unknown[];
    // Copias, como devuelve Postgres: por referencia, un UPDATE le cambiaría el
    // «antes» a quien lo está comparando.
    const responde = (rows: Fila[]) =>
      Promise.resolve({ rows: rows.map((f) => ({ ...f })), rowCount: rows.length } as never);

    if (/CREATE (TABLE|UNIQUE INDEX|INDEX)/i.test(t)) return responde([]);
    if (/MAX\(substring/i.test(t)) return responde([{ ultimo: siguiente - 1 }]);

    if (/INSERT INTO erp_tramite_history/i.test(t)) {
      historial.push({ tramite_id: p[0], operador: p[1] });
      return responde([]);
    }
    if (/INSERT INTO erp_tramites/i.test(t)) {
      const columnas = /\(([^)]+)\)\s*VALUES/i.exec(t)?.[1].split(',').map((c) => c.trim()) ?? [];
      const fila: Fila = {};
      columnas.forEach((c, i) => { fila[c] = p[i]; });
      const mismoSitio = (x: Fila) =>
        (fila.lead_id && x.lead_id === fila.lead_id) || (fila.pedido_id && x.pedido_id === fila.pedido_id);
      if (tramites.some((x) => mismoSitio(x) && x.tipo === fila.tipo)) {
        const e = new Error('duplicate key') as Error & { code?: string };
        e.code = '23505';
        return Promise.reject(e);
      }
      if (!fila.estado) fila.estado = 'Pendiente';
      if (fila.notas === undefined) fila.notas = '';
      tramites.push(fila);
      siguiente += 1;
      return responde([]);
    }
    if (/UPDATE erp_tramites/i.test(t)) {
      const fila = tramites.find((x) => x.id === p[p.length - 1]);
      if (!fila) return responde([]);
      const asignaciones = /SET (.*) WHERE/i.exec(t)?.[1].split(',').map((x) => x.trim()) ?? [];
      for (const a of asignaciones) {
        const [col, val] = a.split('=').map((x) => x.trim());
        if (val.startsWith('$')) fila[col] = p[Number(val.slice(1)) - 1];
        else if (/NOW\(\)/.test(val)) fila[col] = '2026-08-30T10:00:00Z';
      }
      return responde([fila]);
    }
    if (/FROM erp_tramite_history/i.test(t)) return responde(historial.filter((h) => h.tramite_id === p[0]));
    /*
     * ¿Este coche ya tiene ese papeleo?
     *
     * Se pregunta por el coche entero —su expediente y sus pedidos— y no por
     * una columna: se abren por dos caminos y mirando solo una, el mismo coche
     * acababa con seis papeleos para tres cosas que hacer.
     */
    if (/^SELECT id FROM erp_tramites WHERE tipo = \$2/i.test(t)) {
      const clave = String(p[0] ?? '');
      const delCoche = new Set<string>([clave]);
      for (const pe of [] as { id?: string; lead_id?: string }[]) {
        if (pe.id === clave && pe.lead_id) delCoche.add(String(pe.lead_id));
        if (pe.lead_id === clave) delCoche.add(String(pe.id));
      }
      return responde(tramites.filter((x) => x.tipo === p[1]
        && (delCoche.has(String(x.lead_id ?? '')) || delCoche.has(String(x.pedido_id ?? '')))));
    }
    if (/FROM erp_tramites WHERE id = \$1/i.test(t)) return responde(tramites.filter((x) => x.id === p[0]));
    if (/FROM erp_tramites/i.test(t)) return responde(tramites);
    return responde([]);
  } as never;

  const { tramitesRouter } = await import('./tramites.js');
  const app = express();
  app.use(express.json());
  app.use('/api', tramitesRouter);
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

describe('gestoría', { concurrency: 1 }, () => {
  describe('los trámites', { concurrency: 1 }, () => {
    test('se crea uno con su número de serie', async () => {
      const r = await api('/tramites', 'POST', { tipo: 'Transferencia de titularidad', matricula: '1234ABC' });
      assert.equal(r.codigo, 200);
      assert.match(String((r.cuerpo.data as Fila).id), /^TRA-\d{4}-\d{3}$/);
    });

    test('hay que decir qué trámite es', async () => {
      const r = await api('/tramites', 'POST', { tipo: '', matricula: '1234ABC' });
      assert.equal(r.codigo, 400);
    });

    test('y de qué coche', async () => {
      const r = await api('/tramites', 'POST', { tipo: 'ITV periódica' });
      assert.equal(r.codigo, 400);
    });

    test('con el bastidor basta: puede no tener matrícula todavía', async () => {
      const r = await api('/tramites', 'POST', { tipo: 'Matriculación de importación', bastidor: 'VSSZZZ5FZ...' });
      assert.equal(r.codigo, 200);
    });

    test('un tipo que no está en las sugerencias vale igual', async () => {
      const r = await api('/tramites', 'POST', { tipo: 'Cambio de color en ficha técnica', matricula: '1234ABC' });
      assert.equal(r.codigo, 200,
        'lo que hace falta depende del caso: la lista es una ayuda, no una aduana');
    });

    test('no se manda fuera sin decir a qué gestoría', async () => {
      const alta = await api('/tramites', 'POST', { tipo: 'ITV periódica', matricula: '1234ABC' });
      const id = (alta.cuerpo.data as Fila).id;
      const r = await api(`/tramites/${id}`, 'PATCH', { estado: 'Enviado a gestoría', nota: 'va' });
      assert.equal(r.codigo, 409);
      assert.match(String(r.cuerpo.error), /sin_gestoria/);
    });

    test('con gestoría sí, y queda la fecha de envío', async () => {
      const alta = await api('/tramites', 'POST', { tipo: 'ITV periódica', matricula: '1234ABC', gestoria: 'Gestoría Ruiz' });
      const id = (alta.cuerpo.data as Fila).id;
      const r = await api(`/tramites/${id}`, 'PATCH', { estado: 'Enviado a gestoría', nota: 'mandado con la ficha' });
      assert.equal(r.codigo, 200);
      const fila = tramites.find((x) => x.id === id)!;
      assert.ok(fila.fecha_enviado, 'sin fecha no se puede reclamar con un número delante');
      assert.match(String(fila.notas), /Pendiente → Enviado a gestoría/);
      assert.equal(historial.filter((h) => h.tramite_id === id).length, 1);
    });

    test('no se da por resuelto sin saber lo que ha costado', async () => {
      // Cerrarlo sin el coste deja un gasto que aparece semanas después,
      // cuando el margen del coche ya se ha calculado.
      const alta = await api('/tramites', 'POST', { tipo: 'ITV periódica', matricula: '1234ABC', gestoria: 'Gestoría Ruiz' });
      const id = (alta.cuerpo.data as Fila).id;
      const sinCoste = await api(`/tramites/${id}`, 'PATCH', { estado: 'Resuelto', nota: 'devuelto' });
      assert.equal(sinCoste.codigo, 409);
      assert.match(String(sinCoste.cuerpo.detail), /ha costado/);
    });

    test('y con él, resolverlo deja su fecha', async () => {
      const alta = await api('/tramites', 'POST', { tipo: 'ITV periódica', matricula: '1234ABC', gestoria: 'Gestoría Ruiz' });
      const id = (alta.cuerpo.data as Fila).id;
      await api(`/tramites/${id}`, 'PATCH', {
        estado: 'Resuelto', nota: 'devuelto con la tarjeta',
        partidas: [{ concepto: 'ITV', importe: 45, que: 'suplido' }],
      });
      assert.ok(tramites.find((x) => x.id === id)!.fecha_resuelto);
    });

    test('un estado inventado se rechaza', async () => {
      const alta = await api('/tramites', 'POST', { tipo: 'ITV periódica', matricula: '1234ABC' });
      const id = (alta.cuerpo.data as Fila).id;
      const r = await api(`/tramites/${id}`, 'PATCH', { estado: 'En proceso' });
      assert.equal(r.codigo, 400);
    });
  });

  describe('los que abre un pedido según su origen', { concurrency: 1 }, () => {
    test('de un concesionario sale la transferencia', async () => {
      const { abreTramitesDePedido } = await import('./tramites.js');
      const creados = await abreTramitesDePedido({
        pedidoId: 'PED-1', origen: 'concesionario', vehiculoTitulo: 'Peugeot 208',
        matricula: '1234ABC', clienteEmail: 'cliente@ejemplo.es', creadoPor: 'Ana',
      });
      assert.equal(creados.length, 1);
      assert.match(String(tramites[0].tipo), /Transferencia/);
      assert.equal(tramites[0].pedido_id, 'PED-1');
      assert.equal(tramites[0].matricula, '1234ABC');
    });

    test('de un particular salen dos: la transferencia y el impuesto', async () => {
      const { abreTramitesDePedido } = await import('./tramites.js');
      const creados = await abreTramitesDePedido({
        pedidoId: 'PED-2', origen: 'particular', vehiculoTitulo: 'Golf', creadoPor: 'Ana',
      });
      assert.equal(creados.length, 2);
      assert.ok(tramites.some((x) => /transmisiones/i.test(String(x.tipo))));
    });

    test('llamarlo dos veces no abre el doble', async () => {
      const { abreTramitesDePedido } = await import('./tramites.js');
      const datos = { pedidoId: 'PED-3', origen: 'particular', vehiculoTitulo: 'Golf', creadoPor: 'Ana' };
      await abreTramitesDePedido(datos);
      const segunda = await abreTramitesDePedido(datos);
      assert.equal(segunda.length, 0);
      assert.equal(tramites.length, 2);
    });

    test('un origen que no se conoce no abre nada', async () => {
      const { abreTramitesDePedido } = await import('./tramites.js');
      const creados = await abreTramitesDePedido({
        pedidoId: 'PED-4', origen: 'subasta', vehiculoTitulo: 'Golf', creadoPor: 'Ana',
      });
      assert.equal(creados.length, 0);
    });

    test('vender uno nuestro abre su transferencia', async () => {
      const { abreTramitesDeVenta } = await import('./tramites.js');
      const creados = await abreTramitesDeVenta({
        leadId: 'lead-1', vehiculoTitulo: 'Peugeot 208', clienteEmail: 'Cliente@Ejemplo.es', creadoPor: 'Ana',
      });
      assert.equal(creados.length, 1);
      assert.equal(tramites[0].lead_id, 'lead-1');
      assert.equal(tramites[0].cliente_email, 'cliente@ejemplo.es');
    });
  });

  describe('los que abre una importación', { concurrency: 1 }, () => {
    test('son los tres que necesita un coche traído de fuera', async () => {
      const { abreTramitesDeImportacion } = await import('./tramites.js');
      const creados = await abreTramitesDeImportacion({
        leadId: 'imp-1', vehiculoTitulo: 'SEAT Ateca', clienteEmail: 'Cliente@Ejemplo.es', creadoPor: 'Ana',
      });
      assert.equal(creados.length, 3);
      const tipos = tramites.map((x) => String(x.tipo));
      assert.ok(tipos.some((x) => /impuesto/i.test(x)));
      assert.ok(tipos.some((x) => /ITV/i.test(x)));
      assert.ok(tipos.some((x) => /matriculaci/i.test(x)));
    });

    test('llamarlo dos veces no abre seis', async () => {
      const { abreTramitesDeImportacion } = await import('./tramites.js');
      const datos = {
        leadId: 'imp-1', vehiculoTitulo: 'SEAT Ateca', clienteEmail: 'cliente@ejemplo.es', creadoPor: 'Ana',
      };
      await abreTramitesDeImportacion(datos);
      const segunda = await abreTramitesDeImportacion(datos);
      assert.equal(segunda.length, 0, 'la etapa se toca varias veces');
      assert.equal(tramites.length, 3);
    });

    test('quien impide los duplicados es la base, no la comprobación previa', () => {
      // Comprobar antes de insertar ahorra quemar números de serie, pero dos
      // llamadas a la vez leen las dos que no hay nada y las dos insertan. Lo que
      // no puede fallar es el índice único.
      const fuente = readFileSync(new URL('./tramites.ts', import.meta.url), 'utf8');
      // Atado al nombre de cada índice: buscando «CREATE UNIQUE INDEX … tipo» a
      // secas, el de al lado tapaba al que faltaba y la prueba pasaba con uno de
      // los dos sin «unique».
      assert.match(fuente, /CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_lead_tipo/,
        'sin el índice, dos llamadas a la vez abren los mismos papeleos dos veces');
      assert.match(fuente, /CREATE UNIQUE INDEX IF NOT EXISTS idx_tramites_pedido_tipo/,
        'lo mismo con los que cuelgan de un pedido');
    });

    test('nacen pendientes y sin gestoría: eso lo decide quien los lleve', async () => {
      const { abreTramitesDeImportacion } = await import('./tramites.js');
      await abreTramitesDeImportacion({
        leadId: 'imp-2', vehiculoTitulo: 'SEAT Ateca', clienteEmail: 'cliente@ejemplo.es', creadoPor: 'Ana',
      });
      for (const x of tramites) {
        assert.equal(x.estado, 'Pendiente');
        assert.ok(!x.gestoria);
      }
    });
  });
});

/**
 * La matrícula española nace en la gestoría y tiene que salir de ahí.
 *
 * Es el trámite el que la trae: hasta que la gestoría no matricula, el coche no
 * tiene ninguna. Y en cuanto la tiene, es **la matrícula del coche** —no un dato
 * del papeleo—: es como se le busca, cómo se le nombra en una orden de recogida
 * y lo que el cliente está esperando leer.
 *
 * Se quedaba escrita en el expediente de gestoría y en ningún sitio más. El
 * pedido seguía sin matrícula, los tramos también, y el correo que le dice al
 * cliente que su coche sale hacia su casa decía «ya está matriculado» sin poder
 * decir con cuál, que es justo la frase que él quería leer.
 *
 * El SQL se ha probado contra la base dentro de una transacción deshecha: pone
 * la matrícula en el pedido y en los dos viajes, y en la segunda pasada no toca
 * ninguna fila.
 */
describe('la matrícula sale de la gestoría', () => {
  const FUENTE = readFileSync(new URL('./tramites.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const REPARTE = FUENTE.slice(
    FUENTE.indexOf('export async function laMatriculaQueYaTiene'),
    FUENTE.indexOf('export async function abreLosTramitesQueFalten')
  );

  test('llega al pedido y a los viajes', () => {
    assert.match(REPARTE, /UPDATE erp_pedidos pe/);
    assert.match(REPARTE, /UPDATE erp_transportes t/);
  });

  test('solo si allí está vacía: la escrita a mano gana', () => {
    // Puede ser la buena y la del trámite un dedazo. La que alguien tecleó
    // mirando el permiso de circulación no se pisa desde aquí.
    assert.ok(REPARTE.includes(`WHERE COALESCE(pe.matricula, '') = ''`));
    assert.ok(REPARTE.includes(`WHERE COALESCE(t.matricula, '') = ''`));
  });

  test('y solo si el trámite tiene alguna que dar', () => {
    // Sin esto, cada visita escribiría una cadena vacía sobre otra.
    assert.equal((REPARTE.match(/COALESCE\(tr\.matricula, ''\) <> ''/g) ?? []).length, 2);
  });

  test('mira el coche por sus dos columnas', () => {
    // Un papeleo cuelga del pedido o del expediente según por dónde se abriera,
    // y las dos cosas son el mismo coche. Mirando una sola, la mitad de las
    // matrículas no llegaría a ninguna parte.
    assert.match(REPARTE, /tr\.pedido_id = pe\.id OR tr\.lead_id = pe\.lead_id/);
    assert.match(REPARTE, /tr\.pedido_id = t\.pedido_id OR tr\.lead_id = t\.lead_id/);
  });

  test('y se mira en las tres pantallas donde se lee', () => {
    // Reconciliador y no un disparo al guardar el trámite: se escribe a mano en
    // la base, se resuelve desde una pantalla que no lo copiaba, se resolvió
    // antes de que esto existiera. El hecho sigue mañana; el momento, no.
    for (const donde of ['tramites', 'transportes', 'pedidos']) {
      const fuente = readFileSync(new URL(`./${donde}.ts`, import.meta.url), 'utf8');
      assert.match(fuente, /await laMatriculaQueYaTiene\(\)\.catch/, `en ${donde} no se mira`);
    }
  });
});

/**
 * El impuesto de matriculación es una partida, no un trámite.
 *
 * Los tres papeleos de una importación se juntaron en un solo expediente de
 * gestoría, porque los lleva la misma gestoría con una factura. Desde
 * entonces, buscar «el trámite de tipo Impuesto de matriculación» devuelve
 * nulo siempre.
 *
 * Y con nulo pasan dos cosas, las dos de dinero: no se ve la liquidación de lo
 * que el cliente puso a cuenta, y el ERP deja entregar el coche sin ajustarla.
 * Con el coche ya entregado, esa conversación es mucho más difícil.
 */
describe('el impuesto sale de las partidas', () => {
  const LEADS = readFileSync(new URL('./leads.ts', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');

  test('se busca la partida y no el trámite que ya no existe', () => {
    assert.doesNotMatch(LEADS, /t\.tipo = 'Impuesto de matriculación'/);
    // Y todos los que lo miran, lo miran por la partida. Cuántos son da
    // igual: lo que no puede quedar es uno buscando por el tipo viejo.
    const porLaPartida =
      (LEADS.match(/lower\(btrim\(p->>'concepto'\)\) LIKE 'impuesto de matriculaci%'/g) ?? []).length;
    assert.ok(porLaPartida >= 2, `solo ${porLaPartida} sitio lo busca por la partida`);
  });

  test('y en el coche entero, por sus dos columnas', () => {
    // Un papeleo cuelga del expediente o del pedido según por dónde se abriera.
    assert.match(LEADS, /OR t\.pedido_id IN \(SELECT pe\.id FROM erp_pedidos pe/);
  });

  test('una partida sin importe no cuenta como importe', () => {
    // Se apuntan conceptos antes de saber lo que valen. Un vacío leído como
    // cero diría que hay que devolverle la provisión entera.
    const conGuarda = (LEADS.match(/AND COALESCE\(p->>'importe', ''\) <> ''/g) ?? []).length;
    const buscan = (LEADS.match(/lower\(btrim\(p->>'concepto'\)\) LIKE 'impuesto de matriculaci%'/g) ?? []).length;
    assert.equal(conGuarda, buscan, 'hay una búsqueda del impuesto sin la guarda del importe vacío');
  });

  test('sale como texto, que es como está escrito', () => {
    // «1.420,00 €» convertido a número en SQL daría 1,42. Lo entiende
    // importeQueVale, que ya sabe de Excel pegado.
    assert.match(LEADS, /SELECT p->>'importe'/);
  });
});
