/**
 * La venta en curso: en qué paso está y qué se puede hacer en cada uno.
 *
 * Lo que se protege es el orden que decidió Ana: si el comprador financia, la
 * financiación va primero y bloquea lo demás; denegada, o lo paga él o se
 * anula. Y que el panel no diga «vendido sin cerrar» de una venta que se está
 * cerrando.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENSURE_COLUMNAS, enQuePasoEsta, porQueNoSeDecideLaFinanciacion, porQueNoPagaEl, porQueNoSeAnula,
  correoFinanciacionAprobada, correoFinanciacionDenegada, correoVentaAnuladaAlVendedor,
} from './venta-en-curso.js';

describe('en qué paso está', () => {
  test('sin venta, ninguno', () => {
    assert.equal(enQuePasoEsta(null), null);
    assert.equal(enQuePasoEsta({ venta_estado: 'anulada' }), null);
  });

  test('si financia, primero la financiación', () => {
    assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: 'en_estudio' }), 'financiacion_en_estudio');
  });

  test('denegada, se para ahí', () => {
    assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: 'denegada' }), 'financiacion_denegada');
  });

  test('aprobada, sin financiar o pagándolo él: al ingreso', () => {
    for (const estado of ['aprobada', 'sin_financiacion', null]) {
      assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: estado }), 'esperando_ingreso', String(estado));
    }
  });
});

describe('qué se puede hacer', () => {
  const enEstudio = { venta_estado: 'en_curso', financiacion_estado: 'en_estudio' };

  test('aprobarla pide la entidad: sin ella no se factura la comisión', () => {
    assert.match(porQueNoSeDecideLaFinanciacion(enEstudio, 'aprobada', ''), /entidad/);
    assert.equal(porQueNoSeDecideLaFinanciacion(enEstudio, 'aprobada', 'Banco X'), '');
    assert.equal(porQueNoSeDecideLaFinanciacion(enEstudio, 'denegada', ''), '');
  });

  test('solo se decide una que está en estudio', () => {
    assert.ok(porQueNoSeDecideLaFinanciacion({ venta_estado: 'en_curso', financiacion_estado: 'aprobada' }, 'denegada', ''));
    assert.ok(porQueNoSeDecideLaFinanciacion({ venta_estado: 'anulada', financiacion_estado: 'en_estudio' }, 'aprobada', 'X'));
  });

  test('«lo paga él» solo después de una denegación', () => {
    assert.ok(porQueNoPagaEl(enEstudio));
    assert.equal(porQueNoPagaEl({ venta_estado: 'en_curso', financiacion_estado: 'denegada' }), '');
  });

  test('se anula una venta en curso, no otra cosa', () => {
    assert.equal(porQueNoSeAnula(enEstudio), '');
    assert.ok(porQueNoSeAnula({ venta_estado: 'anulada' }));
  });
});

describe('los correos', () => {
  const d = { comprador_nombre: 'Sergio', coche: 'Volkswagen T-Roc', precio: 17900, entidad: 'Banco X', importe: 12000, sitio: 'https://popcar.com.es', oferta_id: 'idcar-veh-1' };

  test('aprobada: con la entidad, el importe y que lo siguiente es el ingreso', () => {
    const c = correoFinanciacionAprobada(d);
    assert.match(c.html, /Banco X/);
    assert.match(c.html, /12\.000 €/);
    assert.match(c.html, /ingreso/);
  });

  test('denegada: le pregunta si lo paga él, sin coste si no', () => {
    const c = correoFinanciacionDenegada(d);
    assert.match(c.html, /17\.900 €/);
    assert.match(c.html, /sin ningún coste/);
  });

  test('anulada: al vendedor, que vuelve a estar a la venta', () => {
    assert.match(correoVentaAnuladaAlVendedor(d).html, /vuelve a estar a la venta/);
  });
});

describe('cableado', () => {
  const ENCARGOS = readFileSync(join(import.meta.dirname, '..', 'routes', 'encargos.ts'), 'utf8').replace(/\r\n/g, '\n');

  test('las columnas se crean al preparar el encargo', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS venta_estado/);
    assert.match(ENCARGOS, /await query\(ENSURE_COLUMNAS_DE_LA_VENTA\)/);
  });

  test('una venta en curso no sale como «vendido sin cerrar»: tiene su paso', () => {
    assert.match(ENCARGOS, /if \(fila\.se_vendio && !paso\) avisos\.push\('encargos_vendidos'\)/);
    assert.match(ENCARGOS, /avisos\.push\('ventas_financiacion_en_estudio'\)/);
    assert.match(ENCARGOS, /avisos\.push\('ventas_financiacion_denegada'\)/);
  });

  test('aprobada, se apunta también en la visita: de ahí sale la comisión', () => {
    assert.match(ENCARGOS, /SET financiacion_resultado = 'financiada', financiacion_entidad = \$2/);
  });

  test('anulada, el anuncio se vuelve a publicar y la visita deja de contar como venta', () => {
    assert.match(ENCARGOS, /UPDATE moveadvisor_marketplace_vo_offers SET is_active = TRUE/);
    assert.match(ENCARGOS, /SET resultado = 'fue'/);
  });
});
