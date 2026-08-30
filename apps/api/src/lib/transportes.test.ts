/**
 * Traer el coche.
 *
 * Lo que se comprueba: que no se dé por contratado un transporte sin saber quién
 * lo trae y por cuánto, que se sepa cuántos días lleva de viaje, que las fotos
 * de la recogida y de la entrega se echen en falta cuando toca, y que el coste
 * sume todos los tramos.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_TRANSPORTE, QUE_TOCA_TRANSPORTE, INCIDENCIA, FOTOS_RECOGIDA, FOTOS_ENTREGA,
  esEstadoTransporteValido, siguienteEstadoTransporte, puedeContratarse, estaEnCamino,
  fotosQueFaltan, diasEnCamino, costeDelViaje, notaDelCambio,
} from './transportes.js';

describe('el camino de un transporte', () => {
  test('cada estado lleva al siguiente', () => {
    assert.equal(siguienteEstadoTransporte('Por organizar'), 'Contratado');
    assert.equal(siguienteEstadoTransporte('Recogido'), 'En tránsito');
    assert.equal(siguienteEstadoTransporte('En tránsito'), 'Entregado');
  });

  test('entregado es el final', () => {
    assert.equal(siguienteEstadoTransporte('Entregado'), null);
  });

  test('una incidencia existe, pero no avanza', () => {
    assert.ok(esEstadoTransporteValido(INCIDENCIA));
    assert.equal(siguienteEstadoTransporte(INCIDENCIA), null);
  });

  test('cada estado dice qué toca', () => {
    for (const e of ESTADOS_TRANSPORTE) {
      assert.ok(QUE_TOCA_TRANSPORTE[e]?.length > 3, `«${e}» sin decir qué toca`);
    }
  });
});

describe('contratar un transporte', () => {
  test('exige saber quién lo trae', () => {
    assert.equal(puedeContratarse({ transportista: '', coste: 400 }), false,
      'un transporte contratado sin transportista es un coche que nadie ha quedado en recoger');
  });

  test('y por cuánto', () => {
    assert.equal(puedeContratarse({ transportista: 'Transportes Gómez', coste: 0 }), false,
      'sin precio cerrado, la factura que llegue será la que quieran');
    assert.equal(puedeContratarse({ transportista: 'Transportes Gómez' }), false);
  });

  test('con las dos cosas, sí', () => {
    assert.equal(puedeContratarse({ transportista: 'Transportes Gómez', coste: 450 }), true);
  });
});

describe('dónde está el coche', () => {
  test('recogido y en tránsito es que está fuera', () => {
    assert.equal(estaEnCamino('Recogido'), true);
    assert.equal(estaEnCamino('En tránsito'), true);
  });

  test('por organizar o entregado, no', () => {
    assert.equal(estaEnCamino('Por organizar'), false);
    assert.equal(estaEnCamino('Entregado'), false);
  });

  test('se sabe cuántos días lleva de viaje', () => {
    assert.equal(diasEnCamino('2026-08-20T10:00:00Z', new Date('2026-08-30T10:00:00Z')), 10);
    assert.equal(diasEnCamino(null), null);
  });
});

describe('las fotos', () => {
  test('en cuanto lo recogen, hacen falta las de la recogida', () => {
    assert.deepEqual(fotosQueFaltan('Recogido', []), [FOTOS_RECOGIDA]);
    assert.deepEqual(fotosQueFaltan('En tránsito', []), [FOTOS_RECOGIDA]);
  });

  test('al entregarlo hacen falta las dos', () => {
    assert.deepEqual(fotosQueFaltan('Entregado', []), [FOTOS_RECOGIDA, FOTOS_ENTREGA]);
  });

  test('antes de recogerlo no falta ninguna', () => {
    assert.deepEqual(fotosQueFaltan('Por organizar', []), []);
    assert.deepEqual(fotosQueFaltan('Contratado', []), []);
  });

  test('con las dos subidas, ninguna', () => {
    assert.deepEqual(fotosQueFaltan('Entregado', [FOTOS_RECOGIDA, FOTOS_ENTREGA]), []);
  });

  test('da igual cómo se escriban', () => {
    assert.deepEqual(fotosQueFaltan('Recogido', ['  fotos en la recogida ']), []);
  });
});

describe('lo que cuesta traerlo', () => {
  test('suma todos los tramos', () => {
    assert.equal(costeDelViaje([{ coste: 450 }, { coste: 120 }, { coste: '80' }]), 650);
  });

  test('un tramo sin precio no rompe la suma', () => {
    assert.equal(costeDelViaje([{ coste: 450 }, {}, { coste: null }]), 450);
  });

  test('el que acabó con incidencia también cuenta: se pagó igual', () => {
    assert.equal(costeDelViaje([{ coste: 450 }, { coste: 200 }]), 650);
  });
});

describe('la nota de un cambio', () => {
  test('se suma a lo que había', () => {
    const previas = '[29 ago 2026 · Por organizar → Contratado] Transportes Gómez, 450 €';
    const r = notaDelCambio(previas, 'Contratado', 'Recogido', 'Recogido en Múnich', new Date('2026-08-30T10:00:00Z'));
    assert.ok(r.startsWith(previas));
    assert.match(r, /Recogido en Múnich/);
  });
});
