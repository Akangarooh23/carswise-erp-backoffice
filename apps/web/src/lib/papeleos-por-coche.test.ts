/**
 * Los papeleos de un coche, juntos.
 *
 * Lo que se sostiene: que un coche sea **una tarjeta** y no tres, y que dentro
 * cada papeleo siga teniendo su estado y su reloj. Fundirlos del todo sería
 * perder lo único que importa saber: cuál es el que lleva tres semanas parado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { papeleosPorCoche, sinResolver } from './papeleos-por-coche.js';

const HOY = new Date('2026-09-20T12:00:00Z');

const KIA = (extra: Record<string, unknown> = {}) => ({
  id: 'TRA-1', tipo: 'Impuesto de matriculación', estado: 'Pendiente',
  vehiculo_titulo: 'Kia Sorento 2.4 GDI', lead_id: 'imp-1',
  gestoria: 'Gestoría Pilar', ...extra,
});

describe('un coche, una tarjeta', () => {
  test('los tres papeleos de una importación van juntos', () => {
    const g = papeleosPorCoche([
      KIA(),
      KIA({ id: 'TRA-2', tipo: 'ITV de homologación' }),
      KIA({ id: 'TRA-3', tipo: 'Matriculación de importación' }),
    ], HOY);
    assert.equal(g.length, 1);
    assert.equal(g[0].papeleos.length, 3);
    assert.equal(g[0].titulo, 'Kia Sorento 2.4 GDI');
  });

  test('y los de coches distintos, separados', () => {
    const g = papeleosPorCoche([
      KIA(),
      KIA({ id: 'TRA-9', lead_id: 'imp-2', vehiculo_titulo: 'SEAT Ateca' }),
    ], HOY);
    assert.equal(g.length, 2);
  });

  test('agrupa por pedido cuando no cuelgan del expediente', () => {
    // Cuelgan de uno o de otro según por dónde se abrieran, y es el mismo coche.
    const g = papeleosPorCoche([
      KIA({ lead_id: null, pedido_id: 'PED-1' }),
      KIA({ id: 'TRA-2', lead_id: null, pedido_id: 'PED-1', tipo: 'ITV de homologación' }),
    ], HOY);
    assert.equal(g.length, 1);
    assert.equal(g[0].papeleos.length, 2);
  });

  test('y uno suelto se queda solo, no se cuela en el grupo de otro', () => {
    // Una transferencia de un coche de stock no tiene por qué caber en ningún
    // grupo, y meterla con calzador sería peor que dejarla aparte.
    const g = papeleosPorCoche([
      KIA(),
      KIA({ id: 'TRA-7', lead_id: null, pedido_id: null, tipo: 'Transferencia' }),
    ], HOY);
    assert.equal(g.length, 2);
    assert.equal(g[1].papeleos.length, 1);
  });
});

describe('lo que se ve sin abrirla', () => {
  test('lo que suman los tres', () => {
    const g = papeleosPorCoche([
      KIA({ coste: 1420 }),
      KIA({ id: 'TRA-2', coste: '99,77' }),
      KIA({ id: 'TRA-3', coste: null }),
    ], HOY);
    assert.equal(g[0].coste, 1519.77);
  });

  test('los días del que más lleva fuera, que es el que manda', () => {
    // El coche no está listo hasta que lo está el último.
    const g = papeleosPorCoche([
      KIA({ fecha_enviado: '2026-09-18T10:00:00Z' }),
      KIA({ id: 'TRA-2', fecha_enviado: '2026-09-05T10:00:00Z' }),
    ], HOY);
    assert.equal(g[0].diasFuera, 15);
  });

  test('sin ninguno fuera, no se inventa un número', () => {
    assert.equal(papeleosPorCoche([KIA()], HOY)[0].diasFuera, null);
  });

  test('la matrícula aparece aunque solo la lleve uno', () => {
    // La dan al matricular, y puede llegar por un papeleo antes que por otro.
    const g = papeleosPorCoche([
      KIA(),
      KIA({ id: 'TRA-2', matricula: '1234 ABC' }),
    ], HOY);
    assert.equal(g[0].identifica, '1234 ABC');
  });

  test('la gestoría solo si es la misma para todos', () => {
    // Media verdad aquí es decir que lo lleva quien no lo lleva.
    const g = papeleosPorCoche([
      KIA(),
      KIA({ id: 'TRA-2', gestoria: 'Otra' }),
    ], HOY);
    assert.equal(g[0].gestoria, '');
  });

  test('cuántos quedan por resolver', () => {
    const g = papeleosPorCoche([
      KIA({ estado: 'Resuelto' }),
      KIA({ id: 'TRA-2', estado: 'En trámite' }),
      KIA({ id: 'TRA-3', estado: 'Pendiente' }),
    ], HOY);
    assert.equal(sinResolver(g[0]), 2);
  });
});

describe('lo que no se pierde al agrupar', () => {
  test('cada papeleo conserva su estado', () => {
    // En una sola casilla no se sabe cuál lleva tres semanas parado en la DGT,
    // que es justo lo que hay que saber.
    const g = papeleosPorCoche([
      KIA({ estado: 'Resuelto' }),
      KIA({ id: 'TRA-2', estado: 'Enviado a gestoría' }),
    ], HOY);
    assert.deepEqual(g[0].papeleos.map((p) => p.estado), ['Resuelto', 'Enviado a gestoría']);
  });

  test('y una lista vacía no revienta', () => {
    assert.deepEqual(papeleosPorCoche([], HOY), []);
  });
});
