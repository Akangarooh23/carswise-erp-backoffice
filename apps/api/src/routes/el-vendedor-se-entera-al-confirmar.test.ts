/**
 * Al vendedor se le escribe cuando la visita es cierta, y con lo justo.
 *
 * Lo que había: al confirmar una visita en el ERP solo se le escribía al
 * comprador. El dueño del coche —que es quien lo enseña— no recibía nada. El
 * manual decía «al comprador y al vendedor, con el calendario», y no era verdad.
 *
 * Y el único correo que le llegaba salía antes, con la visita todavía
 * pendiente, diciendo «alguien ha reservado» y con el teléfono del comprador.
 * A ese vendedor le prometimos al publicar que filtramos y solo le pasamos las
 * visitas que valen la pena.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { correoAlVendedorDeLaVisita } from './visits.js';

const RESERVA = {
  id: '11111111-1111-1111-1111-111111111111',
  offer_id: 'idcar-veh-1',
  vehicle_title: 'Volkswagen T-Roc',
  // Las 10:00 de Madrid.
  starts_at: '2026-09-21T08:00:00.000Z',
  ends_at: '2026-09-21T09:00:00.000Z',
  buyer_email: 'sergio@example.com',
  buyer_name: 'Sergio',
  seller_email: 'ana@example.com',
};

const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('lo que se le dice al vendedor', () => {
  const c = correoAlVendedorDeLaVisita(RESERVA, 'Calle Mayor 3, Madrid');
  const t = soloTexto(c.html);

  test('qué día, a qué hora, dónde y quién viene', () => {
    assert.match(t, /21 de septiembre/);
    assert.match(t, /10:00/);
    assert.match(t, /Calle Mayor 3/);
    assert.match(t, /Sergio/);
  });

  test('que está confirmada, no pedida', () => {
    // «Alguien ha reservado» con la visita pendiente es lo que había, y le hacía
    // organizarse para algo que nadie había confirmado.
    assert.match(c.subject + t, /confirmada/i);
    assert.doesNotMatch(t, /ha reservado/i);
  });

  test('y ni el teléfono ni el correo de quien viene', () => {
    /*
     * Las llamadas de su anuncio las cogemos nosotros. Pasarle los datos del
     * comprador es saltarse el filtro que le prometimos, y que el día que no
     * llegue a un acuerdo con él tenga su teléfono.
     */
    assert.doesNotMatch(t, /sergio@example\.com/);
    assert.doesNotMatch(t, /Tel[eé]fono/i);
  });

  test('y qué hacer si a esa hora no puede', () => {
    // Si no, el que no puede simplemente no está, y el comprador va para nada.
    assert.match(t, /contesta a este correo/i);
  });
});

describe('y se manda al confirmar', () => {
  const RUTA = readFileSync(join(import.meta.dirname, 'visits.ts'), 'utf8').replace(/\r\n/g, '\n');
  const CONFIRMAR = RUTA.slice(
    RUTA.indexOf("visitsRouter.post('/visit-bookings/:bookingId/confirm'"),
    RUTA.indexOf('visitsRouter.', RUTA.indexOf("visitsRouter.post('/visit-bookings/:bookingId/confirm'") + 20),
  );

  test('la confirmación trae el correo del vendedor', () => {
    // Sin esto en el RETURNING, `reserva.seller_email` es siempre undefined y
    // el correo no sale nunca — sin error.
    assert.match(CONFIRMAR, /RETURNING[^`]*seller_email/);
  });

  test('y se le escribe', () => {
    assert.match(CONFIRMAR, /correoAlVendedorDeLaVisita\(reserva, donde\)/);
    assert.match(CONFIRMAR, /to: reserva\.seller_email/);
  });

  test('solo si el coche es de alguien', () => {
    // En los de concesionario no hay correo de vendedor: a ése se le llama.
    assert.match(CONFIRMAR, /if \(reserva\.seller_email\) \{/);
  });

  test('en su propio intento, aparte del comprador', () => {
    /*
     * Que falle su correo no puede hacer que la pantalla diga que no se avisó al
     * comprador, que sí se avisó. Se cuentan por separado.
     */
    assert.match(CONFIRMAR, /vendedor_avisado: vendedorAvisado/);
    const comprador = CONFIRMAR.indexOf('to: reserva.buyer_email');
    const vendedor = CONFIRMAR.indexOf('to: reserva.seller_email');
    const entreMedias = CONFIRMAR.slice(comprador, vendedor);
    assert.match(entreMedias, /\} catch \(e\) \{/, 'los dos correos van en el mismo try');
  });
});
