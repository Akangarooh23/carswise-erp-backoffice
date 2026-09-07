/**
 * Cada factura, atada a la ficha de quien la emite.
 *
 * Hasta ahora la única atadura era `provider_name`, texto libre. Eso vale para
 * leer una factura y no vale para sumar: «Becker Solutions, S.L.» y «Becker
 * Solutions, S.L. (Becker Lines)» son el mismo acreedor escrito de dos maneras,
 * y en la base hay una factura de cada forma.
 *
 * Y lo será más el día que Modrive tenga sedes: Madrid y Barcelona facturan con
 * su dirección y declaran las dos con Modrive SL. Sin la ficha, sumar eso es
 * comparar cadenas de texto.
 *
 * Se comprueba leyendo el SQL de la ruta: lo que hay que fijar es qué se
 * escribe, qué no se toca y qué se queda fuera, y eso está escrito ahí.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./provider-billing.ts', import.meta.url), 'utf8');

const ELRELLENO = FUENTE.slice(
  FUENTE.indexOf('async function ataLasQueYaEstaban'),
  FUENTE.indexOf('async function laFichaDe'),
);

describe('la columna', () => {
  test('se crea sola, como el resto del esquema', () => {
    // Nadie corre migraciones a mano en este proyecto.
    assert.match(FUENTE, /ADD COLUMN IF NOT EXISTS proveedor_id VARCHAR\(40\)/);
  });

  test('y el nombre que se imprimió no se toca', () => {
    /*
     * `provider_name` es lo que decía el documento cuando se emitió.
     * Reescribirlo a posteriori cambiaría una factura ya emitida: la columna
     * nueva es para sumar, la vieja es lo que se imprimió.
     */
    assert.ok(
      !/SET provider_name/.test(FUENTE),
      'se está reescribiendo el nombre de una factura ya emitida',
    );
  });
});

describe('las que ya estaban', () => {
  test('se atan al arrancar, y solo las que no tienen ficha', () => {
    // Volver a pasar no puede cambiar nada: si no, cada arranque reescribiría
    // lo que alguien hubiera corregido a mano.
    assert.match(ELRELLENO, /WHERE proveedor_id IS NULL/);
    assert.match(ELRELLENO, /SET proveedor_id = \$2/);
  });

  test('con el mismo emparejador que usa el resto', () => {
    // «Becker Solutions, S.L.» tiene que encontrar a «Becker Solutions, S.L.
    // (Becker Lines)», y esa regla ya está escrita y probada.
    assert.match(ELRELLENO, /elProveedorDe\(provider_name, fichas\.rows\)/);
  });

  test('y las ventas de vehículo se quedan fuera', () => {
    /*
     * En una venta el otro lado es un cliente, no un proveedor. De las ocho
     * facturas que hay, la única que no casa con ninguna ficha es justo esa: la
     * del T-Roc, a nombre de una persona. Ponerle una ficha de proveedor sería
     * decir que le compramos algo a quien le hemos vendido un coche.
     */
    const veces = (ELRELLENO.match(/type <> 'vehicle_sale'/g) ?? []).length;
    assert.equal(veces, 2, 'la exclusión tiene que estar al buscar y al escribir');
  });

  test('lo que no casa se queda sin ficha, no se inventa una', () => {
    // Dar de alta un proveedor con lo que venga escrito en una factura es cómo
    // se acaba con tres fichas del mismo.
    assert.match(ELRELLENO, /if \(!ficha\) continue;/);
    assert.ok(!/INSERT INTO erp_proveedores/.test(FUENTE), 'la facturación da de alta proveedores sola');
  });
});

describe('las nuevas', () => {
  test('se atan las seis veces que se crea una factura', () => {
    // Seis sitios crean facturas. Si uno se queda fuera, sus facturas no salen
    // en ninguna suma por proveedor y nadie lo nota: el total sale más bajo.
    const altas = (FUENTE.match(/await guardaConIdUnico\(nextProviderInvoiceId/g) ?? []).length;
    const atadas = (FUENTE.match(/await ataLaFactura\(/g) ?? []).length;
    assert.equal(altas, 6, 'ha cambiado el número de sitios que crean facturas');
    assert.equal(atadas, altas, `${altas} altas y ${atadas} atadas`);
  });

  test('y atarlas no puede impedir guardarlas', () => {
    /*
     * Va después del alta y con su propio `catch`. Si resolver la ficha
     * fallara, lo que no puede pasar es que la factura no se guarde — y no se
     * pierde nada: se ata sola en el siguiente arranque.
     */
    const atar = FUENTE.slice(
      FUENTE.indexOf('async function ataLaFactura'),
      FUENTE.indexOf('export const providerBillingRouter'),
    );
    assert.match(atar, /\.catch\(\(\) => \{\}\)/);
    assert.match(atar, /if \(!ficha\) return;/);
  });
});
