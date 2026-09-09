/**
 * El día 30 de un encargo.
 *
 * Lo que se protege: que al cliente no le lleguen cinco correos, que no se
 * pierda ninguno si el cron no corre un día, y que un coche sin mandato no
 * siga anunciado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SQL_LOS_QUE_VENCEN, SQL_MARCA_AVISADO, SQL_RETIRA_EL_ANUNCIO,
  elCoche, elCorreoDeVencimiento,
} from './vence-el-encargo.js';

describe('a quién le toca vencer', () => {
  test('los que ya se pasaron, no los que vencen hoy', () => {
    /*
     * Si el cron no corrió un día —o el despliegue se cayó—, los de ayer tienen
     * que salir mañana igual. Una tarea diaria que solo mira el día de hoy
     * pierde en silencio todo lo que pase mientras no corre.
     */
    assert.match(SQL_LOS_QUE_VENCEN, /vence_at < NOW\(\)/);
    assert.ok(
      !/DATE\(|::date|CURRENT_DATE/.test(SQL_LOS_QUE_VENCEN),
      'está mirando un día concreto: lo que se pierda mientras no corra, se pierde',
    );
  });

  test('y solo los que siguen abiertos', () => {
    assert.match(SQL_LOS_QUE_VENCEN, /cerrado_at IS NULL/);
  });

  test('sin fecha de vencimiento no vence nadie', () => {
    // Una fila sin fecha es una fila mal escrita. Vencerla sería despublicar el
    // coche de alguien que está pagando por tenerlo publicado.
    assert.match(SQL_LOS_QUE_VENCEN, /vence_at IS NOT NULL/);
  });

  test('a nadie se le escribe dos veces', () => {
    assert.match(SQL_LOS_QUE_VENCEN, /avisado_at IS NULL/);
  });
});

describe('cómo se marca', () => {
  test('con una marca, no con una fecha que haya que comparar', () => {
    // Comparar fechas obliga a acertar con la zona horaria, y aquí fallar es un
    // correo repetido a un cliente.
    assert.match(SQL_MARCA_AVISADO, /SET avisado_at = NOW\(\)/);
  });

  test('y solo si no estaba marcado ya', () => {
    /*
     * Es lo que hace que dos ejecuciones a la vez no manden dos correos: la
     * segunda no actualiza ninguna fila y se queda sin nada que hacer.
     */
    assert.match(SQL_MARCA_AVISADO, /WHERE id = \$1 AND avisado_at IS NULL/);
    assert.match(SQL_MARCA_AVISADO, /RETURNING id/,
      'sin RETURNING no hay forma de saber si esta ejecución se lo quedó');
  });

  test('el encargo queda como vencido', () => {
    assert.match(SQL_MARCA_AVISADO, /estado = 'vencido'/);
  });
});

describe('el coche fuera del escaparate', () => {
  test('se apaga el anuncio', () => {
    assert.match(SQL_RETIRA_EL_ANUNCIO, /SET is_active = FALSE/);
  });

  test('en la tabla del marketplace de ocasión, que es donde vive un IDCar', () => {
    assert.match(SQL_RETIRA_EL_ANUNCIO, /UPDATE moveadvisor_marketplace_vo_offers/);
  });

  test('y no cuenta como cambio si ya estaba apagado', () => {
    assert.match(SQL_RETIRA_EL_ANUNCIO, /COALESCE\(is_active, FALSE\) = TRUE/);
  });
});

describe('el correo', () => {
  test('dice qué coche es', () => {
    const c = elCorreoDeVencimiento({ brand: 'Seat', model: 'Ibiza', plate: '8888LXR' });
    assert.match(c.subject, /Seat Ibiza \(8888LXR\)/);
  });

  test('se apaña con lo que haya', () => {
    assert.equal(elCoche({ brand: 'Seat', model: 'Ibiza' }), 'Seat Ibiza');
    assert.equal(elCoche({ plate: '8888LXR' }), '8888LXR');
    assert.equal(elCoche({}), 'tu coche');
  });

  test('dice que no hay ningún cargo', () => {
    // Hoy no se cobra al que agota el plazo. Si algún día se cobra, este texto
    // es lo primero que hay que cambiar.
    assert.match(elCorreoDeVencimiento({}).html, /no hay ningún cargo/);
  });

  test('y le ofrece seguir sin repetir el trabajo', () => {
    /*
     * Es el objetivo del correo. Renovar es la diferencia entre esa rama a
     * −92 € y una venta: si el correo solo se despidiera, no serviría de nada
     * mandarlo.
     */
    const html = elCorreoDeVencimiento({}).html;
    assert.match(html, /renovamos/);
    assert.match(html, /no hay que repetirlos/);
  });

  test('saluda por su nombre cuando lo hay, y sin él cuando no', () => {
    assert.match(elCorreoDeVencimiento({ cliente_nombre: 'Ana' }).html, /Hola, Ana:/);
    assert.match(elCorreoDeVencimiento({}).html, /<p>Hola:<\/p>/);
  });
});
