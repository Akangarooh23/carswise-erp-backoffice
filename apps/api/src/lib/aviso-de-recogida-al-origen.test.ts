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
} from './aviso-de-recogida-al-origen.js';

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

/**
 * Y el mismo aviso cuando el origen es nuestra propia nave.
 *
 * Una importación hace dos viajes: el primero sale de la nave alemana y el
 * segundo de la nuestra, en Zaragoza. Quien tiene que tener el coche listo y
 * las llaves a mano es entonces nuestra persona de allí, y merece el mismo
 * aviso: que no le espere nadie sale igual de caro tanto si la nave es suya
 * como si es nuestra.
 *
 * Lo que cambia de verdad no es el idioma: es que aquí **no se piden los
 * papeles alemanes**. Para entonces el coche ya lleva matrícula española, y
 * pedirle a un compañero de Zaragoza la Zulassungsbescheinigung Teil II es
 * mandarle a buscar algo que ya no existe.
 */
describe('cuando el origen es nuestra nave', () => {
  const NUESTRO = { ...KIA, aQuien: 'los-nuestros' as const, preguntarPor: 'Marta' };

  test('va en castellano, que es quien lo lee', () => {
    const { subject, html } = correoDeAvisoDeRecogida(NUESTRO);
    assert.match(subject, /Recogida del/);
    assert.match(html, /El transporte está organizado/);
    assert.doesNotMatch(html, /Guten Tag|Abholtermin/);
  });

  test('con el día escrito como lo lee un español', () => {
    // Y con el día de la semana delante: es lo que hace que se lea de un
    // vistazo y que nadie lo confunda con el 9 de abril.
    assert.match(correoDeAvisoDeRecogida(NUESTRO).html, /viernes, 4 de septiembre de 2026/);
  });

  test('y le pide los papeles que sí tiene, no los alemanes', () => {
    const { html } = correoDeAvisoDeRecogida(NUESTRO);
    assert.match(html, /permiso de circulación/i);
    assert.match(html, /ficha técnica/i);
    assert.doesNotMatch(html, /Zulassungsbescheinigung|COC/);
  });

  test('sigue diciendo quién va y por quién pregunta', () => {
    // Es lo que hace que el de la nave sepa a quién esperar y a quién no
    // entregarle un coche.
    const { html } = correoDeAvisoDeRecogida(NUESTRO);
    assert.match(html, /Michael Schneider/);
    assert.match(html, /Marta/);
  });

  test('y al vendedor se le sigue escribiendo en alemán', () => {
    // La bifurcación no puede llevarse por delante el correo de siempre.
    assert.match(correoDeAvisoDeRecogida(KIA).html, /Guten Tag/);
  });
});

/**
 * Y el justificante de baja, que solo se puede pedir aquí.
 *
 * Ese papel no existe cuando se organiza la recogida: la baja se tramita al
 * exportar el coche, o sea después de que salga. Pedirlo antes es pedir algo que
 * nadie puede mandar, y pedirlo después tampoco se puede, porque **este es el
 * último correo que le escribimos al vendedor**.
 *
 * Así que se pide aquí y en futuro: cuando lo dé de baja, que lo mande. No
 * bloquea nada, y por eso llevaba desde el principio en la lista de papeles de
 * una importación sin que ningún correo lo pidiera.
 */
describe('la baja alemana', () => {
  test('se pide, y en futuro', () => {
    const { html } = correoDeAvisoDeRecogida(KIA);
    assert.match(html, /Abmeldebescheinigung/);
    assert.match(html, /Sobald Sie das Fahrzeug zur Ausfuhr abgemeldet haben/);
  });

  test('y el inglés dice lo mismo', () => {
    assert.match(correoDeAvisoDeRecogida(KIA).html, /Once you have deregistered it for export/);
  });

  test('pero no a los nuestros: nuestro depósito no da de baja nada', () => {
    // El segundo viaje sale de nuestra nave con el coche ya matriculado aquí.
    // Pedirle a un compañero de Zaragoza una baja alemana es mandarle a buscar
    // algo que no existe.
    const { html } = correoDeAvisoDeRecogida({ ...KIA, aQuien: 'los-nuestros' });
    assert.doesNotMatch(html, /Abmeldebescheinigung|deregistration/);
  });
});
