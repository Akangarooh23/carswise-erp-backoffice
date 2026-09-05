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
  test('el impuesto no cuenta como coste nuestro; lo demás sí', () => {
    // Es la razón de que esto exista, y desde que lo aclaró el asesor la raya
    // está en otro sitio: el impuesto es lo único que se le cobra aparte al
    // cliente. Las tasas y la ITV las pagamos nosotros con el fee, así que son
    // coste del coche por mucho que el recibo lleve el nombre del cliente.
    const r = resumenDeLaGestoria([
      { concepto: 'Impuesto de matriculación', importe: 1420 },
      { concepto: 'Tasa DGT', importe: 99.77 },
      { concepto: 'ITV de homologación', importe: 145 },
      { concepto: 'Honorarios de la gestoría', importe: 90, que: 'nuestro' },
    ]);
    assert.equal(r.suplidos, 1420);
    // 99,77 exentos + 145 y 90 de base: 334,77 de coste, 49,35 de IVA.
    assert.equal(r.honorariosBase, 334.77);
    assert.equal(r.iva, 49.35);
    assert.equal(r.total, 1804.12);
  });
});
