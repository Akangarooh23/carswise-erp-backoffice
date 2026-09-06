import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { Expediente } from './expedientes-importacion.js';
import { pasosDeLaImportacion, loQueToca, loQueFaltaAparte } from './pasos-de-la-importacion.js';
import { trabajoDeLosCoches } from './trabajo-de-los-coches.js';

const HOY = new Date('2026-09-10T12:00:00Z');

function kia(id: string, meta: Record<string, unknown>, status = 'Depósito retenido'): Expediente {
  return {
    id,
    user_email: 'ana@popcar.tech',
    title: 'Kia Sorento 2.4 GDI AWD',
    status,
    created_at: '2026-09-01T10:00:00Z',
    meta: meta as Expediente['meta'],
  };
}

/** Tres coches en el mismo punto y uno más adelante. */
const CON_DEPOSITO = { deposit_paid_at: '2026-09-09T10:00:00Z' };

describe('el trabajo de los coches', () => {
  test('se agrupa por tarea, no una fila por coche', () => {
    // Con quince coches, una fila por coche son quince filas y la lista deja
    // de leerse. «3 coches esperando X» es una tarde de trabajo en una línea.
    const t = trabajoDeLosCoches(
      [kia('a', CON_DEPOSITO), kia('b', CON_DEPOSITO), kia('c', CON_DEPOSITO)], HOY);
    assert.equal(t.length, 1);
    assert.equal(t[0].n, 3);
  });

  test('cada tarea lleva a la pantalla donde está el botón', () => {
    const uno = kia('a', CON_DEPOSITO);
    const suyo = loQueToca(pasosDeLaImportacion(uno, HOY));
    const t = trabajoDeLosCoches([uno], HOY);
    assert.equal(t[0].a, suyo?.donde ?? '/importaciones');
  });

  test('los entregados no cuentan', () => {
    // Un expediente cerrado no tiene nada pendiente, y meterlo llenaría la
    // lista de coches que ya no se tocan.
    assert.deepEqual(trabajoDeLosCoches([kia('a', CON_DEPOSITO, 'Entregado')], HOY), []);
  });

  test('un coche que no espera nada nuestro no sale', () => {
    // Sin depósito se espera al cliente: no es una tarea nuestra.
    assert.deepEqual(trabajoDeLosCoches([kia('a', {})], HOY), []);
  });

  test('lo que mueve el coche va en rojo y lo de aparte en ámbar', () => {
    // Con el veredicto dado y sin pedirle la factura, «pedírsela al perito» es
    // trabajo nuestro pero el coche no la espera: sigue a transporte sin ella.
    const conFacturaPendiente = kia('a', {
      ...CON_DEPOSITO,
      peritacion: { veredicto: 'apto' },
    });
    const aparte = loQueFaltaAparte(pasosDeLaImportacion(conFacturaPendiente, HOY));
    assert.ok(aparte.length > 0, 'el caso de prueba tiene que dar una tarea aparte');

    const t = trabajoDeLosCoches([conFacturaPendiente], HOY);
    const enAmbar = t.filter((x) => x.tono === 'espera');
    assert.ok(enAmbar.length > 0, 'lo de aparte tiene que salir en ámbar');
    assert.match(enAmbar[0].porque, /no para el coche/);
    assert.match(enAmbar[0].etiqueta, /factura al perito/);

    for (const p of t.filter((x) => x.tono === 'urgente')) assert.match(p.porque, /parado/);
  });

  test('de más coches a menos, que es lo que decide por dónde empezar', () => {
    // Dentro de las tareas de coches sí manda la cantidad: todas cuestan lo
    // mismo, un rato.
    const conPerito = kia('z', { ...CON_DEPOSITO, disponible_at: '2026-09-09T12:00:00Z' });
    const t = trabajoDeLosCoches(
      [kia('a', CON_DEPOSITO), kia('b', CON_DEPOSITO), conPerito], HOY);
    if (t.length > 1) assert.ok(t[0].n >= t[1].n, JSON.stringify(t.map((x) => [x.etiqueta, x.n])));
  });

  test('las claves son estables y no se repiten', () => {
    // Se usan de key en la lista: repetidas, React pinta una sola.
    const t = trabajoDeLosCoches([kia('a', CON_DEPOSITO), kia('b', CON_DEPOSITO)], HOY);
    const claves = t.map((x) => x.clave);
    assert.equal(new Set(claves).size, claves.length);
    for (const c of claves) assert.match(c, /^coches:[a-z0-9-]+$/, c);
  });

  test('el singular está bien dicho', () => {
    const t = trabajoDeLosCoches([kia('a', CON_DEPOSITO)], HOY);
    assert.match(t[0].una, /^un coche esperando: /);
    assert.match(t[0].etiqueta, /^coches esperando: /);
  });

  test('y sin coches no revienta', () => {
    assert.deepEqual(trabajoDeLosCoches([], HOY), []);
    assert.deepEqual(trabajoDeLosCoches(null, HOY), []);
  });
});
