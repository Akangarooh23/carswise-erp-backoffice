/**
 * El correo que le pide al perito su factura.
 *
 * Este correo existe porque **nadie lo está esperando**: el pago al vendedor se
 * libera con el veredicto, no con esta factura, así que si nadie la reclama no
 * pasa nada… hasta que se cierran las cuentas del coche y faltan 289 €.
 *
 * Lo que se comprueba aquí es lo que hace que vuelva bien a la primera: de qué
 * revisión hablamos, lo que se acordó, y a nombre de quién va.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { correoDeFacturaAlPerito, faltaParaPedirleLaFactura } from './factura-al-perito.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  cuando: '07/09/2026',
  donde: 'Landsberger Str. 180, 80687 München',
  importe: 289,
  referencia: 'PER-2026-001',
  paraFacturas: 'facturas@popcar.tech',
};

describe('de qué revisión hablamos', () => {
  test('el coche, el día y el sitio', () => {
    // Un perito con quince inspecciones esa semana no sabe cuál es «la del Kia».
    const { html } = correoDeFacturaAlPerito(CASO);
    assert.match(html, /Kia Sorento/);
    assert.match(html, /07\/09\/2026/);
    assert.match(html, /Landsberger Str\. 180/);
  });

  test('y nuestra referencia, para que pueda ponerla', () => {
    assert.match(correoDeFacturaAlPerito(CASO).html, /PER-2026-001/);
  });

  test('con el importe que él mismo dio al confirmar', () => {
    // Una factura que no coincide con lo acordado se descubre al pagarla, y
    // entonces hay que rehacerla.
    assert.match(correoDeFacturaAlPerito(CASO).html, /289,00 EUR/);
  });
});

describe('a nombre de quién va', () => {
  test('a PopCar, y se dice que no al cliente', () => {
    // Es lo contrario que la factura del coche, que va a nombre del cliente.
    // El peritaje es un gasto nuestro, no dinero pagado en nombre de nadie.
    const { html } = correoDeFacturaAlPerito(CASO);
    assert.match(html, /auf PopCar/);
    assert.match(html, /nicht auf den Endkunden/);
    assert.match(html, /to PopCar/);
    assert.match(html, /not to the end customer/);
  });

  test('y a dónde mandarla', () => {
    assert.match(correoDeFacturaAlPerito(CASO).html, /facturas@popcar\.tech/);
  });

  test('sin dirección de facturas, no se deja la frase coja', () => {
    const { html } = correoDeFacturaAlPerito({ ...CASO, paraFacturas: null });
    assert.doesNotMatch(html, /Schicken Sie sie einfach an/);
    assert.match(html, /auf PopCar/);
  });
});

describe('lo demás', () => {
  test('va en alemán, con el inglés debajo', () => {
    const { subject, html } = correoDeFacturaAlPerito(CASO);
    assert.match(subject, /Rechnung für die Fahrzeugprüfung/);
    assert.match(subject, /Invoice for the inspection/);
    assert.match(html, /Guten Tag/);
    assert.match(html, /thank you for the inspection report/);
  });

  test('sin saber qué coche es, no se manda', () => {
    assert.deepEqual(faltaParaPedirleLaFactura({ vehiculo: '  ' }), ['qué coche es']);
    assert.deepEqual(faltaParaPedirleLaFactura(CASO), []);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeFacturaAlPerito({ vehiculo: '<b>x</b>' });
    assert.ok(!html.includes('<b>x</b>'));
  });
});
