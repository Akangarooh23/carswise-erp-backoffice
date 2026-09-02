/**
 * El primer correo al vendedor: si el coche sigue ahí.
 *
 * Es el que puede pararlo todo, y por eso lo que se comprueba aquí es que la
 * pregunta esté y esté la primera. Un anuncio de AutoScout24 sigue publicado
 * días después de que el coche se venda —454 de 484 de los nuestros estaban
 * vendidos desde julio y seguían en pie— y para cuando se manda esto el cliente
 * ya ha transferido veintiún mil euros.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { correoDeReservaAlVendedor, faltaParaLaReserva } from './reserva-al-vendedor.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  anuncio: 'https://www.autoscout24.es/anuncios/kia-sorento-cat_ma39mo1828',
  importe: 16890,
};

describe('las cuatro preguntas', () => {
  test('si sigue disponible, y va la primera', () => {
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /Ist das Fahrzeug noch verfügbar\?/);
    assert.match(html, /is it still available/);
    assert.ok(
      html.indexOf('noch verfügbar') < html.indexOf('ansehen'),
      'la disponibilidad va antes que la visita: sin coche no hay nada que ver'
    );
  });

  test('que lo reserve, y con qué datos le pagamos', () => {
    // De aquí sale el IBAN que luego el ERP exige para dejar soltar el pago:
    // este correo es el principio de esa cadena, no un trámite suelto.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /möchten wir es reservieren/);
    assert.match(html, /IBAN/);
    assert.match(html, /Kontoinhaber/);
    assert.match(html, /Verwendungszweck/);
    assert.match(html, /we would like to reserve it/);
    assert.match(html, /account holder/);
  });

  test('y reservar no es pagar: la visita va antes', () => {
    // Pedir la reserva y los datos de la cuenta en el mismo correo podría
    // leerse como que se paga al recibirlos. Lo que dice es lo contrario.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.ok(
      html.indexOf('reservieren') < html.indexOf('bevor wir bezahlen'),
      'la reserva va antes que el «vamos a verlo antes de pagar»'
    );
  });

  test('cuándo podemos ir a verlo, diciendo que vamos antes de pagar', () => {
    // Que sepa desde el principio que alguien va a ir. Enterarse al final de
    // que hay una visita retrasa la recogida.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /ansehen/);
    assert.match(html, /bevor wir bezahlen/);
  });

  test('y que el coche va a un particular español', () => {
    // Cambia los papeles que tiene que preparar. Descubrirlo el día de la
    // recogida son tres semanas de retraso.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /Privatkunden in Spanien/);
    assert.match(html, /private customer in Spain/);
  });
});

describe('lo que no dice', () => {
  test('no promete el pago ni dice que el dinero esté esperando', () => {
    // Mientras no haya ido nadie a ver el coche, lo único cierto es que hay un
    // comprador. Prometer el dinero antes de eso es prometer lo que no se sabe.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.ok(!/überwiesen|bezahlt bereits|Geld liegt|already paid/i.test(html));
  });
});

describe('de qué coche habla', () => {
  test('el coche y su anuncio, con el precio del anuncio', () => {
    const { subject, html } = correoDeReservaAlVendedor(CASO);
    assert.match(subject, /Kia Sorento/);
    assert.match(html, /autoscout24/);
    assert.match(html, /16\.890,00 EUR/);
  });

  test('sin precio ni anuncio, sigue teniendo sentido', () => {
    const { html } = correoDeReservaAlVendedor({ vehiculo: 'Un coche' });
    assert.match(html, /Un coche/);
    assert.ok(!html.includes('Preis laut Inserat'));
  });

  test('el asunto se entiende en los dos idiomas', () => {
    const { subject } = correoDeReservaAlVendedor(CASO);
    assert.match(subject, /Verfügbarkeit/);
    assert.match(subject, /Still available/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeReservaAlVendedor({ vehiculo: '<b>Un coche</b>' });
    assert.ok(!html.includes('<b>Un coche</b>'));
    assert.match(html, /&lt;b&gt;/);
  });
});

describe('lo que hace falta', () => {
  test('con el coche, basta', () => {
    assert.deepEqual(faltaParaLaReserva(CASO), []);
  });

  test('sin saber qué coche es, no se manda', () => {
    assert.deepEqual(faltaParaLaReserva({ vehiculo: '' }), ['qué coche es']);
    assert.deepEqual(faltaParaLaReserva({ vehiculo: '   ' }), ['qué coche es']);
  });
});
