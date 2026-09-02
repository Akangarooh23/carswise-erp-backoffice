/**
 * Las peritaciones: la única promesa de este negocio, con nombre y fecha.
 *
 * «No se le paga al vendedor hasta que uno de los nuestros ve el coche» era una
 * casilla. Lo que se fija aquí es lo que hace que deje de serlo: que solo un
 * veredicto abre la puerta al pago, y que al perito se le dice exactamente qué
 * mirar — «revísalo» devuelve «está bien».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeEncargoAlPerito, faltaParaEncargarLaRevision,
  abreLaPuertaAlPago, esVeredicto, esEstadoPeritacion,
  ESTADOS_PERITACION, QUE_MIRA_EL_PERITO,
} from './peritaciones.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  anuncio: 'https://www.autoscout24.es/anuncios/kia-sorento-cat_ma39mo1828',
  donde: 'Landsberger Str. 120, 80339 München',
  contacto: 'Herr Kaufmann · +49 89 123456',
};

describe('quién puede soltar el dinero', () => {
  test('solo el veredicto bueno abre la puerta', () => {
    assert.equal(abreLaPuertaAlPago('es_el_que_se_anuncio'), true);
    assert.equal(abreLaPuertaAlPago('no_es_el_que_se_anuncio'), false);
  });

  test('y nada que no sea un veredicto', () => {
    // Un campo vacío, un «sí» suelto o lo que mande un navegador no valen: de
    // esto depende que salgan 16.890 € hacia Alemania.
    for (const x of ['', 'sí', 'ok', null, undefined, true, 1, {}]) {
      assert.equal(abreLaPuertaAlPago(x), false, `ha colado: ${JSON.stringify(x)}`);
      assert.equal(esVeredicto(x), false);
    }
  });

  test('los dos veredictos son los que hay', () => {
    assert.equal(esVeredicto('es_el_que_se_anuncio'), true);
    assert.equal(esVeredicto('no_es_el_que_se_anuncio'), true);
  });
});

describe('por dónde pasa una peritación', () => {
  test('tres estados y ninguno más', () => {
    assert.deepEqual([...ESTADOS_PERITACION], ['Por encargar', 'Encargada', 'Hecha']);
  });

  test('y no hay «cancelada»', () => {
    // Si el coche no era el que se anunció, eso es el resultado y se guarda.
    // Borrarla escondería el único momento en que este sistema dijo que no.
    assert.equal(esEstadoPeritacion('Cancelada'), false);
    assert.equal(esEstadoPeritacion('Hecha'), true);
  });
});

describe('el encargo al perito', () => {
  test('dice qué mirar, punto por punto', () => {
    // «Revísalo» devuelve «está bien».
    const { html } = correoDeEncargoAlPerito(CASO);
    for (const punto of QUE_MIRA_EL_PERITO) {
      assert.ok(html.includes(punto.slice(0, 30)), `falta: ${punto}`);
    }
  });

  test('y lo que de verdad hay que comprobar va el primero', () => {
    // Que sea el coche del anuncio. Todo lo demás es sobre ese coche.
    assert.match(QUE_MIRA_EL_PERITO[0], /Que es el coche del anuncio/);
  });

  test('le dice que puede parar la operación', () => {
    // Un perito que cree que solo puede confirmar, confirma.
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.match(html, /no sale hasta que nos digas que es el coche que se anunció/);
    assert.match(html, /no pasa nada por parar/);
  });

  test('con dónde está y por quién preguntar', () => {
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.match(html, /Landsberger Str\. 120/);
    assert.match(html, /Herr Kaufmann/);
  });

  test('sin dirección todavía, se dice; no se deja el hueco', () => {
    const { html } = correoDeEncargoAlPerito({ vehiculo: 'Un coche' });
    assert.match(html, /todavía no lo tenemos/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeEncargoAlPerito({ vehiculo: '<b>Un coche</b>' });
    assert.ok(!html.includes('<b>Un coche</b>'));
  });

  test('sin saber qué coche es, no se manda', () => {
    assert.deepEqual(faltaParaEncargarLaRevision({ vehiculo: '  ' }), ['qué coche es']);
    assert.deepEqual(faltaParaEncargarLaRevision(CASO), []);
  });
});
