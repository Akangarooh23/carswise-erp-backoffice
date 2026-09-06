import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { losPendientes, cuantasCosas, CATALOGO } from './pendientes.js';

describe('lo que está pendiente', () => {
  test('solo sale lo que tiene algo', () => {
    // Una lista de tareas con nueve filas a cero es una lista que se deja de
    // leer, y de esta pantalla se quiere saber exactamente qué hay que hacer.
    const p = losPendientes({ leads_pendientes: 2, citas_7d: 0, usuarios_en_riesgo: 0 });
    assert.deepEqual(p.map((x) => x.clave), ['leads_pendientes']);
  });

  test('en el orden del catálogo, no por cantidad', () => {
    // Ordenado por cantidad, cuarenta citas taparían la factura que no se
    // puede deducir.
    const p = losPendientes({ citas_7d: 40, facturas_sin_llegar: 1 });
    assert.deepEqual(p.map((x) => x.clave), ['facturas_sin_llegar', 'citas_7d']);
  });

  test('lo que cuesta dinero va en rojo y lo que solo espera no', () => {
    const p = losPendientes({ facturas_sin_llegar: 1, citas_7d: 1 });
    assert.equal(p[0].tono, 'urgente');
    assert.equal(p[1].tono, 'espera');
  });

  test('cada uno dice por qué importa', () => {
    // Sin eso hay que preguntar qué pasa si no se hace, y no se pregunta.
    const p = losPendientes({ sin_autorepercusion: 2 });
    assert.match(p[0].porque, /349/);
  });

  test('nada pendiente es una lista vacía, no una lista de ceros', () => {
    assert.deepEqual(losPendientes({}), []);
    assert.deepEqual(losPendientes(null), []);
    assert.deepEqual(losPendientes({ leads_pendientes: 0 }), []);
  });

  test('un número que no lo es no se cuela', () => {
    assert.deepEqual(losPendientes({ leads_pendientes: 'muchos' }), []);
    assert.deepEqual(losPendientes({ leads_pendientes: -3 }), []);
  });

  test('y una clave que no existe tampoco', () => {
    assert.deepEqual(losPendientes({ lo_que_sea: 99 }), []);
  });
});

describe('cuántas cosas hay que hacer', () => {
  test('la suma de todas', () => {
    assert.equal(cuantasCosas(losPendientes({ leads_pendientes: 2, citas_7d: 3 })), 5);
  });

  test('sin nada, cero', () => {
    assert.equal(cuantasCosas([]), 0);
  });
});

describe('el catálogo está completo', () => {
  test('cada entrada tiene todo lo que hace falta para pintarla', () => {
    // Sin destino, la fila no lleva a ningún sitio; sin «porque», no se sabe
    // qué pasa si no se hace.
    for (const p of CATALOGO) {
      assert.ok(p.etiqueta, `falta la etiqueta de ${p.clave}`);
      assert.ok(p.porque, `falta el porqué de ${p.clave}`);
      assert.match(p.a, /^\//, `${p.clave} no lleva a ninguna pantalla`);
      assert.ok(p.icono, `falta el icono de ${p.clave}`);
    }
  });

  test('sin claves repetidas', () => {
    const claves = CATALOGO.map((p) => p.clave);
    assert.equal(new Set(claves).size, claves.length);
  });

  test('las etiquetas van en minúscula, que es como se leen en una lista', () => {
    for (const p of CATALOGO) {
      assert.equal(p.etiqueta[0], p.etiqueta[0].toLowerCase(), `«${p.etiqueta}» empieza en mayúscula`);
    }
  });
});

describe('el singular', () => {
  test('una factura no son «1 facturas»', () => {
    const p = losPendientes({ sin_desglosar: 1 });
    assert.equal(p[0].una, 'factura que no dice su IVA');
  });

  test('y todas las entradas lo tienen', () => {
    for (const p of CATALOGO) {
      assert.ok(p.una, `falta el singular de ${p.clave}`);
      assert.notEqual(p.una, p.etiqueta, `el singular de ${p.clave} es igual que el plural`);
    }
  });
});
