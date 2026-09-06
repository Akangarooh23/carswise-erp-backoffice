/**
 * En qué se divide el marketplace, y cómo se reconoce cada parte.
 *
 * «4.469 activos y 23.435 € de precio medio» es un número de un montón sin
 * forma. El marketplace son cuatro negocios distintos —coches que vienen de
 * flotas de renting, stock de concesionario, particulares e importación— y cada
 * uno se compra, se vende y se margina de otra manera. Sumados en una cifra no
 * se puede contestar ninguna pregunta útil.
 *
 * ## Lo que hoy no está en la base
 *
 * Solo hay una sección con coches dentro. Las ofertas del marketplace VO son
 * **VO de empresas de renting** puestas a la venta, y `seller_type` dice
 * «concesionario» en casi todas: eso describe **quién las anuncia**, no de qué
 * sección son, y usarlo para partir el marketplace daría 4.288 coches en una
 * sección que todavía no tiene ninguno.
 *
 * Así que las otras tres salen a cero y se ven a cero, que es información: dice
 * que el negocio todavía es uno solo. Cuando entre stock propio de
 * concesionario habrá que marcarlo —con una columna, no adivinándolo— y esa
 * marca se añade aquí, en un sitio.
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
export const SQL_DE_LA_SECCION = "CASE WHEN seller_type = 'particular' THEN 'particular' WHEN available_for_purchase THEN 'ex_renting' ELSE 'concesionario' END";

/**
 * Y el producto de renting, que se cuenta aparte.
 *
 * Un coche con renting disponible no está a la venta: `available_for_purchase`
 * y `renting_available` son excluyentes en los datos, así que esto **no** se
 * solapa con las secciones de compra —cae fuera de ellas—.
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
  total: number;
  activos: number;
  /** Precio medio de los activos, o null si no hay ninguno. */
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
