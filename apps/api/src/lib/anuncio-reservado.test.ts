/**
 * Un coche de importación que ya es de un cliente deja de ofrecerse.
 *
 * El Kia Sorento se entregó el 1 de septiembre y seguía en el escaparate de
 * importación una semana después. Ese anuncio es de AutoScout24 y sigue vivo, y
 * sigue saliendo a cuenta, así que ninguna de las dos banderas que ya había lo
 * apartaba — y otro cliente podía encargar exactamente el mismo coche.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { yaEsDeUnCliente, DESDE_QUE_ES_SUYO, SQL_RESERVA } from './anuncio-reservado.js';

describe('desde cuándo el coche ya es de alguien', () => {
  test('desde que se le ha pagado al vendedor alemán', () => {
    assert.equal(DESDE_QUE_ES_SUYO, 'Verificado y pagado');
    for (const etapa of ['Verificado y pagado', 'En transporte', 'En trámites', 'Entregado']) {
      assert.equal(yaEsDeUnCliente(etapa), true, `«${etapa}» debería contar`);
    }
  });

  test('con el depósito retenido todavía no', () => {
    /*
     * De ahí sí se vuelve: si el perito dice que no es el coche que se anunció,
     * se devuelve el depósito entero y ese anuncio queda libre. Reservarlo antes
     * obligaría a soltarlo después, y una reserva que hay que acordarse de
     * soltar acaba escondiendo coches para siempre.
     */
    assert.equal(yaEsDeUnCliente('Depósito retenido'), false);
    assert.equal(yaEsDeUnCliente('Pendiente'), false);
    assert.equal(yaEsDeUnCliente('Contactado'), false);
  });

  test('y lo que no es una etapa, tampoco', () => {
    for (const raro of ['Descartado', 'Vendido', '', null, undefined, 3]) {
      assert.equal(yaEsDeUnCliente(raro), false, `«${String(raro)}» ha colado`);
    }
  });

  test('los espacios no cambian la respuesta', () => {
    assert.equal(yaEsDeUnCliente('  Entregado  '), true);
  });
});

describe('cómo se retira', () => {
  test('marcando import_locked, y no las otras dos banderas', () => {
    /*
     * `is_active` dice si el anuncio sigue vivo en AutoScout24 y lo reescribe
     * el verificador; `import_published`, si el ahorro es bueno, y lo recalcula
     * un script. Apagar cualquiera de las dos aquí dura hasta la siguiente
     * pasada. `import_locked` no lo toca ninguna automatización.
     */
    assert.match(SQL_RESERVA, /SET import_locked = TRUE/);
    assert.ok(!/is_active/.test(SQL_RESERVA), 'toca is_active, que lo reescribe el verificador');
    assert.ok(!/import_published/.test(SQL_RESERVA), 'toca import_published, que lo recalcula el script');
  });

  test('sobre la tabla de los anuncios rastreados, no sobre la de VO', () => {
    // El coche de una importación vive en `moveadvisor_market_offers`. La otra
    // tabla es la del stock de concesionarios, y ahí ese id no existe: la
    // consulta no fallaría, simplemente no tocaría ninguna fila.
    assert.match(SQL_RESERVA, /UPDATE moveadvisor_market_offers/);
  });

  test('y no cuenta como cambio si ya estaba reservado', () => {
    // Volver a guardar un expediente entregado no puede parecer que ha hecho
    // algo. Sin esto, cada guardado sella `updated_at` y el anuncio parece
    // recién tocado.
    assert.match(SQL_RESERVA, /COALESCE\(import_locked, FALSE\) = FALSE/);
  });
});
