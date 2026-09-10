import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

describe('las visitas del marketplace', () => {
  test('una por confirmar es una persona esperando, y va en rojo', () => {
    // Es lo mismo que un lead sin contestar: pidió hora y nadie ha llamado.
    const p = losPendientes({ visitas_por_confirmar: 3 });
    assert.deepEqual(p.map((x) => x.clave), ['visitas_por_confirmar']);
    assert.equal(p[0].tono, 'urgente');
  });

  test('y una sin cerrar espera a que digamos cómo acabó', () => {
    const p = losPendientes({ visitas_sin_cerrar: 2 });
    assert.equal(p[0].clave, 'visitas_sin_cerrar');
    assert.equal(p[0].tono, 'espera');
  });

  test('las dos llevan a la Agenda, que es donde están los botones', () => {
    const p = losPendientes({ visitas_por_confirmar: 1, visitas_sin_cerrar: 1 });
    for (const x of p) assert.equal(x.a, '/bookings');
  });

  test('y no se confunden con las de mantenimiento', () => {
    // `citas_7d` cuenta `erp_appointments`, que es otra tabla y otra pantalla.
    // Estaban las dos diciendo «citas» y llevando a sitios distintos.
    const p = losPendientes({ visitas_por_confirmar: 1, citas_7d: 1 });
    assert.equal(p.length, 2);
    const [visitas, mantenimiento] = p;
    assert.notEqual(visitas.a, mantenimiento.a);
    assert.match(mantenimiento.etiqueta, /mantenimiento/);
    assert.doesNotMatch(visitas.etiqueta, /mantenimiento/);
  });
});

describe('el dinero del concesionario', () => {
  test('una venta sin comisionar es dinero que no reclama nadie, y va en rojo', () => {
    const p = losPendientes({ ventas_sin_comisionar: 2 });
    assert.deepEqual(p.map((x) => x.clave), ['ventas_sin_comisionar']);
    assert.equal(p[0].tono, 'urgente');
    assert.equal(p[0].a, '/comisiones');
  });

  test('y va antes que las visitas, porque cuesta dinero', () => {
    // El orden del catálogo es el que manda: lo que cuesta dinero primero
    // aunque sea uno solo.
    const p = losPendientes({ visitas_por_confirmar: 9, ventas_sin_comisionar: 1 });
    assert.deepEqual(p.map((x) => x.clave), ['ventas_sin_comisionar', 'visitas_por_confirmar']);
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

describe('los encargos de venta de particulares', () => {
  test('uno a punto de poder irse va en rojo: es el momento de llamarle', () => {
    /*
     * El mandato no caduca. Lo que se acaba a los 30 días es la penalización:
     * a partir de ahí puede vender por su cuenta sin pagarnos nada. Uno de cada
     * cinco acaba yéndose así, y en ese nos hemos gastado el anuncio y la
     * revisión sin cobrar. El aviso es para llamarle antes, no para despedirse.
     */
    const p = losPendientes({ encargos_por_llamar: 2 });
    assert.equal(p[0].tono, 'urgente');
    assert.equal(p[0].n, 2);
    assert.match(p[0].porque, /sin pagarnos nada/);
  });

  test('uno sin horas es un anuncio que nadie puede visitar, y también', () => {
    const p = losPendientes({ encargos_sin_franjas: 1 });
    assert.equal(p[0].tono, 'urgente');
    assert.equal(p[0].una, 'encargo sin horas para visitar');
  });

  test('y uno listo solo espera al taller', () => {
    const p = losPendientes({ encargos_listos: 3 });
    assert.equal(p[0].tono, 'espera');
  });

  test('los tres llevan a IDCars, que es donde está el encargo', () => {
    for (const clave of ['encargos_por_llamar', 'encargos_sin_franjas', 'encargos_listos']) {
      assert.equal(CATALOGO.find((p) => p.clave === clave)?.a, '/idcars', clave);
    }
  });

  test('el que hay que llamar va antes que el que solo espera', () => {
    const p = losPendientes({ encargos_listos: 9, encargos_por_llamar: 1 });
    assert.deepEqual(p.map((x) => x.clave), ['encargos_por_llamar', 'encargos_listos']);
  });
});

describe('el panel pide de verdad los avisos de encargos', () => {
  /*
   * Un catálogo bien escrito no sirve de nada si nadie cuenta esas tres cosas.
   * El fallo silencioso es este: la entrada existe, la pantalla la sabría
   * pintar, y como nadie le pasa el número se queda a cero para siempre — que
   * es indistinguible de «no hay nada pendiente».
   */
  const DASHBOARD = readFileSync(
    new URL('../routes/dashboard.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  test('llama a quien los calcula', () => {
    assert.match(DASHBOARD, /losAvisosDeEncargos\(\)/);
  });

  test('y mete el resultado en las cuentas', () => {
    assert.match(DASHBOARD, /losPendientes\(\{[\s\S]{0,400}\.\.\.encargos,/);
  });

  test('si falla, el panel entero no se cae', () => {
    // El resto de pendientes no puede desaparecer porque la tabla de encargos
    // todavía no exista en un entorno.
    assert.match(DASHBOARD, /losAvisosDeEncargos\(\)\.catch\(/);
  });
});

describe('nadie se queda sin quien le pase el número', () => {
  /*
   * El fallo silencioso, escrito de una vez para todo el catálogo.
   *
   * Añadir una entrada es fácil y se ve enseguida; acordarse de contarla en
   * alguna parte, no. Y una entrada que nadie cuenta se queda a cero para
   * siempre, que en una lista de pendientes es exactamente lo mismo que decir
   * «no hay nada que hacer».
   *
   * Se busca la clave por todo el servidor y no solo en el panel: unas las
   * cuenta el propio panel en SQL, otras vienen de una función de `routes/` y
   * otras de una de `lib/`. Este fichero se excluye a propósito — aquí están
   * todas por definición, y buscarse a sí mismo no demuestra nada.
   */
  const dondeEstoy = (rel: string) =>
    new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const FUENTE = ['../routes/', './']
    .flatMap((dir) => readdirSync(dondeEstoy(dir))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'pendientes.ts')
      .map((f) => readFileSync(dondeEstoy(dir) + f, 'utf8')))
    .join('\n');

  for (const p of CATALOGO) {
    test(`alguien cuenta «${p.etiqueta}»`, () => {
      assert.ok(
        FUENTE.includes(p.clave),
        `«${p.clave}» está en el catálogo y no lo calcula nadie: saldría a cero para siempre`,
      );
    });
  }
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

describe('y el panel reparte de verdad lo que le dan', () => {
  /*
   * El guardián de arriba comprueba que **alguien produzca** cada clave. Es
   * necesario y no basta: una función puede devolver el número y el panel no
   * meterlo en las cuentas, y entonces la clave existe, se calcula, y la
   * pantalla la pinta a cero para siempre.
   *
   * Se descubrió saboteando: quitar `...financiacion` del panel no rompía nada,
   * porque la clave seguía apareciendo en la función que la calcula.
   */
  const DASHBOARD = readFileSync(
    new URL('../routes/dashboard.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  const CUENTAS = DASHBOARD.slice(
    DASHBOARD.indexOf('pendientes: losPendientes({'),
    DASHBOARD.indexOf('}),', DASHBOARD.indexOf('pendientes: losPendientes({')),
  );

  test('lo que calcula cada función acaba en las cuentas', () => {
    assert.ok(CUENTAS.length > 0, 'no encuentro la llamada a losPendientes');
    for (const trozo of ['...encargos', '...anuncios', '...financiacion', '...sinEnviar', '...visitas.rows[0]']) {
      assert.ok(CUENTAS.includes(trozo), `${trozo} no se mete en las cuentas del panel`);
    }
  });

  test('y el reparto de leads va el último, porque pisa', () => {
    /*
     * `reparteLosLeads` reescribe `leads_pendientes`. Si se colara antes del
     * spread de `leads.rows[0]`, ese lo pisaría a él y volveríamos a contar al
     * mismo señor dos veces.
     */
    const leads = CUENTAS.indexOf('...leads.rows[0]');
    const reparte = CUENTAS.indexOf('...reparteLosLeads(');
    assert.ok(leads >= 0 && reparte > 0, 'falta alguno de los dos');
    assert.ok(reparte > leads, 'el reparto se aplica antes que el spread que pisa');
  });
});
