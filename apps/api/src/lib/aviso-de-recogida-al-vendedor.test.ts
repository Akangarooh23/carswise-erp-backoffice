/**
 * Avisar al vendedor de quién va a por el coche y qué día.
 *
 * Lo que importa de este correo es que el vendedor pueda **preparar el coche y
 * reconocer a quien llegue**. Un conductor que se planta en una nave donde
 * nadie le espera se va vacío, y ese viaje se paga igual.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeAvisoDeRecogida, faltaParaAvisarDeLaRecogida,
} from './aviso-de-recogida-al-vendedor.js';

const KIA = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  referencia: 'TRP-2026-001',
  pedido: 'PED-2026-001',
  cuando: '2026-09-04',
  transportista: 'TransLog Fahrzeugtransporte GmbH',
  contacto: 'Michael Schneider',
  telefono: '+49 711 00000000',
  preguntarPor: 'Daniel Weber',
};

describe('lo que tiene que leer el vendedor', () => {
  test('el día, con su día de la semana y en cifras alemanas', () => {
    // «09/04» lo lee un alemán como el 9 de abril, y el día de la semana es lo
    // que hace que se lea de un vistazo.
    assert.match(correoDeAvisoDeRecogida(KIA).html, /Freitag, 04\.09\.2026/);
  });

  test('la empresa y quién le va a llamar', () => {
    const { html } = correoDeAvisoDeRecogida(KIA);
    assert.match(html, /TransLog Fahrzeugtransporte GmbH/);
    assert.match(html, /Michael Schneider · \+49 711 00000000/);
  });

  test('y por quién va a preguntar el conductor, que lo dijo él mismo', () => {
    // Con el nombre delante, el vendedor puede negarse a entregar un coche de
    // dieciséis mil euros a quien no toca. Es lo que queremos que haga.
    assert.match(correoDeAvisoDeRecogida(KIA).html, /Daniel Weber/);
  });

  test('los cuatro papeles, otra vez', () => {
    // Ya los confirmó al contestar, pero eso fue en otro correo y hace días. La
    // Teil II que no se mete en el sobre no se echa en falta hasta Zaragoza.
    const { html } = correoDeAvisoDeRecogida(KIA);
    assert.match(html, /Zulassungsbescheinigung Teil I/);
    assert.match(html, /Zulassungsbescheinigung Teil II/);
    assert.match(html, /COC/);
    assert.match(html, /Fahrzeugschlüssel/);
  });

  test('y se le pide que confirme, no solo se le informa', () => {
    // Un aviso sin acuse es un aviso que puede no haberse leído, y eso se
    // descubre con el camión en la puerta.
    assert.match(correoDeAvisoDeRecogida(KIA).html, /Bitte bestätigen Sie/);
  });

  test('en alemán con su inglés debajo, como los demás', () => {
    const { html } = correoDeAvisoDeRecogida(KIA);
    assert.match(html, /Guten Tag,/);
    assert.match(html, /Friday, 4 September 2026/);
    assert.match(html, /registration parts I and II/);
  });

  test('el asunto lleva nuestro pedido, que es el número que él conoce', () => {
    assert.match(correoDeAvisoDeRecogida(KIA).subject, /PED-2026-001/);
  });

  test('sin contacto del transportista sale igual, sin la fila vacía', () => {
    // Que no nos hayan dado un nombre no es motivo para no avisarle del día.
    const { html } = correoDeAvisoDeRecogida({ ...KIA, contacto: null, telefono: null });
    assert.match(html, /TransLog/);
    assert.ok(!html.includes('Kontakt / Contact'));
  });
});

describe('lo que impide avisarle', () => {
  test('sin día no hay nada que decir', () => {
    assert.deepEqual(
      faltaParaAvisarDeLaRecogida({ ...KIA, cuando: '' }),
      ['cerrar el día de la recogida']
    );
  });

  test('ni sin transportista', () => {
    assert.deepEqual(
      faltaParaAvisarDeLaRecogida({ ...KIA, transportista: '  ' }),
      ['saber quién lo trae']
    );
  });

  test('ni sin decir quién va a ir', () => {
    // Con la empresa sola, el aviso dice que irá alguien de una empresa algún
    // día. El de la nave tiene que saber a quién esperar y a quién darle las
    // llaves; si no, el conductor se planta allí y le piden que espere.
    assert.deepEqual(
      faltaParaAvisarDeLaRecogida({ ...KIA, contacto: '' }),
      ['el nombre de quien va a ir']
    );
  });

  test('con lo del Kia, no falta nada', () => {
    assert.deepEqual(faltaParaAvisarDeLaRecogida(KIA), []);
  });
});
