/**
 * La revisión del taller.
 *
 * Lo que se protege: que no salga un anuncio diciendo que el coche está
 * comprobado sin que nadie lo haya comprobado. Es la promesa que separa nuestro
 * anuncio de uno de Milanuncios, y es la única puerta que no depende del
 * cliente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS, RESULTADOS, QUE_TOCA, ETIQUETA, LO_QUE_CUESTA,
  esUnEstado, esUnResultado, elCocheEstaComprobado, porQueNoEstaComprobado,
  sigueEsperandoAlTaller, elTallerLoTumbo,
  ENSURE_UNA_VIVA, SQL_LA_DEL_COCHE,
} from './revision-del-taller.js';

describe('por dónde va', () => {
  test('tres estados, y ninguno más', () => {
    // Entre «encargada» y «hecha» no hay nada que el ERP pueda saber: cuando el
    // coche está en el taller, lo que hay es una llamada.
    assert.deepEqual([...ESTADOS], ['Por llevar', 'En el taller', 'Hecha']);
    for (const e of ESTADOS) assert.ok(QUE_TOCA[e], `falta qué toca en ${e}`);
  });

  test('y lo que no es un estado no cuela', () => {
    assert.equal(esUnEstado('Hecha'), true);
    assert.equal(esUnEstado('  En el taller  '), true);
    for (const raro of ['hecha', 'Encargada', '', null, undefined]) {
      assert.equal(esUnEstado(raro), false, String(raro));
    }
  });

  test('tres resultados, con su nombre', () => {
    assert.deepEqual([...RESULTADOS], ['bien', 'con_reparos', 'no_se_puede_vender']);
    for (const r of RESULTADOS) assert.ok(ETIQUETA[r], `falta la etiqueta de ${r}`);
  });
});

describe('cuándo el coche está comprobado', () => {
  test('cuando está hecha y salió bien', () => {
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'bien' }), true);
  });

  test('«con reparos» también deja vender', () => {
    /*
     * No es un no: es un coche que se vende contando lo que tiene. La mayoría
     * de los de diez años caen ahí, y tratarlo como un fallo dejaría fuera medio
     * catálogo.
     */
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'con_reparos' }), true);
  });

  test('pero «no se puede vender» cierra la puerta', () => {
    // Es la única de las seis que no depende del cliente: lo haya traído todo o
    // no, si el taller dice que no, no se publica.
    const r = { estado: 'Hecha', resultado: 'no_se_puede_vender' };
    assert.equal(elCocheEstaComprobado(r), false);
    assert.match(porQueNoEstaComprobado(r), /así no se puede vender/);
  });

  test('encargada y sin resultado NO vale', () => {
    /*
     * Lo que se promete en el anuncio no es que lo hayamos llevado: es que lo
     * han mirado. Una revisión sin resultado es un coche sin revisar con papeleo
     * encima.
     */
    assert.equal(elCocheEstaComprobado({ estado: 'En el taller' }), false);
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: null }), false);
    assert.match(porQueNoEstaComprobado({ estado: 'Hecha' }), /nadie ha apuntado cómo salió/);
  });

  test('y sin revisión, tampoco', () => {
    assert.equal(elCocheEstaComprobado(null), false);
    assert.equal(elCocheEstaComprobado(undefined), false);
    assert.match(porQueNoEstaComprobado(null), /No se ha llevado al taller/);
  });

  test('un resultado inventado no abre la puerta', () => {
    // El fallo fácil: comprobar solo que `resultado` no sea el malo. Con eso,
    // cualquier texto raro pasaría por bueno.
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'regular' }), false);
    assert.equal(esUnResultado('regular'), false);
  });

  test('el porqué se puede leer por teléfono', () => {
    // Al otro lado hay alguien explicándoselo al cliente, y «false» no se
    // explica.
    assert.equal(porQueNoEstaComprobado({ estado: 'Hecha', resultado: 'bien' }), '');
    assert.match(porQueNoEstaComprobado({ estado: 'Por llevar' }), /Falta darle cita/);
  });
});

describe('a quién le toca esperar', () => {
  test('sin revisión y con el coche en el taller, se espera', () => {
    assert.equal(sigueEsperandoAlTaller(null), true);
    assert.equal(sigueEsperandoAlTaller({ estado: 'Por llevar' }), true);
    assert.equal(sigueEsperandoAlTaller({ estado: 'En el taller' }), true);
  });

  test('en cuanto está hecha, ya no', () => {
    /*
     * Si no, el coche seguiría saliendo en «listos para el taller» el resto de
     * su vida, ya publicado y ya revisado.
     */
    assert.equal(sigueEsperandoAlTaller({ estado: 'Hecha', resultado: 'bien' }), false);
  });

  test('y el tumbado tampoco espera, aunque no esté comprobado', () => {
    /*
     * Esta es la que no se puede escribir como «lo contrario de comprobado».
     * Un coche rechazado tampoco está comprobado, pero no espera a nadie: lo
     * que necesita es una llamada, y en la lista de los que esperan al taller
     * se quedaría para siempre.
     */
    const tumbado = { estado: 'Hecha', resultado: 'no_se_puede_vender' };
    assert.equal(elCocheEstaComprobado(tumbado), false);
    assert.equal(sigueEsperandoAlTaller(tumbado), false);
  });
});

describe('el que el taller tumba', () => {
  test('se distingue de todos los demás', () => {
    // Su dueño tiene un encargo firmado y está esperando a ver su anuncio, y
    // ese anuncio no va a salir.
    assert.equal(elTallerLoTumbo({ estado: 'Hecha', resultado: 'no_se_puede_vender' }), true);
    for (const otro of [
      null,
      { estado: 'Por llevar' },
      { estado: 'En el taller' },
      { estado: 'Hecha', resultado: 'bien' },
      { estado: 'Hecha', resultado: 'con_reparos' },
    ]) {
      assert.equal(elTallerLoTumbo(otro), false, JSON.stringify(otro));
    }
  });

  test('uno todavía en el taller no cuenta, aunque acabe mal', () => {
    // Mientras no esté hecha no hay nada que contarle al cliente.
    assert.equal(elTallerLoTumbo({ estado: 'En el taller', resultado: 'no_se_puede_vender' }), false);
  });
});

describe('lo que cuesta', () => {
  test('sesenta euros, que es lo que da Norauto', () => {
    // Se le hace a todos los captados, vendan o no. Ese gasto es lo que cubre
    // el fee de cancelación.
    assert.equal(LO_QUE_CUESTA, 60);
  });
});

describe('una revisión viva por coche', () => {
  test('no se puede dar cita dos veces', () => {
    // Con dos fichas, la que decide si se publica es la que salga primero.
    assert.match(ENSURE_UNA_VIVA, /ON erp_revisiones_taller \(vehicle_id\)/);
  });

  test('pero las hechas no estorban a una nueva', () => {
    // Un coche que vuelve el año que viene se revisa otra vez.
    assert.match(ENSURE_UNA_VIVA, /WHERE estado <> 'Hecha'/);
  });

  test('y se lee la más reciente', () => {
    assert.match(SQL_LA_DEL_COCHE, /ORDER BY created_at DESC LIMIT 1/);
  });
});
