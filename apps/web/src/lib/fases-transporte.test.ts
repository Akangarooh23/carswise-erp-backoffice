/**
 * Las tres partes de un tramo de transporte.
 *
 * Lo que se sostiene aquí es el **orden**: nosotros ponemos la empresa y las
 * dos direcciones y preguntamos; el transportista contesta día, precio y quién
 * viene; con eso se avisa al origen; el origen contesta por quién preguntar,
 * en qué horas y si entra un portacoches; y solo entonces se confirma.
 *
 * Cada botón está apagado hasta que se pueda pulsar de verdad, y esa es la
 * parte que importa: un camión en la puerta equivocada no se deshace, y un
 * conductor que llega donde nadie le espera se va vacío con el viaje pagado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  seLePreguntaAlVendedor, queTocaEnElTramo, queViajeEs, queParteSeAbre,
  faltaParaSolicitar, faltaParaAvisarAlOrigen, faltaParaConfirmar,
  seSabeLoDelPortacoches, comoSeLlamaElCampo, pistaDelCampo, PISTAS,
  type DatosDelTramo,
} from './fases-transporte.js';

/** Un tramo con la parte 1 puesta, que es lo que ponemos nosotros. */
const PARTE_1: DatosDelTramo = {
  estado: 'Por organizar',
  tramo: 1,
  transportista: 'TransLog GmbH',
  desde: 'Musterstraße 18, 80331 München',
  hasta: 'Avenida Cataluña 103, 50014 Zaragoza',
};

/** Y con lo que contestó el transportista. */
const PARTE_2: DatosDelTramo = {
  ...PARTE_1,
  presupuesto_pedido_at: '2026-09-02T09:00:00Z',
  recogida_prevista: '2026-09-04',
  entrega_prevista: '2026-09-08',
  coste: 890,
  contacto_transportista: 'Michael Schneider',
  telefono_transportista: '+49 711 000000',
  aviso_recogida_at: '2026-09-03T10:00:00Z',
};

/** Y con lo que contestó el origen: ya se puede confirmar. */
const PARTE_3: DatosDelTramo = {
  ...PARTE_2,
  contacto_origen: 'Daniel Weber',
  telefono_origen: '+49 89 000000',
  horario_origen: 'Viernes 4, de 9:00 a 17:00',
  portacoches: true,
};

describe('parte 1: lo que ponemos nosotros', () => {
  test('sin nada, faltan la empresa y las dos direcciones', () => {
    assert.deepEqual(faltaParaSolicitar({}), [
      'elegir la empresa de transporte',
      'la dirección completa de donde sale',
      'la dirección completa de a dónde va',
    ]);
  });

  test('con las tres, ya se le puede preguntar', () => {
    assert.deepEqual(faltaParaSolicitar(PARTE_1), []);
  });

  test('una dirección en blanco no cuenta como dirección', () => {
    assert.deepEqual(faltaParaSolicitar({ ...PARTE_1, desde: '   ' }),
      ['la dirección completa de donde sale']);
  });

  test('y no hace falta haber contratado a nadie para pedir precio', () => {
    // Es justo la gracia: se le pide a una, se apunta lo que diga, y se cambia
    // de nombre. Entre la primera y la tercera hay varios cientos de euros.
    assert.deepEqual(faltaParaSolicitar({ ...PARTE_1, coste: 0, orden_enviada_at: null }), []);
  });
});

describe('parte 2: lo que contesta el transportista', () => {
  test('sin habérselo preguntado, no hay nada que apuntar todavía', () => {
    assert.ok(faltaParaAvisarAlOrigen(PARTE_1).includes('pedirle antes disponibilidad y precio'));
  });

  test('preguntado y sin contestar, faltan sus tres datos', () => {
    const falta = faltaParaAvisarAlOrigen({ ...PARTE_1, presupuesto_pedido_at: '2026-09-02T09:00:00Z' });
    assert.deepEqual(falta, [
      'el día que lo recoge',
      'el precio acordado',
      'el nombre del transportista que viene',
    ]);
  });

  test('con su respuesta, ya se puede avisar al origen', () => {
    assert.deepEqual(faltaParaAvisarAlOrigen(PARTE_2), []);
  });

  test('un precio de cero no es un precio acordado', () => {
    // «Cero» no es lo que cuesta: es que no se ha apuntado. Una orden sin
    // precio es un encargo abierto, y la factura será la que quieran.
    assert.ok(faltaParaAvisarAlOrigen({ ...PARTE_2, coste: 0 }).includes('el precio acordado'));
    assert.ok(faltaParaAvisarAlOrigen({ ...PARTE_2, coste: '' }).includes('el precio acordado'));
  });

  test('el precio con coma se entiende igual', () => {
    assert.deepEqual(faltaParaAvisarAlOrigen({ ...PARTE_2, coste: '890,50' }), []);
  });

  test('sin nombre de quien viene, el aviso no dice a quién esperar', () => {
    assert.ok(faltaParaAvisarAlOrigen({ ...PARTE_2, contacto_transportista: '' })
      .includes('el nombre del transportista que viene'));
  });
});

describe('parte 3: lo que contesta el origen', () => {
  test('con todo, se puede confirmar', () => {
    assert.deepEqual(faltaParaConfirmar(PARTE_3), []);
  });

  test('sin por quién preguntar, no', () => {
    // La orden decía «preguntar por AutoCheck Deutschland», que es a quién le
    // compramos y no quien sale a abrir.
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, contacto_origen: '' }),
      ['por quién pregunta el conductor']);
  });

  test('sin horario, tampoco: manda al conductor a una puerta cerrada', () => {
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, horario_origen: '' }),
      ['el horario de recogida']);
  });

  test('y sin saber lo del portacoches, tampoco', () => {
    // El precio de la parte 2 se dio suponiendo que entra. Si no entra, ya no
    // vale, y el camión se presenta y no puede cargar.
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, portacoches: null }),
      ['si entra un portacoches']);
  });

  test('«no entra» sí es una respuesta; «todavía no lo sé» no', () => {
    assert.equal(seSabeLoDelPortacoches(false), true);
    assert.equal(seSabeLoDelPortacoches(true), true);
    assert.equal(seSabeLoDelPortacoches('si'), true);
    assert.equal(seSabeLoDelPortacoches('no'), true);
    assert.equal(seSabeLoDelPortacoches(''), false);
    assert.equal(seSabeLoDelPortacoches(null), false);
    assert.equal(seSabeLoDelPortacoches(undefined), false);
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, portacoches: 'no' }), []);
  });

  test('sin avisar al origen, no se confirma', () => {
    // Un conductor que llega a una nave donde nadie le espera se va vacío, y
    // ese viaje se paga igual.
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, aviso_recogida_at: null }),
      ['avisar al origen de quién va y qué día']);
  });

  test('en el segundo viaje eso no se pide: el origen es nuestra nave', () => {
    assert.deepEqual(faltaParaConfirmar({ ...PARTE_3, tramo: 2, aviso_recogida_at: null }), []);
  });

  test('y lo de las partes de antes sigue haciendo falta', () => {
    const falta = faltaParaConfirmar({ ...PARTE_3, transportista: '', coste: 0, entrega_prevista: '' });
    assert.ok(falta.includes('elegir la empresa de transporte'));
    assert.ok(falta.includes('el precio acordado'));
    assert.ok(falta.includes('el día que llega'));
  });

  test('pero no se le exige haber pedido el presupuesto por segunda vez', () => {
    // Ese aviso es de la parte 1 y ahí se queda: repetirlo aquí es ruido.
    assert.ok(!faltaParaConfirmar({ ...PARTE_3, presupuesto_pedido_at: null })
      .includes('pedirle antes disponibilidad y precio'));
  });
});

describe('cuál de las tres se abre, y cuándo se abre sola', () => {
  /*
   * Lo pidió Ana así: primero la 1, y al ejecutar su botón se abre la 2; al
   * ejecutar el suyo, la 3.
   *
   * Lo que se sostiene aquí es que eso lo decide **lo ejecutado** y no lo
   * tecleado. Si lo decidiera el formulario, la sección se cerraría bajo los
   * dedos al rellenar el último hueco y la de abajo se abriría de golpe
   * mientras todavía se está escribiendo en esta.
   */

  test('un tramo recién nacido abre la primera', () => {
    assert.equal(queParteSeAbre({ estado: 'Por organizar', tramo: 1 }), 'solicitud');
  });

  test('con los campos puestos pero sin pedir nada, sigue abierta la primera', () => {
    // El botón está ahí abajo: la parte no termina con los campos, termina
    // con el correo.
    assert.equal(queParteSeAbre(PARTE_1), 'solicitud');
  });

  test('pedida la disponibilidad, se abre la segunda', () => {
    assert.equal(
      queParteSeAbre({ ...PARTE_1, presupuesto_pedido_at: '2026-09-02T09:00:00Z' }),
      'respuesta'
    );
  });

  test('y no se cierra por haber tecleado su respuesta, solo por avisar al origen', () => {
    // Este es el fallo que se evita: rellenar el último campo no puede cerrar
    // la sección en la que se está escribiendo.
    assert.equal(queParteSeAbre({ ...PARTE_2, aviso_recogida_at: null }), 'respuesta');
    assert.equal(queParteSeAbre(PARTE_2), 'origen');
  });

  test('en el segundo viaje la cierra el guardar, que es el botón que hay', () => {
    // No hay a quién avisar: el origen es nuestra nave.
    const segundo = { ...PARTE_2, tramo: 2, aviso_recogida_at: null };
    assert.equal(queParteSeAbre({ ...segundo, contacto_transportista: '' }), 'respuesta');
    assert.equal(queParteSeAbre({ ...segundo, entrega_prevista: '' }), 'respuesta');
    assert.equal(queParteSeAbre(segundo), 'origen');
  });

  test('con la orden fuera ya no se abre ninguna', () => {
    assert.equal(queParteSeAbre({ ...PARTE_3, orden_enviada_at: '2026-09-03T12:00:00Z' }), null);
  });

  test('y hasta confirmarla, la tercera', () => {
    assert.equal(queParteSeAbre(PARTE_3), 'origen');
  });
});
describe('a quién se le avisa de la recogida', () => {
  test('solo en el primer tramo, que es el que sale del vendedor', () => {
    assert.equal(seLePreguntaAlVendedor(1), true);
    assert.equal(seLePreguntaAlVendedor('1'), true);
    assert.equal(seLePreguntaAlVendedor(null), false);
  });

  test('en el segundo no: sale de nuestra campa', () => {
    assert.equal(seLePreguntaAlVendedor(2), false);
  });
});

describe('qué toca ahora en un tramo', () => {
  test('lo primero, la empresa y las dos direcciones', () => {
    assert.match(queTocaEnElTramo({ estado: 'Por organizar', tramo: 1 }),
      /empresa de transporte y pon las dos direcciones/);
  });

  test('luego, pedirle disponibilidad', () => {
    assert.match(queTocaEnElTramo(PARTE_1), /disponibilidad y precio/);
  });

  test('pedida y sin contestar, apuntar lo que conteste', () => {
    assert.match(
      queTocaEnElTramo({ ...PARTE_1, presupuesto_pedido_at: '2026-09-02T09:00:00Z' }),
      /Apunta lo que conteste/
    );
  });

  test('sin la fecha de llegada, todavía es su respuesta lo que falta', () => {
    // Es la que se le dice al cliente: sin ella, «va de camino» no responde a
    // la única pregunta que él tiene.
    assert.match(queTocaEnElTramo({ ...PARTE_2, entrega_prevista: '' }), /Apunta lo que conteste/);
  });

  test('con su respuesta, avisar al origen', () => {
    assert.match(queTocaEnElTramo({ ...PARTE_2, aviso_recogida_at: null }),
      /Avisa al origen/);
  });

  test('avisado y sin lo del origen, apuntar lo que conteste el origen', () => {
    assert.match(queTocaEnElTramo(PARTE_2),
      /por quién preguntar, el horario y si entra un portacoches/);
  });

  test('y con todo, confirmárselo al transportista', () => {
    assert.match(queTocaEnElTramo(PARTE_3), /Confírmaselo al transportista/);
  });

  test('con la orden fuera, se espera a que lo recojan', () => {
    assert.match(
      queTocaEnElTramo({ ...PARTE_3, orden_enviada_at: '2026-09-03T11:02:00Z' }),
      /Esperando a que lo recojan/
    );
  });

  test('con el coche fuera, lo que toca es mirarlo al llegar', () => {
    for (const estado of ['Recogido', 'En tránsito']) {
      assert.match(queTocaEnElTramo({ ...PARTE_3, estado }), /míralo antes de darlo por entregado/);
    }
  });

  test('entregado sin haberlo mirado, eso es lo que falta', () => {
    assert.match(
      queTocaEnElTramo({ ...PARTE_3, estado: 'Entregado' }),
      /llegó como salió/
    );
  });

  test('y mirado, se acabó', () => {
    assert.equal(
      queTocaEnElTramo({ ...PARTE_3, estado: 'Entregado', llegada: { conforme: true } }),
      'Entregado.'
    );
  });

  test('en el segundo tramo no se avisa a ningún vendedor', () => {
    // El coche está en nuestra nave: el correo iría al concesionario alemán,
    // avisándole de una recogida que no es suya.
    assert.doesNotMatch(
      queTocaEnElTramo({ ...PARTE_2, tramo: 2, aviso_recogida_at: null }),
      /Avisa al origen/
    );
  });
});

describe('de qué viaje es un tramo', () => {
  test('una importación hace dos, y se dice cuál es cuál', () => {
    assert.match(queViajeEs(1, 'importacion'), /traerlo a Zaragoza/);
    assert.match(queViajeEs(2, 'importacion'), /llevárselo al cliente/);
  });

  test('los demás coches hacen uno, y no se dice nada', () => {
    assert.equal(queViajeEs(1, 'stock'), '');
    assert.equal(queViajeEs(1, null), '');
  });

  test('sin número de tramo se supone el primero', () => {
    assert.match(queViajeEs(null, 'importacion'), /traerlo a Zaragoza/);
  });
});

describe('cada viaje llama a las cosas por su nombre', () => {
  test('las fechas se llaman igual en los dos: las dice el transportista', () => {
    assert.equal(comoSeLlamaElCampo('recogida_prevista', 1), 'Cuándo lo recoge');
    assert.equal(comoSeLlamaElCampo('recogida_prevista', 2), 'Cuándo lo recoge');
    assert.equal(comoSeLlamaElCampo('entrega_prevista', 1), 'Cuándo llega');
    assert.equal(comoSeLlamaElCampo('entrega_prevista', 2), 'Cuándo llega');
  });

  test('y las dos puntas sí cambian de nombre', () => {
    assert.equal(comoSeLlamaElCampo('desde', 1), 'Desde');
    assert.equal(comoSeLlamaElCampo('desde', 2), 'Dónde está ahora');
    assert.equal(comoSeLlamaElCampo('hasta', 2), 'A dónde va');
  });

  test('en el segundo, la pista dice de dónde sale de verdad', () => {
    assert.match(pistaDelCampo('desde', 2), /nuestra nave/);
    assert.match(pistaDelCampo('hasta', 2), /cliente/);
  });

  test('la de «desde» avisa de lo que se hace mal', () => {
    assert.match(PISTAS.desde ?? '', /Una ciudad no es una dirección/);
  });
});
