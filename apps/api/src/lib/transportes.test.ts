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
  mueveElExpediente, aQueEtapaLoLleva, deQueEtapaSale,
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

describe('el expediente se mueve con el coche', () => {
  const TRAMO = { tramo: 1, lead_id: 'imp-1' };

  test('recogido o en tránsito: el coche va de camino', () => {
    // Es el mismo hecho dicho una vez. Tenerlo que repetir en Importaciones es
    // como se llega a un cliente que ve «verificado y pagado» en su panel con
    // el coche cruzando Francia.
    assert.equal(mueveElExpediente(TRAMO, 'Recogido'), true);
    assert.equal(mueveElExpediente(TRAMO, 'En tránsito'), true);
  });

  test('contratado todavía no: nadie se lo ha llevado', () => {
    assert.equal(mueveElExpediente(TRAMO, 'Contratado'), false);
    assert.equal(mueveElExpediente(TRAMO, 'Por organizar'), false);
  });

  test('entregado en Zaragoza lo lleva a trámites', () => {
    // Colgaba de que alguien moviera la etapa a mano, y de esa etapa cuelgan
    // los tres papeleos de la gestoría y el segundo tramo: un coche podía
    // pasarse una semana aquí sin que nadie hubiera empezado a matricularlo.
    assert.equal(mueveElExpediente(TRAMO, 'Entregado'), true);
    assert.equal(aQueEtapaLoLleva(TRAMO, 'Entregado'), 'En trámites');
  });

  test('y recogido lo lleva a «En transporte», que es otra etapa', () => {
    assert.equal(aQueEtapaLoLleva(TRAMO, 'Recogido'), 'En transporte');
    assert.equal(aQueEtapaLoLleva(TRAMO, 'En tránsito'), 'En transporte');
  });

  test('cada salto sale de la etapa anterior, y de ninguna otra', () => {
    // Es lo que impide saltarse una etapa o retroceder si alguien vuelve a
    // tocar el tramo de un coche que ya está entregado.
    assert.equal(deQueEtapaSale('En transporte'), 'Verificado y pagado');
    assert.equal(deQueEtapaSale('En trámites'), 'En transporte');
  });

  test('el segundo tramo devuelve el coche a «En transporte» al salir', () => {
    // Cargado en Zaragoza para llevárselo al cliente, el coche vuelve a estar
    // en transporte: los papeleos ya están hechos y decir «en trámites» es
    // contar lo de antes.
    assert.equal(aQueEtapaLoLleva({ ...TRAMO, tramo: 2 }, 'Recogido'), 'En transporte');
    assert.equal(aQueEtapaLoLleva({ ...TRAMO, tramo: 2 }, 'En tránsito'), 'En transporte');
  });

  test('pero su entrega no la mueve nadie', () => {
    // Es un acto con firma, y con una garantía que empieza a contar ese día.
    assert.equal(aQueEtapaLoLleva({ ...TRAMO, tramo: 2 }, 'Entregado'), null);
  });

  test('y ese salto sale de «En trámites», no de donde salió el primero', () => {
    // El mismo destino viene de sitios distintos según el viaje. Sin esa
    // distinción, el segundo salto no encontraba ninguna fila que mover.
    assert.equal(deQueEtapaSale('En transporte', 1), 'Verificado y pagado');
    assert.equal(deQueEtapaSale('En transporte', 2), 'En trámites');
  });

  test('los dos viajes mueven la etapa, cada uno a la suya', () => {
    // El primero saca el coche de Alemania; el segundo lo saca de Zaragoza
    // hacia el cliente, y entonces vuelve a estar en transporte.
    assert.equal(mueveElExpediente({ ...TRAMO, tramo: 1 }, 'Recogido'), true);
    assert.equal(mueveElExpediente({ ...TRAMO, tramo: 2 }, 'Recogido'), true);
  });

  test('y un tramo sin expediente no mueve nada', () => {
    assert.equal(mueveElExpediente({ tramo: 1, lead_id: null }, 'Recogido'), false);
    assert.equal(mueveElExpediente({ tramo: 1, lead_id: '  ' }, 'Recogido'), false);
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
