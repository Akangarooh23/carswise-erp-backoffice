/**
 * Qué se puede hacer con un tramo en cada momento.
 *
 * Lo que se sostiene aquí es lo caro: **la orden de recogida no sale sin haberle
 * preguntado antes al vendedor**. Sin esa respuesta, lo que hay escrito en
 * «Desde» es la ciudad del anuncio, y un camión no va a una ciudad: va a una
 * calle, un día, a una hora y preguntando por alguien. Un camión en la puerta
 * equivocada no se deshace.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  bloquesDelTramo, seLePreguntaAlVendedor, faltaParaLaOrden, PISTAS,
} from './fases-transporte.js';

describe('qué se ve en cada fase', () => {
  test('recién nacido: quién lo trae, y preguntarle al vendedor', () => {
    assert.deepEqual(bloquesDelTramo('Por organizar'), ['quien', 'dondeRecoger']);
  });

  test('la ruta y la orden aparecen cuando ya hay transportista contratado', () => {
    const b = bloquesDelTramo('Contratado');
    assert.ok(b.includes('ruta'));
    assert.ok(b.includes('orden'));
  });

  test('las fotos, cuando ya lo tiene: son del viaje, no del coche', () => {
    // Son lo único que distingue un golpe que ya venía de uno que se hizo por
    // el camino. Antes de que lo recojan no hay viaje del que hacer fotos.
    assert.ok(!bloquesDelTramo('Por organizar').includes('fotos'));
    assert.ok(bloquesDelTramo('Recogido').includes('fotos'));
    assert.ok(bloquesDelTramo('Entregado').includes('fotos'));
  });

  test('con una incidencia se enseña todo', () => {
    // Puede pasar en cualquier punto: esconder media pantalla mientras alguien
    // intenta averiguar qué ha ocurrido es lo contrario de ayudar.
    assert.equal(bloquesDelTramo('Con incidencia').length, 5);
  });

  test('un estado desconocido no abre nada de más', () => {
    assert.deepEqual(bloquesDelTramo('Lo que sea'), ['quien']);
  });
});

describe('a quién se le pregunta por la recogida', () => {
  test('solo en el primer tramo, que es el que sale del vendedor', () => {
    assert.equal(seLePreguntaAlVendedor(1), true);
  });

  test('en el segundo no: sale de nuestra campa', () => {
    // El correo iría igualmente al concesionario alemán, preguntándole por una
    // recogida que no es suya.
    assert.equal(seLePreguntaAlVendedor(2), false);
    assert.equal(seLePreguntaAlVendedor(null), false);
    assert.equal(seLePreguntaAlVendedor(undefined), false);
  });
});

describe('lo que impide mandar la orden de recogida', () => {
  const LISTO = {
    transportista: 'Business Ontime GmbH',
    desde: 'Landsberger Str. 180, 80687 München',
    hasta: 'Zaragoza',
    tramo: 1,
    recogida_preguntada_at: '2026-09-02T10:00:00Z',
  };

  test('con todo puesto, nada', () => {
    assert.deepEqual(faltaParaLaOrden(LISTO), []);
  });

  test('sin transportista no hay a quién mandársela', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, transportista: '' }), ['elegir quién lo trae']);
  });

  test('sin las dos puntas, tampoco', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, desde: '', hasta: '' }),
      ['de dónde sale', 'a dónde va']);
  });

  test('y en el primer tramo, sin haber preguntado al vendedor', () => {
    // Es el que evita el camión en la puerta equivocada.
    assert.deepEqual(
      faltaParaLaOrden({ ...LISTO, recogida_preguntada_at: null }),
      ['preguntarle antes al vendedor dónde y cuándo se recoge']
    );
  });

  test('en el segundo tramo eso no se pide: no hay vendedor', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, tramo: 2, recogida_preguntada_at: null }), []);
  });
});

describe('las pistas', () => {
  test('cada dato dice cuándo se sabe', () => {
    for (const clave of ['transportista', 'coste', 'desde', 'hasta', 'recogida_prevista']) {
      assert.ok(PISTAS[clave]?.trim().length > 10, `sin pista: ${clave}`);
    }
  });

  test('la de «desde» avisa de lo que se hace mal', () => {
    assert.match(PISTAS.desde, /ciudad no es una dirección/);
  });
});
