/**
 * Traer el coche.
 *
 * Un coche comprado en Alemania hace un viaje, y a veces dos o tres: del
 * vendedor al almacén, del almacén al taller, del taller al cliente. Hasta ahora
 * eso era una etapa del expediente y nada más — no se sabía quién lo traía,
 * cuánto costaba ni cuándo salía.
 *
 * Cada viaje es un **tramo**, con su transportista y su coste. Sumarlos es parte
 * de lo que cuesta el coche de verdad.
 *
 * Y lo que parece un detalle y no lo es: **fotos al recoger y al entregar**. Es
 * lo único que distingue un golpe que ya venía de uno que se hizo por el camino,
 * y esa discusión llega siempre.
 */

export const ESTADOS_TRANSPORTE = [
  'Por organizar',
  'Contratado',
  'Recogido',
  'En tránsito',
  'Entregado',
] as const;

export type EstadoTransporte = (typeof ESTADOS_TRANSPORTE)[number];

/** No llegó, o no como debía. Existe, pero no es un paso adelante. */
export const INCIDENCIA = 'Con incidencia';

export const QUE_TOCA_TRANSPORTE: Record<EstadoTransporte, string> = {
  'Por organizar': 'Buscar quién lo trae y cerrar precio',
  'Contratado':    'Esperando a que lo recojan',
  'Recogido':      'Ya lo tiene el transportista',
  'En tránsito':   'De camino',
  'Entregado':     'Ha llegado',
};

export function esEstadoTransporte(v: string): v is EstadoTransporte {
  return (ESTADOS_TRANSPORTE as readonly string[]).includes(v);
}

export function esEstadoTransporteValido(v: string): boolean {
  return esEstadoTransporte(v) || v === INCIDENCIA;
}

export function siguienteEstadoTransporte(estado: string): EstadoTransporte | null {
  const i = (ESTADOS_TRANSPORTE as readonly string[]).indexOf(estado);
  return i >= 0 && i < ESTADOS_TRANSPORTE.length - 1 ? ESTADOS_TRANSPORTE[i + 1] : null;
}

/**
 * Contratarlo exige saber a quién y por cuánto.
 *
 * Un transporte «contratado» sin transportista es un coche que nadie ha quedado
 * en recoger. Y sin precio cerrado, la factura que llegue será la que quieran.
 */
export function puedeContratarse(t: { transportista?: string | null; coste?: unknown }): boolean {
  return Boolean((t.transportista ?? '').trim()) && Number(t.coste ?? 0) > 0;
}

/** Está fuera, en manos de otro. */
export function estaEnCamino(estado: string): boolean {
  return estado === 'Recogido' || estado === 'En tránsito';
}

/**
 * Las fotos que tienen que existir en cada momento.
 *
 * Al recoger, para saber cómo salió. Al entregar, para saber cómo llegó. Sin las
 * dos no hay forma de sostener una reclamación por un golpe.
 */
export const FOTOS_RECOGIDA = 'Fotos en la recogida';
export const FOTOS_ENTREGA = 'Fotos en la entrega';

export function fotosQueFaltan(estado: string, papelesSubidos: string[]): string[] {
  const hay = new Set(papelesSubidos.map((x) => x.trim().toLowerCase()));
  const faltan: string[] = [];
  const yaRecogido = estado === 'Recogido' || estado === 'En tránsito' || estado === 'Entregado';
  if (yaRecogido && !hay.has(FOTOS_RECOGIDA.toLowerCase())) faltan.push(FOTOS_RECOGIDA);
  if (estado === 'Entregado' && !hay.has(FOTOS_ENTREGA.toLowerCase())) faltan.push(FOTOS_ENTREGA);
  return faltan;
}

/** Cuántos días lleva de viaje, para poder preguntar con una fecha delante. */
export function diasEnCamino(recogidoEl?: string | null, ahora: Date = new Date()): number | null {
  if (!recogidoEl) return null;
  const d = new Date(recogidoEl);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
}

/**
 * Lo que ha costado traerlo, sumando todos los tramos.
 *
 * Cuenta también el que acabó con incidencia: ese viaje se pagó igual, y lo que
 * se busca aquí es lo que ha costado el coche, no lo que salió bien.
 */
export function costeDelViaje(tramos: { coste?: unknown }[]): number {
  return tramos.reduce((suma, t) => suma + Number(t.coste ?? 0), 0);
}

/** La línea que deja un cambio de estado en las notas. */
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
