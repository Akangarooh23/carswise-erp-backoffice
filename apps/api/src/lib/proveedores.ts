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

/**
 * El **perito** es quien va a ver el coche a Alemania antes de que se suelte el
 * dinero. No es un taller ni un transportista: es la persona de la que depende
 * la única promesa de este producto, y por eso tiene su propio tipo — para
 * poder elegirlo de una lista y saber a quién se le encargó cada revisión.
 */
export const TIPOS_PROVEEDOR =
  ['transportista', 'gestoria', 'taller', 'perito', 'vendedor', 'garantia', 'otro'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

export const ETIQUETA_TIPO: Record<TipoProveedor, string> = {
  transportista: 'Transportista',
  gestoria: 'Gestoría',
  taller: 'Taller',
  perito: 'Perito',
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

/**
 * Grupos y filiales.
 *
 * Un proveedor puede ser un grupo con varias sociedades debajo, y eso no se
 * arregla juntándolos en una fila: **la factura la emite la filial**, con su
 * CIF. Lo que hace falta es saber que van juntos, para dos cosas:
 *
 * - Contestar **cuánto llevamos con el grupo**, que es el número con el que se
 *   negocia. Repartido en tres sociedades, no existe en ninguna parte.
 * - Que una tarifa negociada con el grupo valga para las filiales que facturan,
 *   en vez de tener que copiarla y que luego se separen.
 *
 * Dos niveles y no más: grupo → filial. Un árbol de cinco pisos aquí no lo va a
 * usar nadie y complica todas las consultas.
 */

export interface Vinculo {
  id: string;
  matriz_id?: string | null;
}

export type FalloDeMatriz =
  | 'ella_misma'
  | 'la_matriz_es_filial'
  | 'tiene_filiales';

/**
 * Si este proveedor puede colgar de esa matriz.
 *
 * `todos` son los proveedores tal y como están ahora, para poder mirar quién
 * cuelga de quién sin volver a la base.
 */
export function fallaLaMatriz(
  proveedorId: string,
  matrizId: string,
  todos: Vinculo[]
): FalloDeMatriz | null {
  if (!matrizId) return null;
  if (matrizId === proveedorId) return 'ella_misma';

  const matriz = todos.find((x) => x.id === matrizId);
  // Una filial no puede ser matriz de otra: eso sería un tercer nivel.
  if (matriz?.matriz_id) return 'la_matriz_es_filial';

  // Y un grupo que ya tiene filiales no puede pasar a colgar de otro.
  if (todos.some((x) => x.matriz_id === proveedorId)) return 'tiene_filiales';

  return null;
}

export const EXPLICA_FALLO_DE_MATRIZ: Record<FalloDeMatriz, string> = {
  ella_misma: 'Un proveedor no puede ser su propia matriz.',
  la_matriz_es_filial:
    'Esa sociedad ya cuelga de otra. Solo hay dos niveles: grupo y filial, no una cadena.',
  tiene_filiales:
    'Este proveedor ya tiene filiales colgando. Si además colgara de otro, habría tres niveles.',
};

/**
 * El proveedor y los suyos: él mismo y sus filiales.
 *
 * Es la lista de nombres con los que hay que sumar, porque en cada tramo y en
 * cada trámite lo que está escrito es el nombre de quien facturó.
 */
export function elYLosSuyos(
  proveedorId: string,
  todos: { id: string; nombre: string; matriz_id?: string | null }[]
): { id: string; nombre: string }[] {
  const el = todos.find((x) => x.id === proveedorId);
  if (!el) return [];
  const filiales = todos.filter((x) => x.matriz_id === proveedorId);
  return [el, ...filiales].map((x) => ({ id: x.id, nombre: x.nombre }));
}
