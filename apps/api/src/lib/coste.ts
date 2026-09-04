/**
 * Lo que ha costado el coche de verdad.
 *
 * Es la pregunta que separa un ERP de una lista de tareas, y hasta ahora nadie
 * podía contestarla. El precio que se le paga al proveedor es la mitad de la
 * historia: traerlo cuesta, matricularlo cuesta, y la gestoría cuesta. Un coche
 * de Alemania puede llevar dos mil euros encima antes de que nadie lo vea.
 *
 * Y con eso al lado de lo que se cobró, lo que de verdad importa: **cuál de los
 * cuatro caminos deja dinero**. Comprar en Alemania parece barato hasta que se
 * suman el transporte y el impuesto; comprarle a un particular parece caro hasta
 * que se ve que no lleva ninguna de las dos cosas.
 */

export interface Partida {
  concepto: string;
  importe: number;
}

export interface Coste {
  partidas: Partida[];
  total: number;
}

function suma(vs: unknown[]): number {
  return vs.reduce((s: number, v) => s + (Number(v) || 0), 0);
}

/**
 * El desglose de un coche.
 *
 * Se pasa lo que se sabe de cada sitio. Lo que no haya, no suma: un pedido sin
 * transportes todavía no ha costado transporte, y decirlo como cero es más
 * honesto que no enseñar la línea.
 */
export function costeDelCoche(datos: {
  precioProveedor?: unknown;
  transportes?: { coste?: unknown }[];
  tramites?: { coste?: unknown }[];
  gastos?: { importe?: unknown }[];
}): Coste {
  const partidas: Partida[] = [
    { concepto: 'Precio al proveedor', importe: Number(datos.precioProveedor) || 0 },
    { concepto: 'Transporte', importe: suma((datos.transportes ?? []).map((t) => t.coste)) },
    { concepto: 'Gestoría e impuestos', importe: suma((datos.tramites ?? []).map((t) => t.coste)) },
    { concepto: 'Reacondicionado', importe: suma((datos.gastos ?? []).map((g) => g.importe)) },
  ];
  return { partidas, total: suma(partidas.map((p) => p.importe)) };
}

export interface Margen {
  coste: number;
  venta: number;
  margen: number;
  /** Sobre la venta, que es como se mira en este negocio. */
  porcentaje: number | null;
}

/**
 * Lo que se ha ganado.
 *
 * Sin precio de venta no se calcula nada: un coche que todavía no se ha vendido
 * no tiene margen, tiene coste. Enseñar un margen negativo enorme porque aún no
 * se ha cobrado sería peor que no enseñar nada.
 */
export function margenDelCoche(coste: number, venta?: unknown): Margen | null {
  const v = Number(venta) || 0;
  if (!v) return null;
  const margen = v - coste;
  return {
    coste,
    venta: v,
    margen,
    porcentaje: Math.round((margen / v) * 1000) / 10,
  };
}

/**
 * El resumen por origen: dónde se gana.
 *
 * Solo cuentan los que ya se han vendido. Mezclar los que están de camino daría
 * un número que baja según se compra, y eso no dice nada de si el camino es
 * bueno.
 */
export function margenPorOrigen(
  coches: { origen: string; coste: number; venta?: unknown }[]
): Record<string, { coches: number; margen: number; medio: number }> {
  const acumulado: Record<string, { coches: number; margen: number; medio: number }> = {};
  for (const c of coches) {
    const m = margenDelCoche(c.coste, c.venta);
    if (!m) continue;
    const previo = acumulado[c.origen] ?? { coches: 0, margen: 0, medio: 0 };
    previo.coches += 1;
    previo.margen += m.margen;
    previo.medio = Math.round(previo.margen / previo.coches);
    acumulado[c.origen] = previo;
  }
  return acumulado;
}

/*
 * ── Y la cuenta de una importación, que no es una compraventa ──────────────
 *
 * `costeDelCoche` de aquí arriba vale para el stock: ese coche lo compramos
 * nosotros, lo arreglamos y lo vendemos, y coste y venta son lo que parecen.
 *
 * Una importación es otra cosa y contarla igual da un número que no significa
 * nada. **El coche no es nuestro**: los 16.890 € del Kia son dinero del cliente
 * que pasa por nuestra cuenta camino de un concesionario alemán, igual que los
 * 1.420 € del impuesto van camino de Hacienda. Meterlos en «lo que cuesta el
 * coche» y compararlos con «lo que se cobró» mezcla dos cosas que no se pueden
 * sumar.
 *
 * Son dos cuentas y hay que mirarlas por separado:
 *
 * 1. **La del cliente.** Puso 21.500 € y tienen que salir 21.500 €: el coche al
 *    vendedor, el impuesto y las tasas a quien toque, la garantía a su
 *    proveedor y nuestro servicio a nosotros. La única pregunta es si cuadra.
 *    Si no cuadra, hay dinero suyo en nuestra cuenta o le estamos poniendo
 *    dinero nuestro, y las dos cosas hay que saberlas hoy y no en el cierre.
 *
 * 2. **La nuestra.** Ingresamos el servicio y gastamos en peritación,
 *    transportes, honorarios de gestoría y reacondicionado. Eso —y solo eso—
 *    es el margen. Todo en base, porque el IVA soportado se deduce: no es
 *    coste, es un préstamo a Hacienda.
 */

import { cuenta as cuentaDelDinero, importe as leeImporte, type LineaDeDinero } from './dinero.js';

export interface CuentaDeImportacion {
  /** Lo que el cliente depositó. */
  deposito: number;
  /** De ese dinero, lo que va a terceros: coche, impuesto, tasas, garantía. */
  aTerceros: number;
  /** Y lo que es nuestro: el servicio. */
  ingreso: number;
  /** Lo que sobra o falta de su depósito. Cero es lo que tiene que salir. */
  descuadre: number;
  /** Lo que nos cuesta de verdad, en base, con lo asumido dentro. */
  coste: number;
  /** De ese coste, la diferencia del impuesto que hemos puesto nosotros. */
  asumido: number;
  /** Ingreso menos coste. */
  margen: number;
  /** Sobre el ingreso, que es lo que se mira en un servicio. */
  porcentaje: number | null;
  /** El IVA que se deduce, que no es margen ni coste. */
  ivaSoportado: number;
  /** Cuántas líneas de coste no dicen cómo se parten. */
  sinDesglosar: number;
}

const dosDecimales = (n: number) => Math.round(n * 100) / 100;

/**
 * Las dos cuentas de una importación.
 *
 * `sinDesglosar` viaja pegado al margen a propósito: un margen calculado con
 * cuatro líneas sin IVA conocido no es un margen, es una estimación por lo
 * bajo —cuentan enteras como base— y quien lo mira tiene que saberlo sin ir a
 * buscarlo.
 */
export function cuentaDeUnaImportacion(datos: {
  /** Lo que puso el cliente, partido como se le cobró. */
  escrow: {
    coche?: unknown;
    fee?: unknown;
    impuesto?: unknown;
    garantia?: unknown;
    total?: unknown;
  };
  /** Lo que se le paga al vendedor alemán, que sale de su factura. */
  precioProveedor?: unknown;
  /** Lo que ha costado el impuesto de verdad, si ya se sabe. */
  impuestoReal?: unknown;
  /**
   * Cómo se liquidó la diferencia del impuesto.
   *
   * `asumida` quiere decir que la pagamos nosotros para no cobrarle de más a
   * alguien que ya había cerrado un precio. Es una decisión legítima y es
   * **coste de este coche**: sin contarlo, un coche cuyo impuesto nos comimos
   * parece igual de rentable que otro que cuadró, y el margen medio de la
   * empresa sale de ahí.
   */
  liquidacionComo?: 'cobrada' | 'devuelta' | 'asumida' | null;
  /** Nuestros costes, cada uno con su base, su tipo y su régimen. */
  costes: LineaDeDinero[];
}): CuentaDeImportacion {
  const e = datos.escrow ?? {};
  const deposito = leeImporte(e.total) || (
    leeImporte(e.coche) + leeImporte(e.fee) + leeImporte(e.impuesto) + leeImporte(e.garantia)
  );
  const ingreso = leeImporte(e.fee);

  /*
   * Lo que sale hacia terceros, con lo que ha costado de verdad.
   *
   * El coche vale lo que dice su factura, no lo que se estimó al cobrar; y el
   * impuesto, lo que puso la gestoría. Mientras no se sepan, se usa lo cobrado:
   * decir que descuadra porque todavía no ha llegado un papel sería un aviso
   * falso todos los días hasta que llegue.
   */
  const coche = leeImporte(datos.precioProveedor) || leeImporte(e.coche);
  const impuesto = leeImporte(datos.impuestoReal) || leeImporte(e.impuesto);
  const aTerceros = dosDecimales(coche + impuesto + leeImporte(e.garantia));

  const c = cuentaDelDinero(datos.costes);

  /*
   * Y la diferencia del impuesto, si la asumimos nosotros.
   *
   * Solo la asumida, y solo cuando falta: si sobró y se le devolvió, no nos
   * ha costado nada. El impuesto no lleva IVA, así que entra entera — no hay
   * base que separar.
   */
  const asumido = datos.liquidacionComo === 'asumida'
    ? dosDecimales(Math.max(0, impuesto - leeImporte(e.impuesto)))
    : 0;
  const coste = dosDecimales(c.nuestro + asumido);

  const margen = dosDecimales(ingreso - coste);
  return {
    deposito: dosDecimales(deposito),
    aTerceros,
    ingreso: dosDecimales(ingreso),
    /*
     * El descuadre, con lo asumido ya puesto.
     *
     * Si la diferencia la pagamos nosotros, la cuenta del cliente cuadra: él
     * puso lo que le pedimos y no le falta nada. Lo que no cuadra es la
     * nuestra, y ahí es donde tiene que verse.
     */
    descuadre: dosDecimales(deposito - aTerceros - ingreso + asumido),
    asumido,
    coste,
    margen,
    porcentaje: ingreso > 0 ? Math.round((margen / ingreso) * 1000) / 10 : null,
    ivaSoportado: c.ivaSoportado,
    sinDesglosar: c.sinDesglosar,
  };
}

/**
 * Lo que hay que decir del descuadre, si lo hay.
 *
 * No es lo mismo que sobre a que falte, y las dos cosas se arreglan de forma
 * distinta: lo que sobra es dinero suyo que hay que devolverle, y lo que falta
 * es dinero nuestro puesto en su coche.
 */
export function quePasaConSuDinero(c: CuentaDeImportacion): string | null {
  if (Math.abs(c.descuadre) <= 0.01) return null;
  const eur = (n: number) => `${Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return c.descuadre > 0
    ? `Sobran ${eur(c.descuadre)} de lo que depositó: son suyos y hay que devolvérselos.`
    : `Faltan ${eur(c.descuadre)} de su depósito: ese dinero lo estamos poniendo nosotros.`;
}
