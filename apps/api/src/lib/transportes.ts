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
 * Si el coche ya ha salido, el expediente lo dice sin que nadie lo repita.
 *
 * Marcar el tramo «Recogido» o «En tránsito» **es** decir que el coche va de
 * camino: es el mismo hecho, y tenerlo que decir otra vez en Importaciones es
 * como se llega a un cliente que ve «verificado y pagado» en su panel con el
 * coche cruzando Francia.
 *
 * Solo desde «Verificado y pagado», que es la etapa anterior: así no se salta
 * ninguna ni se retrocede desde trámites o entregado si alguien vuelve a tocar
 * el tramo. Y solo el **primer** tramo, que es el que trae el coche a España;
 * el segundo sale de nuestra campa con el expediente ya en trámites.
 *
 * No manda ningún correo: cambia lo que el cliente ve en su panel, y el aviso
 * por correo sigue siendo un botón que alguien pulsa.
 */
export function mueveElExpediente(t: {
  tramo?: number | string | null;
  lead_id?: string | null;
}, estadoNuevo: string): boolean {
  return aQueEtapaLoLleva(t, estadoNuevo) !== null;
}

/**
 * Y a cuál lo lleva, que son dos y no una.
 *
 * El coche sale de la nave del vendedor: **En transporte**. El coche se
 * descarga en Zaragoza: **En trámites**, porque a partir de ahí lo que ocurre
 * es ponerlo legal aquí. Las dos son el mismo hecho dicho una vez.
 *
 * La segunda era la que faltaba, y colgaba de ella media máquina: los tres
 * papeleos de la gestoría y el segundo tramo se abren al entrar en trámites,
 * así que hasta que alguien se acordaba de mover la etapa a mano no existía
 * ninguno. Un coche podía pasarse una semana en Zaragoza sin que nadie
 * hubiera empezado a matricularlo y sin que apareciera en ningún tablero.
 *
 * Devuelve `null` cuando no hay que mover nada. Quien llama comprueba además
 * la etapa de la que sale, para no saltarse ninguna ni retroceder.
 */
export function aQueEtapaLoLleva(t: {
  tramo?: number | string | null;
  lead_id?: string | null;
}, estadoNuevo: string): string | null {
  if (!String(t.lead_id ?? '').trim()) return null;
  // Solo el primer tramo: el segundo sale de nuestra campa con el expediente
  // ya en trámites, y su entrega es un acto con firma que no se automatiza.
  if (Number(t.tramo ?? 1) > 1) return null;
  if (estaEnCamino(estadoNuevo)) return 'En transporte';
  if (estadoNuevo === 'Entregado') return 'En trámites';
  return null;
}

/** De qué etapa tiene que venir para que ese salto no se salte ninguna. */
export function deQueEtapaSale(etapaNueva: string): string {
  return etapaNueva === 'En trámites' ? 'En transporte' : 'Verificado y pagado';
}

/**
 * El coche ya no está donde estaba.
 *
 * No es lo mismo que `estaEnCamino`: uno entregado también salió, y un pedido
 * no puede dejar de cumplir una condición por haberla cumplido del todo. Se usa
 * para no dejar poner un pedido en camino sin que nadie lo haya recogido.
 *
 * Una incidencia no cuenta: puede ser de antes de recogerlo. Si el coche ya
 * había salido, el tramo se mueve al estado que corresponda y se sigue.
 */
export function haSalido(estado: string): boolean {
  return estado === 'Recogido' || estado === 'En tránsito' || estado === 'Entregado';
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
