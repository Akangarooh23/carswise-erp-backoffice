/**
 * Los papeles que se esperan de cada origen.
 *
 * Lo que se comprueba no es la lista en sí —esa la irá corrigiendo quien
 * compre— sino que el sistema sepa contestar la pregunta que hoy no sabía:
 * **qué falta**. Un coche alemán no se matricula sin su ficha ni sin el COC, y
 * eso hay que verlo antes de tenerlo aparcado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBITOS, esAmbito, papelesEsperados, papelesQueFaltan, faltaAlgoImprescindible,
  PAPELES_POR_ORIGEN,
} from './documentos.js';

describe('de qué puede colgar un papel', () => {
  test('de una solicitud, de un pedido o de un trámite', () => {
    for (const a of AMBITOS) assert.ok(esAmbito(a));
  });

  test('de nada más', () => {
    assert.equal(esAmbito('usuario'), false,
      'un ámbito inventado escribiría ficheros en una carpeta que no mira nadie');
  });
});

describe('lo que se espera de cada origen', () => {
  test('los cinco orígenes tienen su lista', () => {
    for (const origen of ['importacion', 'concesionario', 'ex-renting', 'particular', 'stock']) {
      assert.ok(papelesEsperados(origen).length > 0, `«${origen}» sin papeles esperados`);
    }
  });

  test('un origen desconocido no inventa papeles', () => {
    assert.deepEqual(papelesEsperados('subasta'), []);
  });

  test('cada papel dice para qué sirve', () => {
    for (const [origen, papeles] of Object.entries(PAPELES_POR_ORIGEN)) {
      for (const p of papeles) {
        assert.ok(p.porQue.length > 10,
          `«${p.papel}» de ${origen} sin explicar: lo lee quien no sabe por qué se lo piden`);
      }
    }
  });

  test('de Alemania se piden la ficha y el COC, que son los que bloquean', () => {
    const imprescindibles = papelesEsperados('importacion').filter((p) => p.imprescindible).map((p) => p.papel);
    assert.ok(imprescindibles.some((x) => /ficha del veh/i.test(x)));
    assert.ok(imprescindibles.some((x) => /COC/i.test(x)),
      'sin COC hay que homologar unidad a unidad: caro y lento');
  });

  test('a un particular se le piden las comprobaciones que evitan el susto', () => {
    const papeles = papelesEsperados('particular').map((p) => p.papel.toLowerCase());
    assert.ok(papeles.some((x) => x.includes('dgt')), 'cargas y embargos se miran antes de pagar');
    assert.ok(papeles.some((x) => x.includes('dni')), 'quien firma tiene que ser el titular');
    assert.ok(papeles.some((x) => x.includes('circulación')), 'una deuda del ayuntamiento bloquea la transferencia');
  });

  test('a un ex-renting se le exige el justificante de cargas', () => {
    const cargas = papelesEsperados('ex-renting').find((p) => /cargas/i.test(p.papel));
    assert.ok(cargas?.imprescindible, 'una flota puede llevar reserva de dominio');
  });
});

describe('qué falta por reunir', () => {
  test('lo que no se ha subido', () => {
    const faltan = papelesQueFaltan('concesionario', ['Factura']).map((p) => p.papel);
    assert.ok(!faltan.includes('Factura'));
    assert.ok(faltan.includes('Permiso de circulación'));
  });

  test('da igual cómo se escriba', () => {
    const faltan = papelesQueFaltan('concesionario', ['  factura  ']).map((p) => p.papel);
    assert.ok(!faltan.includes('Factura'));
  });

  test('subir algo sin decir qué papel es no tapa ningún hueco', () => {
    const conNada = papelesQueFaltan('concesionario', ['', '  ']);
    assert.equal(conNada.length, papelesEsperados('concesionario').length,
      'si tapara, bastaría con subir cualquier cosa para que la lista se pusiera verde');
  });

  test('con todos subidos no falta nada', () => {
    const todos = papelesEsperados('particular').map((p) => p.papel);
    assert.deepEqual(papelesQueFaltan('particular', todos), []);
  });

  test('se distingue lo que bloquea de lo que solo conviene', () => {
    const todosMenosUnoOpcional = papelesEsperados('concesionario')
      .filter((p) => p.imprescindible).map((p) => p.papel);
    assert.equal(faltaAlgoImprescindible('concesionario', todosMenosUnoOpcional), false,
      'faltan opcionales, pero nada que impida seguir');

    assert.equal(faltaAlgoImprescindible('concesionario', []), true);
  });
});
