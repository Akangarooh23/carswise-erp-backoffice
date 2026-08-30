import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceAlAnuncio } from './enlace-al-anuncio.js';

describe('el enlace al anuncio', () => {
  test('completa el que se guardó a medias', () => {
    assert.equal(
      enlaceAlAnuncio('/marketplace-vo/as_6256929c'),
      'https://www.popcar.tech/marketplace-vo/as_6256929c'
    );
  });

  test('deja en paz el que ya viene entero', () => {
    const u = 'https://www.popcar.tech/marketplace-vo/as_1';
    assert.equal(enlaceAlAnuncio(u), u);
  });

  test('sin enlace no hay enlace', () => {
    assert.equal(enlaceAlAnuncio(''), null);
    assert.equal(enlaceAlAnuncio(undefined), null);
    assert.equal(enlaceAlAnuncio(null), null);
    assert.equal(enlaceAlAnuncio('   '), null);
  });

  test('lo que no es una dirección web no se abre', () => {
    assert.equal(enlaceAlAnuncio('javascript:alert(1)'), null);
    assert.equal(enlaceAlAnuncio('mailto:hola@popcar.tech'), null);
  });

  test('sin barra delante también', () => {
    assert.equal(enlaceAlAnuncio('marketplace-vo/as_1'), 'https://www.popcar.tech/marketplace-vo/as_1');
  });
});
