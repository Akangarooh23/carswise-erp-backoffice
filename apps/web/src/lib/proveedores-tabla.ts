/**
 * Las columnas de la tabla de proveedores, y cómo salen al fichero.
 *
 * Están aquí y no dentro de la pantalla por una razón concreta: **la tabla y la
 * exportación tienen que enseñar lo mismo**. Separarlas acaba con un fichero que
 * no se parece a lo que había delante, y eso es lo que hace que nadie se fíe de
 * una exportación.
 *
 * La única que se sale de esa regla son las **notas**, y va marcada: ocupan
 * párrafos y en una tabla no se leen, pero en el fichero son justo lo que
 * interesa —lo comprobado de cada proveedor y lo que falta por pedirle—. Se
 * avisa en pantalla para que nadie se lo encuentre por sorpresa.
 */

export interface FilaProveedor {
  nombre: string;
  tipos?: string[];
  nif?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
}

export const ETIQUETA_TIPO: Record<string, string> = {
  transportista: 'Transportistas',
  gestoria: 'Gestorías',
  taller: 'Talleres',
  vendedor: 'Vendedores',
  garantia: 'Garantías',
  otro: 'Otros',
};

export interface Columna {
  titulo: string;
  valor: (p: FilaProveedor) => string;
  /** Falso para lo que va al fichero pero no cabe en pantalla. */
  enTabla?: boolean;
}

export const COLUMNAS: Columna[] = [
  { titulo: 'Nombre', valor: (p) => p.nombre ?? '' },
  {
    titulo: 'Tipos',
    valor: (p) => (p.tipos ?? []).map((t) => ETIQUETA_TIPO[t] ?? t).join(', '),
  },
  { titulo: 'NIF', valor: (p) => p.nif ?? '' },
  { titulo: 'Teléfono', valor: (p) => p.telefono ?? '' },
  { titulo: 'Correo', valor: (p) => p.email ?? '' },
  { titulo: 'Dirección', valor: (p) => p.direccion ?? '' },
  /**
   * Las notas van al fichero, no a la tabla.
   *
   * Y aplanadas: llevan saltos de línea, y uno suelto deja una celda a medias en
   * cualquier hoja de cálculo que lo abra.
   */
  {
    titulo: 'Notas',
    valor: (p) => (p.notas ?? '').replace(/\s*\n\s*/g, ' · '),
    enTabla: false,
  },
];

/** Las que se pintan. El fichero lleva todas. */
export const COLUMNAS_TABLA = COLUMNAS.filter((c) => c.enTabla !== false);

/**
 * Buscar sin pelearse con las tildes ni con las mayúsculas.
 *
 * Quien busca «gestoria» quiere encontrar «Gestorías». Obligar a escribirlo con
 * tilde convierte un filtro en un acertijo.
 */
export function normaliza(texto: string): string {
  return (texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

export function coincide(valor: string, busqueda: string): boolean {
  const b = normaliza(busqueda);
  if (!b) return true;
  return normaliza(valor).includes(b);
}

/**
 * Las filas que quedan al filtrar por columna.
 *
 * Todos los filtros a la vez, no el último: escribir en dos columnas es acotar
 * más, no cambiar de búsqueda.
 */
export function filtraFilas<T extends FilaProveedor>(
  filas: T[],
  filtros: Record<string, string>
): T[] {
  const activos = COLUMNAS_TABLA.filter((c) => normaliza(filtros[c.titulo] ?? ''));
  if (!activos.length) return filas;
  return filas.filter((p) => activos.every((c) => coincide(c.valor(p), filtros[c.titulo])));
}

/** Con punto y coma, que es lo que abre Excel en español sin preguntar. */
export function escapaCsv(valor: string): string {
  const s = valor ?? '';
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** El fichero entero, para poder comprobarlo sin navegador. */
export function csvDeProveedores(filas: FilaProveedor[]): string {
  const cabeceras = COLUMNAS.map((c) => c.titulo).join(';');
  const cuerpo = filas.map((p) => COLUMNAS.map((c) => escapaCsv(c.valor(p))).join(';'));
  return [cabeceras, ...cuerpo].join('\r\n');
}

/**
 * Cómo se llama el fichero.
 *
 * Lleva el filtro dentro a propósito: dos exportaciones del mismo día con
 * distinto filtro no pueden llamarse igual, o acaban pisándose en Descargas y
 * nadie sabe cuál es cuál.
 */
export function nombreDelFichero(filtro: string, hoy: string): string {
  return `proveedores-${filtro || 'todos'}-${hoy}.csv`;
}
