/**
 * El camino de un coche de importación.
 *
 * Lo que se sostiene aquí es la distinción que hace que esto sirva: **de quién
 * depende cada cosa**. «Ya se lo he pedido al perito y falta que confirme» no
 * es una tarea mía; «no se lo he pedido» sí. El número rojo del menú cuenta
 * solo lo segundo, porque un contador que incluye esperas nunca baja y un
 * número que nunca baja se deja de mirar.
 *
 * Y que las esperas vencen: a los tres días sin respuesta, esperar se convierte
 * en reclamar. Sin eso, «esperando» es donde los expedientes se quedan a morir.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { Expediente } from './expedientes-importacion.js';
import {
  pasosDeLaImportacion, loQueToca, loQueSeEspera, loQueFaltaAparte, pideAlgoNuestro,
  pendientesPorPantalla, PLAZOS,
} from './pasos-de-la-importacion.js';

const HOY = new Date('2026-09-10T12:00:00Z');

/** El Kia, tal y como está en cada momento. */
function kia(meta: Record<string, unknown>, status = 'Depósito retenido'): Expediente {
  return {
    id: 'imp-1',
    user_email: 'ana@popcar.tech',
    title: 'Kia Sorento 2.4 GDI AWD',
    status,
    created_at: '2026-09-01T10:00:00Z',
    meta: meta as Expediente['meta'],
  };
}

const paso = (x: Expediente, clave: string) =>
  pasosDeLaImportacion(x, HOY).find((p) => p.clave === clave)!;

describe('el orden del camino', () => {
  test('con el depósito dentro, lo que toca es preguntarle al vendedor', () => {
    const x = kia({ deposit_paid_at: '2026-09-09T10:00:00Z' });
    assert.equal(loQueToca(pasosDeLaImportacion(x, HOY))?.clave, 'disponible');
  });

  test('sin depósito no toca nada nuestro: se espera al cliente', () => {
    const x = kia({});
    assert.equal(loQueToca(pasosDeLaImportacion(x, HOY)), null);
    assert.equal(paso(x, 'deposito').estado, 'esperando');
    assert.equal(pideAlgoNuestro(x, HOY), false);
  });

  test('lo que aún no se puede hacer no se ofrece', () => {
    const x = kia({ deposit_paid_at: '2026-09-09T10:00:00Z' });
    assert.equal(paso(x, 'encargo').estado, 'porVenir');
    assert.equal(paso(x, 'liberar').estado, 'porVenir');
  });
});

describe('de quién depende, que es lo que decide si es tarea mía', () => {
  const CONTESTO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Por encargar', veredicto: null, perito: 'checkdenwagen',
      fecha_hecha: null, donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-12',
      hora_prevista: '10:00',
    },
  };

  test('con su respuesta apuntada, toca encargarle la revisión al perito', () => {
    assert.equal(loQueToca(pasosDeLaImportacion(kia(CONTESTO), HOY))?.clave, 'encargo');
  });

  test('mandado el encargo, ya no es tarea mía: se espera al perito', () => {
    const x = kia({
      ...CONTESTO,
      peritacion: { ...CONTESTO.peritacion, encargo_enviado_at: '2026-09-09T10:00:00Z' },
    });
    assert.equal(paso(x, 'confirma').estado, 'esperando');
    assert.equal(loQueToca(pasosDeLaImportacion(x, HOY)), null);
    assert.equal(pideAlgoNuestro(x, HOY), false);
    assert.equal(loQueSeEspera(pasosDeLaImportacion(x, HOY))?.clave, 'confirma');
  });

  test('y cuando confirma y dice el precio, vuelve a tocarme a mí', () => {
    // Confirmar y decir lo que cobra vienen en la misma respuesta: por eso el
    // coste sirve para saber que ha contestado.
    const x = kia({
      ...CONTESTO,
      peritacion: {
        ...CONTESTO.peritacion,
        encargo_enviado_at: '2026-09-09T10:00:00Z', coste: 289,
      },
    });
    assert.equal(paso(x, 'confirma').estado, 'hecho');
    assert.equal(loQueToca(pasosDeLaImportacion(x, HOY))?.clave, 'cita');
  });

  test('un coste de cero no es haber confirmado', () => {
    // Se guardaba 0,00 € cuando el campo estaba en blanco. Si eso contara como
    // respuesta, el paso se daría por hecho sin que nadie haya dicho nada.
    const x = kia({
      ...CONTESTO,
      peritacion: { ...CONTESTO.peritacion, encargo_enviado_at: '2026-09-09T10:00:00Z', coste: null },
    });
    assert.equal(paso(x, 'confirma').estado, 'esperando');
  });
});

describe('las esperas vencen', () => {
  test('a los tres días sin confirmar, deja de ser espera y hay que reclamar', () => {
    const viejo = new Date(HOY.getTime() - (PLAZOS.perito + 1) * 86400000).toISOString();
    const x = kia({
      deposit_paid_at: '2026-09-01T10:00:00Z',
      reserva_preguntada_at: '2026-09-02T10:00:00Z',
      peritacion: {
        id: 'PER-2026-001', estado: 'Encargada', veredicto: null, perito: 'checkdenwagen',
        fecha_hecha: null, donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-20',
        encargo_enviado_at: viejo,
      },
    });
    const p = paso(x, 'confirma');
    assert.equal(p.estado, 'toca');
    assert.match(p.titulo, /Reclamarle al perito/);
    assert.equal(pideAlgoNuestro(x, HOY), true);
  });

  test('y el vendedor que no contesta si el coche sigue ahí, igual', () => {
    const viejo = new Date(HOY.getTime() - (PLAZOS.vendedor + 1) * 86400000).toISOString();
    const x = kia({ deposit_paid_at: '2026-09-01T10:00:00Z', reserva_preguntada_at: viejo });
    assert.match(paso(x, 'respuesta').titulo, /Reclamarle al vendedor/);
    assert.equal(paso(x, 'respuesta').estado, 'toca');
  });

  test('dentro de plazo, no se molesta a nadie', () => {
    const ayer = new Date(HOY.getTime() - 86400000).toISOString();
    const x = kia({ deposit_paid_at: '2026-09-01T10:00:00Z', reserva_preguntada_at: ayer });
    assert.equal(paso(x, 'respuesta').estado, 'esperando');
    assert.equal(paso(x, 'respuesta').dias, 1);
  });
});

describe('cuando el coche no era el que se anunció', () => {
  const NO_ERA = kia({
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'no_es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-08T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07',
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
      coste: 289,
    },
  });

  test('el camino se acaba ahí: lo que toca es devolver el dinero', () => {
    assert.equal(loQueToca(pasosDeLaImportacion(NO_ERA, HOY))?.clave, 'devolver');
  });

  test('y no se enseñan el transporte ni los trámites', () => {
    // Enseñarlos en gris invitaría a buscar la forma de seguir, y no la hay.
    const claves = pasosDeLaImportacion(NO_ERA, HOY).map((p) => p.clave);
    assert.ok(!claves.includes('transporte'));
    assert.ok(!claves.includes('tramites'));
    assert.ok(!claves.includes('liberar'));
  });

  test('devuelto el dinero, ya no queda nada que hacer', () => {
    const x = kia({ ...NO_ERA.meta, deposit_refunded_at: '2026-09-09T10:00:00Z' } as never);
    assert.equal(pideAlgoNuestro(x, HOY), false);
  });
});

describe('el final del camino', () => {
  const TODO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    verificado_alemania_at: '2026-09-07T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    factura_vendedor_pedida_at: '2026-09-08T11:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-07T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
      // Su factura ya está apuntada: en este bloque se mira lo que viene después.
      factura_numero: 'PE-DE-0001',
    },
  };

  test('con el pago fuera, lo primero es preguntar dónde se recoge', () => {
    // Un transportista no va a una ciudad: va a una calle, un día, a una hora
    // y preguntando por alguien. Contratar antes de saberlo es contratar a
    // ciegas, y si además no entra un portacoches, cambia hasta el precio.
    assert.equal(loQueToca(pasosDeLaImportacion(kia(TODO), HOY))?.clave, 'recogida');
  });

  test('preguntar es de aquí; organizar, de Transportes', () => {
    // El correo se manda desde el expediente, así que el número rojo de esa
    // tarea tiene que llevar a Importaciones. Lo de Transportes viene después.
    assert.equal(paso(kia(TODO), 'recogida').donde, '/importaciones');
    assert.equal(pendientesPorPantalla([kia(TODO)], HOY)['/importaciones'], 1);
    assert.equal(pendientesPorPantalla([kia(TODO)], HOY)['/transportes'], undefined);
  });

  test('preguntado y sin contestar, no hay nada que organizar', () => {
    // Contratar un camión sin saber el día es contratarlo a ciegas. Mientras
    // no conteste, esto es espera, y la espera no lleva número rojo.
    const preguntado = kia({ ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z' });
    assert.equal(paso(preguntado, 'transporte').estado, 'esperando');
    assert.equal(pendientesPorPantalla([preguntado], HOY)['/transportes'], undefined);
  });

  test('pero esa espera dice dónde se apunta lo que conteste', () => {
    // Su correo llega a un buzón, no al ERP: sin este camino la espera se
    // queda quieta con la respuesta ya encima de la mesa, y como una espera
    // no lleva número rojo, nada la reclama hasta que vence el plazo.
    const preguntado = kia({ ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z' });
    assert.equal(paso(preguntado, 'transporte').apuntarEn, '/transportes');
  });

  test('si tarda en contestar, hay que reclamárselo, y eso es de aquí', () => {
    const viejo = new Date(HOY.getTime() - (PLAZOS.vendedor + 1) * 86400000).toISOString();
    const x = kia({ ...TODO, recogida_preguntada_at: viejo });
    assert.equal(paso(x, 'transporte').estado, 'toca');
    assert.match(paso(x, 'transporte').titulo, /Reclamarle al vendedor el día/);
    assert.equal(paso(x, 'transporte').donde, '/importaciones');
  });

  test('y con su respuesta apuntada, ya toca organizarlo en Transportes', () => {
    const conRespuesta = kia({
      ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: { recogida_prevista: '2026-09-15' },
    });
    assert.equal(loQueToca(pasosDeLaImportacion(conRespuesta, HOY))?.clave, 'transporte');
    assert.equal(pendientesPorPantalla([conRespuesta], HOY)['/transportes'], 1);
  });

  test('con la orden mandada, organizarlo está hecho', () => {
    // Termina cuando sale la orden, no cuando se mueve el coche: entre una y
    // otra pueden pasar días, y seguir diciendo «organizar el transporte»
    // manda a mirar un tramo que ya está.
    const organizado = kia({
      ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: {
        recogida_prevista: '2026-09-15', transportista: 'TransLog GmbH',
        orden_enviada_at: '2026-09-10T09:00:00Z',
      },
    });
    assert.equal(paso(organizado, 'transporte').estado, 'hecho');
    assert.equal(paso(organizado, 'transporte').detalle, 'TransLog GmbH');
    assert.equal(pendientesPorPantalla([organizado], HOY)['/transportes'], undefined);
  });

  test('y entonces lo que se espera es que lo recojan, no que llegue', () => {
    // Decir «que llegue a España» con el coche todavía en la nave del vendedor
    // hace pensar que ya va de camino.
    const organizado = kia({
      ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: { recogida_prevista: '2026-09-15', orden_enviada_at: '2026-09-10T09:00:00Z' },
    });
    assert.equal(paso(organizado, 'llegada').estado, 'esperando');
    assert.match(paso(organizado, 'llegada').titulo, /lo recoja/);
  });

  test('ya en camino, se espera que llegue', () => {
    const enCamino = kia({ ...TODO }, 'En transporte');
    assert.equal(paso(enCamino, 'transporte').estado, 'hecho');
    assert.match(paso(enCamino, 'llegada').titulo, /llegue a España/);
  });

  test('recogido y con el expediente sin mover, eso es tarea nuestra', () => {
    // El tramo se marca en Transportes, pero la etapa del coche la mueve una
    // persona: es lo que ve el cliente en su panel. Sin este paso, el camino
    // diría «que el transportista lo recoja» con el coche cruzando Francia.
    const recogido = kia({
      ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: {
        recogida_prevista: '2026-09-15', orden_enviada_at: '2026-09-10T09:00:00Z',
        fecha_recogida: '2026-09-15T08:30:00Z',
      },
    });
    assert.equal(paso(recogido, 'llegada').estado, 'toca');
    assert.match(paso(recogido, 'llegada').titulo, /Pasarlo a «En transporte»/);
    assert.equal(pendientesPorPantalla([recogido], HOY)['/importaciones'], 1);
  });

  test('y una vez movido, deja de pedirlo', () => {
    const enCamino = kia({
      ...TODO, recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: {
        recogida_prevista: '2026-09-15', orden_enviada_at: '2026-09-10T09:00:00Z',
        fecha_recogida: '2026-09-15T08:30:00Z',
      },
    }, 'En transporte');
    assert.equal(paso(enCamino, 'llegada').estado, 'esperando');
  });

  test('en trámites, toca la gestoría', () => {
    assert.equal(loQueToca(pasosDeLaImportacion(kia(TODO, 'En trámites'), HOY))?.clave, 'tramites');
  });

  test('entregado, no queda nada', () => {
    const x = kia({ ...TODO, encargo_gestoria_enviado_at: '2026-09-09T10:00:00Z' }, 'Entregado');
    assert.equal(pideAlgoNuestro(x, HOY), false);
    assert.equal(paso(x, 'entrega').estado, 'hecho');
  });
});

describe('el número rojo del menú', () => {
  const PARADO_EN_PERITACIONES = kia({
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Por encargar', veredicto: null, perito: '',
      fecha_hecha: null, donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-12',
    },
  });

  test('el número va donde está el botón, no donde está el coche', () => {
    // Encargar una peritación se hace en Peritaciones. Contarlo también en
    // Importaciones sería el mismo trabajo contado dos veces.
    const cuenta = pendientesPorPantalla([PARADO_EN_PERITACIONES], HOY);
    assert.equal(cuenta['/peritaciones'], 1);
    assert.equal(cuenta['/importaciones'], undefined);
  });

  test('se cuentan acciones, no coches', () => {
    // Un expediente parado en dos sitios a la vez son dos cosas que hacer.
    const conDosFrentes = kia({
      deposit_paid_at: '2026-09-01T10:00:00Z',
      reserva_preguntada_at: '2026-09-02T10:00:00Z',
      verificado_alemania_at: '2026-09-07T10:00:00Z',
      escrow_liberado_at: '2026-09-08T10:00:00Z',
      factura_vendedor_pedida_at: '2026-09-08T11:00:00Z',
      peritacion: {
        id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
        perito: 'checkdenwagen', fecha_hecha: '2026-09-07T10:00:00Z',
        donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
        encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
      },
    }, 'En trámites');
    const cuenta = pendientesPorPantalla([conDosFrentes], HOY);
    assert.equal(cuenta['/gestoria'], 1);
    assert.equal(cuenta['/importaciones'], 1); // entregárselo al cliente
  });

  test('lo que se espera de fuera no suma', () => {
    // Un contador que incluye esperas nunca baja, y un número que nunca baja se
    // deja de mirar.
    const esperando = kia({
      deposit_paid_at: '2026-09-01T10:00:00Z',
      reserva_preguntada_at: '2026-09-09T10:00:00Z',
    });
    assert.deepEqual(pendientesPorPantalla([esperando], HOY), {});
  });

  test('varios coches suman en la misma pantalla', () => {
    const cuenta = pendientesPorPantalla(
      [PARADO_EN_PERITACIONES, PARADO_EN_PERITACIONES], HOY
    );
    assert.equal(cuenta['/peritaciones'], 2);
  });
});

describe('la factura del perito, que llega cuando llega', () => {
  const VISTO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    verificado_alemania_at: '2026-09-07T10:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-09T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
    },
  };

  test('no bloquea nada: sin ella se puede liberar el pago igual', () => {
    // El portero del pago mira el veredicto, no la factura. Un coche parado
    // porque su perito tarda en facturar sería absurdo.
    const x = kia(VISTO);
    assert.equal(paso(x, 'liberar').estado, 'toca');
  });

  test('pero queda pendiente: toca pedírsela', () => {
    // 289 € que nadie apunta no llegan al coste del coche ni a lo que hay que
    // pagar, y el margen sale mejor de lo que es.
    assert.equal(paso(kia(VISTO), 'facturaPerito').estado, 'toca');
  });

  test('pedida y sin llegar, se espera; y si tarda, se reclama', () => {
    // La cuenta corre desde que se pidió, no desde la visita: reclamar dos
    // días después de haberla pedido es prisa, no seguimiento.
    const ayer = new Date(HOY.getTime() - 86400000).toISOString();
    const conPrisa = kia({ ...VISTO, peritacion: { ...VISTO.peritacion, factura_pedida_at: ayer } });
    assert.equal(paso(conPrisa, 'facturaPerito').estado, 'esperando');

    const viejo = new Date(HOY.getTime() - (PLAZOS.perito + 1) * 86400000).toISOString();
    const x = kia({ ...VISTO, peritacion: { ...VISTO.peritacion, factura_pedida_at: viejo } });
    assert.equal(paso(x, 'facturaPerito').estado, 'toca');
    assert.match(paso(x, 'facturaPerito').titulo, /Reclamarle otra vez/);
  });

  test('apuntada, deja de pedir nada', () => {
    const x = kia({ ...VISTO, peritacion: { ...VISTO.peritacion, factura_numero: 'PE-DE-0001' } });
    assert.equal(paso(x, 'facturaPerito').estado, 'hecho');
    assert.equal(paso(x, 'facturaPerito').detalle, 'PE-DE-0001');
  });

  test('antes de la visita ni se menciona', () => {
    const x = kia({
      deposit_paid_at: '2026-09-01T10:00:00Z',
      reserva_preguntada_at: '2026-09-02T10:00:00Z',
    });
    assert.equal(paso(x, 'facturaPerito').estado, 'porVenir');
  });
});

describe('lo que mueve el coche y lo que va por su cuenta', () => {
  /** Peritado y pagado, con el coche ya de camino y sin la factura del perito. */
  const EN_MARCHA = kia({
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    verificado_alemania_at: '2026-09-07T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    factura_vendedor_pedida_at: '2026-09-08T11:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-07T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
    },
  }, 'En transporte');

  test('con el coche de camino, no toca nada nuestro: se espera que llegue', () => {
    // La factura del perito hay que pedirla, pero el coche no la espera: sigue
    // a trámites sin ella. De titular, parecía que había algo parado.
    assert.equal(loQueToca(pasosDeLaImportacion(EN_MARCHA, HOY)), null);
    assert.equal(loQueSeEspera(pasosDeLaImportacion(EN_MARCHA, HOY))?.clave, 'llegada');
  });

  test('y en cuanto llega, lo que toca son los trámites', () => {
    const aqui = kia(EN_MARCHA.meta as never, 'En trámites');
    assert.equal(loQueToca(pasosDeLaImportacion(aqui, HOY))?.clave, 'tramites');
  });

  test('y la factura del perito se dice aparte', () => {
    const aparte = loQueFaltaAparte(pasosDeLaImportacion(EN_MARCHA, HOY));
    assert.deepEqual(aparte.map((x) => x.clave), ['facturaPerito']);
  });

  test('pero cuenta igual como trabajo pendiente', () => {
    // El número rojo dice «hay trabajo», y pedirle la factura es trabajo.
    assert.equal(pideAlgoNuestro(EN_MARCHA, HOY), true);
  });

  test('con todo hecho y la factura apuntada, no queda nada', () => {
    const cerrado = kia({
      ...EN_MARCHA.meta,
      encargo_gestoria_enviado_at: '2026-09-09T10:00:00Z',
      peritacion: { ...EN_MARCHA.meta!.peritacion!, factura_numero: 'PE-DE-0001' },
    } as never, 'Entregado');
    assert.equal(pideAlgoNuestro(cerrado, HOY), false);
  });
});

describe('la factura del vendedor: pedirla, esperarla y tenerla', () => {
  const PAGADO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    verificado_alemania_at: '2026-09-07T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-07T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
      factura_numero: 'PE-DE-0001',
    },
  };

  test('pedida no es tenida', () => {
    // Se daba por hecha al pedirla, así que el camino saltaba adelante con el
    // papel sin llegar — y es el que convierte 16.890 € en un suplido.
    const x = kia({ ...PAGADO, factura_vendedor_pedida_at: '2026-09-09T10:00:00Z' });
    assert.equal(paso(x, 'factura').estado, 'esperando');
  });

  test('subida sí', () => {
    const x = kia({
      ...PAGADO,
      factura_vendedor_pedida_at: '2026-09-09T10:00:00Z',
      factura_vendedor_subida: true,
    });
    assert.equal(paso(x, 'factura').estado, 'hecho');
  });

  test('y no bloquea el transporte: el camión puede salir sin ella', () => {
    // Lo dijo Ana y es verdad: lo que no se puede hacer sin la factura es
    // matricular, no mover el coche.
    const x = kia({
      ...PAGADO,
      factura_vendedor_pedida_at: '2026-09-09T10:00:00Z',
      recogida_preguntada_at: '2026-09-09T10:00:00Z',
      tramo: { recogida_prevista: '2026-09-15' },
    });
    assert.equal(loQueToca(pasosDeLaImportacion(x, HOY))?.clave, 'transporte');
  });

  test('si tarda, deja de ser espera y hay que subirla', () => {
    const viejo = new Date(HOY.getTime() - (PLAZOS.vendedor + 1) * 86400000).toISOString();
    const x = kia({ ...PAGADO, factura_vendedor_pedida_at: viejo });
    assert.equal(paso(x, 'factura').estado, 'toca');
    assert.match(paso(x, 'factura').titulo, /Subir la factura del vendedor/);
  });
});

describe('lo que vive en Pedidos', () => {
  const PAGADO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    reserva_preguntada_at: '2026-09-02T10:00:00Z',
    verificado_alemania_at: '2026-09-07T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    factura_vendedor_pedida_at: '2026-09-08T11:00:00Z',
    factura_vendedor_subida: true,
    recogida_preguntada_at: '2026-09-09T10:00:00Z',
    tramo: { recogida_prevista: '2026-09-15' },
    peritacion: {
      id: 'PER-2026-001', estado: 'Hecha', veredicto: 'es_el_que_se_anuncio',
      perito: 'checkdenwagen', fecha_hecha: '2026-09-07T10:00:00Z',
      donde: 'Landsberger Str. 180', fecha_prevista: '2026-09-07', coste: 289,
      encargo_enviado_at: '2026-09-03T10:00:00Z', cita_avisada_at: '2026-09-04T10:00:00Z',
      factura_numero: 'PE-DE-0001',
    },
    pedido: { id: 'PED-2026-001', estado: 'Pedido' },
  };

  test('sin el número de su factura, hay algo que hacer en Pedidos', () => {
    // Los 16.890 € ya han salido del banco. Sin ese número queda un cargo de
    // dieciséis mil euros sin concepto, y aparece al cuadrar el mes.
    const x = kia(PAGADO);
    assert.equal(paso(x, 'pedidoPagado').estado, 'toca');
    assert.equal(pendientesPorPantalla([x], HOY)['/pedidos'], 1);
  });

  test('apuntado, deja de pedirlo', () => {
    const x = kia({ ...PAGADO, pedido: { ...PAGADO.pedido, factura_proveedor: 'ACD-2026-0903-001' } });
    assert.equal(paso(x, 'pedidoPagado').estado, 'hecho');
    assert.equal(pendientesPorPantalla([x], HOY)['/pedidos'], undefined);
  });

  test('pero no le quita el titular al transporte', () => {
    // Apuntar un número no mueve el coche: es trabajo nuestro, va aparte.
    assert.equal(loQueToca(pasosDeLaImportacion(kia(PAGADO), HOY))?.clave, 'transporte');
  });

  test('sin pedido todavía, ese paso ni se menciona', () => {
    const x = kia({ deposit_paid_at: '2026-09-01T10:00:00Z' });
    assert.ok(!pasosDeLaImportacion(x, HOY).some((p) => p.clave === 'pedidoPagado'));
  });
});

describe('el segundo viaje: de Zaragoza a casa del cliente', () => {
  const EN_TRAMITES = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    recogida_preguntada_at: '2026-09-09T10:00:00Z',
    tramo: { recogida_prevista: '2026-09-15', orden_enviada_at: '2026-09-10T09:00:00Z' },
  };

  test('mientras no exista, el camino no lo menciona', () => {
    // Si el cliente lo recoge en Zaragoza no hay segundo viaje, y un paso que
    // nadie tiene que hacer es ruido.
    const x = kia(EN_TRAMITES, 'En trámites');
    assert.ok(!pasosDeLaImportacion(x, HOY).some((p) => p.clave === 'transporteAlCliente'));
  });

  test('abierto y en trámites, hay que organizarlo', () => {
    const x = kia({
      ...EN_TRAMITES,
      tramo_al_cliente: { id: 'TRP-2026-002', hasta: 'Calle Mauricio Legendre 45, MADRID' },
    }, 'En trámites');
    assert.equal(paso(x, 'transporteAlCliente').estado, 'toca');
    assert.match(paso(x, 'transporteAlCliente').titulo, /Organizar el viaje hasta el cliente/);
    assert.equal(pendientesPorPantalla([x], HOY)['/transportes'], 1);
  });

  test('con la orden mandada, se espera a que lo lleven', () => {
    const x = kia({
      ...EN_TRAMITES,
      tramo_al_cliente: { id: 'TRP-2026-002', orden_enviada_at: '2026-10-01T09:00:00Z', transportista: 'Gómez' },
    }, 'En trámites');
    assert.equal(paso(x, 'transporteAlCliente').estado, 'esperando');
    assert.equal(paso(x, 'transporteAlCliente').detalle, 'Gómez');
  });

  test('y entregado allí, hecho', () => {
    const x = kia({
      ...EN_TRAMITES,
      tramo_al_cliente: { id: 'TRP-2026-002', fecha_entrega: '2026-10-05T11:00:00Z' },
    }, 'En trámites');
    assert.equal(paso(x, 'transporteAlCliente').estado, 'hecho');
  });

  test('antes de los trámites está, pero todavía no toca', () => {
    // El coche no se entrega sin matricular: organizarlo antes es apuntar un
    // trabajo que no se puede terminar.
    const x = kia({
      ...EN_TRAMITES, tramo_al_cliente: { id: 'TRP-2026-002' },
    }, 'En transporte');
    assert.equal(paso(x, 'transporteAlCliente').estado, 'porVenir');
  });
});

describe('llegar es que lo descarguen, no que cambie la etapa', () => {
  const DESCARGADO = {
    deposit_paid_at: '2026-09-01T10:00:00Z',
    escrow_liberado_at: '2026-09-08T10:00:00Z',
    recogida_preguntada_at: '2026-09-09T10:00:00Z',
    tramo: {
      recogida_prevista: '2026-09-15', orden_enviada_at: '2026-09-10T09:00:00Z',
      fecha_recogida: '2026-09-15T08:30:00Z', fecha_entrega: '2026-09-18T11:00:00Z',
    },
  };

  test('descargado en Zaragoza, la llegada está hecha aunque la etapa no se haya movido', () => {
    // La etapa la mueve una persona y detrás está el encargo a la gestoría. El
    // camino decía «que el coche llegue a España» con el coche ya en Zaragoza.
    const x = kia(DESCARGADO, 'En transporte');
    assert.equal(paso(x, 'llegada').estado, 'hecho');
    assert.equal(paso(x, 'llegada').cuando, '2026-09-18T11:00:00Z');
  });

  test('y entonces lo que toca es la gestoría', () => {
    const x = kia(DESCARGADO, 'En transporte');
    assert.equal(paso(x, 'tramites').estado, 'toca');
    assert.equal(pendientesPorPantalla([x], HOY)['/gestoria'], 1);
  });

  test('sin descargar sigue siendo una espera', () => {
    const x = kia({
      ...DESCARGADO, tramo: { ...DESCARGADO.tramo, fecha_entrega: null },
    }, 'En transporte');
    assert.equal(paso(x, 'llegada').estado, 'esperando');
    assert.equal(paso(x, 'tramites').estado, 'porVenir');
  });
});
