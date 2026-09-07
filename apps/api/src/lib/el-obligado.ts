/**
 * Quién es el obligado tributario de una fila de proveedor.
 *
 * `matriz_id` ya existía y significaba una cosa: un **grupo de sociedades**,
 * cada una con su CIF, que van juntas para negociar una tarifa y sumar lo del
 * grupo. La factura la emite la filial, con su propio NIF.
 *
 * Ahora hace falta otra cosa que se le parece y no lo es: una sociedad con
 * **varias sedes** —Modrive Madrid, Modrive Barcelona—, un solo CIF y varias
 * direcciones de facturación. Cada sede tiene su teléfono, su dirección y su
 * persona; el CIF es de la matriz.
 *
 * Y para Hacienda no se parecen en nada:
 *
 *   - Un grupo son **varias declaraciones**, una por NIF.
 *   - Unas sedes son **una sola**, con la suma de todas.
 *
 * Por eso la relación se escribe y no se deduce. Se podría adivinar del NIF
 * —«si está vacío, será una sede»—, pero un NIF sin rellenar es lo más normal
 * del mundo, y de esa suposición sale un modelo 347 mal presentado.
 */

/** Qué es una fila respecto de su matriz. */
export type Relacion = 'sede' | 'filial';

export const RELACIONES: readonly Relacion[] = ['sede', 'filial'];

export function esRelacion(v: unknown): v is Relacion {
  return typeof v === 'string' && (RELACIONES as readonly string[]).includes(v);
}

export const COMO_SE_LEE: Record<Relacion, string> = {
  sede: 'sede',
  filial: 'sociedad del grupo',
};

/** Lo mínimo que hace falta saber de una fila para situarla. */
export interface Fila {
  id: string;
  matriz_id?: string | null;
  relacion?: string | null;
  nif?: string | null;
}

const puesto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Si esta fila es una sede de otra: mismo CIF, otra dirección. */
export function esSede(p: Fila): boolean {
  return Boolean(puesto(p.matriz_id)) && p.relacion === 'sede';
}

/**
 * A nombre de quién se declara lo de esta fila.
 *
 * De una sede, su matriz: comparten CIF y Hacienda ve un solo acreedor. De una
 * filial, ella misma: tiene NIF propio y declara aparte. Y de una fila suelta,
 * ella misma.
 *
 * Todo lo que acabe en un modelo —el 347, el saldo con un acreedor, el libro de
 * facturas recibidas— se agrupa por esto y **nunca por la fila**. Agrupando por
 * la fila, Modrive saldría tres veces con tres importes por debajo del umbral
 * donde tiene que salir una con la suma.
 */
export function elObligado(p: Fila): string {
  return esSede(p) ? puesto(p.matriz_id) : p.id;
}

/**
 * De dónde sale el NIF de esta fila.
 *
 * De la sede no: no tiene. Se lo pide a su matriz, y quien pinta enseña ese con
 * una nota de que es heredado. Escribirlo también en la sede seria el mismo
 * dato en dos sitios, y el dia que cambie uno cambiaria solo uno.
 */
export function deQuienEsElNif(p: Fila): string {
  return esSede(p) ? puesto(p.matriz_id) : p.id;
}

export const PORQUE_NO_VALE = {
  sinMatriz: 'para ser sede o filial hace falta decir de quién',
  sedeConNif: 'una sede no tiene NIF propio: lo hereda de su matriz',
  nifRepetido: 'ya hay otro proveedor con ese NIF. Si es la misma empresa en otra dirección, dalo de alta como sede',
} as const;

/**
 * Si una fila se sostiene tal y como viene.
 *
 * Solo lo que trae la propia fila. Lo que necesita mirar a las demás —que la
 * matriz no sea ella misma, que no haya tres niveles— ya lo comprueba
 * `fallaLaMatriz` en `lib/proveedores.ts`, y repetirlo aquí sería tener la
 * misma regla en dos sitios para que un día se separen.
 *
 * Y se comprueba antes de guardar, no solo con el índice de la base: un índice
 * dice «clave duplicada» y quien lo lee no sabe qué hacer con eso. Lo que hay
 * que decirle es que eso que intenta crear es una sede de algo que ya existe.
 */
export function seSostiene(
  p: Fila & { relacion?: string | null },
): { si: boolean; porque?: string } {
  const relacion = puesto(p.relacion);

  if (relacion && !puesto(p.matriz_id)) return { si: false, porque: PORQUE_NO_VALE.sinMatriz };
  if (relacion === 'sede' && puesto(p.nif)) return { si: false, porque: PORQUE_NO_VALE.sedeConNif };
  return { si: true };
}
