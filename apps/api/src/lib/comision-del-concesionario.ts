/**
 * Lo que nos paga un concesionario cuando un coche suyo se vende por una visita
 * nuestra.
 *
 * Hasta ahora esta línea no tenía dinero por ninguna parte: se concertaban
 * visitas, el coche se vendía y en la contabilidad no aparecía nada. Con el
 * resultado de la visita ya se sabe **cuándo** se vende; esto es **cuánto**.
 *
 * El fee es fijo y provisional —200 € por coche vendido, mientras no haya nada
 * firmado con cada concesionario—. Es un número puesto a mano, no una tarifa
 * acordada, y por eso vive aquí solo y con su nombre: cuando haya contrato se
 * cambia en un sitio.
 */
import { IVA_GENERAL } from './dinero.js';

/** Euros por coche vendido, **con el IVA dentro**. Provisional. */
export const FEE_POR_VENTA = 200;

/**
 * Con el IVA dentro, como la comisión de la garantía.
 *
 * Es la forma en que se acuerdan estas cosas —«nos pagas 200 por coche»— y la
 * que evita el error de la garantía, donde se guardó el precio de venta en la
 * base y la comisión en el total: una factura que decía que el total era menor
 * que la base. Aquí el total es lo acordado y la base sale de dividir.
 */
export interface Comision {
  /** Lo que se factura en total, que es lo acordado. */
  total: number;
  /** Lo que es ingreso nuestro. */
  base: number;
  /** Y lo que es de Hacienda. */
  cuota: number;
  /** El tipo, en tanto por ciento. */
  iva: number;
}

const dosDecimales = (n: number) => Math.round(n * 100) / 100;

export function laComision(total: number = FEE_POR_VENTA): Comision {
  const base = dosDecimales(total / (1 + IVA_GENERAL / 100));
  /*
   * La cuota se saca restando y no multiplicando.
   *
   * Con 200 €, `base * 0,21` da 34,7109 → 34,71 y cuadra; pero para otros
   * importes los dos redondeos se separan un céntimo y la factura deja de
   * sumar. El guardián de `provider-billing` admite dos céntimos de holgura,
   * así que no saltaría: la factura estaría mal y nadie se enteraría.
   */
  return { total: dosDecimales(total), base, cuota: dosDecimales(total - base), iva: IVA_GENERAL };
}

/**
 * Lo que se lee en la factura.
 *
 * Lleva el coche y el precio al que se vendió cuando se sabe, porque una línea
 * que solo dice «comisión» no se puede comprobar contra nada dentro de seis
 * meses.
 */
export function elConcepto(coche: string | null, precio?: number | null): string {
  const cual = (coche ?? '').trim() || 'un coche';
  const cuanto = precio && precio > 0 ? ` · se vendió por ${precio.toFixed(2)} €` : '';
  return `Comisión por venta · ${cual}${cuanto}`;
}
