/**
 * Las facturas que emitimos y no llegan.
 *
 * Lo que se protege es una promesa escrita: en el correo de cierre se le dice
 * al cliente «te llega la factura por separado», y hoy eso solo pasa si alguien
 * entra a Facturación y descarga el PDF. Si nadie la abre, no le llega nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR, sePuedeEnviar } from './facturas-sin-enviar.js';

describe('cuáles cuentan', () => {
  test('solo las que salen de aquí', () => {
    /*
     * `direction = 'emitted'`. Las recibidas son las que nos tienen que llegar
     * a nosotros de un proveedor, y de ésas ya hay otra lista.
     */
    for (const sql of [SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR]) {
      assert.match(sql, /direction = 'emitted'/);
    }
  });

  test('y solo mientras no conste que se enviaron', () => {
    for (const sql of [SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR]) {
      assert.match(sql, /cw_sent_at IS NULL/);
    }
  });

  test('una sin correo del cliente no cuenta', () => {
    /*
     * No se puede mandar. Ponerla en una lista de «pendientes de enviar» es
     * pedir algo que nadie puede hacer desde ahí, y una lista con filas
     * imposibles se deja de mirar.
     */
    for (const sql of [SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR]) {
      assert.match(sql, /COALESCE\(customer_email, ''\) <> ''/);
    }
    assert.equal(sePuedeEnviar({ customer_email: 'a@b.c' }), true);
    assert.equal(sePuedeEnviar({ customer_email: '   ' }), false);
    assert.equal(sePuedeEnviar({}), false);
  });

  test('el PDF generado NO se toma por enviada', () => {
    /*
     * Era la tentación, para no arrastrar las históricas. Pero abre un agujero
     * hacia delante: una factura cuyo PDF se generó y cuyo correo falló tiene
     * PDF y no tiene envío — que es **justo** el caso que este aviso existe
     * para cazar. Y se midió antes: en producción no hay ninguna emitida, así
     * que no había avalancha que esconder.
     */
    for (const sql of [SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR]) {
      assert.doesNotMatch(sql, /pdf_url/);
    }
  });

  test('la lista trae el correo, que es la pregunta que se hace', () => {
    // Al abrir esto no se pregunta cuántas hay: se pregunta a quién no le ha
    // llegado la suya.
    assert.match(SQL_LAS_SIN_ENVIAR, /customer_email/);
    assert.match(SQL_LAS_SIN_ENVIAR, /invoice_number/);
  });

  test('y las más viejas primero', () => {
    // La que lleva tres semanas sin llegar es la que peor sienta.
    assert.match(SQL_LAS_SIN_ENVIAR, /ORDER BY created_at ASC/);
  });
});
