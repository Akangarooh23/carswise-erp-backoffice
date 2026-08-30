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
