/**
 * De qué es cada factura de cliente.
 *
 * Las tres —suscripción, informe de mercado y servicio de importación— comparten
 * tabla, así que hay que distinguirlas al leerlas. Y no da igual: un servicio de
 * importación son 3.000 € que estaban entrando en el contador de
 * **suscripciones**, que es la cifra que dice cuánto ingresa PopCar por cuotas.
 * Con dos importaciones al mes, esa tarjeta decía el triple de lo que es.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tipoDeFactura } from './billing.js';

describe('de qué es cada factura', () => {
  test('una importación se reconoce por el identificador', () => {
    // Lo emite el flujo del depósito como `srv-imp-…`. Se mira eso y no solo el
    // texto porque la descripción la escribe quien emite y puede cambiar; el
    // identificador, no.
    assert.equal(
      tipoDeFactura('srv-imp-1788287946414-97mlu', 'Servicio de importación · Kia Sorento'),
      'importacion'
    );
    assert.equal(tipoDeFactura('srv-imp-1', ''), 'importacion');
  });

  test('y también por el texto, si el identificador fuera otro', () => {
    assert.equal(tipoDeFactura('lo-que-sea', 'Servicio de importación · Kia Sorento'), 'importacion');
  });

  test('un informe de mercado sigue siendo un informe', () => {
    assert.equal(tipoDeFactura('cs_test_x', 'Informe de Valor de Mercado'), 'tasacion');
    assert.equal(tipoDeFactura('in_1', 'Tasación de un Golf'), 'tasacion');
  });

  test('y lo demás, una suscripción', () => {
    assert.equal(tipoDeFactura('in_1TvJCbQj1tCRE159YTNwvlku', 'Plan Plus'), 'suscripcion');
    assert.equal(tipoDeFactura('', ''), 'suscripcion');
  });

  test('una importación no cae en suscripción por llevar la palabra plan dentro', () => {
    // El coche puede llamarse cualquier cosa. Manda el identificador.
    assert.equal(
      tipoDeFactura('srv-imp-2', 'Servicio de importación · Renault Scenic Plan B'),
      'importacion'
    );
  });

  test('lo que no es texto no rompe la cuenta', () => {
    assert.equal(tipoDeFactura(null, null), 'suscripcion');
    assert.equal(tipoDeFactura(undefined, undefined), 'suscripcion');
    assert.equal(tipoDeFactura(42, 7), 'suscripcion');
  });
});
