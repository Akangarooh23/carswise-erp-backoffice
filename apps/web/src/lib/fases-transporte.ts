/**
 * Qué se enseña de un tramo de transporte en cada fase.
 *
 * Un tramo recién nacido enseñaba a la vez el transportista, el precio, la
 * dirección exacta de recogida, el día, el botón de preguntarle al vendedor y
 * el de mandarle la orden al transportista. La mitad de eso no se puede hacer
 * todavía, y **un hueco vacío parece una tarea pendiente**: puesto delante en
 * la fase que no toca se rellena con lo primero que sirva.
 *
 * Y uno de esos botones hacía daño de verdad. La orden de recogida se podía
 * mandar antes de preguntarle al vendedor dónde y cuándo se recoge, así que
 * salía con la ciudad del anuncio por dirección. Un camión no va a una ciudad:
 * va a una calle, un día, a una hora y preguntando por alguien. Un camión en la
 * puerta equivocada no se deshace.
 *
 * Es el mismo criterio que en los pedidos y en las peritaciones: se enseña lo
 * de la fase, y lo demás sigue estando detrás de «Ver todo».
 */

export type BloqueDeTramo = 'quien' | 'dondeRecoger' | 'ruta' | 'orden' | 'fotos';

export const LO_DE_CADA_FASE: Record<string, BloqueDeTramo[]> = {
  // Buscando quién lo trae. Y, si sale del vendedor, preguntarle dónde y cuándo.
  'Por organizar': ['quien', 'dondeRecoger'],
  // Contratado: con su respuesta se cierra la ruta y se manda la orden.
  'Contratado':    ['quien', 'dondeRecoger', 'ruta', 'orden'],
  // Ya lo tiene: lo que queda son las fotos del viaje.
  'Recogido':      ['ruta', 'orden', 'fotos'],
  'En tránsito':   ['ruta', 'fotos'],
  'Entregado':     ['ruta', 'fotos'],
  // Una incidencia puede pasar en cualquier momento: se enseña todo.
  'Con incidencia': ['quien', 'dondeRecoger', 'ruta', 'orden', 'fotos'],
};

/**
 * Y con la pregunta al vendedor ya hecha, la ruta se enseña antes.
 *
 * La tabla decía que la ruta viene después de contratar, y está al revés: su
 * respuesta —la calle, el día, por quién preguntar, si entra un portacoches—
 * es justo lo que hace falta para pedir precio. Sin enseñar esos campos, el
 * correo llega al buzón y no hay dónde copiarlo; y lo que no se apunta no
 * existe para nadie más que para quien lo leyó.
 *
 * Antes de preguntar siguen escondidos, que era el motivo original: un hueco
 * vacío puesto delante parece una tarea pendiente y se rellena con lo primero
 * que sirva, que aquí es la ciudad del anuncio.
 */
/**
 * Y con quién lo trae y por cuánto ya elegidos, la orden se enseña también.
 *
 * La tabla pedía pasar a «Contratado» y luego mandar la orden, y eso está al
 * revés de como ocurre: se acuerda por correo, se manda la orden confirmando
 * el encargo, y **eso es contratar**. Pedir que se marque antes obliga a
 * declarar cerrado algo que se cierra con el correo que todavía no ha salido.
 *
 * Hace falta el precio, no solo el nombre: una orden sin precio acordado es
 * un encargo abierto, y la factura será la que quieran.
 */
export function bloquesDelTramo(
  estado: string,
  t?: {
    recogida_preguntada_at?: string | null;
    transportista?: string | null;
    coste?: unknown;
  } | null
): BloqueDeTramo[] {
  const base = [...(LO_DE_CADA_FASE[estado] ?? ['quien'])];
  if (String(t?.recogida_preguntada_at ?? '').trim() && !base.includes('ruta')) {
    base.push('ruta');
  }
  const hayTrato = Boolean(String(t?.transportista ?? '').trim()) && Number(t?.coste ?? 0) > 0;
  if (hayTrato && !base.includes('orden')) base.push('orden');
  return base;
}

/**
 * Preguntarle al vendedor dónde se recoge **solo tiene sentido en el tramo 1**.
 *
 * Es el que sale de la nave del vendedor alemán. El segundo sale de nuestra
 * campa, y ahí no hay a quién preguntar: el correo iría igualmente al
 * concesionario, preguntándole por una recogida que no es suya.
 */
export function seLePreguntaAlVendedor(tramo: number | string | null | undefined): boolean {
  return Number(tramo) === 1;
}


/**
 * Qué toca ahora en un tramo, en una frase.
 *
 * El panel enseña ocho campos y cuatro botones, y con todo delante no se
 * distingue lo que falta de lo que ya está: el único dato que toca queda
 * debajo de dos pantallas de datos correctos, y ni siquiera se ve que falta.
 *
 * Se mira **lo que hay**, no el estado: un tramo «En tránsito» al que le falta
 * mirar el coche y otro al que no están en el mismo sitio aunque digan lo
 * mismo en el desplegable.
 */
export function queTocaEnElTramo(t: {
  estado?: string | null;
  transportista?: string | null;
  coste?: unknown;
  desde?: string | null;
  recogida_prevista?: string | null;
  tramo?: number | string | null;
  recogida_preguntada_at?: string | null;
  aviso_recogida_at?: string | null;
  orden_enviada_at?: string | null;
  llegada?: { conforme?: boolean } | null;
}): string {
  const estado = String(t.estado ?? '');
  if (estado === 'Entregado') {
    return typeof t.llegada?.conforme === 'boolean'
      ? 'Entregado.'
      : 'Falta decir si el coche llegó como salió.';
  }

  // Con el coche fuera, lo único que queda es mirarlo al bajarlo del camión.
  if (estado === 'Recogido' || estado === 'En tránsito') {
    return 'Cuando llegue, míralo antes de darlo por entregado: ahí se dice si llegó como salió.';
  }

  // Y antes de que salga, en el orden en que se hace.
  if (!String(t.transportista ?? '').trim() || !(Number(t.coste ?? 0) > 0)) {
    return 'Elige quién lo trae y pídele precio.';
  }
  if (seLePreguntaAlVendedor(t.tramo) && !t.recogida_preguntada_at) {
    return 'Pregúntale al vendedor dónde y cuándo se recoge, desde el expediente.';
  }
  if (!String(t.desde ?? '').trim() || !String(t.recogida_prevista ?? '').trim()) {
    return 'Apunta lo que ha contestado el vendedor: la dirección exacta y el día.';
  }
  if (seLePreguntaAlVendedor(t.tramo) && !t.aviso_recogida_at) {
    return 'Dile al vendedor quién va a por el coche y qué día.';
  }
  if (!t.orden_enviada_at) {
    return 'Confírmaselo al transportista y mándale la orden.';
  }
  return 'Esperando a que lo recojan.';
}

/** Lo que impide mandar la orden de recogida, si algo lo impide. */
export function faltaParaLaOrden(t: {
  transportista?: string | null;
  desde?: string | null;
  hasta?: string | null;
  tramo?: number | string | null;
  recogida_preguntada_at?: string | null;
  aviso_recogida_at?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!String(t.transportista ?? '').trim()) falta.push('elegir quién lo trae');
  if (!String(t.desde ?? '').trim()) falta.push('de dónde sale');
  if (!String(t.hasta ?? '').trim()) falta.push('a dónde va');
  // En el primer tramo, la dirección buena la da el vendedor. Sin preguntarle,
  // lo que hay escrito en «Desde» es la ciudad del anuncio.
  if (seLePreguntaAlVendedor(t.tramo) && !t.recogida_preguntada_at) {
    falta.push('preguntarle antes al vendedor dónde y cuándo se recoge');
  }
  /*
   * Y el vendedor tiene que saber quién va antes de que salga el camión.
   *
   * Lo puso Ana como regla y es la que evita el fallo caro: un conductor que
   * llega a una nave donde nadie le espera se va vacío, y ese viaje se paga
   * igual. Mandar la orden primero es apostar a que el vendedor se entera a
   * tiempo por su cuenta.
   */
  if (seLePreguntaAlVendedor(t.tramo) && t.recogida_preguntada_at && !t.aviso_recogida_at) {
    falta.push('avisar al vendedor de quién va y qué día');
  }
  return falta;
}

/** Cuándo se sabe cada dato, para no dejarlo a la intuición. */
export const PISTAS: Record<string, string> = {
  transportista: 'De la lista de Proveedores. Sin él no hay a quién mandarle la orden.',
  coste: 'Lo que nos cobra por este tramo, no lo que paga el cliente.',
  desde: 'La dirección exacta, la que dé el vendedor. Una ciudad no es una dirección.',
  hasta: 'A dónde lo lleva: nuestra campa, o la dirección del cliente en el último tramo.',
  recogida_prevista: 'El día que dice el vendedor que se lo pueden llevar.',
};
