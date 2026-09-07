/**
 * Una sede no es una filial, y confundirlas se paga en el 347.
 *
 * Las dos cuelgan de una matriz y las dos se parecen en pantalla. La diferencia
 * es el CIF: la filial tiene el suyo y declara aparte; la sede comparte el de
 * su matriz y suma con ella.
 *
 * El fallo que se busca es el silencioso: dar de alta «Modrive Madrid» y
 * «Modrive Barcelona» como dos acreedores y presentar dos importes de 2.400 €
 * donde tiene que ir uno de 4.800 — que pasa el umbral de los 3.005,06 € y hay
 * que declararlo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RELACIONES, COMO_SE_LEE, esRelacion, esSede, elObligado, deQuienEsElNif,
  seSostiene, PORQUE_NO_VALE,
} from './el-obligado.js';

const MATRIZ  = { id: 'PRV-1', matriz_id: null, relacion: null, nif: 'B12345678' };
const MADRID  = { id: 'PRV-2', matriz_id: 'PRV-1', relacion: 'sede',   nif: '' };
const BARNA   = { id: 'PRV-3', matriz_id: 'PRV-1', relacion: 'sede',   nif: '' };
const FILIAL  = { id: 'PRV-4', matriz_id: 'PRV-1', relacion: 'filial', nif: 'B99999999' };
const SUELTO  = { id: 'PRV-5', matriz_id: null, relacion: null, nif: 'B87654321' };

describe('las dos relaciones', () => {
  test('son sede y filial, y cada una se lee', () => {
    assert.deepEqual([...RELACIONES], ['sede', 'filial']);
    for (const r of RELACIONES) assert.ok(COMO_SE_LEE[r]);
  });

  test('y no se leen igual, que es de lo que va todo esto', () => {
    assert.notEqual(COMO_SE_LEE.sede, COMO_SE_LEE.filial);
  });

  test('lo que no es ninguna de las dos, no cuela', () => {
    assert.ok(esRelacion('sede'));
    for (const malo of ['sucursal', 'SEDE', '', null, undefined, 2]) {
      assert.equal(esRelacion(malo), false, `«${String(malo)}» ha colado`);
    }
  });
});

describe('a nombre de quién se declara', () => {
  test('una sede declara a nombre de su matriz', () => {
    assert.equal(elObligado(MADRID), 'PRV-1');
    assert.equal(elObligado(BARNA), 'PRV-1');
  });

  test('las dos sedes de la misma empresa son un solo acreedor', () => {
    // Es el fallo que cuesta dinero: dos declaraciones por debajo del umbral
    // donde tiene que ir una por encima.
    assert.equal(elObligado(MADRID), elObligado(BARNA));
  });

  test('una filial declara a su nombre, porque tiene su CIF', () => {
    assert.equal(elObligado(FILIAL), 'PRV-4');
    assert.notEqual(elObligado(FILIAL), elObligado(MADRID));
  });

  test('y una fila suelta, ella misma', () => {
    assert.equal(elObligado(SUELTO), 'PRV-5');
    assert.equal(elObligado(MATRIZ), 'PRV-1');
  });

  test('colgar de una matriz no basta: hay que decir de qué manera', () => {
    /*
     * Aquí está la trampa. `matriz_id` ya se usaba para los grupos, así que una
     * fila colgada sin decir qué es tiene que seguir declarando a su nombre —es
     * lo que significaba antes—. Si esto diera la matriz, todas las filiales que
     * ya hay pasarían a declararse a nombre de otro de un día para otro.
     */
    const viejo = { id: 'PRV-6', matriz_id: 'PRV-1', relacion: null, nif: 'B11111111' };
    assert.equal(elObligado(viejo), 'PRV-6');
    assert.equal(esSede(viejo), false);
  });
});

describe('el NIF', () => {
  test('el de una sede es el de su matriz', () => {
    assert.equal(deQuienEsElNif(MADRID), 'PRV-1');
  });

  test('el de una filial es el suyo', () => {
    assert.equal(deQuienEsElNif(FILIAL), 'PRV-4');
  });
});

describe('lo que no se puede guardar', () => {
  test('una sede con NIF propio', () => {
    // Si lo tiene, o no es una sede o el NIF está mal. Guardarlo seria el mismo
    // dato en dos sitios, y el dia que cambie cambiaria solo uno.
    const r = seSostiene({ ...MADRID, nif: 'B12345678' });
    assert.equal(r.si, false);
    assert.equal(r.porque, PORQUE_NO_VALE.sedeConNif);
  });

  test('una relación sin decir de quién', () => {
    const r = seSostiene({ id: 'PRV-9', matriz_id: null, relacion: 'sede', nif: '' });
    assert.equal(r.si, false);
    assert.equal(r.porque, PORQUE_NO_VALE.sinMatriz);
  });

  test('lo de mirar a las demás no está aquí, y no se cuela', () => {
    // Que una fila cuelgue de sí misma, o que haya tres niveles, lo comprueba
    // `fallaLaMatriz`. Esto solo mira lo que trae la fila, y decir que sí es lo
    // correcto: la otra puerta sigue estando.
    assert.equal(seSostiene({ id: 'PRV-1', matriz_id: 'PRV-1', relacion: 'sede', nif: '' }).si, true);
  });

  test('lo que sí se guarda', () => {
    for (const bueno of [MATRIZ, MADRID, BARNA, FILIAL, SUELTO]) {
      assert.equal(seSostiene(bueno).si, true, `${bueno.id} no pasa y debería`);
    }
  });

  test('los espacios no cuentan como NIF', () => {
    assert.equal(seSostiene({ ...MADRID, nif: '   ' }).si, true);
  });
});
