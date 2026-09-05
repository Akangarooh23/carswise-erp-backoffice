/**
 * La pantalla y el servidor suman igual.
 *
 * Están duplicados —los dos lados se compilan por separado—, así que lo que hay
 * que sostener es que **dan el mismo número**. Si uno dejara de separar los
 * suplidos, el total que se ve al escribir la factura y el coste con el que se
 * calcula el margen del coche dirían cosas distintas sobre el mismo dinero.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resumenDeLaGestoria, importeQueVale, queEsPorDefecto, leeLoPegado, type Partida,
} from './partidas-de-la-gestoria.js';
import {
  resumenDeLaGestoria as resumenDeLaApi,
  importeQueVale as importeDeLaApi,
  queEsPorDefecto as queEsEnLaApi,
  leeLoPegado as leeLoPegadoLaApi,
} from '../../../api/src/lib/partidas-de-la-gestoria.js';

const CASOS: Partida[][] = [
  [],
  [{ concepto: 'Impuesto de matriculación', importe: '1420.00', que: 'suplido' }],
  [
    { concepto: 'Tasa DGT', importe: '99,77' },
    { concepto: 'Honorarios de la gestoría', importe: 90, que: 'nuestro' },
  ],
  [{ concepto: '   ', importe: 500 }],
  [{ concepto: 'Sello raro', importe: null }],
];

describe('las dos mitades', () => {
  test('suman igual, y separan igual los suplidos', () => {
    for (const c of CASOS) {
      assert.deepEqual(resumenDeLaGestoria(c), resumenDeLaApi(c), JSON.stringify(c));
    }
  });

  test('entienden los importes igual', () => {
    for (const v of ['1.420,00 €', '99,77', '145', '1420.00', 'a convenir', '', null]) {
      assert.equal(importeQueVale(v), importeDeLaApi(v), String(v));
    }
  });

  test('y de quién es cada partida, igual', () => {
    for (const c of ['Impuesto de matriculación', 'Honorarios', 'Minuta', 'Sello del ayuntamiento']) {
      assert.equal(queEsPorDefecto(c), queEsEnLaApi(c), c);
    }
  });

  test('y leen lo pegado igual', () => {
    const pegado = 'IMP-01\tImpuesto de matriculación\t1.420,00\nTOTAL\t1.420,00';
    assert.deepEqual(leeLoPegado(pegado), leeLoPegadoLaApi(pegado));
  });
});

describe('la cuenta que importa', () => {
  test('lo de terceros no cuenta como coste nuestro', () => {
    // Es la razón de que esto exista: 1.664 € del impuesto y las tasas no son
    // gasto de PopCar, y metidos en el coste el margen sale mal en todos.
    const r = resumenDeLaGestoria([
      { concepto: 'Impuesto de matriculación', importe: 1420 },
      { concepto: 'Tasa DGT', importe: 99.77 },
      { concepto: 'ITV de homologación', importe: 145 },
      { concepto: 'Honorarios de la gestoría', importe: 90, que: 'nuestro' },
    ]);
    assert.equal(r.suplidos, 1664.77);
    // Los 90 € de honorarios son la base; con su IVA, 108,90.
    assert.equal(r.honorariosBase, 90);
    assert.equal(r.honorarios, 108.9);
    assert.equal(r.total, 1773.67);
  });
});
