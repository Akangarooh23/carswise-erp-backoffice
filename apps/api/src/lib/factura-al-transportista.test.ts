/**
 * Pedirle al transportista su factura.
 *
 * No bloquea nada, y por eso se olvida: el coche llegó, el tramo está cerrado y
 * nadie espera ese papel para poder seguir. Pero 890 € que no llegan al coste
 * del coche hacen que el margen salga mejor de lo que es, y cuando la factura
 * aparece ya se han sacado cuentas con un número que no era.
 *
 * Lo que se sostiene: que la petición diga **de qué viaje habla** —una empresa
 * con cuarenta portes al mes no sabe cuál es «el del Kia»— y que cite **lo
 * acordado**, porque una factura que no coincide se descubre al pagarla y hay
 * que rehacerla.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeFacturaAlTransportista, faltaParaPedirLaFactura,
} from './factura-al-transportista.js';

const VIAJE = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  matricula: '8181APH',
  desde: 'Musterstraße 18, 80331 München',
  hasta: 'Avenida Cataluña 103, 50014 Zaragoza',
  cuando: '03/09/2026',
  importe: 890,
  referencia: 'TRP-2026-001',
  paraFacturas: 'facturas@popcar.tech',
};

describe('lo que lleva la petición', () => {
  test('de qué viaje habla', () => {
    const { html } = correoDeFacturaAlTransportista(VIAJE);
    assert.match(html, /Kia Sorento/);
    assert.match(html, /München/);
    assert.match(html, /Zaragoza/);
    assert.match(html, /03\/09\/2026/);
  });

  test('y lo acordado, que lo dijeron ellos', () => {
    // Una factura que no coincide con lo acordado se descubre al pagarla, y
    // entonces hay que rehacerla.
    assert.match(correoDeFacturaAlTransportista(VIAJE).html, /890,00 €/);
  });

  test('sin precio cerrado no se cita ninguno', () => {
    // Citar un importe que no se acordó es invitarles a discutirlo ahora.
    const { html } = correoDeFacturaAlTransportista({ ...VIAJE, importe: null });
    assert.doesNotMatch(html, /Precio acordado/);
  });

  test('la referencia va en el asunto: es como la van a buscar', () => {
    const { subject } = correoDeFacturaAlTransportista(VIAJE);
    assert.match(subject, /TRP-2026-001/);
    assert.match(subject, /8181APH/);
  });

  test('a nombre nuestro, dicho con todas las letras', () => {
    // Es lo contrario que la factura del coche, que va a nombre del cliente.
    assert.match(correoDeFacturaAlTransportista(VIAJE).html, /PopCar/);
  });

  test('y a dónde mandarla', () => {
    assert.match(correoDeFacturaAlTransportista(VIAJE).html, /facturas@popcar\.tech/);
  });

  test('un coche sin matricular se dice, no se deja en blanco', () => {
    const { html } = correoDeFacturaAlTransportista({ ...VIAJE, matricula: null });
    assert.match(html, /sin matrícula todavía/);
  });

  test('en los tres idiomas', () => {
    // El primer viaje lo hace muchas veces una empresa alemana o del este que
    // trabaja en inglés: una petición que no se entiende se queda sin contestar.
    assert.match(correoDeFacturaAlTransportista(VIAJE, 'de').html, /Ihre Rechnung/);
    assert.match(correoDeFacturaAlTransportista(VIAJE, 'en').html, /your invoice/);
    assert.match(correoDeFacturaAlTransportista(VIAJE, 'es').html, /vuestra factura/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeFacturaAlTransportista({ ...VIAJE, desde: '<b>München</b>' });
    assert.ok(!html.includes('<b>München</b>'));
  });
});

describe('lo que impide pedirla', () => {
  test('con coche y referencia, se puede', () => {
    assert.deepEqual(faltaParaPedirLaFactura(VIAJE), []);
  });

  test('sin referencia no: es lo que ellos pueden citar', () => {
    assert.deepEqual(
      faltaParaPedirLaFactura({ ...VIAJE, referencia: '' }),
      ['nuestra referencia del tramo']
    );
  });

  test('y sin coche tampoco', () => {
    assert.deepEqual(
      faltaParaPedirLaFactura({ vehiculo: '', referencia: 'TRP-1' }),
      ['qué coche es']
    );
  });
});
