import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceAlAnuncio } from './enlace-al-anuncio.js';
import { SITIO_URL } from './marca.js';

// El dominio sale de la marca y no escrito a mano: estaba fijado aqui y la
// prueba caduco sola el dia que la web se mudo, que es tarde para enterarse.

describe('el enlace al anuncio', () => {
  test('completa el que se guardó a medias', () => {
    assert.equal(
      enlaceAlAnuncio('/marketplace-vo/as_6256929c'),
      `${SITIO_URL}/marketplace-vo/as_6256929c`
    );
  });

  test('deja en paz el que ya viene entero', () => {
    const u = `${SITIO_URL}/marketplace-vo/as_1`;
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
    assert.equal(enlaceAlAnuncio('marketplace-vo/as_1'), `${SITIO_URL}/marketplace-vo/as_1`);
  });
});
