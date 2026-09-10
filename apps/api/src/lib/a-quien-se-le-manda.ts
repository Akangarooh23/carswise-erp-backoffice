/**
 * A quién se le manda cada factura que emitimos.
 *
 * ## El fallo que esto arregla
 *
 * En la misma tabla conviven dos cosas distintas. En unas facturas el cliente
 * **es** a quien se le cobra: la de gestión de venta al particular y la de la
 * venta del coche. En otras —la comisión del concesionario, la del portal, el
 * fee de renting— a quien se le cobra es la **empresa**, y las columnas
 * `customer_name` y `customer_email` guardan al cliente final solo como dato:
 * salen en el PDF como «Cliente: Fulano», debajo del concepto.
 *
 * El PDF ya se emitía bien —va a nombre de `provider_name`— pero el correo se
 * mandaba siempre a `customer_email`. Es decir: la factura de 200 € del
 * concesionario le llegaba **al particular que fue a ver el coche**, con el
 * nombre del concesionario, el importe de nuestra comisión y la referencia de
 * la venta. A un tercero que no pinta nada ahí.
 *
 * ## La regla
 *
 * La factura va a nombre de quien dice `provider_name`. Así que el correo va a
 * ese mismo, y se saca de su ficha de **Proveedores**.
 *
 * Con dos excepciones que no son excepciones: cuando no hay `provider_name`
 * —la venta del coche— el destinatario es el cliente; y en la gestión de venta
 * el `provider_name` **es** el particular, porque no hay proveedor detrás y se
 * le factura a él.
 *
 * ## Y si no hay a quién, no se manda
 *
 * Un proveedor sin correo en su ficha no se resuelve tirando del cliente. Eso
 * es justamente lo que hacía el fallo, y volver a caer ahí por descuido es
 * peor que no mandar nada: la factura no se pierde, se queda en la lista de
 * «sin enviar» diciendo qué falta.
 *
 * Falla cerrado a propósito: un tipo de factura nuevo que se le facture a una
 * empresa, si esa empresa no tiene ficha, **no** sale por correo al cliente.
 * Se queda esperando.
 */

/** Las que se le facturan al cliente porque no hay ninguna empresa detrás. */
export const AL_CLIENTE = ['gestion_venta', 'vehicle_sale'] as const;

export interface FacturaEmitida {
  type?: unknown;
  /** A nombre de quién sale el PDF. */
  provider_name?: unknown;
  /** El cliente final. En las de empresa es un dato, no un destinatario. */
  customer_email?: unknown;
  /** El de la ficha de Proveedores, que lo trae la consulta. */
  proveedor_email?: unknown;
}

export type Destinatario = {
  /** Vacío si no hay a quién mandarla. */
  email: string;
  quien: 'cliente' | 'proveedor' | 'nadie';
  /** Qué falta, para poder decirlo en pantalla. */
  falta: string;
};

const texto = (v: unknown) => String(v ?? '').trim();

/**
 * Quién recibe esta factura.
 *
 * Devuelve también por qué no se puede mandar, porque una lista que dice «sin
 * enviar» y no dice qué falta obliga a abrir la factura para averiguarlo.
 */
export function aQuienSeLeManda(f: FacturaEmitida): Destinatario {
  const tipo = texto(f.type);
  const empresa = texto(f.provider_name);

  // Sin empresa detrás, o siendo el propio particular, es del cliente.
  if (!empresa || (AL_CLIENTE as readonly string[]).includes(tipo)) {
    const email = texto(f.customer_email);
    return email
      ? { email, quien: 'cliente', falta: '' }
      : { email: '', quien: 'nadie', falta: 'el correo del cliente' };
  }

  const email = texto(f.proveedor_email);
  return email
    ? { email, quien: 'proveedor', falta: '' }
    : { email: '', quien: 'nadie', falta: `el correo de ${empresa}, en su ficha de Proveedores` };
}

/** Si se puede mandar tal cual. */
export function sePuedeEnviar(f: FacturaEmitida): boolean {
  return aQuienSeLeManda(f).email !== '';
}
