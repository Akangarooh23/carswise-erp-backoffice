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

describe('las tres preguntas', () => {
  test('si sigue disponible, y va la primera', () => {
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /Ist das Fahrzeug noch verfügbar\?/);
    assert.match(html, /is it still available/);
    assert.ok(
      html.indexOf('noch verfügbar') < html.indexOf('besichtigen'),
      'la disponibilidad va antes que la visita: sin coche no hay nada que ver'
    );
  });

  test('que lo reserve, si lo está', () => {
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /würden wir es gerne reservieren/);
    assert.match(html, /we would like to reserve it/);
  });

  test('y reservar no es pagar: la visita va antes', () => {
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.ok(
      html.indexOf('reservieren') < html.indexOf('bevor wir bezahlen'),
      'la reserva va antes que el «vamos a verlo antes de pagar»'
    );
  });

  test('la dirección exacta y que tenga tiempo para el perito', () => {
    // Son los dos datos con los que se encarga la revisión. Sin pedirlos
    // aquí hay que perseguirlos después, con el coche ya pagado a medias.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /genauen Adresse/);
    assert.match(html, /Zeit für unseren Prüfer/);
    assert.match(html, /at exactly which address/);
    assert.match(html, /make time for our inspector/);
  });

  test('dice tres y son tres, no cuatro', () => {
    // Decía «Drei Fragen» y enumeraba cuatro. Un correo que no sabe contar
    // lo que él mismo pide se contesta a medias.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /Drei Fragen/);
    assert.equal(html.split('<li').length - 1, 3);
  });

  test('cuándo podemos ir a verlo, diciendo que vamos antes de pagar', () => {
    // Que sepa desde el principio que alguien va a ir. Enterarse al final de
    // que hay una visita retrasa la recogida.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.match(html, /besichtigen/);
    assert.match(html, /bevor wir bezahlen/);
    assert.match(html, /before paying/);
  });

});

describe('lo que no dice', () => {
  test('no promete el pago ni dice que el dinero esté esperando', () => {
    // Mientras no haya ido nadie a ver el coche, lo único cierto es que hay un
    // comprador. Prometer el dinero antes de eso es prometer lo que no se sabe.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.ok(!/überwiesen|bezahlt bereits|Geld liegt|already paid/i.test(html));
  });

  test('y no pide datos bancarios: todavía no toca', () => {
    // Un IBAN pedido antes de saber si el coche existe es el hilo por el que
    // entra el fraude de esto: alguien se mete en medio del correo y contesta
    // con otra cuenta. Se pide cuando se va a pagar, y por teléfono.
    const { html } = correoDeReservaAlVendedor(CASO);
    assert.ok(!/IBAN|Kontoinhaber|Verwendungszweck|BIC/.test(html));
    assert.ok(!/account holder|bank details/i.test(html));
  });
});

describe('de qué coche habla', () => {
  test('el coche y su anuncio, con el precio', () => {
    const { subject, html } = correoDeReservaAlVendedor(CASO);
    assert.match(subject, /Kia Sorento/);
    assert.match(html, /autoscout24/);
    assert.match(html, /16\.890,00 EUR/);
  });

  test('sin precio ni anuncio, sigue teniendo sentido', () => {
    const { html } = correoDeReservaAlVendedor({ vehiculo: 'Un coche' });
    assert.match(html, /Un coche/);
    assert.ok(!html.includes('Preis / Price'));
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
