import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LO_DE_CADA_FASE, CAMPOS, toca, tocaCampo, camposDe, queTocaEnElPedido,
} from './fases-pedido.js';

/**
 * Lo que se enseña en cada fase.
 *
 * Lo que se comprueba aquí no es la maqueta: es que no se ponga delante, en la
 * fase que no toca, algo que solo se puede saber después. Un hueco vacío parece
 * una tarea pendiente, y se rellena con lo primero que sirva.
 */
describe('cada fase enseña lo suyo', () => {
  test('un coche que sigue en Alemania no pide kilómetros ni llaves', () => {
    assert.equal(toca('alLlegar', 'Borrador'), false);
    assert.equal(toca('alLlegar', 'Pedido'), false);
    assert.equal(toca('alLlegar', 'Confirmado'), false);
  });

  test('pero sí en cuanto viene de camino: se rellena el día que llega', () => {
    assert.equal(toca('alLlegar', 'En camino'), true);
    assert.equal(toca('alLlegar', 'Recibido'), true);
  });

  test('los papeles salen cuando ya sirven para algo: moverlo', () => {
    assert.equal(toca('papeles', 'Pedido'), false);
    assert.equal(toca('papeles', 'Confirmado'), true);
    assert.equal(toca('papeles', 'En camino'), true);
  });

  test('a nombre de quién va se decide pronto, no al final', () => {
    assert.equal(toca('titular', 'Pedido'), true);
    assert.equal(toca('titular', 'Recibido'), false, 'a esas alturas ya está decidido');
  });

  test('lo que cuesta dejarlo listo, cuando está aquí', () => {
    assert.equal(toca('gastos', 'Confirmado'), false);
    assert.equal(toca('gastos', 'Recibido'), true);
  });

  test('con «ver todo» sale hasta lo que no toca', () => {
    assert.equal(toca('alLlegar', 'Pedido', true), true);
    assert.equal(toca('gastos', 'Borrador', true), true);
  });

  test('un estado que no conocemos no enseña nada, pero no rompe', () => {
    assert.equal(toca('papeles', 'Inventado'), false);
    assert.equal(toca('papeles', 'Inventado', true), true);
  });

  test('todas las fases del camino están contempladas', () => {
    for (const e of ['Borrador', 'Pedido', 'Confirmado', 'En camino', 'Recibido', 'Cancelado']) {
      assert.ok(LO_DE_CADA_FASE[e], `${e} no está en la tabla`);
    }
  });
});

/**
 * Los campos, uno por uno.
 *
 * La pregunta que resuelve esto es «¿esto hay que rellenarlo ahora?». Salían los
 * cinco en todas las fases, así que la respuesta parecía que sí siempre: hasta
 * la matrícula de un coche de importación, que todavía no existe.
 */
describe('qué campos se rellenan en cada fase', () => {
  test('en Pedido, a quién y por cuánto — nada más', () => {
    assert.deepEqual(
      camposDe('Pedido').map((c) => c.campo),
      ['proveedor', 'importe', 'fecha_estimada']
    );
  });

  test('la matrícula no sale hasta que el coche está aquí', () => {
    assert.equal(tocaCampo('matricula', 'Pedido'), false);
    assert.equal(tocaCampo('matricula', 'Confirmado'), false);
    assert.equal(tocaCampo('matricula', 'En camino'), false);
    assert.equal(tocaCampo('matricula', 'Recibido'), true);
  });

  test('qué campo cierra el paso a qué fase', () => {
    const obligan = CAMPOS.filter((c) => c.haceFaltaPara);
    assert.deepEqual(obligan.map((c) => [c.campo, c.haceFaltaPara]), [
      ['proveedor', 'Pedido'],
      ['importe', 'Confirmado'],
      // Mover un coche sin pagarlo es moverlo siendo todavía del vendedor.
      ['factura_proveedor', 'En camino'],
      ['factura_pagada_el', 'En camino'],
    ]);
  });

  test('el importe se puede poner desde el principio, y sigue estando al confirmar', () => {
    assert.equal(tocaCampo('importe', 'Borrador'), true);
    assert.equal(tocaCampo('importe', 'Pedido'), true);
    assert.equal(tocaCampo('importe', 'Confirmado'), true);
  });

  test('cada campo dice cuándo se sabe: si no, se rellena a ojo', () => {
    for (const c of CAMPOS) {
      assert.ok(c.pista && c.pista.length > 10, `${c.campo} no explica cuándo se sabe`);
    }
  });

  test('con «ver todo» salen los cinco, en cualquier fase', () => {
    assert.equal(camposDe('Recibido', true).length, CAMPOS.length);
    assert.equal(camposDe('Cancelado', true).length, CAMPOS.length);
  });

  test('lo que obliga a una fase se enseña en esa fase y en las de antes', () => {
    // Si el importe hace falta para Confirmado pero no saliera hasta después, la
    // puerta sería imposible de abrir desde la pantalla.
    for (const c of CAMPOS) {
      if (!c.haceFaltaPara) continue;
      assert.ok(c.fases.includes(c.haceFaltaPara),
        `${c.campo} hace falta para ${c.haceFaltaPara} y no sale en esa fase`);
    }
  });
});

describe('qué toca en un pedido, según de dónde viene el coche', () => {
  test('en importación, un pedido «Pedido» ya está comprado y pagado', () => {
    // Nace al liberar el dinero. «Esperando que lo acepten» no es que se
    // entienda mal: es falso, y quien lo lee cree que falta que el vendedor
    // conteste algo.
    assert.match(
      queTocaEnElPedido('Pedido', 'importacion', 'Esperando que lo acepten'),
      /Comprado y pagado/
    );
  });

  test('y «Confirmado» es que está listo para recoger', () => {
    assert.match(
      queTocaEnElPedido('Confirmado', 'importacion', 'Organizar la recogida'),
      /Listo para recoger/
    );
  });

  test('en los demás orígenes se queda la frase de siempre', () => {
    // Un coche de concesionario sí se encarga y sí hay que esperar que lo
    // acepten: ahí la frase vieja es la correcta.
    assert.equal(
      queTocaEnElPedido('Pedido', 'concesionario', 'Esperando que lo acepten'),
      'Esperando que lo acepten'
    );
  });

  test('y un estado que no esté en la tabla no deja el hueco vacío', () => {
    assert.equal(queTocaEnElPedido('Cancelado', 'importacion', 'Cancelado'), 'Cancelado');
  });
});

describe('un pedido de importación nace pagado', () => {
  test('en «Pedido» ya se puede apuntar su factura y el pago', () => {
    // El pedido se crea al liberar el dinero: en cuanto existe hay una factura
    // que apuntar. Sin esto, el panel decía arriba «falta apuntar su factura» y
    // abajo no había dónde.
    const campos = camposDe('Pedido', false, 'importacion').map((c) => c.campo);
    assert.ok(campos.includes('factura_proveedor'));
    assert.ok(campos.includes('factura_pagada_el'));
  });

  test('en los demás orígenes, en «Pedido» todavía no', () => {
    // Ahí «Pedido» es un encargo que aún no han aceptado: preguntar por el pago
    // sería preguntar por algo que no ha pasado.
    const campos = camposDe('Pedido', false, 'concesionario').map((c) => c.campo);
    assert.ok(!campos.includes('factura_proveedor'));
    assert.ok(!campos.includes('factura_pagada_el'));
  });

  test('y «Ver todo» los enseña igual, venga de donde venga', () => {
    const campos = camposDe('Pedido', true, 'concesionario').map((c) => c.campo);
    assert.ok(campos.includes('factura_proveedor'));
  });
});

describe('los papeles, donde se piden', () => {
  test('en importación, el pedido enseña Documentos desde «Pedido»', () => {
    // Si ahí ya se apunta el número de la factura, ahí tiene que poder
    // adjuntarse el PDF. Pedir un dato y no dar dónde ponerlo es lo que acaba
    // con el papel en el correo de alguien.
    assert.equal(toca('papeles', 'Pedido', false, 'importacion'), true);
  });

  test('en los demás, todavía no hay papeles que reunir', () => {
    assert.equal(toca('papeles', 'Pedido', false, 'concesionario'), false);
  });

  test('y en «Confirmado» los enseña para todos, como siempre', () => {
    assert.equal(toca('papeles', 'Confirmado', false, 'concesionario'), true);
  });
});

describe('lo que en una importación no se decide en el pedido', () => {
  test('«Lo esperamos para» no sale: lo dice el vendedor', () => {
    // Es cuándo estará listo para recoger, y se le pregunta desde Transportes
    // junto con la dirección, la hora y si entra un portacoches. Un campo de
    // fecha suelto aquí invita a poner una a ojo, y de ahí sale una orden de
    // recogida para un día en el que el coche no está listo.
    for (const estado of ['Pedido', 'Confirmado', 'En camino']) {
      const campos = camposDe(estado, false, 'importacion').map((c) => c.campo);
      assert.ok(!campos.includes('fecha_estimada'), `sale en ${estado}`);
    }
  });

  test('en los demás orígenes sigue estando', () => {
    // Ahí sí es nuestra: se la pedimos al proveedor al encargar.
    const campos = camposDe('Pedido', false, 'concesionario').map((c) => c.campo);
    assert.ok(campos.includes('fecha_estimada'));
  });

  test('y con «Ver todo» se puede corregir igual', () => {
    const campos = camposDe('Pedido', true, 'importacion').map((c) => c.campo);
    assert.ok(campos.includes('fecha_estimada'));
  });
});
