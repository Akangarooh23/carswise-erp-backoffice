/**
 * Cómo se le llama en pantalla a quien tiene el coche.
 *
 * No es «el concesionario» siempre: el marketplace ya tiene particulares y
 * profesionales, y vendrán importación, renting y portales. Cada visita usa la
 * palabra que le toca según de quién sea la oferta, que es la misma que ve el
 * cliente. Decirle concesionario a un particular no es un detalle de estilo:
 * quien lee la Agenda decide con eso a quién llama y cómo le habla.
 *
 * El nombre viene **sin artículo**. Con el artículo pegado dentro, quien lo usa
 * le enchufa la preposición delante y sale «he llamado a el concesionario»: en
 * castellano `a` + `el` es `al`, y eso no se arregla concatenando. Por eso van
 * aparte `elQueVende` y `alQueVende`, y quien escribe elige cuál necesita.
 */

export function comoSeLlama(tipo: string | null | undefined): string {
  if (tipo === 'particular') return 'particular';
  if (tipo === 'concesionario') return 'concesionario';
  if (tipo === 'professional') return 'profesional';
  return 'vendedor';
}

/** «el concesionario». Para cuando va de sujeto o detrás de «con», «de». */
export function elQueVende(tipo: string | null | undefined): string {
  return `el ${comoSeLlama(tipo)}`;
}

/** «al concesionario». Para detrás de «a»: llamar a, avisar a, la llamada a. */
export function alQueVende(tipo: string | null | undefined): string {
  return `al ${comoSeLlama(tipo)}`;
}
