import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  lasSecciones, esSeccion, SQL_DE_LA_SECCION, SQL_ES_RENTING,
  NOMBRE_DE_LA_SECCION, QUE_ES_LA_SECCION, ORDEN_DE_SECCIONES,
} from './secciones-del-marketplace.js';

describe('las cuatro secciones', () => {
  test('salen siempre las cuatro, aunque alguna esté vacía', () => {
    // Que una esté a cero es la respuesta a «cuánto hay de eso». Escondiéndola,
    // esa respuesta se convierte en una pregunta.
    const s = lasSecciones([{ seccion: 'concesionario', total: 4288, activos: 4286, precio_medio: 23435, leads: 8 }]);
    assert.equal(s.length, 4);
    assert.deepEqual(s.map((x) => x.clave), ['ex_renting', 'concesionario', 'particular', 'importacion']);
    assert.equal(s[0].total, 0, 'ex-renting va primero y aquí no viene');
  });

  test('en el orden del negocio, no en el que llegan', () => {
    const s = lasSecciones([
      { seccion: 'importacion', total: 3, activos: 3 },
      { seccion: 'ex_renting', total: 4447, activos: 4445 },
    ]);
    assert.deepEqual(s.map((x) => x.clave), ['ex_renting', 'concesionario', 'particular', 'importacion']);
  });

  test('cada una con su nombre y con qué es', () => {
    const s = lasSecciones([]);
    assert.equal(s[0].nombre, 'Ex-renting');
    assert.match(s[0].queEs, /empresas de renting/);
  });

  test('sin coches no hay precio medio: null, no cero', () => {
    // Un 0 € en la tarjeta se lee como coches regalados.
    const s = lasSecciones([{ seccion: 'concesionario', total: 12, activos: 0, precio_medio: 0 }]);
    assert.equal(s[1].precioMedio, null);
    assert.equal(s[1].total, 12, 'el catálogo se ve aunque no haya nada publicado');
  });

  test('y con coches, redondeado a euros', () => {
    const s = lasSecciones([{ seccion: 'ex_renting', total: 10, activos: 10, precio_medio: '23435.41' }]);
    assert.equal(s[0].precioMedio, 23435);
  });

  test('una sección que no existe no se cuela', () => {
    const s = lasSecciones([{ seccion: 'lo_que_sea', total: 99, activos: 99 }]);
    assert.equal(s.reduce((n, x) => n + x.total, 0), 0);
  });

  test('y una lista vacía no revienta', () => {
    assert.equal(lasSecciones([]).length, 4);
    assert.equal(lasSecciones([]).every((x) => x.total === 0), true);
  });
});

describe('cómo se reconoce cada sección', () => {
  test('un particular se aparta antes que nada', () => {
    // Si no, cae en el cajón de ex-renting y las secciones se solapan: la suma
    // deja de ser el marketplace.
    const i = SQL_DE_LA_SECCION.indexOf("'particular'");
    const j = SQL_DE_LA_SECCION.indexOf("'ex_renting'");
    assert.ok(i >= 0 && j >= 0 && i < j, SQL_DE_LA_SECCION);
  });

  test('el ex-renting sale de las empresas de renting, no de todo el catálogo', () => {
    // Astara y Leasys van como `professional` y son las de renting. Partir por
    // «está a la venta» metía los 4.288 coches de Modrive, Gamboa y VIAN —que
    // son concesionarios— en ex-renting, y dejaba Concesionario a cero.
    assert.match(SQL_DE_LA_SECCION, /seller_type\s*=\s*'professional'\s*THEN\s*'ex_renting'/);
    assert.doesNotMatch(SQL_DE_LA_SECCION, /available_for_purchase/);
  });

  test('un vendedor sin tipo cae en concesionario, que es lo que más hay', () => {
    // Y no fuera: una sección de sobras escondería coches que existen.
    assert.match(SQL_DE_LA_SECCION, /ELSE\s*'concesionario'\s*END/);
  });

  test('va en una línea: el SQL se compara con espacios normalizados', () => {
    assert.doesNotMatch(SQL_DE_LA_SECCION, /\n/);
  });

  test('el renting es otro producto y se cuenta aparte', () => {
    assert.equal(SQL_ES_RENTING, 'renting_available');
    assert.doesNotMatch(SQL_DE_LA_SECCION, /renting_available/,
      'metido en las secciones, la suma dejaría de ser el marketplace');
  });
});

describe('nada se queda sin nombre', () => {
  // Añadir una sección al tipo y olvidarse de nombrarla pinta «undefined».
  test('todas tienen nombre, explicación y sitio en el orden', () => {
    for (const s of ORDEN_DE_SECCIONES) {
      assert.ok(NOMBRE_DE_LA_SECCION[s], `falta el nombre de ${s}`);
      assert.ok(QUE_ES_LA_SECCION[s], `falta qué es ${s}`);
    }
    assert.equal(ORDEN_DE_SECCIONES.length, Object.keys(NOMBRE_DE_LA_SECCION).length);
  });

  test('y esSeccion no deja pasar cualquier cosa', () => {
    assert.ok(esSeccion('ex_renting'));
    assert.ok(!esSeccion('renting'));
    assert.ok(!esSeccion(''));
    assert.ok(!esSeccion(null));
  });
});
