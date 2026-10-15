/**
 * Cómo se llama un papel cuando ya está guardado.
 *
 * Lo destapó el primer Carfax de verdad: se guardó como
 * `Peritaci%C3%B3n%20Oficial.pdf` —el nombre codificado con el que lo dejó el
 * navegador— y así se quedó. Sin papel y sin matrícula delante, cinco papeles
 * de un coche no se distinguen sin abrirlos uno a uno.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  comoSeLlama, comoLoEscribioUnaPersona, diceAlgo, laExtension, comoSeEscribe, yaEsNuestro,
  comoSeDice,
} from './como-se-llama-el-papel.js';

describe('el nombre que se guarda', () => {
  test('el papel, la matrícula y el original detrás', () => {
    assert.equal(
      comoSeLlama({ papel: 'Informe de la revisión', matricula: '5228HNS', original: 'Peritacion Oficial.pdf' }),
      'Informe de la revisión · 5228HNS — Peritacion Oficial.pdf',
    );
  });

  test('y si el original no dice nada, no se arrastra', () => {
    /*
     * `scan_0007.jpg` detrás no informa de nada: alarga la línea y empuja
     * fuera lo que sí importa. La extensión sí se queda, que es lo que hace
     * que el navegador sepa abrirlo.
     */
    assert.equal(
      comoSeLlama({ papel: 'Fotos de los daños', matricula: '5228HNS', original: 'scan_0007.jpg' }),
      'Fotos de los daños · 5228HNS.jpg',
    );
  });

  test('sin matrícula, el papel solo', () => {
    // Los expedientes de importación no tienen matrícula española todavía, y
    // poner la alemana en una lista de aquí confunde más de lo que ayuda.
    assert.equal(
      comoSeLlama({ papel: 'Factura del vendedor alemán', original: 'rechnung 1823.pdf' }),
      'Factura del vendedor alemán — rechnung 1823.pdf',
    );
  });

  test('y sin papel elegido, el nombre del fichero', () => {
    // Inventarse una etiqueta sería peor que no poner ninguna: diría que es
    // algo que nadie ha comprobado que sea.
    assert.equal(comoSeLlama({ matricula: '5228HNS', original: 'lo que sea.pdf' }), 'lo que sea.pdf');
  });
});

describe('el nombre codificado del navegador', () => {
  test('se deshace: es lo que escribió una persona', () => {
    /*
     * Es exactamente lo que pasó con el Carfax. El fichero llega del disco ya
     * así, y sin deshacerlo se queda así para siempre en la lista.
     */
    assert.equal(comoLoEscribioUnaPersona('Peritaci%C3%B3n%20Oficial.pdf'), 'Peritación Oficial.pdf');
  });

  test('pero un porcentaje de verdad no se toca', () => {
    // «descuento 50%.pdf» no está codificado, y decodificarlo revienta. Lo
    // que vale entonces es el nombre de partida, no un error.
    assert.equal(comoLoEscribioUnaPersona('descuento 50%.pdf'), 'descuento 50%.pdf');
    assert.equal(comoLoEscribioUnaPersona('100% garantizado.pdf'), '100% garantizado.pdf');
  });

  test('y un nombre normal se queda igual', () => {
    assert.equal(comoLoEscribioUnaPersona('Informe de octubre.pdf'), 'Informe de octubre.pdf');
  });
});

describe('cuándo el original aporta algo', () => {
  test('las palabras sí', () => {
    assert.equal(diceAlgo('Rechnung_Transport_TRP-2026-002.pdf'), true);
    assert.equal(diceAlgo('Informe de octubre.pdf'), true);
  });

  test('los nombres que pone el sistema, no', () => {
    for (const n of ['scan_0007.jpg', 'IMG_2841.jpg', 'documento (1).pdf', 'foto.png', '20261014.pdf']) {
      assert.equal(diceAlgo(n), false, `«${n}» no dice nada y se está arrastrando`);
    }
  });
});

describe('las piezas sueltas', () => {
  test('la extensión se respeta, y un punto en medio no lo es', () => {
    assert.equal(laExtension('algo.PDF'), '.pdf');
    assert.equal(laExtension('factura 26.001 del taller'), '');
    assert.equal(laExtension('sinpunto'), '');
  });

  test('la matrícula, sin espacios ni guiones', () => {
    assert.equal(comoSeEscribe(' 5228-hns '), '5228HNS');
  });

  test('y lo nuestro se reconoce, para no ponerlo dos veces', () => {
    /*
     * Al volver a guardar, la pantalla devuelve el documento con el nombre
     * que ya le pusimos. Sin esto acabaría en «Carfax · 5228HNS — Carfax ·
     * 5228HNS — …» una vez por guardado.
     */
    assert.equal(yaEsNuestro('Informe de la revisión · 5228HNS — x.pdf', 'Informe de la revisión'), true);
    assert.equal(
      comoSeLlama({
        papel: 'Informe de la revisión', matricula: '5228HNS',
        original: 'Informe de la revisión · 5228HNS — x.pdf',
      }),
      'Informe de la revisión · 5228HNS — x.pdf',
    );
  });

  test('pero el papel del cliente que empieza igual no se toma por nuestro', () => {
    // «ITV _ 2026.04.27.pdf» empieza por «ITV» y lo trajo él: es lo único que
    // distingue ese papel de los otros dos suyos.
    assert.equal(yaEsNuestro('ITV _ 2026.04.27.pdf', 'ITV'), false);
  });
});

describe('las claves de máquina y las etiquetas', () => {
  /*
   * El `papel` viene de dos sitios: desde el ERP lo elige una persona en un
   * desplegable y ya es legible; desde PopCar lo pone el código al recibir lo
   * que sube el cliente, y es una clave.
   *
   * Lo descubrí probando el renombrado sobre los cuatro documentos que ya
   * había: tres salían peor de lo que estaban.
   */
  test('una clave se dice por su nombre', () => {
    assert.equal(
      comoSeLlama({ papel: 'mandato_firmado', matricula: '5228HNS', original: 'scan_1.pdf' }),
      'Mandato firmado · 5228HNS.pdf',
    );
  });

  test('y lo ya nombrado con OTRA etiqueta nuestra no se vuelve a prefijar', () => {
    /*
     * La cláusula del precio llegó de PopCar como «Documento · …» porque allí
     * esa clave no estaba traducida. Mirando solo su etiqueta, se prefijaría
     * otra vez: «Precio de salida firmado · 5228HNS — Documento · 5228HNS — …».
     */
    const yaPuesto = 'Documento · 5228HNS — precio-firmado.docx';
    assert.equal(yaEsNuestro(yaPuesto, 'clausula_precio_firmada'), true);
    assert.equal(
      comoSeLlama({ papel: 'clausula_precio_firmada', matricula: '5228HNS', original: yaPuesto }),
      yaPuesto,
    );
  });

  test('pero el papel del cliente que empieza por una etiqueta sigue siendo suyo', () => {
    // Hace falta el patrón entero: la etiqueta y detrás algo nuestro.
    assert.equal(yaEsNuestro('Seguro 2026 renovado.pdf', 'itv'), false);
    assert.equal(yaEsNuestro('ITV _ 2026.04.27.pdf', 'mandato_firmado'), false);
  });
});
