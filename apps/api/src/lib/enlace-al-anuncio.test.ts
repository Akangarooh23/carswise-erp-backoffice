import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceAlAnuncio } from './enlace-al-anuncio.js';
import { config } from '../config.js';

const SITIO = config.PUBLIC_SITE_URL.replace(/\/+$/, '');

describe('el enlace al anuncio que va en el correo', () => {
  test('completa el que se guardó a medias', () => {
    assert.equal(enlaceAlAnuncio('/marketplace-vo/as_1'), `${SITIO}/marketplace-vo/as_1`);
  });

  test('deja en paz el que ya viene entero', () => {
    const u = 'https://www.popcar.tech/marketplace-vo/as_1';
    assert.equal(enlaceAlAnuncio(u), u);
  });

  test('sin enlace no hay botón', () => {
    assert.equal(enlaceAlAnuncio(''), null);
    assert.equal(enlaceAlAnuncio(null), null);
    assert.equal(enlaceAlAnuncio(undefined), null);
  });

  test('lo que no es una dirección web no se abre', () => {
    assert.equal(enlaceAlAnuncio('javascript:alert(1)'), null);
  });
});
