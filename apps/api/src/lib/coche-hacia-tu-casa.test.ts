/**
 * El correo del segundo viaje, el que sí va a su casa.
 *
 * Es el gemelo del de «tu coche ya viene de camino», y dicen cosas contrarias:
 * aquel decía **«no va a tu domicilio todavía»** porque el coche iba a Zaragoza
 * a matricularse, y esa frase le ha sujetado la expectativa varias semanas.
 *
 * Lo que se sostiene aquí es que no se confundan, que no invente fechas, y que
 * pida lo único que hay que pedirle: que esté. La entrega se firma, y un camión
 * que llega a una casa vacía se vuelve con el coche dentro y el viaje se paga
 * igual.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { correoDeCocheHaciaTuCasa } from './coche-hacia-tu-casa.js';

const KIA = {
  nombre: 'Ana',
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  matricula: '1234 KLM',
  destino: 'Calle Mauricio Legendre 45 G2B, 28046, MADRID',
  llegadaEstimada: '2026-09-23',
  conductor: 'Javier Campo',
  telefonoConductor: '+34 673 961 837',
  panel: 'https://popcar.es/panel/solicitudes',
};

describe('lo que lee el cliente', () => {
  test('que ya está matriculado, que es la noticia', () => {
    // Es la parte lenta y la que llevaba semanas bloqueada. Va primero.
    const { html } = correoDeCocheHaciaTuCasa(KIA);
    assert.match(html, /matriculado en España/);
    assert.match(html, /1234 KLM/);
  });

  test('y sin matrícula todavía, no se la inventa', () => {
    const { html } = correoDeCocheHaciaTuCasa({ ...KIA, matricula: null });
    assert.match(html, /matriculado en España/);
    assert.doesNotMatch(html, /con la matrícula/);
  });

  test('a dónde va y qué día llega', () => {
    const { html } = correoDeCocheHaciaTuCasa(KIA);
    assert.match(html, /Mauricio Legendre/);
    assert.match(html, /23 de septiembre de 2026/);
  });

  test('y quién lo lleva, con su teléfono', () => {
    // Va a llamar a su puerta: saber quién es y poder llamarle es la diferencia
    // entre abrir y no abrir.
    const { html } = correoDeCocheHaciaTuCasa(KIA);
    assert.match(html, /Javier Campo · \+34 673 961 837/);
  });

  test('no dice lo contrario que el primero', () => {
    // Aquel decía «no va a tu domicilio todavía». Mandarlo ahora sería negarle
    // lo que está pasando.
    const { html } = correoDeCocheHaciaTuCasa(KIA);
    assert.doesNotMatch(html, /no va a tu domicilio/i);
    assert.doesNotMatch(html, /Zaragoza/);
    assert.match(html, /hacia tu dirección/);
  });

  test('le pide lo único que hay que pedirle: que esté', () => {
    const { html } = correoDeCocheHaciaTuCasa(KIA);
    assert.match(html, /hace falta que estés/);
    assert.match(html, /firmar/);
  });

  test('sin fecha, no se inventa ninguna', () => {
    // Un plazo puesto para rellenar el hueco es la fecha que nos reclaman.
    const { html } = correoDeCocheHaciaTuCasa({ ...KIA, llegadaEstimada: null });
    assert.doesNotMatch(html, /Llega el/);
    assert.match(html, /te llamamos para cerrarlo/);
  });

  test('ni fechas imposibles', () => {
    const { html } = correoDeCocheHaciaTuCasa({ ...KIA, llegadaEstimada: 'lo que sea' });
    assert.doesNotMatch(html, /Invalid Date/);
    assert.doesNotMatch(html, /Llega el/);
  });

  test('y sin conductor, no deja el hueco', () => {
    const { html } = correoDeCocheHaciaTuCasa({ ...KIA, conductor: null, telefonoConductor: null });
    assert.doesNotMatch(html, /Lo lleva/);
  });

  test('el asunto dice qué coche es', () => {
    // Es el tercer correo nuestro que recibe: sin el coche en el asunto, los
    // tres se llaman igual en su bandeja.
    const { subject } = correoDeCocheHaciaTuCasa(KIA);
    assert.match(subject, /sale hacia tu casa/);
    assert.match(subject, /Kia Sorento/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeCocheHaciaTuCasa({ ...KIA, nombre: '<b>Ana</b>' });
    assert.ok(!html.includes('<b>Ana</b>'));
  });
});
