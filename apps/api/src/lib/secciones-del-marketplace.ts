/**
 * En qué se divide el marketplace, y cómo se reconoce cada parte.
 *
 * «4.469 activos y 23.435 € de precio medio» es un número de un montón sin
 * forma. El marketplace son cuatro negocios distintos —coches que vienen de
 * flotas de renting, stock de concesionario, particulares e importación— y cada
 * uno se compra, se vende y se margina de otra manera. Sumados en una cifra no
 * se puede contestar ninguna pregunta útil.
 *
 * ## Quién vende cada coche
 *
 * La sección sale de `seller_type`, que es lo que de verdad separa los
 * negocios. Mirando quién hay detrás se ve solo:
 *
 * - `concesionario` — Modrive, Gamboa Ocasión, VIAN. Stock de concesionario.
 * - `professional` — Astara y Leasys, que son empresas de renting: su VO es
 *   el ex-renting.
 * - `particular` — un coche de un particular.
 *
 * Un vendedor que no diga de qué tipo es cae en concesionario, que es de lejos
 * lo que más hay: equivocarse hacia ahí se corrige mirando la ficha, y dejarlo
 * fuera lo escondería.
 *
 * ## Y el renting no es una sección
 *
 * Las 23 ofertas con renting disponible son **otro producto** sobre el mismo
 * coche: en vez de comprarlo, se alquila. Contarlas como una sección más
 * mezclaría «de dónde viene el coche» con «cómo se paga», y entonces la suma de
 * las secciones deja de ser el marketplace. Van aparte y con su nombre.
 */

export type SeccionDelMarketplace = 'ex_renting' | 'concesionario' | 'particular' | 'importacion';

export const NOMBRE_DE_LA_SECCION: Record<SeccionDelMarketplace, string> = {
  ex_renting:    'Ex-renting',
  concesionario: 'Concesionario',
  particular:    'Particulares',
  importacion:   'Importación',
};

/** Qué es cada una, para quien no lleve el negocio en la cabeza. */
export const QUE_ES_LA_SECCION: Record<SeccionDelMarketplace, string> = {
  ex_renting:    'VO de empresas de renting, puesto a la venta',
  concesionario: 'stock propio de concesionario',
  particular:    'coches de un particular',
  importacion:   'traídos de Alemania y publicados aquí',
};

/** De más a menos coches, que hoy es también de más a menos negocio. */
export const ORDEN_DE_SECCIONES: readonly SeccionDelMarketplace[] =
  ['ex_renting', 'concesionario', 'particular', 'importacion'];

/**
 * Cómo se reconoce cada sección en `moveadvisor_marketplace_vo_offers`.
 *
 * La importación no está aquí: vive en la tabla de ofertas de portales, con la
 * marca de publicada, y se cuenta con su propia consulta. Meterla a la fuerza
 * en este `CASE` obligaría a un `UNION` que no dice nada más.
 *
 * El orden importa: un particular cae en `particular` antes de que lo recoja el
 * cajón de ex-renting, y así las cuatro suman el total exacto en vez de
 * solaparse.
 *
 * Va en **una sola línea y sin plantilla**: quien comprueba las consultas del
 * panel las lee del fichero y resuelve las interpolaciones buscando la
 * constante. Partida en varias líneas o construida con `.join()`, no la
 * encuentra y esa consulta se queda sin comprobar.
 */
export const SQL_DE_LA_SECCION = "CASE WHEN seller_type = 'particular' THEN 'particular' WHEN seller_type = 'professional' THEN 'ex_renting' ELSE 'concesionario' END";

/**
 * Y el producto de renting, que se cuenta aparte.
 *
 * Un coche con renting disponible es un coche de una sección —hoy todos son de
 * Leasys, o sea ex-renting— que además se ofrece alquilado. Por eso **está
 * dentro** de su sección y se dice aparte: contarlo como una quinta sección
 * haría que la suma dejase de ser el marketplace, y dejarlo fuera de las
 * secciones escondería veintitrés coches que existen.
 */
export const SQL_ES_RENTING = 'renting_available';

export function esSeccion(v: unknown): v is SeccionDelMarketplace {
  return typeof v === 'string' && (ORDEN_DE_SECCIONES as readonly string[]).includes(v);
}

/** Una sección con sus números, tal como se pinta. */
export interface Seccion {
  clave: SeccionDelMarketplace;
  nombre: string;
  queEs: string;
  /** Todo lo que hay en el catálogo, publicado o no. */
  total: number;
  /** Y lo que está publicado de verdad, que es lo que ve un cliente. */
  activos: number;
  /** Precio medio de los publicados, o null si no hay ninguno. */
  precioMedio: number | null;
  /** Cuántas solicitudes ha traído. */
  leads: number;
}

/**
 * Las cuatro, siempre las cuatro y en orden.
 *
 * Una sección vacía no se esconde: que Concesionario esté a cero es la
 * respuesta a «cuánto stock propio tenemos», y esconderla convierte esa
 * respuesta en una pregunta sin contestar.
 */
export function lasSecciones(
  filas: readonly { seccion?: unknown; total?: unknown; activos?: unknown; precio_medio?: unknown; leads?: unknown }[],
): Seccion[] {
  const porClave = new Map<string, (typeof filas)[number]>();
  for (const f of filas ?? []) {
    if (esSeccion(f.seccion)) porClave.set(f.seccion, f);
  }

  return ORDEN_DE_SECCIONES.map((clave) => {
    const f = porClave.get(clave);
    const activos = Number(f?.activos ?? 0) || 0;
    const medio = Number(f?.precio_medio ?? 0);
    return {
      clave,
      nombre: NOMBRE_DE_LA_SECCION[clave],
      queEs: QUE_ES_LA_SECCION[clave],
      total: Number(f?.total ?? 0) || 0,
      activos,
      // Sin coches no hay precio medio. Un 0 € se lee como coches regalados.
      precioMedio: activos > 0 && Number.isFinite(medio) && medio > 0 ? Math.round(medio) : null,
      leads: Number(f?.leads ?? 0) || 0,
    };
  });
}
