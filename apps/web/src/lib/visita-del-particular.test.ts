/**
 * Una visita al coche de un particular la contesta él, no la Agenda.
 *
 * Lo que se protege: que el número rojo del menú no se encienda por trabajo
 * que no es nuestro, y que se vuelva a encender si el vendedor no contesta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nosTocaContestarla, laConfirmaElVendedor, horasSinContestar, HORAS_PARA_QUE_CONTESTE } from './visita-del-particular.js';

const AHORA = new Date('2026-09-17T12:00:00Z');
const hace = (h: number) => new Date(AHORA.getTime() - h * 3600000).toISOString();

describe('de quién es una visita pendiente', () => {
  test('la de un concesionario, nuestra desde el primer minuto', () => {
    assert.equal(nosTocaContestarla({ status: 'pending', la_confirma_el_vendedor: false, created_at: hace(0) }, AHORA), true);
  });

  test('la de un particular recién pedida, suya', () => {
    assert.equal(nosTocaContestarla({ status: 'pending', la_confirma_el_vendedor: true, created_at: hace(2) }, AHORA), false);
  });

  test('pero si lleva un día sin contestar, vuelve a ser nuestra', () => {
    assert.equal(HORAS_PARA_QUE_CONTESTE, 24);
    assert.equal(nosTocaContestarla({ status: 'pending', la_confirma_el_vendedor: true, created_at: hace(23) }, AHORA), false);
    assert.equal(nosTocaContestarla({ status: 'pending', la_confirma_el_vendedor: true, created_at: hace(24) }, AHORA), true);
  });

  test('sin saber desde cuándo espera, nuestra', () => {
    assert.equal(nosTocaContestarla({ status: 'pending', la_confirma_el_vendedor: true, created_at: null }, AHORA), true);
  });

  test('una confirmada no es de nadie', () => {
    assert.equal(nosTocaContestarla({ status: 'confirmed', la_confirma_el_vendedor: false }, AHORA), false);
  });

  test('y se cuentan las horas', () => {
    assert.equal(horasSinContestar({ created_at: hace(5) }, AHORA), 5);
    assert.equal(laConfirmaElVendedor({ la_confirma_el_vendedor: true }), true);
  });
});

describe('el mismo número en todas partes', () => {
  test('el servidor cuenta con la misma regla de 24 horas', () => {
    const DASH = readFileSync(join(import.meta.dirname, '..', '..', '..', 'api', 'src', 'routes', 'dashboard.ts'), 'utf8');
    assert.match(DASH, /b\.seller_email IS NOT NULL AND b\.offer_id LIKE 'idcar-%'\s*AND b\.created_at > NOW\(\) - INTERVAL '24 hours'/);
  });

  test('el menú y la Agenda usan la regla, no la lista entera', () => {
    const MENU = readFileSync(join(import.meta.dirname, '..', 'components', 'layout', 'AppLayout.tsx'), 'utf8');
    assert.match(MENU, /nosTocaContestarla/);
    const AGENDA = readFileSync(join(import.meta.dirname, '..', 'pages', 'BookingsPage.tsx'), 'utf8');
    assert.match(AGENDA, /nosTocaContestarla/);
  });
});
