/**
 * La vista previa y el correo dicen lo mismo sobre los adjuntos.
 *
 * Están duplicados —los dos lados se compilan por separado—, así que lo que hay
 * que sostener es que **producen la misma frase**. Si un día uno de los dos
 * dejara de traducir «Factura del vendedor alemán», la pantalla enseñaría un
 * correo que no es el que sale, y revisar dejaría de valer para nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { lineaDeAdjuntos, comoSeLlama, type PapelAdjunto } from './lo-que-va-adjunto.js';
import {
  lineaDeAdjuntos as lineaDeLaApi,
  comoSeLlama as comoLoLlamaLaApi,
} from '../../../api/src/lib/lo-que-va-adjunto.js';

const FACTURA: PapelAdjunto = { nombre: 'rechnung_4471.pdf', papel: 'Factura del vendedor alemán' };
const COC: PapelAdjunto = { nombre: 'coc.pdf', papel: 'COC (certificado de conformidad)' };
const SUELTO: PapelAdjunto = { nombre: 'escaneado.pdf', papel: '' };

describe('lo que se dice que va', () => {
  test('un papel marcado se nombra por lo que es, no por el fichero', () => {
    // «rechnung_4471.pdf» no le dice nada a nadie. El nombre del fichero va
    // detrás porque es lo que verá en su buzón y tiene que emparejarlos.
    const linea = lineaDeAdjuntos([FACTURA], 'de');
    assert.match(linea, /Kaufrechnung \(rechnung_4471\.pdf\)/);
    assert.match(linea, /Anhang:/);
  });

  test('y al alemán se le dice en alemán, con su inglés debajo', () => {
    // El correo ya sale en dos idiomas: una línea suelta en español dentro es
    // justo la que se salta.
    const linea = lineaDeAdjuntos([FACTURA, COC], 'de');
    assert.match(linea, /Kaufrechnung/);
    assert.match(linea, /Übereinstimmungsbescheinigung/);
    assert.match(linea, /purchase invoice/);
    assert.ok(!linea.includes('Factura del vendedor alemán'));
  });

  test('al transportista y a la gestoría, en español', () => {
    const linea = lineaDeAdjuntos([FACTURA], 'es');
    assert.match(linea, /Se adjunta:/);
    assert.match(linea, /Factura del vendedor alemán \(rechnung_4471\.pdf\)/);
    assert.ok(!linea.includes('Kaufrechnung'));
  });

  test('sin nada marcado no se dice nada', () => {
    // «Adjuntos: ninguno» es ruido, y peor: hace dudar de si se perdió algo.
    assert.equal(lineaDeAdjuntos([], 'de'), '');
    assert.equal(lineaDeAdjuntos([], 'es'), '');
  });

  test('un papel sin clasificar sale con su nombre de fichero', () => {
    // Es lo único que se sabe de él. «Un documento» sería decir menos.
    assert.equal(comoSeLlama(SUELTO, 'de'), 'escaneado.pdf');
    assert.match(lineaDeAdjuntos([SUELTO], 'es'), /escaneado\.pdf/);
  });

  test('y lo que llegue con el nombre en blanco no cuenta', () => {
    assert.equal(lineaDeAdjuntos([{ nombre: '  ', papel: 'Factura' }], 'es'), '');
  });

  test('el nombre de un fichero no puede meter etiquetas en el correo', () => {
    const linea = lineaDeAdjuntos([{ nombre: '<script>x</script>.pdf', papel: '' }], 'es');
    assert.ok(!linea.includes('<script>'));
    assert.match(linea, /&lt;script&gt;/);
  });
});

describe('la pantalla y el correo, la misma frase', () => {
  const CASOS: PapelAdjunto[][] = [
    [FACTURA],
    [FACTURA, COC],
    [SUELTO],
    [],
    [{ nombre: 'brief.pdf', papel: 'Ficha del vehículo (parte II)' }],
    [{ nombre: 'x.pdf', papel: 'Un papel que no está en la lista' }],
  ];

  for (const idioma of ['de', 'es'] as const) {
    test(`en ${idioma}, digan lo que digan`, () => {
      for (const caso of CASOS) {
        assert.equal(lineaDeAdjuntos(caso, idioma), lineaDeLaApi(caso, idioma));
        for (const p of caso) assert.equal(comoSeLlama(p, idioma), comoLoLlamaLaApi(p, idioma));
      }
    });
  }
});
