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
