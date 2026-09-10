/**
 * Cerrar un encargo, y qué se le cobra al hacerlo.
 *
 * Es la parte que se discute con un cliente por teléfono, así que lo que se
 * protege es que la factura diga lo mismo que su ficha: si en pantalla pone que
 * ya se puede ir sin pagar, la factura no puede salir por 150 €.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOTIVOS, COMO_ACABO, esUnMotivo, loQueSeLeFactura, seLeCobra,
  TIPO_DE_FACTURA, SQL_YA_EMITIDA, SQL_CIERRA,
} from './cierre-del-encargo.js';
import { FEE_DE_GESTION, FEE_DE_CANCELACION } from './encargo-de-venta.js';

const AHORA = new Date('2026-09-10T10:00:00Z');
const firmadoHace = (n: number) => new Date(AHORA.getTime() - n * 86400000).toISOString();

describe('las tres formas de acabar', () => {
  test('vendido, se fue, o lo retiramos nosotros', () => {
    assert.deepEqual([...MOTIVOS], ['vendido', 'se_fue', 'retirado']);
    for (const m of MOTIVOS) assert.ok(COMO_ACABO[m], `falta cómo se llama ${m}`);
  });

  test('y nada más cuela', () => {
    for (const raro of ['cerrado', '', null, undefined, 'VENDIDO ']) {
      assert.equal(esUnMotivo(raro), false, String(raro));
    }
    assert.equal(esUnMotivo('vendido'), true);
    assert.equal(esUnMotivo('  se_fue  '), true, 'los espacios no deberían importar');
  });
});

describe('lo que se le factura', () => {
  const firmoElPrecio = { firmado_at: firmadoHace(10), acepto_el_precio: true };

  test('si vendió con nosotros, el fee de gestión', () => {
    const f = loQueSeLeFactura('vendido', firmoElPrecio, AHORA);
    assert.equal(f?.total, FEE_DE_GESTION);
    assert.match(f!.concepto, /Gestión integral/);
  });

  test('con el IVA incluido, no por encima', () => {
    /*
     * Al cliente se le dijo «299 €». A un particular se le dice el precio
     * final: si la factura sumara 361,79 € habríamos cobrado un 21 % más de lo
     * prometido.
     */
    const f = loQueSeLeFactura('vendido', firmoElPrecio, AHORA)!;
    assert.equal(f.total, 299);
    assert.equal(f.iva, 21);
    assert.equal(Number((f.base + f.cuota).toFixed(2)), 299, 'base + cuota tiene que dar el total');
    assert.ok(f.base < f.total);
  });

  test('si se va antes de los 30 días, la penalización', () => {
    const f = loQueSeLeFactura('se_fue', firmoElPrecio, AHORA);
    assert.equal(f?.total, FEE_DE_CANCELACION);
    assert.match(f!.concepto, /Cancelación/);
  });

  test('si se va después, no se le cobra nada', () => {
    // Y `null`, no una factura de 0 €: eso no existe.
    assert.equal(loQueSeLeFactura('se_fue', { firmado_at: firmadoHace(40), acepto_el_precio: true }, AHORA), null);
    assert.equal(seLeCobra('se_fue', { firmado_at: firmadoHace(40), acepto_el_precio: true }, AHORA), false);
  });

  test('el que no firmó el precio paga aunque hayan pasado meses', () => {
    const f = loQueSeLeFactura('se_fue', { firmado_at: firmadoHace(200), acepto_el_precio: false }, AHORA);
    assert.equal(f?.total, FEE_DE_CANCELACION);
  });

  test('y si lo retiramos nosotros, nunca se le cobra', () => {
    /*
     * El coche ya no existe, el cliente no contesta, se lo quedó un familiar.
     * Cobrarle ahí sería cobrarle por una decisión nuestra.
     */
    for (const e of [
      { firmado_at: firmadoHace(1), acepto_el_precio: false },
      { firmado_at: firmadoHace(1), acepto_el_precio: true },
      { firmado_at: firmadoHace(90), acepto_el_precio: true },
    ]) {
      assert.equal(loQueSeLeFactura('retirado', e, AHORA), null);
    }
  });

  test('la factura dice lo mismo que su ficha', () => {
    /*
     * Es el invariante que importa: `laPenalizacion` es lo que se le enseña en
     * la ficha del encargo, y es lo que decide el importe aquí. Si se calcularan
     * por separado, en pantalla pondría que ya puede irse gratis y le llegaría
     * una factura de 150 €.
     */
    const justoAntes = { firmado_at: firmadoHace(29), acepto_el_precio: true };
    const justoDespues = { firmado_at: firmadoHace(30), acepto_el_precio: true };
    assert.equal(loQueSeLeFactura('se_fue', justoAntes, AHORA)?.total, 150);
    assert.equal(loQueSeLeFactura('se_fue', justoDespues, AHORA), null);
  });
});

describe('que no se emita dos veces', () => {
  test('la factura se ata al encargo, no al coche', () => {
    /*
     * Un mismo coche puede tener dos encargos con meses de diferencia —el señor
     * vuelve el año que viene— y cada uno con su factura. Atándola al coche, la
     * segunda no se podría emitir nunca.
     */
    assert.match(SQL_YA_EMITIDA, /contract_id = \$2/);
    assert.ok(!/vehicle_id/.test(SQL_YA_EMITIDA), 'está atada al coche');
  });

  test('y el tipo va como parámetro, no incrustado en la cadena', () => {
    /*
     * Interpolado funciona —la plantilla se resuelve al cargar el módulo— pero
     * deja escrita una consulta que nadie puede ejecutar tal cual: ni el
     * comprobador del panel ni una prueba contra la base, porque lo que hay en
     * el fichero es un hueco sin rellenar. Se descubrió así, con la
     * comprobación contra la base devolviendo cero filas.
     */
    assert.match(SQL_YA_EMITIDA, /type = \$1/);
    assert.ok(!SQL_YA_EMITIDA.includes(TIPO_DE_FACTURA), 'el tipo está incrustado en el SQL');
  });

  test('y el encargo solo se cierra si estaba abierto', () => {
    // Dos personas mirando la misma pantalla no pueden pisarse el motivo ni la
    // fecha.
    assert.match(SQL_CIERRA, /WHERE id = \$1 AND cerrado_at IS NULL/);
    assert.match(SQL_CIERRA, /RETURNING id/);
  });

  test('y queda escrito por qué se cerró', () => {
    // Sin el motivo, dentro de tres meses un encargo cerrado no dice si se
    // vendió, si se fue o si lo retiramos.
    assert.match(SQL_CIERRA, /motivo_cierre = \$2/);
  });
});

describe('lo que la pantalla enseña antes de pulsar', () => {
  /*
   * El importe de cada final se calcula en el servidor y viaja a la pantalla.
   * Si la pantalla lo repitiera con su propia cuenta, un dia enseñaria una
   * cifra y el boton cobraria otra — y quien lo descubre es el cliente,
   * mirando una factura que no esperaba.
   */
  const RUTA = readFileSync(
    new URL('../routes/encargos.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const PANTALLA = readFileSync(
    new URL('../../../web/src/pages/idcar/EncargoDeVenta.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  test('los tres finales con su importe salen del servidor', () => {
    assert.match(RUTA, /cierres: encargo[\s\S]{0,220}loQueSeLeFactura\(m, encargo\)\?\.total/);
  });

  test('y la pantalla los pinta, no los calcula', () => {
    /*
     * Sin los comentarios: la regla es sobre el codigo, y el comentario que
     * explica por que se quito un numero a mano nombra ese numero.
     *
     * Esto ya encontro uno de verdad: la pantalla tenia un «150» escrito como
     * respaldo por si el servidor no mandaba importe. Una cifra inventada
     * esperando su turno.
     */
    const codigo = PANTALLA
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    assert.match(codigo, /datos\.cierres\.map/);
    for (const cuenta of ['299', '150', 'FEE_DE_GESTION', 'laPenalizacion']) {
      assert.ok(!codigo.includes(cuenta), `la pantalla calcula el importe por su cuenta: ${cuenta}`);
    }
  });

  test('cerrar va detras de un clic, no como tres botones sueltos', () => {
    // Emite una factura a un cliente: no puede estar a un toque accidental
    // mientras se mira si le faltan fotos.
    assert.match(PANTALLA, /\{!cerrando \? \(/);
    assert.match(PANTALLA, /No se deshace/);
  });
});
