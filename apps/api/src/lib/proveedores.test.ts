/**
 * Con quién trabajamos.
 *
 * Lo que se comprueba es lo que hace útil tener la lista: que «Transportes
 * Gómez» y «transportes gomez» se reconozcan como uno solo. Sin eso, traerse lo
 * que ya está escrito a mano daría tres proveedores donde hay uno, y la pregunta
 * de cuánto llevamos gastado con cada uno seguiría sin respuesta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_PROVEEDOR, ETIQUETA_TIPO, esTipoProveedor, tiposLimpios,
  fallaLaMatriz, EXPLICA_FALLO_DE_MATRIZ, elYLosSuyos,
  nombreComparable, esElMismo, agrupaNombresSueltos,
} from './proveedores.js';

describe('qué hace un proveedor', () => {
  test('los tipos que hay, y todos con nombre para la pantalla', () => {
    for (const t of TIPOS_PROVEEDOR) {
      assert.ok(esTipoProveedor(t));
      assert.ok(ETIQUETA_TIPO[t]?.length > 2);
    }
  });

  test('uno puede ser varias cosas', () => {
    assert.deepEqual(tiposLimpios(['taller', 'transportista']), ['taller', 'transportista'],
      'hay talleres que también traen coches');
  });

  test('los repetidos y los inventados se caen', () => {
    assert.deepEqual(tiposLimpios(['taller', 'taller', 'astronauta']), ['taller']);
    assert.deepEqual(tiposLimpios([]), []);
  });

  test('da igual cómo se escriba el tipo', () => {
    assert.deepEqual(tiposLimpios([' Gestoria ', 'TALLER']), ['gestoria', 'taller']);
  });
});

describe('el mismo proveedor escrito de tres maneras', () => {
  test('los acentos y las mayúsculas no hacen a nadie distinto', () => {
    assert.ok(esElMismo('Transportes Gómez', 'transportes gomez'));
    assert.ok(esElMismo('GESTORÍA RUIZ', 'Gestoria Ruiz'));
  });

  test('ni los espacios de más', () => {
    assert.ok(esElMismo('Transportes  Gómez ', 'Transportes Gómez'));
  });

  test('pero dos nombres distintos siguen siendo dos', () => {
    assert.equal(esElMismo('Transportes Gómez', 'Transportes Gómez e Hijos'), false);
  });

  test('un nombre vacío no es igual a nada, ni a otro vacío', () => {
    assert.equal(esElMismo('', ''), false,
      'si no, todo lo que esté sin rellenar se juntaría en un proveedor fantasma');
    assert.equal(nombreComparable('   '), '');
  });
});

describe('traerse lo que ya estaba escrito', () => {
  test('las tres formas del mismo nombre dan un proveedor', () => {
    const r = agrupaNombresSueltos([
      { nombre: 'Transportes Gómez', tipo: 'transportista' },
      { nombre: 'transportes gomez', tipo: 'transportista' },
      { nombre: 'TRANSPORTES  GÓMEZ', tipo: 'transportista' },
    ]);
    assert.equal(r.length, 1);
  });

  test('se queda la primera forma en que se escribió', () => {
    const r = agrupaNombresSueltos([
      { nombre: 'Transportes Gómez', tipo: 'transportista' },
      { nombre: 'transportes gomez', tipo: 'transportista' },
    ]);
    assert.equal(r[0].nombre, 'Transportes Gómez',
      'la que alguien tecleó a conciencia, no la que se escribió con prisa');
  });

  test('si aparecía en dos sitios, se queda con los dos tipos', () => {
    const r = agrupaNombresSueltos([
      { nombre: 'Talleres Paco', tipo: 'taller' },
      { nombre: 'talleres paco', tipo: 'transportista' },
    ]);
    assert.equal(r.length, 1);
    assert.deepEqual([...r[0].tipos].sort(), ['taller', 'transportista']);
  });

  test('los vacíos no crean proveedores', () => {
    assert.deepEqual(agrupaNombresSueltos([{ nombre: '  ', tipo: 'taller' }]), []);
  });
});

/**
 * Quién da una garantía.
 *
 * Sin este tipo, el proveedor de una garantía sería un nombre suelto dentro del
 * producto: sin teléfono, sin CIF y sin poder contestar a quién se le reclama el
 * día que algo se rompe.
 */
describe('el proveedor de garantías', () => {
  test('es un tipo de proveedor como los demás', () => {
    assert.equal(esTipoProveedor('garantia'), true);
    assert.equal(ETIQUETA_TIPO.garantia, 'Garantías');
  });

  test('y se puede combinar: un taller que además da garantías', () => {
    assert.deepEqual(tiposLimpios(['taller', 'garantia']), ['taller', 'garantia']);
  });
});

/**
 * Grupos y filiales.
 *
 * Lo que se vigila es que no se pueda montar una cadena. Con tres niveles, «lo
 * que llevamos con el grupo» dejaría de tener una respuesta clara, y peor: la
 * consulta que suma podría no terminar nunca.
 */
describe('un grupo con filiales', () => {
  const todos = [
    { id: 'PRV-grupo', nombre: 'Higueral Grupo' },
    { id: 'PRV-filial', nombre: 'Higueral Cars Logistics', matriz_id: 'PRV-grupo' },
    { id: 'PRV-suelto', nombre: 'Becker Solutions' },
  ];

  test('una sociedad puede colgar de un grupo', () => {
    assert.equal(fallaLaMatriz('PRV-suelto', 'PRV-grupo', todos), null);
  });

  test('sin matriz no falla nada: la mayoría no son de ningún grupo', () => {
    assert.equal(fallaLaMatriz('PRV-suelto', '', todos), null);
  });

  test('nadie es su propia matriz', () => {
    assert.equal(fallaLaMatriz('PRV-grupo', 'PRV-grupo', todos), 'ella_misma');
  });

  test('una filial no puede ser matriz de otra: sería un tercer nivel', () => {
    assert.equal(fallaLaMatriz('PRV-suelto', 'PRV-filial', todos), 'la_matriz_es_filial');
  });

  test('y un grupo con filiales no puede colgar de otro', () => {
    assert.equal(fallaLaMatriz('PRV-grupo', 'PRV-suelto', todos), 'tiene_filiales');
  });

  test('un ciclo de dos no se puede montar', () => {
    // A cuelga de B; que B cuelgue de A tiene que fallar, o la suma no acaba.
    const conVinculo = [
      { id: 'A', nombre: 'A', matriz_id: 'B' },
      { id: 'B', nombre: 'B' },
    ];
    assert.ok(fallaLaMatriz('B', 'A', conVinculo) !== null);
  });

  test('cada fallo se explica: un «no se puede» a secas no dice qué hacer', () => {
    for (const fallo of ['ella_misma', 'la_matriz_es_filial', 'tiene_filiales'] as const) {
      assert.ok(EXPLICA_FALLO_DE_MATRIZ[fallo].length > 20);
    }
  });
});

describe('con quién hay que sumar', () => {
  const todos = [
    { id: 'PRV-grupo', nombre: 'Higueral Grupo' },
    { id: 'PRV-filial', nombre: 'Higueral Cars Logistics', matriz_id: 'PRV-grupo' },
    { id: 'PRV-otra', nombre: 'Higueral Transportes', matriz_id: 'PRV-grupo' },
    { id: 'PRV-suelto', nombre: 'Becker Solutions' },
  ];

  test('el grupo suma lo suyo y lo de sus filiales', () => {
    assert.deepEqual(elYLosSuyos('PRV-grupo', todos).map((x) => x.nombre), [
      'Higueral Grupo', 'Higueral Cars Logistics', 'Higueral Transportes',
    ]);
  });

  test('una filial suma solo lo suyo', () => {
    assert.deepEqual(elYLosSuyos('PRV-filial', todos).map((x) => x.nombre),
      ['Higueral Cars Logistics'],
      'lo del grupo no es suyo: si lo sumara, el mismo gasto se contaría dos veces');
  });

  test('uno sin grupo, él solo', () => {
    assert.equal(elYLosSuyos('PRV-suelto', todos).length, 1);
  });

  test('uno que no existe no suma nada', () => {
    assert.deepEqual(elYLosSuyos('PRV-inventado', todos), []);
  });
});
