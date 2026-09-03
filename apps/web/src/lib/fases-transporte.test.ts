/**
 * Qué se puede hacer con un tramo en cada momento.
 *
 * Lo que se sostiene aquí es lo caro: **la orden de recogida no sale sin haberle
 * preguntado antes al vendedor**. Sin esa respuesta, lo que hay escrito en
 * «Desde» es la ciudad del anuncio, y un camión no va a una ciudad: va a una
 * calle, un día, a una hora y preguntando por alguien. Un camión en la puerta
 * equivocada no se deshace.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  bloquesDelTramo, seLePreguntaAlVendedor, faltaParaLaOrden, PISTAS,
  queTocaEnElTramo,
  queViajeEs,
} from './fases-transporte.js';

describe('qué se ve en cada fase', () => {
  test('recién nacido: quién lo trae, y preguntarle al vendedor', () => {
    assert.deepEqual(bloquesDelTramo('Por organizar'), ['quien', 'dondeRecoger']);
  });

  test('pero con la pregunta hecha, la ruta se enseña ya', () => {
    // Su respuesta es lo que hace falta para pedir precio: la calle, el día,
    // por quién preguntar. Si los campos no están, el correo llega al buzón y
    // no hay dónde copiarlo — y lo que no se apunta no existe para nadie más.
    const b = bloquesDelTramo('Por organizar', { recogida_preguntada_at: '2026-09-02T10:00:00Z' });
    assert.ok(b.includes('ruta'));
    assert.ok(b.includes('quien'));
  });

  test('y sin preguntar sigue escondida', () => {
    // Un hueco vacío delante parece una tarea pendiente y se rellena con lo
    // primero que sirva, que aquí es la ciudad del anuncio.
    assert.ok(!bloquesDelTramo('Por organizar', { recogida_preguntada_at: null }).includes('ruta'));
    assert.ok(!bloquesDelTramo('Por organizar', { recogida_preguntada_at: '  ' }).includes('ruta'));
  });

  test('la ruta y la orden aparecen cuando ya hay transportista contratado', () => {
    const b = bloquesDelTramo('Contratado');
    assert.ok(b.includes('ruta'));
    assert.ok(b.includes('orden'));
  });

  test('y la orden sale ya sin organizar, en cuanto hay con quién y por cuánto', () => {
    // Mandarla es contratar: se acuerda por correo y la orden lo confirma.
    // Pedir que se marque «Contratado» antes obliga a declarar cerrado algo
    // que se cierra con el correo que todavía no ha salido.
    const b = bloquesDelTramo('Por organizar', { transportista: 'TransLog GmbH', coste: 890 });
    assert.ok(b.includes('orden'));
  });

  test('con nombre pero sin precio, todavía no', () => {
    // Una orden sin precio acordado es un encargo abierto, y la factura será
    // la que quieran.
    const b = bloquesDelTramo('Por organizar', { transportista: 'TransLog GmbH', coste: 0 });
    assert.ok(!b.includes('orden'));
  });

  test('ni con precio y sin nombre', () => {
    assert.ok(!bloquesDelTramo('Por organizar', { transportista: '', coste: 890 }).includes('orden'));
  });

  test('y no se duplica si la fase ya la traía', () => {
    const b = bloquesDelTramo('Contratado', { transportista: 'TransLog GmbH', coste: 890 });
    assert.equal(b.filter((x) => x === 'orden').length, 1);
  });

  test('las fotos, cuando ya lo tiene: son del viaje, no del coche', () => {
    // Son lo único que distingue un golpe que ya venía de uno que se hizo por
    // el camino. Antes de que lo recojan no hay viaje del que hacer fotos.
    assert.ok(!bloquesDelTramo('Por organizar').includes('fotos'));
    assert.ok(bloquesDelTramo('Recogido').includes('fotos'));
    assert.ok(bloquesDelTramo('Entregado').includes('fotos'));
  });

  test('con una incidencia se enseña todo', () => {
    // Puede pasar en cualquier punto: esconder media pantalla mientras alguien
    // intenta averiguar qué ha ocurrido es lo contrario de ayudar.
    assert.equal(bloquesDelTramo('Con incidencia').length, 5);
  });

  test('un estado desconocido no abre nada de más', () => {
    assert.deepEqual(bloquesDelTramo('Lo que sea'), ['quien']);
  });
});

describe('a quién se le pregunta por la recogida', () => {
  test('solo en el primer tramo, que es el que sale del vendedor', () => {
    assert.equal(seLePreguntaAlVendedor(1), true);
  });

  test('en el segundo no: sale de nuestra campa', () => {
    // El correo iría igualmente al concesionario alemán, preguntándole por una
    // recogida que no es suya.
    assert.equal(seLePreguntaAlVendedor(2), false);
    assert.equal(seLePreguntaAlVendedor(null), false);
    assert.equal(seLePreguntaAlVendedor(undefined), false);
  });
});

describe('el vendedor se entera antes que el camión', () => {
  const CERRADO = {
    transportista: 'TransLog Fahrzeugtransporte GmbH',
    desde: 'Musterstraße 18, 80331 München',
    hasta: 'Zaragoza', tramo: 1,
    recogida_preguntada_at: '2026-09-03T09:40:00Z',
  };

  test('sin avisarle, la orden no sale', () => {
    // Un conductor que llega a una nave donde nadie le espera se va vacío, y
    // ese viaje se paga igual.
    assert.deepEqual(faltaParaLaOrden(CERRADO), ['avisar al vendedor de quién va y qué día']);
  });

  test('avisado, ya no falta nada', () => {
    assert.deepEqual(faltaParaLaOrden({ ...CERRADO, aviso_recogida_at: '2026-09-03T12:00:00Z' }), []);
  });

  test('en el segundo tramo no aplica: no sale de casa de ningún vendedor', () => {
    assert.deepEqual(faltaParaLaOrden({ ...CERRADO, tramo: 2, recogida_preguntada_at: null }), []);
  });

  test('y primero se pregunta, que es lo que da la dirección', () => {
    // Sin la pregunta no se pide el aviso todavía: pedir las dos cosas a la vez
    // esconde cuál es la que toca.
    assert.deepEqual(
      faltaParaLaOrden({ ...CERRADO, recogida_preguntada_at: null }),
      ['preguntarle antes al vendedor dónde y cuándo se recoge']
    );
  });
});

describe('lo que impide mandar la orden de recogida', () => {
  const LISTO = {
    transportista: 'Business Ontime GmbH',
    desde: 'Landsberger Str. 180, 80687 München',
    hasta: 'Zaragoza',
    tramo: 1,
    recogida_preguntada_at: '2026-09-02T10:00:00Z',
    // Listo del todo incluye que el vendedor sepa quién va: eso se comprueba
    // arriba, y aquí estorbaría en cada caso.
    aviso_recogida_at: '2026-09-03T12:00:00Z',
  };

  test('con todo puesto, nada', () => {
    assert.deepEqual(faltaParaLaOrden(LISTO), []);
  });

  test('sin transportista no hay a quién mandársela', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, transportista: '' }), ['elegir quién lo trae']);
  });

  test('sin las dos puntas, tampoco', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, desde: '', hasta: '' }),
      ['de dónde sale', 'a dónde va']);
  });

  test('y en el primer tramo, sin haber preguntado al vendedor', () => {
    // Es el que evita el camión en la puerta equivocada.
    assert.deepEqual(
      faltaParaLaOrden({ ...LISTO, recogida_preguntada_at: null }),
      ['preguntarle antes al vendedor dónde y cuándo se recoge']
    );
  });

  test('en el segundo tramo eso no se pide: no hay vendedor', () => {
    assert.deepEqual(faltaParaLaOrden({ ...LISTO, tramo: 2, recogida_preguntada_at: null }), []);
  });
});

describe('las pistas', () => {
  test('cada dato dice cuándo se sabe', () => {
    for (const clave of ['transportista', 'coste', 'desde', 'hasta', 'recogida_prevista']) {
      assert.ok(PISTAS[clave]?.trim().length > 10, `sin pista: ${clave}`);
    }
  });

  test('la de «desde» avisa de lo que se hace mal', () => {
    assert.match(PISTAS.desde, /ciudad no es una dirección/);
  });
});

describe('qué toca ahora en un tramo', () => {
  const CERRADO = {
    estado: 'Por organizar',
    transportista: 'Business Ontime GmbH', coste: 890,
    desde: 'Musterstraße 18, 80331 München', recogida_prevista: '2026-09-10',
    tramo: 1,
    recogida_preguntada_at: '2026-09-03T09:40:00Z',
    aviso_recogida_at: '2026-09-03T10:49:00Z',
  };

  test('sin transportista, lo primero es buscarlo', () => {
    assert.match(queTocaEnElTramo({ ...CERRADO, transportista: '' }), /Elige quién lo trae/);
    assert.match(queTocaEnElTramo({ ...CERRADO, coste: 0 }), /pídele precio/);
  });

  test('con precio pero sin preguntar al vendedor, se le pregunta', () => {
    assert.match(
      queTocaEnElTramo({ ...CERRADO, recogida_preguntada_at: null }),
      /Pregúntale al vendedor/
    );
  });

  test('preguntado y sin apuntar su respuesta, se apunta', () => {
    assert.match(queTocaEnElTramo({ ...CERRADO, recogida_prevista: '' }), /Apunta lo que ha contestado/);
  });

  test('con la respuesta puesta, avisar al vendedor de quién va', () => {
    assert.match(
      queTocaEnElTramo({ ...CERRADO, aviso_recogida_at: null }),
      /Dile al vendedor quién va/
    );
  });

  test('y con todo, confirmárselo al transportista', () => {
    assert.match(queTocaEnElTramo(CERRADO), /Confírmaselo al transportista/);
  });

  test('con la orden fuera, se espera a que lo recojan', () => {
    assert.match(
      queTocaEnElTramo({ ...CERRADO, orden_enviada_at: '2026-09-03T11:02:00Z' }),
      /Esperando a que lo recojan/
    );
  });

  test('con el coche fuera, lo que toca es mirarlo al llegar', () => {
    // Es el aviso que Ana no veía: el campo estaba al final del panel y el
    // botón de «Entregado» apagado sin decir por qué delante.
    for (const estado of ['Recogido', 'En tránsito']) {
      assert.match(queTocaEnElTramo({ ...CERRADO, estado }), /míralo antes de darlo por entregado/);
    }
  });

  test('entregado sin haberlo mirado, eso es lo que falta', () => {
    assert.match(
      queTocaEnElTramo({ ...CERRADO, estado: 'Entregado' }),
      /Falta decir si el coche llegó como salió/
    );
  });

  test('y mirado, se acabó', () => {
    assert.equal(
      queTocaEnElTramo({ ...CERRADO, estado: 'Entregado', llegada: { conforme: true } }),
      'Entregado.'
    );
  });

  test('en el segundo tramo no se pregunta a ningún vendedor', () => {
    // Sale de nuestra campa: ahí no hay a quién preguntarle ni a quién avisar.
    assert.match(
      queTocaEnElTramo({ ...CERRADO, tramo: 2, recogida_preguntada_at: null, aviso_recogida_at: null }),
      /Confírmaselo al transportista/
    );
  });
});

describe('de qué viaje es un tramo', () => {
  test('una importación hace dos, y se dice cuál es cuál', () => {
    // Dos tarjetas del mismo coche en el mismo tablero, sin decirlo, se leen
    // como un duplicado.
    assert.match(queViajeEs(1, 'importacion'), /1 de 2 · traerlo a Zaragoza/);
    assert.match(queViajeEs(2, 'importacion'), /2 de 2 · llevárselo al cliente/);
  });

  test('los demás coches hacen uno, y no se dice nada', () => {
    // «Tramo 1 de 1» es ruido: solo hay uno y se ve.
    assert.equal(queViajeEs(1, 'concesionario'), '');
    assert.equal(queViajeEs(1, null), '');
    assert.equal(queViajeEs(1, undefined), '');
  });

  test('sin número de tramo se supone el primero', () => {
    assert.match(queViajeEs(null, 'importacion'), /1 de 2/);
  });
});
