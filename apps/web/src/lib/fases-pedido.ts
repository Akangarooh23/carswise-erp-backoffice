/**
 * Qué se enseña de un pedido en cada fase, y qué hace falta rellenar.
 *
 * Un pedido recién encargado enseñaba los kilómetros del coche y cuántas llaves
 * traía —de un coche que sigue en Alemania—, el reacondicionado de uno que nadie
 * ha visto, y su matrícula, que en un coche de importación todavía no existe.
 *
 * El problema no es solo el ruido: **un hueco vacío parece una tarea
 * pendiente**. Puesto delante en la fase que no toca, se rellena con lo primero
 * que sirva, y entonces hay un dato falso donde había un hueco honesto.
 *
 * Nada se quita: lo que no es de esta fase sigue estando, detrás de «Ver todo».
 * A veces hay que corregir un bastidor mal escrito tres fases después.
 */

export type Bloque = 'titular' | 'comprobaciones' | 'papeles' | 'alLlegar' | 'gastos';

export const LO_DE_CADA_FASE: Record<string, Bloque[]> = {
  // Preparándolo: a quién y a nombre de quién.
  'Borrador':   ['titular', 'comprobaciones'],
  // Encargado. Solo falta que lo acepten, y por cuánto.
  'Pedido':     ['titular', 'comprobaciones'],
  // Aceptado: ahora se reúnen los papeles, que es lo que hará falta para moverlo.
  'Confirmado': ['titular', 'papeles'],
  // Viene de camino: los papeles y lo que se vea el día que llegue.
  'En camino':  ['papeles', 'alLlegar'],
  // Aquí: lo que se vio, y lo que cuesta dejarlo listo.
  'Recibido':   ['alLlegar', 'gastos', 'papeles'],
  'Cancelado':  [],
};

export type Campo =
  | 'proveedor' | 'importe' | 'fecha_estimada' | 'matricula' | 'bastidor'
  | 'factura_proveedor' | 'factura_pagada_el';

export interface CampoDePedido {
  campo: Campo;
  etiqueta: string;
  /** Las fases en las que tiene sentido rellenarlo. */
  fases: string[];
  /** Si sin él no se puede pasar a esa fase. Los demás son opcionales. */
  haceFaltaPara?: string;
  /** Una línea que diga cuándo se sabe, para no dejarlo a la intuición. */
  pista?: string;
}

export const CAMPOS: CampoDePedido[] = [
  {
    campo: 'proveedor', etiqueta: 'Proveedor',
    fases: ['Borrador', 'Pedido'],
    haceFaltaPara: 'Pedido',
    pista: 'Sin proveedor no hay a quién reclamar.',
  },
  {
    campo: 'importe', etiqueta: 'Importe',
    fases: ['Borrador', 'Pedido', 'Confirmado'],
    haceFaltaPara: 'Confirmado',
    pista: 'Lo que cobra el vendedor, no lo que paga el cliente.',
  },
  {
    campo: 'fecha_estimada', etiqueta: 'Lo esperamos para',
    fases: ['Pedido', 'Confirmado', 'En camino'],
    pista: 'Cuando lo diga el proveedor. Si aún no lo ha dicho, déjalo vacío.',
  },
  {
    campo: 'factura_proveedor', etiqueta: 'Factura del vendedor (número)',
    fases: ['Confirmado', 'En camino', 'Recibido'],
    haceFaltaPara: 'En camino',
    pista: 'Es lo que ata el pago a este coche. Sin él queda un cargo sin concepto.',
  },
  {
    campo: 'factura_pagada_el', etiqueta: 'Pagada el',
    fases: ['Confirmado', 'En camino', 'Recibido'],
    haceFaltaPara: 'En camino',
    pista: 'Un coche que se mueve sin pagar sigue siendo del vendedor.',
  },
  {
    campo: 'bastidor', etiqueta: 'Bastidor',
    fases: ['Confirmado', 'En camino', 'Recibido'],
    pista: 'Va en la documentación del coche.',
  },
  {
    campo: 'matricula', etiqueta: 'Matrícula',
    fases: ['Recibido'],
    pista: 'Un coche de importación no la tiene hasta que se matricula aquí.',
  },
];

/** Si ese bloque toca en esa fase. Con `verTodo`, todos. */
export function toca(bloque: Bloque, estado: string, verTodo = false): boolean {
  return verTodo || (LO_DE_CADA_FASE[estado] ?? []).includes(bloque);
}

/** Si ese campo se enseña en esa fase. */
export function tocaCampo(campo: Campo, estado: string, verTodo = false): boolean {
  if (verTodo) return true;
  return CAMPOS.find((c) => c.campo === campo)?.fases.includes(estado) ?? false;
}

/** Los campos de esta fase, en orden. Vacío si no hay ninguno que rellenar. */
export function camposDe(estado: string, verTodo = false): CampoDePedido[] {
  return CAMPOS.filter((c) => verTodo || c.fases.includes(estado));
}
