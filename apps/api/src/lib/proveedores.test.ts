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
  nombreComparable, esElMismo, agrupaNombresSueltos, elProveedorDe,
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

describe('a qué proveedor se refiere un nombre escrito a mano', () => {
  const alta = [
    { nombre: 'Becker Solutions, S.L. (Becker Lines)', tipos: ['transportista'] },
    { nombre: 'checkdenwagen Automobile DE', tipos: ['perito'] },
    { nombre: 'Gómez', tipos: ['taller'] },
  ];

  test('el nombre entero, aunque cambien tildes y mayúsculas', () => {
    assert.equal(elProveedorDe('CHECKDENWAGEN AUTOMOBILE DE', alta)?.tipos[0], 'perito');
  });

  test('y el nombre a medias, que es como se escribe de menos', () => {
    // Sin esto, esta factura se queda sin tipo y no sale en ningún desglose.
    assert.equal(elProveedorDe('Becker Solutions, S.L.', alta)?.tipos[0], 'transportista');
  });

  test('pero no por el medio: «Transportes Gómez» no es «Gómez»', () => {
    assert.equal(elProveedorDe('Transportes Gómez', alta), null);
  });

  test('un nombre vacío no engancha con el primero de la lista', () => {
    assert.equal(elProveedorDe('', alta), null);
    assert.equal(elProveedorDe(null, alta), null);
  });

  test('y sin proveedores dados de alta no revienta', () => {
    assert.equal(elProveedorDe('Becker', []), null);
    assert.equal(elProveedorDe('Becker', null), null);
  });
});

describe('un nombre que casa con una empresa y con sus sedes', () => {
  /*
   * Modrive SL, con sedes en Madrid y Barcelona. Los 2.626 anuncios suyos
   * dicen «Modrive» a secas: no dicen en qué sede está el coche.
   */
  const MODRIVE = [
    { id: 'PRV-1', nombre: 'Modrive SL', relacion: null },
    { id: 'PRV-2', nombre: 'Modrive Madrid', relacion: 'sede' },
    { id: 'PRV-3', nombre: 'Modrive Barcelona', relacion: 'sede' },
  ];

  test('se contesta la empresa, no una sede al azar', () => {
    /*
     * La regla de «el más largo» contestaría «Modrive Barcelona», y ese coche
     * puede estar en Madrid. El anuncio no dice la sede, así que contestar una
     * es inventarla; la empresa sí se sabe.
     */
    assert.equal(elProveedorDe('Modrive', MODRIVE)?.id, 'PRV-1');
  });

  test('pero si el anuncio dice la sede, se contesta la sede', () => {
    assert.equal(elProveedorDe('Modrive Madrid', MODRIVE)?.id, 'PRV-2');
  });

  test('y si lo único que casa son sedes, se contesta la más larga', () => {
    // Peor respuesta que la empresa, pero mejor que ninguna.
    const soloSedes = MODRIVE.filter((x) => x.relacion === 'sede');
    assert.equal(elProveedorDe('Modrive', soloSedes)?.id, 'PRV-3');
  });

  test('lo de siempre sigue igual: el paréntesis que se escribe de menos', () => {
    // Sin sedes por medio, entre «Becker» y «Becker Solutions, S.L. (Becker
    // Lines)» sigue ganando la larga, que es la que tiene la ficha de verdad.
    const becker = [
      { id: 'A', nombre: 'Becker' },
      { id: 'B', nombre: 'Becker Solutions, S.L. (Becker Lines)' },
    ];
    assert.equal(elProveedorDe('Becker Solutions, S.L.', becker)?.id, 'B');
  });
});

describe('la empresa se llama de una manera y los anuncios de otra', () => {
  /*
   * Modrive es Marcos Ocasión SL. Los 2.626 anuncios suyos dicen «Modrive» y la
   * factura tiene que decir «Marcos Ocasión SL». Ninguno empieza por el otro,
   * así que con un solo nombre la ficha o casa con los anuncios o sirve para
   * facturar.
   */
  const MARCOS = [
    { id: 'PRV-1', nombre: 'Marcos Ocasión SL', nombre_comercial: 'Modrive', relacion: null },
    { id: 'PRV-2', nombre: 'Marcos Ocasión SL · Madrid', nombre_comercial: 'Modrive Madrid', relacion: 'sede' },
    { id: 'PRV-3', nombre: 'Marcos Ocasión SL · Barcelona', nombre_comercial: 'Modrive Barcelona', relacion: 'sede' },
  ];

  test('el nombre de los anuncios encuentra la ficha', () => {
    assert.equal(elProveedorDe('Modrive', MARCOS)?.id, 'PRV-1');
  });

  test('y el fiscal también, que es el que va en la factura', () => {
    assert.equal(elProveedorDe('Marcos Ocasión SL', MARCOS)?.id, 'PRV-1');
  });

  test('un anuncio que sí dice la sede da con la sede', () => {
    assert.equal(elProveedorDe('Modrive Madrid', MARCOS)?.id, 'PRV-2');
  });

  test('pero «Modrive» a secas sigue dando la empresa, no una sede', () => {
    // El anuncio no dice dónde está el coche. La empresa sí se sabe.
    assert.equal(elProveedorDe('Modrive', MARCOS)?.id, 'PRV-1');
  });

  test('sin nombre comercial se comporta como siempre', () => {
    const sinComercial = [{ id: 'A', nombre: 'Gestoría Bernal' }];
    assert.equal(elProveedorDe('Gestoría Bernal', sinComercial)?.id, 'A');
    assert.equal(elProveedorDe('Modrive', sinComercial), null);
  });

  test('y un comercial vacío no casa con cualquier cosa', () => {
    // Con la cadena vacía dentro, `''.startsWith(x)` haría que esta ficha
    // casara con todo lo que se busque.
    const conVacio = [{ id: 'A', nombre: 'Gestoría Bernal', nombre_comercial: '' }];
    assert.equal(elProveedorDe('Transportes Gómez', conVacio), null);
  });
});

describe('el desempate mide el nombre que ha casado', () => {
  /*
   * Dos empresas cuyo nombre comercial empieza igual, y cuyos nombres fiscales
   * no tienen nada que ver ni con el buscado ni entre sí.
   *
   * Midiendo por el fiscal se elegiría la primera —tiene el nombre más largo—
   * cuando lo que de verdad se parece a lo buscado es el comercial de la
   * segunda. Se comparan longitudes de cadenas que no vienen a cuento.
   */
  const DOS = [
    { id: 'A', nombre: 'Transportes Internacionales del Ebro SL', nombre_comercial: 'Becker' },
    { id: 'B', nombre: 'BK SL', nombre_comercial: 'Becker Solutions Lines' },
  ];

  test('gana la que más se parece, no la del nombre fiscal más largo', () => {
    assert.equal(elProveedorDe('Becker Sol', DOS)?.id, 'B');
  });

  test('y con el nombre entero se acierta igual', () => {
    assert.equal(elProveedorDe('Becker', DOS)?.id, 'A');
  });
});
