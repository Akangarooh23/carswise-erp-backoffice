/**
 * Lo que hay que hacer con los coches, dicho como una lista de tareas.
 *
 * Pendientes tenía nueve cosas administrativas —facturas, leads, citas— y le
 * faltaba **el trabajo del día**: «a este Kia le toca encargar la peritación».
 * Eso vivía en una tabla dentro de otra pestaña, así que la lista de pendientes
 * era la del papeleo y no la del trabajo.
 *
 * El cálculo no se rehace aquí: sale de `pasosDeLaImportacion`, el mismo del
 * que salen la ficha del coche y el número rojo del menú. Calculado aparte
 * acabaría diciendo otra cosa del mismo expediente.
 *
 * ## Se agrupa por tarea, no por coche
 *
 * Con quince coches, una fila por coche son quince filas y la lista deja de
 * leerse. Agrupado sale «3 coches esperando encargar la peritación», que es una
 * tarde de trabajo en una línea y lleva a la pantalla donde está el botón. El
 * detalle coche a coche ya está en Gestión.
 */

import type { Expediente } from './expedientes-importacion.js';
import { pasosDeLaImportacion, loQueToca, loQueFaltaAparte } from './pasos-de-la-importacion.js';

/** Una tarea pendiente, con la misma forma que las que da el servidor. */
export interface TareaDeCoches {
  clave: string;
  etiqueta: string;
  /** En singular: «1 coches» se lee mal. */
  una: string;
  porque: string;
  n: number;
  a: string;
  icono: string;
  tono: 'urgente' | 'espera';
}

/** Un nombre de clave estable a partir del título del paso. */
function claveDe(titulo: string): string {
  return 'coches:' + titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Las tareas de los coches en marcha.
 *
 * Los entregados no cuentan: un expediente cerrado no tiene nada pendiente
 * aunque le falte algún papel, y meterlo aquí llenaría la lista de coches que
 * ya no se tocan.
 *
 * Lo que **mueve el coche** va en rojo y lo que va por su cuenta —pedirle la
 * factura al perito— en ámbar. Es trabajo igual, pero el coche no lo espera, y
 * pintados iguales acaban por no mirarse ninguno de los dos.
 */
export function trabajoDeLosCoches(
  expedientes: readonly Expediente[] | null | undefined,
  hoy: Date = new Date()
): TareaDeCoches[] {
  const porTarea = new Map<string, { titulo: string; donde: string; n: number; tono: 'urgente' | 'espera' }>();

  for (const x of expedientes ?? []) {
    if (x.status === 'Entregado') continue;
    const pasos = pasosDeLaImportacion(x, hoy);

    const suma = (titulo: string, donde: string | undefined, tono: 'urgente' | 'espera') => {
      const clave = claveDe(titulo);
      const ya = porTarea.get(clave);
      if (ya) { ya.n += 1; return; }
      porTarea.set(clave, { titulo, donde: donde || '/importaciones', n: 1, tono });
    };

    const toca = loQueToca(pasos);
    if (toca) suma(toca.titulo, toca.donde, 'urgente');
    for (const p of loQueFaltaAparte(pasos)) suma(p.titulo, p.donde, 'espera');
  }

  // De más coches a menos: dentro de las tareas de coches sí manda la cantidad,
  // porque todas cuestan lo mismo —un rato— y lo que decide por dónde empezar
  // es cuántas hay.
  return [...porTarea.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].titulo.localeCompare(b[1].titulo, 'es'))
    .map(([clave, t]) => ({
      clave,
      etiqueta: `coches esperando: ${t.titulo.toLowerCase()}`,
      una: `un coche esperando: ${t.titulo.toLowerCase()}`,
      porque: t.tono === 'urgente'
        ? 'el expediente está parado hasta que se haga'
        : 'no para el coche, pero hay que hacerlo',
      n: t.n,
      a: t.donde,
      icono: 'coche',
      tono: t.tono,
    }));
}
