/**
 * Mirar el coche al llegar.
 *
 * Es el momento con más valor de toda la compra y el que no existía. Cuando el
 * coche llega, alguien lo mira **antes de dar nada por bueno**: kilómetros de
 * verdad, cuántas llaves vienen, qué documentación traía dentro, y los golpes
 * que tenga, con fotos.
 *
 * De ahí salen dos cosas que no se pueden conseguir después:
 *
 * - **Una reclamación al proveedor** si no es lo que se compró. Pasada una
 *   semana, ya no hay forma de sostener que el golpe venía de fábrica.
 * - **La ficha honesta del coche** para venderlo: los kilómetros que marca, las
 *   llaves que lleva, si tiene libro de mantenimiento.
 *
 * Una segunda llave cuesta cientos de euros. Descubrir que no está el día que se
 * entrega al cliente es descubrirlo tarde.
 */

export interface Recepcion {
  /** Los que marca de verdad, no los del anuncio. */
  km?: number | null;
  /** Cuántas hay. Cero es un dato, no un hueco sin rellenar. */
  llaves?: number | null;
  /** Lo que traía dentro. */
  documentacion?: string;
  /** Los golpes, arañazos y lo que sea. */
  danos?: string;
  /** Libro de mantenimiento, ITV, ruedas… lo que se quiera anotar. */
  observaciones?: string;
  /** Si el coche es lo que se compró. */
  conforme?: boolean;
  /** Lo que se le reclama al proveedor, si no lo es. */
  reclamacion?: string;
  revisado_por?: string;
  revisado_el?: string;
}

/**
 * Lo mínimo para dar un coche por recibido.
 *
 * Kilómetros y llaves, siempre. No porque sean lo único importante, sino porque
 * son los dos datos que **cambian de valor con el tiempo**: los kilómetros hay
 * que leerlos antes de moverlo, y las llaves hay que contarlas delante de quien
 * lo trae.
 */
export function faltaPorMirar(r: Recepcion | null | undefined): string[] {
  const falta: string[] = [];
  const rec = r ?? {};
  if (rec.km == null || Number.isNaN(Number(rec.km))) falta.push('Los kilómetros que marca');
  if (rec.llaves == null || Number.isNaN(Number(rec.llaves))) falta.push('Cuántas llaves vienen');
  return falta;
}

export function puedeDarsePorRecibido(r: Recepcion | null | undefined): boolean {
  return faltaPorMirar(r).length === 0;
}

/**
 * Decir que no está conforme sin decir qué se reclama no sirve de nada.
 *
 * Quien lo lea dentro de un mes tiene que saber qué se pidió, no solo que algo
 * estaba mal.
 */
export function reclamacionCompleta(r: Recepcion | null | undefined): boolean {
  const rec = r ?? {};
  if (rec.conforme !== false) return true;
  return Boolean((rec.reclamacion ?? '').trim());
}

/**
 * Los kilómetros que dijeron y los que marca.
 *
 * Una diferencia grande no es un detalle: cambia el precio y, si es hacia abajo,
 * es motivo para desconfiar del cuentakilómetros.
 */
export function diferenciaDeKm(prometidos?: number | null, reales?: number | null): number | null {
  if (prometidos == null || reales == null) return null;
  const a = Number(prometidos), b = Number(reales);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}

/** Si esa diferencia merece que alguien la mire. */
export function kmSospechosos(prometidos?: number | null, reales?: number | null): boolean {
  const d = diferenciaDeKm(prometidos, reales);
  if (d == null) return false;
  // Mil kilómetros de más se explican con un traslado; diez mil, no. Y menos de
  // los prometidos es peor: nadie se equivoca a su favor por accidente.
  return d > 5000 || d < -1000;
}

/** Lo apuntado, con quién lo miró y cuándo. */
export function anota(
  previa: Recepcion | null | undefined,
  cambios: Recepcion,
  quien: string,
  cuando: Date = new Date()
): Recepcion {
  return {
    ...(previa ?? {}),
    ...cambios,
    revisado_por: quien,
    revisado_el: cuando.toISOString(),
  };
}
