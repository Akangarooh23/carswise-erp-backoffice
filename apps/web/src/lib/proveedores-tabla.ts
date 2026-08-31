/**
 * Las columnas de la tabla de proveedores, y cómo salen al fichero.
 *
 * Están aquí y no dentro de la pantalla por una razón concreta: **la tabla y la
 * exportación tienen que enseñar lo mismo**. Separarlas acaba con un fichero que
 * no se parece a lo que había delante, y eso es lo que hace que nadie se fíe de
 * una exportación.
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

export const COLUMNAS: { titulo: string; valor: (p: FilaProveedor) => string }[] = [
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
   * Las notas van en una sola celda.
   *
   * Llevan saltos de línea —lo comprobado de cada proveedor, lo que falta por
   * pedirles— y un salto sin escapar parte la fila en dos: la mitad de un
   * proveedor aparecería como si fuera otro.
   */
  { titulo: 'Notas', valor: (p) => (p.notas ?? '').replace(/\s*\n\s*/g, ' · ') },
];

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
