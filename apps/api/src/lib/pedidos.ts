/**
 * Las reglas de un pedido.
 *
 * Un pedido es encargarle un coche a un proveedor y esperarlo. Da igual que el
 * proveedor esté en Alemania, sea un concesionario de aquí o una empresa de
 * renting: el camino es el mismo, y por eso los estados son los mismos para
 * todos los orígenes.
 *
 * Están fuera de la ruta porque son reglas, no consultas: qué estado va después
 * de cuál, y qué no se puede hacer todavía. Así se pueden comprobar sin base de
 * datos.
 */

export const ESTADOS_PEDIDO = [
  'Borrador',
  'Pedido',
  'Confirmado',
  'En camino',
  'Recibido',
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

/** Fuera del camino: existe, pero ya no avanza. */
export const CANCELADO = 'Cancelado';

/** Qué hay que hacer con un pedido que está aquí. */
export const QUE_TOCA_PEDIDO: Record<EstadoPedido, string> = {
  'Borrador':   'Prepararlo y encargarlo',
  'Pedido':     'Esperando que el proveedor lo acepte',
  'Confirmado': 'Organizar la recogida o el transporte',
  'En camino':  'Viene de camino',
  'Recibido':   'Está en nuestras manos',
};

export const ORIGENES_PEDIDO = [
  'importacion',
  'concesionario',
  'ex-renting',
  'particular',
  'stock',
] as const;

export type OrigenPedido = (typeof ORIGENES_PEDIDO)[number];

export const ETIQUETA_ORIGEN: Record<OrigenPedido, string> = {
  'importacion':   'Importación',
  'concesionario': 'Concesionario',
  'ex-renting':    'Ex-renting',
  'particular':    'Particular',
  'stock':         'Para stock',
};

export function esEstadoPedido(v: string): v is EstadoPedido {
  return (ESTADOS_PEDIDO as readonly string[]).includes(v);
}

export function esEstadoValido(v: string): boolean {
  return esEstadoPedido(v) || v === CANCELADO;
}

export function esOrigenPedido(v: string): v is OrigenPedido {
  return (ORIGENES_PEDIDO as readonly string[]).includes(v);
}

/** El estado que viene después. Null si ya está recibido o cancelado. */
export function siguienteEstado(estado: string): EstadoPedido | null {
  const i = (ESTADOS_PEDIDO as readonly string[]).indexOf(estado);
  return i >= 0 && i < ESTADOS_PEDIDO.length - 1 ? ESTADOS_PEDIDO[i + 1] : null;
}

/**
 * Un pedido sin proveedor no es un pedido.
 *
 * Se puede empezar a preparar sin saber a quién, y por eso existe el borrador.
 * Pero encargarlo es encargárselo a alguien: dejarlo pasar deja un coche
 * esperando sin que nadie sepa a quién reclamar.
 */
export function puedeEncargarse(pedido: { proveedor?: string | null }): boolean {
  return Boolean((pedido.proveedor ?? '').trim());
}

/**
 * La línea que deja un cambio de estado en las notas.
 *
 * Igual que en un expediente de importación: el rastro guarda quién lo movió,
 * pero lo que pasó —«el proveedor no confirma hasta el lunes»— solo lo sabe
 * quien lo escriba.
 */
export function notaDelCambio(
  notasActuales: string,
  desde: string,
  hasta: string,
  texto: string,
  cuando: Date = new Date()
): string {
  const limpio = (texto ?? '').trim();
  if (!limpio) return notasActuales ?? '';
  const dia = cuando.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const entrada = `[${dia} · ${desde} → ${hasta}] ${limpio}`;
  const previas = (notasActuales ?? '').trim();
  return previas ? `${previas}\n${entrada}` : entrada;
}

/**
 * En qué punto del camino está un estado. -1 si no es del camino.
 */
function paso(estado: string): number {
  return (ESTADOS_PEDIDO as readonly string[]).indexOf(estado);
}

/** Si llegar a `estado` supone haber pasado ya por `hito`. */
export function alMenos(estado: string, hito: EstadoPedido): boolean {
  const i = paso(estado);
  const j = paso(hito);
  return i >= 0 && j >= 0 && i >= j;
}

/**
 * Confirmado quiere decir que hay precio acordado.
 *
 * Sin importe no hay coste, y el margen de ese coche sale mal desde el primer
 * día: la cuenta de lo que ha costado de verdad se hace sumando partidas sobre
 * el precio de compra, y si ese precio es cero, todo lo que se calcule encima es
 * mentira. Es el único dato que **define** el estado, no que lo acompaña.
 */
export function importeAcordado(importe: unknown): boolean {
  const n = Number(importe);
  return Number.isFinite(n) && n > 0;
}

/**
 * Lo que falta para llegar a un estado.
 *
 * Se mira por el punto del camino, no por el salto: pasar de Borrador a «En
 * camino» de una vez exige lo mismo que haber ido paso a paso. Si no, el propio
 * atajo sería la forma de saltarse las puertas.
 *
 * Cada cosa se pide en el estado que la **define**, no antes:
 *
 * - **Pedido** es comprometerse: a quién, y con un particular lo que no se
 *   arregla después —cargas, deudas, que quien firma sea el titular—.
 * - **Confirmado** es que hay precio cerrado.
 * - **En camino** es contratar un transporte y pagarlo. Ahí sí hacen falta los
 *   papeles imprescindibles: lo que se mueve, si no, es un coche de otro.
 * - **Recibido** son los dos datos que solo se pueden tomar ese día: los
 *   kilómetros antes de moverlo y las llaves delante de quien lo trae.
 *
 * Lo que viene de fuera —papeles, comprobaciones, recepción— entra como listas
 * ya calculadas: esta función no sabe de base de datos, y así se puede
 * comprobar entera sin levantar nada.
 */
export interface LoQueYaHay {
  /** Comprobaciones del origen que aún no se han hecho. */
  comprobaciones?: string[];
  /** Papeles imprescindibles del origen que no están subidos. */
  papeles?: string[];
  /** Lo que falta por mirar del coche al llegar. */
  recepcion?: string[];
  /** Si ningún tramo de transporte ha salido todavía. */
  transporteSinSalir?: boolean;
}

/**
 * La compra pagada.
 *
 * Un coche que se mueve sin pagar es un coche que sigue siendo del vendedor,
 * viajando por nuestra cuenta y a nuestro riesgo. Y el número de su factura es
 * lo que ata el gasto a este coche: sin él, meses después hay un pago sin
 * concepto y un coche sin coste.
 */
export function compraPagada(pedido: {
  factura_proveedor?: unknown; factura_pagada_el?: unknown;
}): string[] {
  const falta: string[] = [];
  if (!String(pedido.factura_proveedor ?? '').trim()) falta.push('El número de la factura del vendedor');
  if (!String(pedido.factura_pagada_el ?? '').trim()) falta.push('Que esté pagada');
  return falta;
}

export interface DatosDelPedido {
  proveedor?: string | null;
  importe?: unknown;
  factura_proveedor?: unknown;
  factura_pagada_el?: unknown;
}

export function faltaParaLlegarA(
  estado: string,
  pedido: DatosDelPedido,
  pendiente: LoQueYaHay = {}
): string[] {
  if (estado === CANCELADO) return [];
  const falta: string[] = [];
  if (alMenos(estado, 'Pedido')) {
    if (!puedeEncargarse(pedido)) falta.push('A quién se le encarga');
    falta.push(...(pendiente.comprobaciones ?? []));
  }
  if (alMenos(estado, 'Confirmado') && !importeAcordado(pedido.importe)) {
    falta.push('Por cuánto se ha cerrado');
  }
  if (alMenos(estado, 'En camino')) {
    falta.push(...(pendiente.papeles ?? []));
    falta.push(...compraPagada(pedido));
    if (pendiente.transporteSinSalir) falta.push('Que alguien lo haya recogido: el transporte, contratado y de camino');
  }
  if (alMenos(estado, 'Recibido')) {
    falta.push(...(pendiente.recepcion ?? []));
  }
  return falta;
}

/** Lo que falta para cada estado del camino, para poder enseñarlo antes de intentarlo. */
export function faltaPorEstado(
  pedido: DatosDelPedido,
  pendiente: LoQueYaHay = {}
): Record<EstadoPedido, string[]> {
  const mapa = {} as Record<EstadoPedido, string[]>;
  for (const e of ESTADOS_PEDIDO) mapa[e] = faltaParaLlegarA(e, pedido, pendiente);
  return mapa;
}
