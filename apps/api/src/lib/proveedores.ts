/**
 * Con quién trabajamos.
 *
 * El transportista de un tramo, la gestoría de un trámite y el taller de un
 * gasto se escribían a mano, uno por uno. Eso trae tres problemas, y el tercero
 * es el que importa:
 *
 * 1. Lo que se escribe mal se queda mal, y nadie lo corrige después.
 * 2. El mismo proveedor acaba con tres nombres distintos.
 * 3. **No hay forma de contestar «cuánto llevamos gastado con este
 *    transportista» ni «cuánto tarda de media esta gestoría».** Y esas son las
 *    preguntas que hacen que merezca la pena tener los datos.
 *
 * Un proveedor tiene un tipo, pero **puede tener varios**: hay talleres que
 * también traen coches. Por eso el tipo es una lista, no un valor.
 */

export const TIPOS_PROVEEDOR =
  ['transportista', 'gestoria', 'taller', 'vendedor', 'garantia', 'otro'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

export const ETIQUETA_TIPO: Record<TipoProveedor, string> = {
  transportista: 'Transportista',
  gestoria: 'Gestoría',
  taller: 'Taller',
  vendedor: 'Vendedor',
  garantia: 'Garantías',
  otro: 'Otro',
};

export function esTipoProveedor(v: string): v is TipoProveedor {
  return (TIPOS_PROVEEDOR as readonly string[]).includes(v);
}

/** Los tipos válidos de una lista, sin repetidos ni inventados. */
export function tiposLimpios(tipos: unknown): TipoProveedor[] {
  const lista = Array.isArray(tipos) ? tipos : [tipos];
  const buenos = lista.map((t) => String(t ?? '').trim().toLowerCase()).filter(esTipoProveedor);
  return [...new Set(buenos)];
}

/**
 * El nombre, comparable.
 *
 * «Transportes Gómez», «transportes gomez» y «TRANSPORTES  GÓMEZ» son el mismo.
 * Sin esto, juntar lo que ya está escrito a mano no serviría de nada: saldrían
 * tres proveedores donde hay uno.
 */
export function nombreComparable(nombre: string): string {
  return (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Si dos nombres escritos a mano son en realidad el mismo. */
export function esElMismo(a: string, b: string): boolean {
  const na = nombreComparable(a);
  return Boolean(na) && na === nombreComparable(b);
}

/**
 * Los nombres sueltos que hay por ahí, agrupados en proveedores.
 *
 * Sirve para traerse lo ya escrito sin perder nada: de cada grupo se guarda **la
 * primera forma en que se escribió**, que es la que alguien tecleó a conciencia,
 * y se apuntan los tipos donde aparecía.
 */
export function agrupaNombresSueltos(
  sueltos: { nombre: string; tipo: TipoProveedor }[]
): { nombre: string; tipos: TipoProveedor[] }[] {
  const grupos = new Map<string, { nombre: string; tipos: Set<TipoProveedor> }>();
  for (const s of sueltos) {
    const clave = nombreComparable(s.nombre);
    if (!clave) continue;
    const previo = grupos.get(clave);
    if (previo) previo.tipos.add(s.tipo);
    else grupos.set(clave, { nombre: s.nombre.trim(), tipos: new Set([s.tipo]) });
  }
  return [...grupos.values()].map((g) => ({ nombre: g.nombre, tipos: [...g.tipos] }));
}
