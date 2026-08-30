/**
 * Lo que hay que mirar antes de comprarle a una persona.
 *
 * Es el único caso de este negocio que puede salir mal sin arreglo: un embargo,
 * una deuda del ayuntamiento, un firmante que no es el titular. Todo eso se ve
 * antes de pagar y no se ve después.
 *
 * Lo que se comprueba aquí es que el sistema no deje encargar sin haberlo
 * mirado, y que guarde quién lo miró — el día que aparezca un embargo, esa va a
 * ser la pregunta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPROBACIONES_PARTICULAR, comprobacionesQueTocan, comprobacionesQueFaltan,
  puedeEncargarseConComprobaciones, marca,
} from './comprobaciones.js';

const TODAS = COMPROBACIONES_PARTICULAR.reduce(
  (acc, c) => ({ ...acc, [c.clave]: { ok: true, por: 'Ana', el: '2026-08-30T10:00:00Z' } }),
  {} as Record<string, { ok: boolean; por: string; el: string }>
);

describe('a quién se le comprueba', () => {
  test('a un particular, sí', () => {
    assert.ok(comprobacionesQueTocan('particular').length >= 4);
  });

  test('a una empresa no: hay factura, CIF y a quién reclamar', () => {
    for (const origen of ['concesionario', 'ex-renting', 'importacion', 'stock']) {
      assert.deepEqual(comprobacionesQueTocan(origen), [], `falla con ${origen}`);
    }
  });

  test('cada comprobación dice qué pasa si no se hace', () => {
    for (const c of COMPROBACIONES_PARTICULAR) {
      assert.ok(c.que.length > 10, `«${c.clave}» sin decir qué hay que mirar`);
      assert.ok(c.siNo.length > 15, `«${c.clave}» sin decir qué pasa si no`);
    }
  });

  test('están las cuatro que de verdad bloquean', () => {
    const claves = COMPROBACIONES_PARTICULAR.map((c) => c.clave);
    assert.ok(claves.includes('informe_dgt'), 'cargas y embargos');
    assert.ok(claves.includes('firma_el_titular'), 'si no, la venta no vale');
    assert.ok(claves.includes('sin_deudas'), 'bloquea la transferencia');
    assert.ok(claves.includes('itv_en_vigor'), 'sin ITV no se transfiere');
  });
});

describe('la puerta antes de encargar', () => {
  test('sin comprobar nada, no se encarga', () => {
    assert.equal(puedeEncargarseConComprobaciones('particular', {}), false);
    assert.equal(puedeEncargarseConComprobaciones('particular', null), false);
  });

  test('con todas puestas, sí', () => {
    assert.equal(puedeEncargarseConComprobaciones('particular', TODAS), true);
  });

  test('faltando una, no', () => {
    const menosUna = { ...TODAS };
    delete menosUna.informe_dgt;
    assert.equal(puedeEncargarseConComprobaciones('particular', menosUna), false);
    assert.deepEqual(comprobacionesQueFaltan('particular', menosUna).map((c) => c.clave), ['informe_dgt']);
  });

  test('marcada a «no» cuenta como no comprobada', () => {
    const conUnaMal = { ...TODAS, sin_deudas: { ok: false, por: 'Ana', el: '2026-08-30T10:00:00Z' } };
    assert.equal(puedeEncargarseConComprobaciones('particular', conUnaMal), false,
      'decir que hay deudas no es haberlo resuelto');
  });

  test('a los demás orígenes esta puerta no les afecta', () => {
    assert.equal(puedeEncargarseConComprobaciones('concesionario', {}), true);
  });
});

describe('quién lo comprobó', () => {
  test('se guarda con la persona y la fecha', () => {
    const r = marca({}, 'informe_dgt', true, 'Ana', new Date('2026-08-30T10:00:00Z'));
    assert.equal(r.informe_dgt.ok, true);
    assert.equal(r.informe_dgt.por, 'Ana');
    assert.match(String(r.informe_dgt.el), /^2026-08-30/);
  });

  test('desmarcar también deja rastro de quién la quitó', () => {
    const puesta = marca({}, 'informe_dgt', true, 'Ana');
    const quitada = marca(puesta, 'informe_dgt', false, 'Miguel');
    assert.equal(quitada.informe_dgt.ok, false);
    assert.equal(quitada.informe_dgt.por, 'Miguel',
      'quitar una comprobación es una decisión, y tiene dueño');
  });

  test('marcar una no toca las demás', () => {
    const r = marca(TODAS, 'itv_en_vigor', false, 'Miguel');
    assert.equal(r.informe_dgt.por, 'Ana');
  });
});
