/**
 * Lo que hay que mirar antes de comprarle un coche a una persona.
 *
 * Comprarle a una empresa es un trámite: si algo sale mal hay una factura, un
 * CIF y alguien a quien reclamar. Comprarle a un particular es lo único de este
 * negocio que puede **salir mal sin arreglo**: un coche con un embargo no se
 * puede poner a nombre de nadie, una deuda del ayuntamiento bloquea la
 * transferencia, y si quien firma no es el titular la venta no vale. Todo eso se
 * ve antes de pagar y no se ve después.
 *
 * Por eso el sistema no deja encargar un coche a un particular sin haberlo
 * marcado, y guarda **quién lo comprobó y cuándo**. No es una casilla de
 * conciencia: el día que aparezca un embargo, esa va a ser la pregunta.
 */

export interface Comprobacion {
  clave: string;
  /** Lo que hay que mirar, dicho como se lo dirías a alguien. */
  que: string;
  /** Qué pasa si no se mira. */
  siNo: string;
}

export const COMPROBACIONES_PARTICULAR: Comprobacion[] = [
  {
    clave: 'informe_dgt',
    que: 'Informe de la DGT pedido, y sale limpio',
    siNo: 'Un coche con carga o embargo no se puede poner a nombre de nadie',
  },
  {
    clave: 'firma_el_titular',
    que: 'Quien firma es el titular del permiso',
    siNo: 'La venta no vale, y el dinero ya está pagado',
  },
  {
    clave: 'sin_deudas',
    que: 'Sin deudas del impuesto de circulación',
    siNo: 'Una deuda del ayuntamiento bloquea la transferencia',
  },
  {
    clave: 'itv_en_vigor',
    que: 'ITV en vigor, o sabido y descontado del precio',
    siNo: 'Sin ITV no se transfiere, y pasarla puede destapar más',
  },
];

/** Lo que hay que comprobar según a quién se le compre. */
export function comprobacionesQueTocan(origen: string): Comprobacion[] {
  return origen === 'particular' ? COMPROBACIONES_PARTICULAR : [];
}

/** Lo apuntado de cada comprobación: si está y quién la hizo. */
export interface Marcada {
  ok?: boolean;
  por?: string;
  el?: string;
}

export type Comprobadas = Record<string, Marcada>;

/** Las que faltan por mirar. */
export function comprobacionesQueFaltan(origen: string, hechas: Comprobadas | null | undefined): Comprobacion[] {
  const puestas = hechas ?? {};
  return comprobacionesQueTocan(origen).filter((c) => puestas[c.clave]?.ok !== true);
}

/**
 * Si se puede encargar ya.
 *
 * El borrador existe justamente para poder preparar un pedido mientras se mira
 * todo esto. Encargarlo es comprometerse, y a un particular uno se compromete
 * con lo comprobado.
 */
export function puedeEncargarseConComprobaciones(origen: string, hechas: Comprobadas | null | undefined): boolean {
  return comprobacionesQueFaltan(origen, hechas).length === 0;
}

/** Lo apuntado, con quién y cuándo, para no perder el rastro. */
export function marca(
  hechas: Comprobadas | null | undefined,
  clave: string,
  ok: boolean,
  quien: string,
  cuando: Date = new Date()
): Comprobadas {
  const previas = { ...(hechas ?? {}) };
  // Desmarcar no borra quién la había puesto: se apunta quién la quita.
  previas[clave] = { ok, por: quien, el: cuando.toISOString() };
  return previas;
}
