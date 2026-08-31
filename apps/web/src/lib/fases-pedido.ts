/**
 * Qué se enseña de un pedido en cada fase.
 *
 * Un pedido recién encargado enseñaba los kilómetros del coche y cuántas llaves
 * traía —de un coche que sigue en Alemania—, y el reacondicionado de un coche
 * que nadie ha visto. Con todo delante a la vez, lo que toca ahora se pierde
 * entre lo que no toca todavía, y los huecos vacíos parecen tareas pendientes.
 *
 * Nada se quita: lo que no es de esta fase sigue estando, detrás de «Ver todo».
 * A veces hay que corregir un bastidor mal escrito tres fases después.
 */

export type Bloque = 'titular' | 'comprobaciones' | 'datos' | 'papeles' | 'alLlegar' | 'gastos';

export const LO_DE_CADA_FASE: Record<string, Bloque[]> = {
  // Preparándolo: a quién, por cuánto y a nombre de quién.
  'Borrador':   ['titular', 'comprobaciones', 'datos'],
  // Encargado. Solo falta que lo acepten, y por cuánto.
  'Pedido':     ['titular', 'comprobaciones', 'datos'],
  // Aceptado: ahora se reúnen los papeles, que es lo que hace falta para moverlo.
  'Confirmado': ['titular', 'papeles', 'datos'],
  // Viene de camino: los papeles y lo que se vea el día que llegue.
  'En camino':  ['papeles', 'alLlegar'],
  // Aquí: lo que se vio, su matrícula, y lo que cuesta dejarlo listo.
  'Recibido':   ['alLlegar', 'datos', 'gastos', 'papeles'],
  'Cancelado':  ['datos'],
};

/** Si ese bloque toca en esa fase. Con `verTodo`, todos. */
export function toca(bloque: Bloque, estado: string, verTodo = false): boolean {
  return verTodo || (LO_DE_CADA_FASE[estado] ?? []).includes(bloque);
}
