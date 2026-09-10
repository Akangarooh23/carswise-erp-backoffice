/**
 * A quién le llega cada factura.
 *
 * Lo que se protege: que la factura de una empresa **no** acabe en el correo
 * del particular que fue a ver el coche. Esa columna se llama `customer_email`
 * y en esas facturas guarda al cliente final como dato, no como destinatario —
 * y el correo se mandaba ahí.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aQuienSeLeManda, sePuedeEnviar, AL_CLIENTE } from './a-quien-se-le-manda.js';

/** La comisión del concesionario, tal y como se guarda. */
const COMISION = {
  type: 'dealer_commission',
  provider_name: 'Marcos Ocasión SL',
  customer_email: 'comprador@ejemplo.invalid',
  proveedor_email: 'admin@modrive.invalid',
};

describe('la factura va a quien se le cobra', () => {
  test('la comisión del concesionario, al concesionario', () => {
    const a = aQuienSeLeManda(COMISION);
    assert.equal(a.email, 'admin@modrive.invalid');
    assert.equal(a.quien, 'proveedor');
  });

  test('y nunca al comprador, que ahí solo es un dato', () => {
    /*
     * Es el fallo entero en una línea. El PDF sale a nombre del concesionario,
     * con nuestra comisión y la referencia de la venta: mandárselo al
     * particular es enseñarle a un tercero lo que cobramos y a quién.
     */
    assert.notEqual(aQuienSeLeManda(COMISION).email, COMISION.customer_email);
  });

  test('lo mismo la del portal y la de renting', () => {
    for (const type of ['portal_commission', 'renting_fee']) {
      const a = aQuienSeLeManda({ ...COMISION, type });
      assert.equal(a.email, 'admin@modrive.invalid', type);
      assert.equal(a.quien, 'proveedor', type);
    }
  });

  test('la gestión de venta sí es del particular', () => {
    // Aquí `provider_name` es él: no hay proveedor detrás y se le factura a él.
    const a = aQuienSeLeManda({
      type: 'gestion_venta',
      provider_name: 'Ana Picazo',
      customer_email: 'ana@ejemplo.invalid',
      proveedor_email: '',
    });
    assert.equal(a.email, 'ana@ejemplo.invalid');
    assert.equal(a.quien, 'cliente');
  });

  test('y la venta del coche también, que no tiene empresa detrás', () => {
    const a = aQuienSeLeManda({
      type: 'vehicle_sale',
      provider_name: '',
      customer_email: 'comprador@ejemplo.invalid',
    });
    assert.equal(a.email, 'comprador@ejemplo.invalid');
    assert.equal(a.quien, 'cliente');
  });
});

describe('si no hay a quién, no se manda', () => {
  test('un proveedor sin correo en su ficha no se resuelve con el del cliente', () => {
    /*
     * Es la manera de volver a caer en el fallo sin darse cuenta: el correo del
     * cliente está ahí, en la misma fila, y tirar de él «para que salga algo»
     * es exactamente lo que hacía antes.
     */
    const a = aQuienSeLeManda({ ...COMISION, proveedor_email: '' });
    assert.equal(a.email, '');
    assert.equal(a.quien, 'nadie');
    assert.notEqual(a.email, COMISION.customer_email);
  });

  test('y se dice qué falta y dónde se pone', () => {
    const a = aQuienSeLeManda({ ...COMISION, proveedor_email: '' });
    assert.match(a.falta, /Marcos Ocasión SL/);
    assert.match(a.falta, /Proveedores/);
  });

  test('un tipo nuevo de empresa sin ficha tampoco se le manda al cliente', () => {
    /*
     * Falla cerrado. Si mañana se factura otra cosa a una empresa y esa empresa
     * no tiene ficha, lo que no puede pasar es que el correo salga al
     * particular «porque era el único que había».
     */
    const a = aQuienSeLeManda({
      type: 'lo_que_sea_nuevo',
      provider_name: 'Otra SL',
      customer_email: 'particular@ejemplo.invalid',
      proveedor_email: '',
    });
    assert.equal(a.email, '');
    assert.equal(sePuedeEnviar(a as never), false);
  });

  test('y un cliente sin correo tampoco', () => {
    const a = aQuienSeLeManda({ type: 'gestion_venta', provider_name: 'Ana', customer_email: '' });
    assert.equal(a.email, '');
    assert.match(a.falta, /correo del cliente/);
  });
});

describe('las dos que son del cliente están escritas', () => {
  test('y son esas dos, no una lista que crece sola', () => {
    // Si alguien añade un tipo aquí, está diciendo «a este se le factura al
    // particular». Que cueste un cambio explícito es el punto.
    assert.deepEqual([...AL_CLIENTE], ['gestion_venta', 'vehicle_sale']);
  });
});
