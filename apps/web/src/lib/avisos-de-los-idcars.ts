/**
 * Qué espera cada IDCar, dicho en la lista y en el menú.
 *
 * El panel avisaba de «1 encargo listo para el taller» y llevaba a la lista
 * entera de IDCars, donde todos los coches se ven iguales: no había forma de
 * saber cuál era. Con dos ya es adivinar; con doscientos, el aviso no sirve.
 *
 * Aquí viven dos cosas: cómo se llama cada aviso en una frase corta —la del
 * panel es larga y en una tabla no cabe— y cómo se cuenta cuántos coches
 * esperan algo, que es el número rojo del menú.
 */

/** Un coche con lo que espera, tal y como lo manda la API. */
export interface IdCarConAvisos {
  vehicle_id: string;
  matricula: string;
  coche: string;
  avisos: string[];
}

/**
 * El nombre corto de cada aviso.
 *
 * En la tabla caben cuatro palabras, no una frase. «Falta la revisión» al lado
 * de un coche dice lo mismo que «encargo listo para el taller» en el panel, que
 * es una frase pensada para leerse suelta.
 */
export const NOMBRE_CORTO: Record<string, string> = {
  encargos_vendidos: 'Vendido, falta cerrar',
  encargos_por_llamar: 'Hay que llamarle',
  encargos_sin_franjas: 'Sin horas de visita',
  encargos_listos: 'Falta la revisión',
  encargos_rechazados: 'El taller lo tumbó',
  encargos_sin_firmar: 'Mandato sin firmar',
  citas_taller_que_pide_mover: 'No puede ir al taller',
  encargos_sin_mandar_el_precio: 'Falta mandarle el precio',
  ventas_financiacion_en_estudio: 'Financiación en estudio',
  ventas_financiacion_denegada: 'Financiación denegada',
  ventas_esperando_ingreso: 'Falta el ingreso',
};

/**
 * Los rojos y los que solo esperan.
 *
 * Mismo criterio que el panel: el rojo se guarda para lo que cuesta dinero o
 * para alguien que está esperando una llamada. «Falta la revisión» es trabajo
 * nuestro en marcha, y pintarlo de rojo haría que el rojo dejara de significar
 * nada.
 */
const URGENTES = new Set([
  'encargos_vendidos',
  'encargos_por_llamar',
  'encargos_sin_franjas',
  'encargos_rechazados',
  'encargos_sin_firmar',
  'citas_taller_que_pide_mover',
  'encargos_sin_mandar_el_precio',
  'ventas_financiacion_denegada',
]);

export function esUrgente(aviso: string): boolean {
  return URGENTES.has(aviso);
}

/** Si alguno de los de este coche es urgente, la marca entera lo es. */
export function algunoEsUrgente(avisos: readonly string[]): boolean {
  return avisos.some(esUrgente);
}

/**
 * Cuántos coches esperan algo. **Coches, no avisos.**
 *
 * Un coche con el mandato sin firmar y sin horas de visita es **un** coche que
 * mirar, no dos. El número del menú dice a cuántas fichas hay que entrar; el
 * del panel dice cuántas cosas hay que hacer, y son dos preguntas distintas.
 */
export function cuantosCochesEsperan(coches: readonly IdCarConAvisos[]): number {
  return coches.filter((c) => c.avisos.length > 0).length;
}

/** Lo que espera cada coche, por su id, para pintarlo en la tabla. */
export function porCoche(coches: readonly IdCarConAvisos[]): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const c of coches) {
    if (c.avisos.length) mapa[c.vehicle_id] = c.avisos;
  }
  return mapa;
}
