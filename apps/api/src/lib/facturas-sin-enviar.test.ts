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
import { AL_CLIENTE } from './a-quien-se-le-manda.js';

const LAS_DOS = [SQL_SIN_ENVIAR, SQL_LAS_SIN_ENVIAR];

describe('cuáles cuentan', () => {
  test('solo las que salen de aquí', () => {
    /*
     * `direction = 'emitted'`. Las recibidas son las que nos tienen que llegar
     * a nosotros de un proveedor, y de ésas ya hay otra lista.
     */
    for (const sql of LAS_DOS) assert.match(sql, /direction = 'emitted'/);
  });

  test('y solo mientras no conste que se enviaron', () => {
    for (const sql of LAS_DOS) assert.match(sql, /cw_sent_at IS NULL/);
  });

  test('una a la que no se sabe a quién mandarla no cuenta', () => {
    /*
     * No se puede mandar. Ponerla en una lista de «pendientes de enviar» es
     * pedir algo que nadie puede hacer desde ahí, y una lista con filas
     * imposibles se deja de mirar.
     */
    for (const sql of LAS_DOS) assert.match(sql, /COALESCE\(\s*CASE WHEN[\s\S]*?END, ''\) <> ''/);
    assert.equal(sePuedeEnviar({ type: 'vehicle_sale', customer_email: 'a@b.c' }), true);
    assert.equal(sePuedeEnviar({ type: 'vehicle_sale', customer_email: '   ' }), false);
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
    for (const sql of LAS_DOS) assert.doesNotMatch(sql, /pdf_url/);
  });

  test('la lista trae a quién, que es la pregunta que se hace', () => {
    // Al abrir esto no se pregunta cuántas hay: se pregunta a quién no le ha
    // llegado la suya.
    assert.match(SQL_LAS_SIN_ENVIAR, /END AS a_quien/);
    assert.match(SQL_LAS_SIN_ENVIAR, /i\.invoice_number/);
  });

  test('y las más viejas primero', () => {
    // La que lleva tres semanas sin llegar es la que peor sienta.
    assert.match(SQL_LAS_SIN_ENVIAR, /ORDER BY i\.created_at ASC/);
  });
});

describe('el SQL dice lo mismo que la regla', () => {
  /**
   * Las tres copias del `CASE`, sacadas del SQL.
   *
   * La regla de a quién va cada factura vive en `a-quien-se-le-manda.ts`, pero
   * aquí está repetida a mano tres veces porque el comprobador del panel lee
   * estas consultas del fichero y las ejecuta: una armada con `${...}` saldría
   * rota siempre. Esta prueba es lo que sustituye a la constante.
   */
  const losTipos = (sql: string) =>
    [...sql.matchAll(/i\.type IN \(([^)]*)\)/g)]
      .map((m) => m[1].split(',').map((t) => t.trim().replace(/'/g, '')));

  test('los tipos del SQL son exactamente los de AL_CLIENTE', () => {
    const listas = LAS_DOS.flatMap(losTipos);
    assert.equal(listas.length, 3, 'son tres copias del CASE: una cuenta y dos la lista');
    for (const lista of listas) assert.deepEqual(lista, [...AL_CLIENTE]);
  });

  test('y a los demás se les manda por la ficha del proveedor, no al cliente', () => {
    /*
     * Es el fallo que esto arregla, dicho en SQL: la comisión del concesionario
     * sale a nombre del concesionario y el correo se mandaba a
     * `customer_email`, que ahí es el particular que fue a ver el coche.
     */
    for (const sql of LAS_DOS) {
      assert.match(sql, /LEFT JOIN erp_proveedores p ON p\.id = i\.proveedor_id/);
      assert.match(sql, /ELSE p\.email/);
    }
  });
});
