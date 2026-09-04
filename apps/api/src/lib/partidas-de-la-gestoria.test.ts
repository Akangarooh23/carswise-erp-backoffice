/**
 * Lo que factura la gestoría, partida a partida.
 *
 * Lo que se sostiene aquí es una cuenta: de lo que cobra una gestoría por
 * matricular un coche de fuera, la mayor parte **no es suya**. Contado como
 * gasto nuestro, el coche parece costar mil setecientos euros más de lo que
 * cuesta, y el margen sale mal en todos.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTIDAS_HABITUALES, queEsPorDefecto, importeQueVale,
  resumenDeLaGestoria, comoSeCuenta, leeLoPegado, type Partida,
} from './partidas-de-la-gestoria.js';

const FACTURA: Partida[] = [
  { concepto: 'Impuesto de matriculación', importe: '1420.00', que: 'suplido' },
  { concepto: 'Tasa DGT', importe: '99.77', que: 'suplido' },
  { concepto: 'ITV de homologación', importe: 145, que: 'suplido' },
  { concepto: 'Honorarios de la gestoría', importe: 90, que: 'nuestro' },
];

describe('lo que es de terceros y lo que es suyo', () => {
  test('se separan, que es para lo que existe esto', () => {
    const r = resumenDeLaGestoria(FACTURA);
    assert.equal(r.cuantas, 4);
    assert.equal(r.total, 1754.77);
    assert.equal(r.suplidos, 1664.77);
    assert.equal(r.honorarios, 90);
  });

  /*
   * Y con el IVA, que son dos preguntas distintas.
   *
   * `honorarios` es lo que sale del banco; `honorariosBase` lo que cuesta el
   * coche, porque el IVA de los honorarios se deduce. Con una sola cifra, o el
   * pago o el margen salen mal.
   */
  test('lo suyo, con IVA y sin IVA', () => {
    const conDesglose = [
      ...FACTURA.filter((p) => p.que !== 'nuestro'),
      { concepto: 'Honorarios de la gestoría', base: 74.38, iva: 21, importe: 90, que: 'nuestro' as const },
    ];
    const r = resumenDeLaGestoria(conDesglose);
    assert.equal(r.honorarios, 90);
    assert.equal(r.honorariosBase, 74.38);
    assert.equal(r.iva, 15.62);
    assert.equal(r.sinDesglosar, 0, 'los suplidos exentos sí se saben: van al 0 %');
  });

  test('y sin desglose se dice, en vez de suponerle un 21 %', () => {
    // Un 21 % encima de unos honorarios que ya lo llevaban dentro no da un
    // error visible: da una cifra plausible y equivocada.
    const r = resumenDeLaGestoria([
      { concepto: 'Honorarios de la gestoría', importe: 90, que: 'nuestro' as const },
    ]);
    assert.equal(r.honorariosBase, 90, 'sin saber el IVA, cuenta entera como base');
    assert.equal(r.iva, 0);
    assert.equal(r.sinDesglosar, 1);
    assert.match(comoSeCuenta(r), /no dice su IVA/);
  });

  test('y se dice, porque un total suelto parece coste nuestro', () => {
    const dice = comoSeCuenta(resumenDeLaGestoria(FACTURA));
    assert.match(dice, /664,77 € de suplidos/);
    assert.match(dice, /del cliente/);
  });

  test('sin partidas no se inventa una cuenta', () => {
    const r = resumenDeLaGestoria([]);
    assert.equal(r.cuantas, 0);
    assert.equal(r.total, 0);
    assert.equal(r.honorarios, 0);
    assert.equal(comoSeCuenta(resumenDeLaGestoria(null)), 'Sin partidas todavía.');
  });

  test('una partida sin nombre no cuenta', () => {
    // Una fila a medio escribir no puede sumar al total del coche.
    assert.equal(resumenDeLaGestoria([{ concepto: '  ', importe: 500 }]).cuantas, 0);
  });

  test('y los céntimos no se van en decimales de más', () => {
    // Sumar en coma flotante deja 1754.7700000000002, y eso acaba impreso.
    const r = resumenDeLaGestoria([
      { concepto: 'Uno', importe: 0.1 }, { concepto: 'Dos', importe: 0.2 },
    ]);
    assert.equal(r.total, 0.3);
  });
});

describe('de quién es cada partida', () => {
  test('las habituales lo saben solas', () => {
    assert.equal(queEsPorDefecto('Impuesto de matriculación'), 'suplido');
    assert.equal(queEsPorDefecto('Tasa DGT'), 'suplido');
    assert.equal(queEsPorDefecto('Honorarios de la gestoría'), 'nuestro');
  });

  test('lo que suena a su trabajo es suyo', () => {
    assert.equal(queEsPorDefecto('Minuta'), 'nuestro');
    assert.equal(queEsPorDefecto('Gestión del expediente'), 'nuestro');
    assert.equal(queEsPorDefecto('Tramitación'), 'nuestro');
  });

  test('y lo que no se reconoce se supone suplido', () => {
    // Es lo que más hay, y equivocarse al revés infla el coste del coche.
    assert.equal(queEsPorDefecto('Sello del ayuntamiento'), 'suplido');
  });

  test('la lista trae lo que sale casi siempre', () => {
    const conceptos = PARTIDAS_HABITUALES.map((p) => p.concepto);
    assert.ok(conceptos.includes('Impuesto de matriculación'));
    assert.ok(conceptos.includes('Tasa DGT'));
    assert.ok(conceptos.includes('Honorarios de la gestoría'));
  });
});

describe('los importes, vengan como vengan', () => {
  test('«1.420,00 €» son mil cuatrocientos veinte', () => {
    // De un Excel pegado llegan con punto de millar y coma decimal.
    assert.equal(importeQueVale('1.420,00 €'), 1420);
    assert.equal(importeQueVale('99,77'), 99.77);
    assert.equal(importeQueVale('145'), 145);
  });

  test('y de Postgres llegan como texto', () => {
    assert.equal(importeQueVale('1420.00'), 1420);
  });

  test('lo que no es un número vale cero, no rompe', () => {
    assert.equal(importeQueVale('a convenir'), 0);
    assert.equal(importeQueVale(null), 0);
    assert.equal(importeQueVale(''), 0);
  });
});

describe('pegar la factura de la gestoría', () => {
  test('sale entera, con lo que es cada una', () => {
    const { partidas } = leeLoPegado([
      'Impuesto de matriculación\t1.420,00',
      'Tasa DGT\t99,77',
      'ITV de homologación\t145,00',
      'Honorarios de la gestoría\t90,00',
    ].join('\n'));
    assert.equal(partidas.length, 4);
    assert.equal(partidas[0].importe, 1420);
    assert.equal(partidas[0].que, 'suplido');
    assert.equal(partidas[3].que, 'nuestro');
  });

  test('el importe es la última columna que parece dinero', () => {
    // Las facturas traen columnas de por medio: código, base, IVA.
    const { partidas } = leeLoPegado('IMP-01\tImpuesto de matriculación\t1.420,00');
    assert.equal(partidas[0].importe, 1420);
    assert.match(partidas[0].concepto, /Impuesto de matriculación/);
  });

  test('la línea del total no entra como partida', () => {
    // Metida, duplica la factura entera.
    const { partidas } = leeLoPegado('Tasa DGT\t99,77\nTOTAL\t1.754,77');
    assert.equal(partidas.length, 1);
  });

  test('ni las cabeceras', () => {
    const { partidas } = leeLoPegado('Concepto\tImporte\nTasa DGT\t99,77');
    assert.equal(partidas.length, 1);
  });

  test('lo que no se entiende se dice, no se descarta en silencio', () => {
    // Una línea perdida en silencio es una partida que falta y nadie sabe.
    const { partidas, malas } = leeLoPegado('Tasa DGT\t99,77\nalgo raro sin importe');
    assert.equal(partidas.length, 1);
    assert.deepEqual(malas, ['algo raro sin importe']);
  });

  test('y un pegado vacío no revienta', () => {
    assert.deepEqual(leeLoPegado(''), { partidas: [], malas: [] });
    assert.deepEqual(leeLoPegado('   \n  '), { partidas: [], malas: [] });
  });

  test('acepta punto y coma y espacios, que es como sale de otras hojas', () => {
    assert.equal(leeLoPegado('Tasa DGT;99,77').partidas.length, 1);
    assert.equal(leeLoPegado('Tasa DGT   99,77').partidas.length, 1);
  });
});

describe('las columnas de en medio de una factura', () => {
  test('no se quedan pegadas al nombre', () => {
    // La factura de una gestoría trae base, IVA y cantidad entre el concepto y
    // el total. Arrastradas, dejaban partidas llamadas «Placas 16,5 0,21»: el
    // nombre es lo que se lee en el tablero y lo que se reconoce para saber si
    // es suplido, y con la basura detrás no se reconoce ninguna.
    const { partidas } = leeLoPegado('Placas	16,5	0,21	19,96');
    assert.equal(partidas[0].concepto, 'Placas');
    assert.equal(partidas[0].importe, 19.96);
  });

  test('y una partida conocida se sigue reconociendo', () => {
    const { partidas } = leeLoPegado('Honorarios de la gestoría	74,38	0,21	90,00');
    assert.equal(partidas[0].concepto, 'Honorarios de la gestoría');
    assert.equal(partidas[0].que, 'nuestro');
  });

  test('un nombre con número dentro no se rompe', () => {
    // «Envío kit 14h» es el nombre, no una columna.
    const { partidas } = leeLoPegado('Envío kit concesionario 14h	12,10');
    assert.match(partidas[0].concepto, /Env[íi]o kit concesionario/);
    assert.equal(partidas[0].importe, 12.1);
  });
});

/**
 * Y lo pegado trae ya el desglose, si la factura lo trae.
 *
 * Una factura de gestoría viene «Concepto · base · %IVA · total». Antes se
 * tiraban las dos columnas de en medio y había que teclear el desglose a mano,
 * línea a línea, mirando el mismo papel del que se acababa de copiar. Ocho
 * líneas tecleadas dos veces es donde se cuela un cero.
 *
 * Solo si cuadran: base por el tipo tiene que dar el total al céntimo. Si no
 * cuadra, esas columnas eran otra cosa —una cantidad, un código— y quedarse con
 * ellas sería inventarse un desglose que la factura no dice.
 */
describe('lo pegado con base e IVA', () => {
  test('se queda con las tres columnas cuando cuadran', () => {
    const { partidas } = leeLoPegado('Honorarios\t74,38\t21\t90,00');
    assert.equal(partidas.length, 1);
    assert.equal(partidas[0].base, 74.38);
    assert.equal(partidas[0].iva, 21);
    assert.equal(partidas[0].importe, 90);
  });

  test('y si no cuadran, se queda solo con el total', () => {
    // «2» ahí era una cantidad, no una base. Un desglose inventado es peor que
    // no tener desglose: parece un dato.
    const { partidas } = leeLoPegado('Placas\t2\t19,97');
    assert.equal(partidas[0].importe, 19.97);
    assert.equal(partidas[0].base, undefined);
    assert.equal(partidas[0].iva, undefined);
  });

  test('un suplido pegado sale exento, que es lo que es', () => {
    const { partidas } = leeLoPegado('Tasa DGT\t99,77');
    assert.equal(partidas[0].que, 'suplido');
    assert.equal(partidas[0].regimen, 'exento');
  });

  test('y el concepto sigue saliendo limpio', () => {
    // Arrastrar las columnas de en medio dejaba partidas llamadas
    // «Placas 16,5 0,21», y con ese nombre no se reconoce si es suplido.
    const { partidas } = leeLoPegado('Impuesto de matriculación\t1420,00\t0\t1420,00');
    assert.equal(partidas[0].concepto, 'Impuesto de matriculación');
    assert.equal(partidas[0].que, 'suplido');
  });

  test('una factura entera, con sus dos formas de línea', () => {
    const { partidas } = leeLoPegado([
      'Tasa DGT\t99,77',
      'Honorarios\t74,38\t21\t90,00',
    ].join('\n'));
    const r = resumenDeLaGestoria(partidas);
    assert.equal(r.total, 189.77);
    assert.equal(r.suplidos, 99.77);
    assert.equal(r.honorarios, 90);
    assert.equal(r.honorariosBase, 74.38);
    assert.equal(r.sinDesglosar, 0);
  });
});

/**
 * Y aguanta lo que llegue de la base.
 *
 * De Postgres viene un array, pero no siempre: una columna JSONB leída por otro
 * camino llega como texto, y una fila vieja puede traer null. Un `.filter` sobre
 * eso revienta la ficha entera del pedido —lo hizo— y un coste que no se puede
 * ver es peor que un coste a cero.
 */
describe('lo que llegue de la base', () => {
  test('un array, lo normal', () => {
    assert.equal(resumenDeLaGestoria([{ concepto: 'Tasa DGT', importe: 99.77 }]).total, 99.77);
  });

  test('el mismo array como texto', () => {
    const r = resumenDeLaGestoria(JSON.stringify([{ concepto: 'Tasa DGT', importe: 99.77 }]));
    assert.equal(r.total, 99.77);
    assert.equal(r.suplidos, 99.77);
  });

  test('un texto que no es JSON no revienta', () => {
    assert.equal(resumenDeLaGestoria('lo que sea').cuantas, 0);
  });

  test('ni nada de lo que pueda venir en una fila vieja', () => {
    assert.equal(resumenDeLaGestoria(null).cuantas, 0);
    assert.equal(resumenDeLaGestoria(undefined).cuantas, 0);
    assert.equal(resumenDeLaGestoria('{}' as unknown as string).cuantas, 0);
  });
});
