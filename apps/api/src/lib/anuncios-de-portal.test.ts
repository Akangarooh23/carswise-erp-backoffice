/**
 * Los anuncios que ponemos fuera, y quitarlos a tiempo.
 *
 * Lo que se protege es el fallo del Kia Sorento, pero en canales que no
 * controlamos: se entregó el 1 de septiembre y seguía publicado una semana
 * después. Aquí no basta con una consulta —hay que entrar a coches.net y
 * borrarlo— y el teléfono que sale en ese anuncio es el nuestro.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTALES, elPortal, faltaParaApuntar, losQueSiguenPuestos,
  SQL_POR_RETIRAR, SQL_LOS_POR_RETIRAR, SQL_RETIRA,
  elEnlaceParaElPortal, MEDIO, ENSURE_TABLE, ENSURE_UNO_VIVO,
} from './anuncios-de-portal.js';

describe('cómo se llama cada portal', () => {
  test('los que ya conocemos se reconocen escritos de cualquier forma', () => {
    /*
     * Escrito a mano cada vez, «coches.net», «Coches.net» y «cochesnet» acaban
     * siendo tres portales en la lista, y entonces no se puede contestar ni
     * dónde está un coche ni cuánto cuesta cada portal.
     */
    for (const escrito of ['coches.net', 'Coches.net', 'COCHES NET', 'cochesnet']) {
      assert.equal(elPortal(escrito), 'coches.net', escrito);
    }
    assert.equal(elPortal('autoscout24'), 'AutoScout24');
    assert.equal(elPortal('WALLAPOP'), 'Wallapop');
  });

  test('y uno nuevo se acepta tal cual', () => {
    // Mañana puede haber otro portal y eso no es motivo para no poder apuntarlo.
    assert.equal(elPortal('Autocasión'), 'Autocasión');
  });

  test('sin nombre, nada', () => {
    assert.equal(elPortal(''), '');
    assert.equal(elPortal(null), '');
    assert.equal(elPortal('   '), '');
  });

  test('están los cuatro que promete la web', () => {
    assert.deepEqual([...PORTALES], ['coches.net', 'AutoScout24', 'Milanuncios', 'Wallapop']);
  });
});

describe('qué hace falta para apuntar una publicación', () => {
  const bien = { vehicle_id: 'veh-1', portal: 'coches.net', url: 'https://coches.net/x' };

  test('con todo puesto, nada', () => {
    assert.equal(faltaParaApuntar(bien), '');
  });

  test('el enlace se exige, y por una razón', () => {
    /*
     * Es por donde se entra a borrarlo. Apuntar «está en Milanuncios» sin la
     * dirección obliga a buscarlo entre los anuncios de la cuenta el día que
     * haya que quitarlo — que es justo el día en que nadie tiene tiempo.
     */
    assert.match(faltaParaApuntar({ ...bien, url: '' }), /enlace/);
    assert.match(faltaParaApuntar({ ...bien, url: 'coches.net/x' }), /http/);
  });

  test('y el coche y el portal también', () => {
    assert.notEqual(faltaParaApuntar({ ...bien, vehicle_id: '' }), '');
    assert.notEqual(faltaParaApuntar({ ...bien, portal: '' }), '');
  });
});

describe('cuáles siguen puestos', () => {
  test('los que no tienen fecha de retirada', () => {
    const lista = [
      { portal: 'coches.net', url: 'x', retirado_at: null },
      { portal: 'Wallapop', url: 'y', retirado_at: '2026-09-01' },
    ];
    assert.deepEqual(losQueSiguenPuestos(lista).map((a) => a.portal), ['coches.net']);
  });
});

describe('cuándo hay que retirar', () => {
  test('la regla mira el escaparate, no el estado del encargo', () => {
    /*
     * Si el coche ya no está publicado en nuestro marketplace, tampoco puede
     * estarlo en los de fuera. Da igual por qué se cayó —vendido, vencido,
     * cancelado, retirado a mano—: mirar el estado del encargo dejaría fuera
     * todos los motivos que todavía no se nos han ocurrido.
     */
    assert.match(SQL_POR_RETIRAR, /COALESCE\(o\.is_active, FALSE\) = FALSE/);
    assert.ok(!/estado|cerrado_at|vencido/.test(SQL_POR_RETIRAR),
      'está mirando el encargo en vez del escaparate');
  });

  test('solo los que no se han retirado ya', () => {
    assert.match(SQL_POR_RETIRAR, /a\.retirado_at IS NULL/);
  });

  test('un coche cuya oferta ya ni existe cuenta igual', () => {
    /*
     * Es el caso peor y el más fácil de dejarse: borramos la oferta de casa y
     * el anuncio de coches.net se queda huérfano, con nuestro teléfono debajo.
     * Con un LEFT JOIN la fila sin pareja tiene `is_active` nulo, y el COALESCE
     * la deja dentro.
     */
    assert.match(SQL_POR_RETIRAR, /LEFT JOIN moveadvisor_marketplace_vo_offers/);
    assert.ok(!/INNER JOIN|\n\s*JOIN /.test(SQL_POR_RETIRAR),
      'con un JOIN normal, el coche sin oferta desaparecería del aviso');
  });

  test('se cuentan coches, no anuncios', () => {
    // Quien mira el panel tiene que salir sabiendo a cuántos coches hay que
    // entrar, no cuántas pestañas va a abrir.
    assert.match(SQL_POR_RETIRAR, /COUNT\(DISTINCT a\.vehicle_id\)/);
  });

  test('la lista usa la misma condición que la cuenta', () => {
    // Si no coincidieran, el panel mandaría a una pantalla donde no está lo que
    // anuncia — que es como se pierde la confianza en un aviso.
    for (const trozo of ['a.retirado_at IS NULL', 'COALESCE(o.is_active, FALSE) = FALSE']) {
      assert.ok(SQL_LOS_POR_RETIRAR.includes(trozo), trozo);
    }
  });

  test('y los más viejos salen primero', () => {
    // El que lleva más tiempo puesto es el que más llamadas de un coche vendido
    // está recibiendo.
    assert.match(SQL_LOS_POR_RETIRAR, /ORDER BY a\.publicado_at ASC/);
  });
});

describe('retirar uno', () => {
  test('deja quién y cuándo', () => {
    assert.match(SQL_RETIRA, /SET retirado_at = NOW\(\), retirado_por = \$2/);
  });

  test('y volver a pulsar no reescribe el rastro', () => {
    // Si no, la fecha pasaría a ser la última vez que alguien tocó el botón, y
    // no la vez que se retiró de verdad.
    assert.match(SQL_RETIRA, /WHERE id = \$1 AND retirado_at IS NULL/);
    assert.match(SQL_RETIRA, /RETURNING id/);
  });
});

describe('el enlace que se pega en el portal', () => {
  const SITIO = 'https://popcar.com.es';

  test('es la dirección corta, la que se puede teclear', () => {
    /*
     * En coches.net no se puede enlazar: solo se mete texto que alguien copia
     * o teclea. `/marketplace-vo/idcar-veh-1778144236925` no lo teclea nadie.
     */
    assert.match(elEnlaceParaElPortal(SITIO, '8888LXR', 'coches.net'), /popcar\.com\.es\/v\/8888LXR/);
  });

  test('y lleva la UTM del portal, generada y no escrita a mano', () => {
    /*
     * Sin ella, el comprador que llega de coches.net entra como «directo» y no
     * hay forma de saber si el portal trae gente o solo cuesta dinero — que es
     * la única pregunta que decide si se sigue pagando.
     */
    const url = elEnlaceParaElPortal(SITIO, '8888LXR', 'coches.net');
    assert.match(url, /utm_source=coches\.net/);
    assert.match(url, new RegExp(`utm_medium=${MEDIO}`));
  });

  test('el nombre del portal se normaliza antes de meterlo', () => {
    /*
     * Escrito a mano salen «coches.net», «Coches.net» y «cochesnet», y en el
     * informe son tres fuentes distintas: la respuesta a «¿cuánto trae
     * coches.net?» se reparte en tres filas que nadie suma.
     */
    for (const escrito of ['coches.net', 'Coches.net', 'COCHESNET', ' coches net ']) {
      assert.match(
        elEnlaceParaElPortal(SITIO, '8888LXR', escrito),
        /utm_source=coches\.net(&|$)/,
        `«${escrito}» no acaba en la misma fuente`,
      );
    }
  });

  test('la matrícula también, aunque venga con espacios', () => {
    // Quien la copia de la ficha se trae los espacios, y `/v/8888 LXR` no
    // resuelve a nada.
    assert.match(elEnlaceParaElPortal(SITIO, '8888 lxr', 'coches.net'), /\/v\/8888LXR\?/);
  });

  test('sin matrícula no se devuelve un enlace roto', () => {
    /*
     * `/v/` a secas lleva a un 400. Devolver cadena vacía deja que la pantalla
     * no pinte el botón, que es mejor que pintarlo y que no funcione.
     */
    assert.equal(elEnlaceParaElPortal(SITIO, '', 'coches.net'), '');
    assert.equal(elEnlaceParaElPortal(SITIO, '   ', 'coches.net'), '');
  });

  test('y una barra de más no deja una doble', () => {
    assert.match(elEnlaceParaElPortal('https://popcar.com.es/', '8888LXR', 'coches.net'), /es\/v\//);
  });
});

describe('un anuncio vivo por coche y portal', () => {
  test('no se puede apuntar dos veces el mismo', () => {
    /*
     * Con dos filas, retirar una no apaga el aviso: el coche seguiría saliendo
     * como pendiente de retirar para siempre, y una lista que no se vacía es
     * una lista que se deja de mirar.
     */
    assert.match(ENSURE_UNO_VIVO, /ON erp_anuncios_de_portal \(vehicle_id, portal\)/);
  });

  test('pero el mismo coche puede estar en dos portales', () => {
    // Es justo lo que se quiere poder apuntar: dónde está cada coche.
    assert.match(ENSURE_UNO_VIVO, /\(vehicle_id, portal\)/);
  });

  test('y los retirados no estorban a uno nuevo', () => {
    // Un coche que vuelve a anunciarse el mes que viene se apunta otra vez.
    assert.match(ENSURE_UNO_VIVO, /WHERE retirado_at IS NULL/);
  });

  test('la tabla guarda quién lo puso y quién lo quitó', () => {
    /*
     * Es lo que convierte «alguien lo retiró» en «lo retiró Marta el martes».
     * Sin eso, cuando un anuncio sigue puesto no hay a quién preguntar.
     */
    assert.match(ENSURE_TABLE, /publicado_por/);
    assert.match(ENSURE_TABLE, /retirado_por/);
  });
});
