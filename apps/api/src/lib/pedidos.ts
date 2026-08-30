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
