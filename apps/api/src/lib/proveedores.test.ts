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
