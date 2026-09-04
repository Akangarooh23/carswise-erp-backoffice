/**
 * Preguntarle al vendedor dónde y cuándo se recoge el coche.
 *
 * El tramo dice «München → Zaragoza» porque la ciudad es lo único que trae el
 * anuncio. Un transportista no va a una ciudad: va a una calle, un día, a una
 * hora y preguntando por alguien. Sin las cuatro respuestas de este correo, la
 * orden que se le manda al camión sale con media dirección.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { correoDeDatosDeRecogida, faltaParaPedirLaRecogida } from './datos-de-recogida.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  pedido: 'PED-2026-001',
  ciudad: 'München',
};

describe('las cinco cosas que se preguntan', () => {
  test('la dirección exacta, no la ciudad', () => {
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /Genaue Abholadresse/);
    assert.match(html, /Straße, Hausnummer und PLZ/);
    assert.match(html, /exact pick-up address/);
  });

  test('qué día y a qué hora se puede recoger', () => {
    // «Cuando quieran» no sirve para contratar a nadie: un transportista
    // necesita un día. Y si de verdad es flexible, el horario de la nave.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /An welchem Tag und zu welcher Uhrzeit/);
    assert.match(html, /Öffnungszeiten/);
    assert.match(html, /which day and time/);
  });

  test('y si puede entrar un camión portacoches', () => {
    // Un portacoches lleva ocho y sale a un tercio por coche; una grúa
    // individual cuesta lo que cuesta. Si el coche está en un sótano o en una
    // calle estrecha, el camión no entra — y eso se descubre con el conductor
    // en la puerta, que es cuando ya se paga igual.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /Autotransporter/);
    assert.match(html, /Tiefgarage/);
    assert.match(html, /car-carrier truck can reach the vehicle/);
  });

  test('por quién pregunta el conductor, con teléfono', () => {
    // Sin un nombre en la puerta, el conductor llega y llama aquí.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /Ansprechpartner und Telefonnummer/);
    assert.match(html, /Der Fahrer fragt nach ihm/);
  });

  test('y qué se lleva con el coche, con los papeles por su nombre', () => {
    // Un coche que sale de Alemania sin la Zulassungsbescheinigung II no se
    // puede matricular aquí, y eso se descubre con el coche ya en Zaragoza.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /Zulassungsbescheinigung Teil I und II/);
    assert.match(html, /COC/);
    assert.match(html, /Schlüssel/);
  });
});

describe('de qué coche habla', () => {
  test('el coche, el pedido y la ciudad que tenemos', () => {
    const { subject, html } = correoDeDatosDeRecogida(CASO);
    assert.match(subject, /Kia Sorento/);
    assert.match(subject, /PED-2026-001/);
    assert.match(html, /München/);
  });

  test('la matrícula solo si la hay', () => {
    assert.ok(!correoDeDatosDeRecogida(CASO).html.includes('Kennzeichen'));
    assert.match(correoDeDatosDeRecogida({ ...CASO, matricula: 'M-AW 1234' }).html, /M-AW 1234/);
  });

  test('el asunto se entiende en los dos idiomas', () => {
    const { subject } = correoDeDatosDeRecogida(CASO);
    assert.match(subject, /Abholung/);
    assert.match(subject, /Pick-up/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeDatosDeRecogida({ vehiculo: '<b>Un coche</b>' });
    assert.ok(!html.includes('<b>Un coche</b>'));
    assert.match(html, /&lt;b&gt;/);
  });
});

describe('lo que hace falta para mandarlo', () => {
  test('con el coche, basta', () => {
    assert.deepEqual(faltaParaPedirLaRecogida(CASO), []);
  });

  test('sin saber qué coche es, no', () => {
    assert.deepEqual(faltaParaPedirLaRecogida({ vehiculo: '  ' }), ['qué coche es']);
  });
});

/**
 * Y los tres papeles que el ERP esperaba y nadie pedía nunca.
 *
 * El contrato de compraventa y el justificante de baja estaban en la lista de lo
 * que hay que reunir de una importación; el libro de mantenimiento, en la de lo
 * que se le entrega al cliente. Ninguno de los tres salía en ningún correo del
 * ERP: se quedaban esperando a que alguien se acordara de pedirlos por su
 * cuenta, que es otra forma de decir que no llegaban.
 *
 * Ninguno bloquea nada, y por eso mismo hay que pedirlos aquí: lo que no se pide
 * en el correo que ya se manda no se pide nunca.
 */
/**
 * Y el libro de mantenimiento, que va aquí y no en otro correo.
 *
 * Es un papel físico que viaja en la guantera: si no sale del concesionario
 * alemán con el coche, ya no sale. Por eso va en la lista de lo que se lleva el
 * conductor y no en una petición por correo, que es donde van el contrato y la
 * baja.
 *
 * Estaba en la lista de lo que se le entrega al cliente y no salía en ningún
 * correo del ERP: esperaba a que alguien se acordara de pedirlo por su cuenta.
 */
describe('el libro de mantenimiento', () => {
  test('viaja con el coche, en la lista del conductor', () => {
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.match(html, /Serviceheft/);
    assert.match(html, /service book/);
  });

  test('y aquí no se piden el contrato ni la baja', () => {
    // El contrato va con la factura —son los dos papeles de la misma compra
    // cerrada— y la baja en el aviso de recogida, porque hasta que el coche no
    // sale no existe.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.doesNotMatch(html, /Kaufvertrag/);
    assert.doesNotMatch(html, /Abmeldebescheinigung/);
  });

  test('la cuenta de lo que se pide cuadra con lo que se pregunta', () => {
    // «Cinco cosas» seguido de seis puntos hace dudar de las seis.
    const { html } = correoDeDatosDeRecogida(CASO);
    assert.equal((html.match(/<li /g) ?? []).length, 5);
    assert.match(html, /fünf Angaben/);
    assert.match(html, /We need five things/);
  });
});
