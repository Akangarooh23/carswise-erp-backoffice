/**
 * El correo que le pide al vendedor alemán la factura del coche.
 *
 * Lo que se comprueba aquí es lo único que hace que ese correo sirva: que pide
 * la factura **a nombre del cliente** y que lleva sus tres datos para poder
 * emitirla. Una factura a nombre de PopCar es exactamente la que no vale — con
 * ella los 16.890 € del coche dejan de ser un suplido y pasan a ser ingreso
 * nuestro, con unos 3.500 € de IVA sobre dinero que no es nuestro.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeFacturaAlVendedor, faltaParaPedirLaFactura, direccionEnUnaLinea,
} from './factura-al-vendedor.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  anuncio: 'https://www.autoscout24.es/anuncios/kia-sorento-cat_ma39mo1828',
  pedido: 'PED-2026-001',
  importe: 16890,
  cliente: {
    nombre: 'Ana Picazo Haase',
    nif: '06609510T',
    direccion: 'Calle Mauricio Legendre 45 G2B',
    cp: '28046',
    provincia: 'MADRID',
  },
};

describe('lo que le pedimos al vendedor', () => {
  test('la factura va a nombre del cliente, y se dice en su idioma', () => {
    const { html } = correoDeFacturaAlVendedor(CASO);
    assert.match(html, /Rechnung muss auf den Endkunden ausgestellt werden/);
    assert.match(html, /invoice must be made out to the end customer/);
  });

  test('y se dice que no va a nombre nuestro, que es el error que se comete', () => {
    const { html } = correoDeFacturaAlVendedor(CASO);
    assert.match(html, /nicht auf PopCar/);
    assert.match(html, /not to PopCar/);
  });

  test('con los tres datos para poder emitirla', () => {
    const { html } = correoDeFacturaAlVendedor(CASO);
    assert.match(html, /Ana Picazo Haase/);
    assert.match(html, /06609510T/);
    assert.match(html, /Calle Mauricio Legendre 45 G2B/);
  });

  test('y con de qué coche hablamos', () => {
    // Un concesionario tiene cien coches. Sin el anuncio y la referencia, la
    // petición se queda esperando a que alguien adivine cuál es.
    const { subject, html } = correoDeFacturaAlVendedor(CASO);
    assert.match(subject, /Kia Sorento/);
    assert.match(subject, /PED-2026-001/);
    assert.match(html, /autoscout24/);
    assert.match(html, /16\.890,00 EUR/);
  });

  test('el asunto se entiende en los dos idiomas', () => {
    const { subject } = correoDeFacturaAlVendedor(CASO);
    assert.match(subject, /Rechnung/);
    assert.match(subject, /Invoice/);
  });

  test('sin pedido ni anuncio, sigue saliendo un correo con sentido', () => {
    const { subject, html } = correoDeFacturaAlVendedor({
      vehiculo: 'Un coche', cliente: CASO.cliente,
    });
    assert.match(subject, /Un coche/);
    assert.ok(!subject.includes('()'), 'un paréntesis vacío en el asunto');
    assert.match(html, /Ana Picazo Haase/);
  });

  test('lo que escriba el cliente no se cuela como HTML', () => {
    // El nombre y la dirección los teclea él en su perfil.
    const { html } = correoDeFacturaAlVendedor({
      vehiculo: 'Un coche',
      cliente: { ...CASO.cliente, nombre: '<script>alert(1)</script>' },
    });
    assert.ok(!html.includes('<script>'), 'se ha colado una etiqueta');
    assert.match(html, /&lt;script&gt;/);
  });
});

describe('lo que hace falta antes de pedirla', () => {
  test('con los tres datos, no falta nada', () => {
    assert.deepEqual(faltaParaPedirLaFactura(CASO), []);
  });

  test('sin NIF no se pide: volvería mal hecha', () => {
    assert.deepEqual(
      faltaParaPedirLaFactura({ ...CASO, cliente: { ...CASO.cliente, nif: '' } }),
      ['su NIF']
    );
  });

  test('y si falta todo, se dicen los tres', () => {
    assert.deepEqual(faltaParaPedirLaFactura({ vehiculo: 'X', cliente: {} }), [
      'el nombre del cliente', 'su NIF', 'su dirección',
    ]);
  });

  test('un espacio en blanco no es un dato', () => {
    assert.deepEqual(
      faltaParaPedirLaFactura({ ...CASO, cliente: { ...CASO.cliente, direccion: '   ' } }),
      ['su dirección']
    );
  });
});

describe('que el dinero ya ha salido', () => {
  // Este correo se manda justo después de pagarle. Decirlo cambia lo que es:
  // no un trámite de una compra en curso, sino el papel que falta de una que
  // ya está hecha, y eso se contesta antes.
  test('la transferencia, con su día y su importe, en los dos idiomas', () => {
    const { html } = correoDeFacturaAlVendedor({ ...CASO, pagadoEl: '14.09.2026' });
    assert.match(html, /Die Zahlung ist raus/);
    assert.match(html, /The payment has been made/);
    assert.equal(html.split('14.09.2026').length - 1, 2);
    assert.match(html, /16\.890,00 EUR/);
  });

  test('va delante de la petición, no enterrado al final', () => {
    const { html } = correoDeFacturaAlVendedor({ ...CASO, pagadoEl: '14.09.2026' });
    assert.ok(html.indexOf('Die Zahlung ist raus') < html.indexOf('Die Rechnung muss auf den Endkunden'));
  });

  test('y si todavía no se ha pagado, no se inventa una transferencia', () => {
    // Se puede pedir la factura antes de liberar. Decir que se ha pagado
    // cuando no se ha pagado es una mentira firmada por nosotros.
    const { html } = correoDeFacturaAlVendedor(CASO);
    assert.doesNotMatch(html, /Zahlung ist raus/);
    assert.doesNotMatch(html, /payment has been made/);
    assert.match(html, /Rechnung muss auf den Endkunden/);
  });
});

describe('la dirección, en una línea', () => {
  test('calle, código postal, provincia y el país', () => {
    // El país no es adorno: quien la recibe está en Alemania y su programa de
    // facturación necesita saber que es una venta intracomunitaria.
    assert.equal(
      direccionEnUnaLinea(CASO.cliente),
      'Calle Mauricio Legendre 45 G2B, 28046 MADRID, Spanien'
    );
  });

  test('sin código postal no se queda una coma suelta', () => {
    assert.equal(
      direccionEnUnaLinea({ direccion: 'Calle X', provincia: 'MADRID' }),
      'Calle X, MADRID, Spanien'
    );
  });
});
