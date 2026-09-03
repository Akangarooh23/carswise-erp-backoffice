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

/**
 * Qué toca en un pedido, dicho según de dónde viene el coche.
 *
 * Los estados son los mismos para todos los orígenes, pero no significan lo
 * mismo. Un pedido de importación **nace comprado y pagado** —se crea al
 * liberar el dinero—, así que la tarjeta decía «Pedido · esperando que lo
 * acepten» de un coche que ya es del cliente y ya está cobrado. Eso no es que
 * se entienda mal: es falso.
 *
 * Los nombres del estado no se tocan —son datos, y los comparten cuatro
 * orígenes—; lo que cambia es la frase que explica qué hacer.
 */
export const QUE_TOCA_POR_ORIGEN: Record<string, Record<string, string>> = {
  importacion: {
    'Borrador':   'Prepararlo',
    'Pedido':     'Comprado y pagado. Falta apuntar su factura y cuándo estará listo',
    'Confirmado': 'Listo para recoger: organiza el transporte',
    'En camino':  'De camino a España',
    'Recibido':   'Ya está aquí: los trámites y lo que cueste dejarlo listo',
  },
};

/** La frase de este pedido, con la genérica de repuesto. */
export function queTocaEnElPedido(estado: string, origen: string, generica: string): string {
  return QUE_TOCA_POR_ORIGEN[origen]?.[estado] ?? generica;
}

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
/**
 * En una importación, el pedido **nace comprado y pagado**.
 *
 * Se crea al liberar el dinero, así que en cuanto existe ya hay una factura
 * del vendedor que apuntar y un pago que fechar. En los demás orígenes no:
 * ahí «Pedido» es un encargo que aún no han aceptado, y preguntar por el pago
 * sería preguntar por algo que no ha pasado.
 *
 * Es la contradicción que se veía en pantalla: arriba ponía «falta apuntar su
 * factura» y abajo no había dónde.
 */
const YA_PAGADO_AL_NACER: Record<string, Campo[]> = {
  importacion: ['factura_proveedor', 'factura_pagada_el'],
};

export function camposDe(estado: string, verTodo = false, origen = ''): CampoDePedido[] {
  const antesDeTiempo = estado === 'Pedido' ? (YA_PAGADO_AL_NACER[origen] ?? []) : [];
  return CAMPOS.filter(
    (c) => verTodo || c.fases.includes(estado) || antesDeTiempo.includes(c.campo)
  );
}
