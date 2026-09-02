/**
 * Los daños que vio el perito, y lo que suman.
 *
 * Lo que se comprueba aquí es sobre todo una cosa: que el total **no miente por
 * abajo**. Una partida vista y no valorada no puede desaparecer del recuento,
 * porque desaparece justo en los coches peores — que son los que más caro salen
 * si el precio de reacondicionamiento se queda corto.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTIDAS_HABITUALES, faltaParaApuntarUnDano, costeQueSeGuarda,
  resumenDeDanos, comoSeCuenta, leeLoPegado,
} from './danos-del-coche.js';

describe('apuntar una partida', () => {
  test('hace falta saber qué pieza es', () => {
    assert.deepEqual(faltaParaApuntarUnDano({ pieza: '   ' }), ['qué pieza es']);
    assert.deepEqual(faltaParaApuntarUnDano({ pieza: 'Capó' }), []);
  });

  test('sin importe se puede: verlo y no valorarlo es lo normal', () => {
    // El perito lista un golpe y no siempre le pone precio. Obligar a poner
    // uno acabaría con ceros inventados, que es peor que no tener el dato.
    assert.deepEqual(faltaParaApuntarUnDano({ pieza: 'Aleta trasera izquierda' }), []);
  });
});

describe('el importe, tal y como lo teclea alguien', () => {
  test('con euro, con espacios y con coma', () => {
    assert.equal(costeQueSeGuarda('800 €'), 800);
    assert.equal(costeQueSeGuarda('1250,50'), 1250.5);
    assert.equal(costeQueSeGuarda(340), 340);
  });

  test('como lo escribe un Excel español: punto de miles, coma de decimales', () => {
    // Es el formato que sale de una hoja de cálculo de aquí. Leído como lo
    // lee `Number` da NaN, y un NaN aquí no se ve: es una partida sin valorar
    // y un total que va corto justo en las caras.
    assert.equal(costeQueSeGuarda('1.200,00'), 1200);
    assert.equal(costeQueSeGuarda('1.200'), 1200);
    assert.equal(costeQueSeGuarda('12.450,75'), 12450.75);
  });

  test('y como lo escribe uno inglés, que también llega', () => {
    assert.equal(costeQueSeGuarda('1200.50'), 1200.5);
    assert.equal(costeQueSeGuarda('1,200.50'), 1200.5);
  });

  test('lo que no es un número se guarda sin valorar, no a cero', () => {
    // Un cero diría que arreglarlo es gratis. No saberlo es no saberlo.
    assert.equal(costeQueSeGuarda('a consultar'), null);
    assert.equal(costeQueSeGuarda(''), null);
    assert.equal(costeQueSeGuarda(null), null);
    assert.equal(costeQueSeGuarda(-40), null);
  });
});

describe('lo que suman', () => {
  const DANOS = [
    { pieza: 'Paragolpes delantero', coste: 480 },
    { pieza: 'Faro izquierdo', coste: 610.5 },
    { pieza: 'Aleta trasera izquierda', coste: null },
  ];

  test('el total es lo valorado, y lo que falta se cuenta aparte', () => {
    assert.deepEqual(resumenDeDanos(DANOS), { cuantas: 3, total: 1090.5, sinValorar: 1 });
  });

  test('una partida sin valorar no se cuela como cero en el total', () => {
    const sinNada = resumenDeDanos([{ pieza: 'Capó' }]);
    assert.equal(sinNada.total, 0);
    assert.equal(sinNada.sinValorar, 1);
    assert.equal(sinNada.cuantas, 1);
  });

  test('sin partidas, ni total ni cuento', () => {
    assert.deepEqual(resumenDeDanos([]), { cuantas: 0, total: 0, sinValorar: 0 });
  });
});

describe('cómo se cuenta en una línea', () => {
  test('con todo valorado, el importe y las partidas', () => {
    assert.equal(
      comoSeCuenta({ cuantas: 3, total: 1240, sinValorar: 0 }),
      '1240 € en 3 partidas'
    );
  });

  test('si algo va sin valorar, se dice: el total va corto', () => {
    // Quien lee esto está a punto de dar un precio por teléfono.
    assert.equal(
      comoSeCuenta({ cuantas: 5, total: 1240, sinValorar: 2 }),
      '1240 € en 5 partidas, y 2 sin valorar'
    );
  });

  test('y si no hay ninguna valorada, no se enseña un total de cero', () => {
    assert.equal(
      comoSeCuenta({ cuantas: 2, total: 0, sinValorar: 2 }),
      '2 partidas, ninguna valorada'
    );
  });

  test('una partida, en singular', () => {
    assert.equal(comoSeCuenta({ cuantas: 1, total: 300, sinValorar: 0 }), '300 € en 1 partida');
  });

  test('y los miles se separan como aquí, a partir de cinco cifras', () => {
    // Es la convención de es-ES y la del resto del ERP: 1240, pero 12.400.
    assert.equal(comoSeCuenta({ cuantas: 2, total: 12400, sinValorar: 0 }), '12.400 € en 2 partidas');
  });

  test('sin daños, se dice que no hay', () => {
    assert.equal(comoSeCuenta({ cuantas: 0, total: 0, sinValorar: 0 }), 'Sin daños apuntados');
  });
});

describe('lo que se pega de un Excel', () => {
  test('del portapapeles de Excel: columnas con tabulador', () => {
    const { danos, malas } = leeLoPegado(
      [
        'Pieza\tCoste',
        'Paragolpes delantero\t480',
        'Faro izquierdo\t610,50',
        'Aleta trasera izquierda\t',
      ].join('\n')
    );
    assert.deepEqual(malas, []);
    assert.deepEqual(danos, [
      { pieza: 'Paragolpes delantero', coste: 480, notas: null },
      { pieza: 'Faro izquierdo', coste: 610.5, notas: null },
      { pieza: 'Aleta trasera izquierda', coste: null, notas: null },
    ]);
  });

  test('la cabecera del Excel no entra como una partida', () => {
    // Copiar la columna entera se lleva el título dentro. Un «Pieza · 0 €»
    // en la lista de daños es basura que alguien tiene que borrar a mano.
    const { danos } = leeLoPegado('Pieza\tCoste\nCapó\t300');
    assert.equal(danos.length, 1);
    assert.equal(danos[0].pieza, 'Capó');
  });

  test('de un CSV español: punto y coma', () => {
    const { danos } = leeLoPegado('Capó;1.200,00;repintado\nTecho;;solo rayado');
    assert.deepEqual(danos, [
      { pieza: 'Capó', coste: 1200, notas: 'repintado' },
      { pieza: 'Techo', coste: null, notas: 'solo rayado' },
    ]);
  });

  test('escrito a pelo, con el importe detrás', () => {
    const { danos } = leeLoPegado('Faro derecho 480 €\nParagolpes trasero 1250');
    assert.deepEqual(danos, [
      { pieza: 'Faro derecho', coste: 480, notas: null },
      { pieza: 'Paragolpes trasero', coste: 1250, notas: null },
    ]);
  });

  test('«Llanta 18» son pulgadas, no dieciocho euros', () => {
    // Es el error caro de leer sin separador: se cuela en el total y nadie
    // vuelve a mirarlo. Ante la duda, la línea entera es el nombre de la pieza.
    const { danos } = leeLoPegado('Llanta 18');
    assert.deepEqual(danos, [{ pieza: 'Llanta 18', coste: null, notas: null }]);
  });

  test('con tabulador sí, porque ahí no hay duda', () => {
    const { danos } = leeLoPegado('Llanta 18\t90');
    assert.deepEqual(danos, [{ pieza: 'Llanta 18', coste: 90, notas: null }]);
  });

  test('las líneas en blanco se saltan, no son partidas vacías', () => {
    const { danos, malas } = leeLoPegado('\n\nCapó;300\n   \n');
    assert.equal(danos.length, 1);
    assert.deepEqual(malas, []);
  });

  test('una línea sin pieza se devuelve como no entendida, no se tira', () => {
    // Tirarla en silencio es perder una partida del informe sin que se note.
    const { danos, malas } = leeLoPegado(';480\nCapó;300');
    assert.equal(danos.length, 1);
    assert.deepEqual(malas, [';480']);
  });

  test('y lo pegado suma como lo apuntado a mano', () => {
    const { danos } = leeLoPegado('Capó\t480\nTecho\t\nFaro izquierdo\t610,50');
    assert.deepEqual(resumenDeDanos(danos), { cuantas: 3, total: 1090.5, sinValorar: 1 });
  });
});

describe('las partidas habituales', () => {
  test('están las que se repiten, y «Otros» para lo que no', () => {
    assert.ok(PARTIDAS_HABITUALES.includes('Paragolpes delantero'));
    assert.ok(PARTIDAS_HABITUALES.includes('Otros'));
  });

  test('sin repetidas: dos formas de escribir la misma pieza son dos partidas', () => {
    assert.equal(new Set(PARTIDAS_HABITUALES).size, PARTIDAS_HABITUALES.length);
  });
});

describe('el informe de verdad de un perito', () => {
  /**
   * La hoja tal y como la manda AutoCheck: tres columnas —punto, lo que vio y
   * el coste— y once filas, de las que solo dos son daños.
   */
  const HOJA = [
    'PUNTO DE CONTROL\tRESULTADO\tCOSTE ESTIMADO',
    'Identificación\tCoincide con el anuncio.\t0 €',
    'Kilometraje\t128.450 km; coincide.\t0 €',
    'Frenos\tDesgaste moderado.\t0 €',
    'Paragolpes trasero\tPequeños roces superficiales.\t200 €',
    'Aleta delantera derecha\tLigera diferencia de tono; requiere pintura.\t300 €',
    'Llaves\t2 llaves.\t0 €',
  ].join('\n');

  test('el coste es la tercera columna, no la segunda', () => {
    // Leyendo la segunda como importe, el coste se guardaba de nota y todas las
    // partidas quedaban sin valorar: el informe entero se perdía en silencio.
    const { danos } = leeLoPegado(HOJA);
    assert.deepEqual(danos.map((d) => d.coste), [200, 300]);
  });

  test('y lo que observó se guarda de nota', () => {
    const { danos } = leeLoPegado(HOJA);
    assert.equal(danos[0].notas, 'Pequeños roces superficiales.');
  });

  test('los puntos a 0 € no son daños: se cuentan aparte', () => {
    // «Identificación · Coincide con el anuncio · 0 €» es una comprobación
    // pasada. Guardarla diría «500 € en 7 partidas» habiendo dos dañadas.
    const { danos, revisadosSinDano } = leeLoPegado(HOJA);
    assert.equal(danos.length, 2);
    assert.equal(revisadosSinDano, 4);
  });

  test('pero una partida sin valorar sí entra', () => {
    // Un daño que vio y no puso precio no puede desaparecer: es justo el que
    // deja el total corto.
    const { danos, revisadosSinDano } = leeLoPegado('Aleta trasera\tGolpe.\t');
    assert.equal(danos.length, 1);
    assert.equal(danos[0].coste, null);
    assert.equal(revisadosSinDano, 0);
  });

  test('«PUNTO DE CONTROL» tampoco entra como partida', () => {
    assert.ok(!leeLoPegado(HOJA).danos.some((d) => /punto de control/i.test(d.pieza)));
  });

  test('el total sale igual que el suyo', () => {
    // Él escribe «Coste estimado total: 500 €». Si nuestro total no coincide
    // con el de su informe, alguien va a rehacer la suma a mano cada vez.
    const { danos } = leeLoPegado(HOJA);
    assert.equal(comoSeCuenta(resumenDeDanos(danos)), '500 € en 2 partidas');
  });

  test('y si estima en horquilla, se guarda la alta', () => {
    // «150–250 €»: de ahí sale lo que se le cobra al cliente por dejarlo bien,
    // y quedarse corto es comerse la diferencia en el taller.
    const { danos } = leeLoPegado('Paragolpes trasero\tRoces.\t150–250 €');
    assert.equal(danos[0].coste, 250);
  });
});

describe('cuál de las columnas es el dinero', () => {
  test('la de la derecha, aunque en medio haya números', () => {
    // «Kilometraje · 128.450 · 0 €»: leyendo de izquierda a derecha, el primer
    // número que parece un importe son los kilómetros, y esa partida entraría
    // costando ciento veintiocho mil euros. El coste es la última columna que
    // parece dinero, no la primera.
    const { danos, revisadosSinDano } = leeLoPegado([
      'Kilometraje\t128.450\t0 €',
      'Paragolpes trasero\t2 roces\t200 €',
    ].join('\n'));
    assert.equal(revisadosSinDano, 1);
    assert.deepEqual(danos.map((d) => [d.pieza, d.coste]), [['Paragolpes trasero', 200]]);
  });
});
