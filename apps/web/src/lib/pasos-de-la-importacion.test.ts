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

  test('con el pago fuera y la factura pedida, toca el transporte', () => {
    assert.equal(loQueToca(pasosDeLaImportacion(kia(TODO), HOY))?.clave, 'transporte');
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
