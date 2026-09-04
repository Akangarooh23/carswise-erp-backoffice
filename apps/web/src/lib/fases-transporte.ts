/**
 * Cómo se reparte un tramo de transporte: tres partes, siempre las mismas.
 *
 * Lo fijó Ana, y el orden es el de la conversación real, no el de la ficha:
 *
 *   1. **Lo que sabemos nosotros.** Qué empresa lo lleva, de dónde sale y a
 *      dónde va. Con eso se le pregunta si puede y cuánto cobra.
 *   2. **Lo que contesta el transportista.** Qué día lo recoge, qué día llega,
 *      cuánto cuesta y quién viene a por el coche. Con eso se avisa al origen.
 *   3. **Lo que contesta el origen.** Por quién pregunta el conductor, en qué
 *      teléfono, en qué horas y si entra un portacoches. Con eso se le confirma
 *      al transportista, y eso es contratarlo.
 *
 * Cada parte termina en un botón, y ese botón es lo que abre la siguiente: los
 * campos de la parte 2 están vacíos porque todavía no ha contestado nadie, no
 * porque se hayan olvidado. Antes, con las tres partes mezcladas, un hueco
 * vacío parecía una tarea pendiente y se rellenaba con lo primero que sirviera
 * —la ciudad del anuncio por dirección, una fecha inventada por día de
 * recogida—, y un camión en la puerta equivocada no se deshace.
 *
 * Las tres se enseñan siempre y en este orden. Lo que cambia es cuál está
 * abierta: la que toca. Las terminadas se pliegan con una línea que dice lo que
 * guardan dentro.
 */

export type ParteDelTramo = 'solicitud' | 'respuesta' | 'origen';

export const PARTES: ParteDelTramo[] = ['solicitud', 'respuesta', 'origen'];

/** Los datos de un tramo, tal como los mira este fichero. */
export interface DatosDelTramo {
  estado?: string | null;
  tramo?: number | string | null;
  transportista?: string | null;
  desde?: string | null;
  hasta?: string | null;
  coste?: unknown;
  recogida_prevista?: string | null;
  entrega_prevista?: string | null;
  contacto_transportista?: string | null;
  telefono_transportista?: string | null;
  contacto_origen?: string | null;
  telefono_origen?: string | null;
  horario_origen?: string | null;
  /** Puede venir de la base (booleano o nulo) o del formulario ('si' | 'no' | ''). */
  portacoches?: unknown;
  presupuesto_pedido_at?: string | null;
  aviso_recogida_at?: string | null;
  orden_enviada_at?: string | null;
  recogida_preguntada_at?: string | null;
  llegada?: { conforme?: boolean } | null;
}

const hay = (v: unknown): boolean => Boolean(String(v ?? '').trim());
const importe = (v: unknown): number => Number(String(v ?? '').replace(',', '.')) || 0;

/**
 * Si se sabe ya lo del portacoches.
 *
 * Tres valores y no dos: «todavía no lo sé» no es «no entra». En la base es un
 * booleano o nulo; en el formulario, 'si', 'no' o vacío. Las dos cosas llegan
 * aquí porque el panel mezcla lo grabado con lo que se está escribiendo.
 */
export function seSabeLoDelPortacoches(v: unknown): boolean {
  if (typeof v === 'boolean') return true;
  return v === 'si' || v === 'no';
}

/**
 * Avisar al vendedor de que va un camión **solo tiene sentido en el tramo 1**.
 *
 * Es el que sale de la nave del vendedor alemán. El segundo sale de nuestra
 * campa, y ahí no hay a quién avisar: el correo iría igualmente al
 * concesionario, avisándole de una recogida que no es suya.
 */
export function seLePreguntaAlVendedor(tramo: number | string | null | undefined): boolean {
  return Number(tramo) === 1;
}

/**
 * Parte 1: lo que ponemos nosotros antes de preguntar nada.
 *
 * La dirección, entera. Un transportista no va a una ciudad: va a una calle,
 * un número y un código postal. Con «Múnich» lo que vuelve no es un precio,
 * es una estimación que se discute con el camión ya cargado.
 */
export function faltaParaSolicitar(t: DatosDelTramo): string[] {
  const falta: string[] = [];
  if (!hay(t.transportista)) falta.push('elegir la empresa de transporte');
  if (!hay(t.desde)) falta.push('la dirección completa de donde sale');
  if (!hay(t.hasta)) falta.push('la dirección completa de a dónde va');
  return falta;
}

/**
 * Parte 2: lo que hace falta para avisar al origen de que va un camión.
 *
 * El aviso dice tres cosas —qué día, quién viene y en qué teléfono— y las tres
 * las acaba de dar el transportista al contestar. Sin ellas el correo sale
 * diciendo que irá alguien algún día, que es no avisar.
 */
export function faltaParaAvisarAlOrigen(t: DatosDelTramo): string[] {
  const falta: string[] = [];
  if (!hay(t.presupuesto_pedido_at)) falta.push('pedirle antes disponibilidad y precio');
  if (!hay(t.recogida_prevista)) falta.push('el día que lo recoge');
  if (importe(t.coste) <= 0) falta.push('el precio acordado');
  if (!hay(t.contacto_transportista)) falta.push('el nombre del transportista que viene');
  return falta;
}

/**
 * Parte 3: lo que hace falta para confirmárselo al transportista.
 *
 * Confirmar es contratar: el correo cierra el encargo. Así que antes tiene que
 * estar todo lo que va dentro de la orden, y en especial lo que contesta el
 * origen. Sin por quién preguntar, el conductor llega a una nave con ochenta
 * coches y llama aquí; sin horario, a una puerta cerrada; y sin saber si entra
 * un portacoches, el precio de arriba puede no ser el que se pague.
 */
export function faltaParaConfirmar(t: DatosDelTramo): string[] {
  const falta = [...faltaParaSolicitar(t), ...faltaParaAvisarAlOrigen(t)]
    .filter((x) => x !== 'pedirle antes disponibilidad y precio');
  if (!hay(t.entrega_prevista)) falta.push('el día que llega');
  /*
   * Y el origen tiene que saber quién va antes de que salga el camión.
   *
   * Lo puso Ana como regla y es la que evita el fallo caro: un conductor que
   * llega a una nave donde nadie le espera se va vacío, y ese viaje se paga
   * igual. Confirmar primero es apostar a que el origen se entera a tiempo por
   * su cuenta.
   */
  if (seLePreguntaAlVendedor(t.tramo) && !hay(t.aviso_recogida_at)) {
    falta.push('avisar al origen de quién va y qué día');
  }
  if (!hay(t.contacto_origen)) falta.push('por quién pregunta el conductor');
  if (!hay(t.horario_origen)) falta.push('el horario de recogida');
  if (!seSabeLoDelPortacoches(t.portacoches)) falta.push('si entra un portacoches');
  return falta;
}

/**
 * Cuál de las tres se abre al entrar, y cuál se abre sola después.
 *
 * Lo pidió Ana así: primero la parte 1, y **al ejecutar su botón** se abre la
 * 2; al ejecutar el suyo, la 3. Por eso esto mira solo lo ya grabado —los
 * correos que han salido y los datos guardados— y no lo que se está
 * escribiendo: si mirara el formulario, la sección se cerraría bajo los dedos
 * en cuanto se rellenara el último hueco, y la siguiente se abriría de golpe
 * mientras todavía se está escribiendo en esta.
 *
 * En el segundo viaje no hay a quién avisar —el origen es nuestra nave—, así
 * que la parte 2 la cierra el guardar de lo que conteste el transportista,
 * que es el botón que hay.
 *
 * Es distinto de queTocaEnElTramo, que sí mira lo vivo: aquella contesta «qué
 * falta ahora mismo» y va cambiando mientras se escribe. Esta decide qué se
 * despliega, y eso no puede moverse solo.
 */
export function queParteSeAbre(t: DatosDelTramo): ParteDelTramo | null {
  if (!hay(t.presupuesto_pedido_at)) return 'solicitud';
  if (seLePreguntaAlVendedor(t.tramo)) {
    if (!hay(t.aviso_recogida_at)) return 'respuesta';
  } else if (faltaParaAvisarAlOrigen(t).length > 0 || !hay(t.entrega_prevista)) {
    return 'respuesta';
  }
  if (!hay(t.orden_enviada_at)) return 'origen';
  return null;
}

/**
 * De qué viaje es este tramo, dicho para quien lo lee.
 *
 * Una importación hace **dos**: de Alemania a Zaragoza y de Zaragoza a casa
 * del cliente, con los trámites en medio. Los demás coches hacen uno. «Tramo
 * 1» no dice ninguna de las dos cosas, y dos tarjetas del mismo coche en el
 * mismo tablero, sin decir cuál es cuál, se leen como un duplicado.
 */
export function queViajeEs(tramo: number | string | null | undefined, origen?: string | null): string {
  const n = Number(tramo) || 1;
  if (String(origen ?? '') !== 'importacion') return '';
  return n <= 1 ? '1 de 2 · traerlo a Zaragoza' : '2 de 2 · llevárselo al cliente';
}

/**
 * Qué toca ahora en un tramo, en una frase.
 *
 * El panel enseña doce campos y tres botones, y con todo delante no se
 * distingue lo que falta de lo que ya está. Esta frase va arriba del todo y es
 * la respuesta a «y ahora qué», que es la pregunta con la que se abre un tramo.
 */
export function queTocaEnElTramo(t: DatosDelTramo): string {
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

  // Y antes de que salga, las tres partes en su orden.
  if (faltaParaSolicitar(t).length > 0) {
    return 'Elige la empresa de transporte y pon las dos direcciones completas.';
  }
  if (!hay(t.presupuesto_pedido_at)) {
    return 'Pídele disponibilidad y precio a la empresa.';
  }
  if (faltaParaAvisarAlOrigen(t).length > 0 || !hay(t.entrega_prevista)) {
    return 'Apunta lo que conteste: qué día lo recoge, qué día llega, cuánto y quién viene.';
  }
  if (seLePreguntaAlVendedor(t.tramo) && !hay(t.aviso_recogida_at)) {
    return 'Avisa al origen de que va el transportista, quién es y qué día.';
  }
  if (!hay(t.contacto_origen) || !hay(t.horario_origen) || !seSabeLoDelPortacoches(t.portacoches)) {
    return 'Apunta lo que conteste el origen: por quién preguntar, el horario y si entra un portacoches.';
  }
  if (!hay(t.orden_enviada_at)) {
    return 'Confírmaselo al transportista: con eso queda contratado.';
  }
  return 'Esperando a que lo recojan.';
}

/** Cuándo se sabe cada dato, para no dejarlo a la intuición. */
export const PISTAS: Record<string, string> = {
  transportista: 'La empresa, de nuestra lista de Proveedores. Sin ella no hay a quién preguntarle.',
  coste: 'Lo que nos cobra por este tramo, no lo que paga el cliente.',
  desde: 'La dirección exacta, la que dé el vendedor. Una ciudad no es una dirección.',
  hasta: 'A dónde lo lleva: nuestra campa, o la dirección del cliente en el último tramo.',
  recogida_prevista: 'El día que diga el transportista que va a por él.',
};

/**
 * Y las mismas cosas quieren decir otra en el segundo viaje.
 *
 * En el primero, el día de recogida lo condiciona el vendedor —«está listo
 * desde el 4»—. En el segundo el coche está en nuestra nave y disponible desde
 * ya. En los dos, la fecha que se apunta es la que dice el transportista al
 * contestar; lo que cambia es de dónde sale y a dónde va.
 */
export const PISTAS_DEL_SEGUNDO: Record<string, string> = {
  desde: 'Dónde está el coche ahora: nuestra nave, con su calle.',
  hasta: 'La dirección del cliente, la que puso al pedirlo.',
  recogida_prevista: 'El día que diga el transportista que puede ir. Se apunta al contestar.',
  entrega_prevista: 'Cuándo estima llegar. Se apunta al contestar, y es lo que se le dice al cliente.',
};

/** Cómo se llama cada cosa en cada viaje. */
export function comoSeLlamaElCampo(campo: string, tramo: number | string | null | undefined): string {
  const segundo = !seLePreguntaAlVendedor(tramo);
  if (!segundo) {
    return campo === 'recogida_prevista' ? 'Cuándo lo recoge'
      : campo === 'entrega_prevista' ? 'Cuándo llega'
      : campo === 'desde' ? 'Desde' : 'Hasta';
  }
  return campo === 'recogida_prevista' ? 'Cuándo lo recoge'
    : campo === 'entrega_prevista' ? 'Cuándo llega'
    : campo === 'desde' ? 'Dónde está ahora' : 'A dónde va';
}

/** Y la pista que le toca. */
export function pistaDelCampo(campo: string, tramo: number | string | null | undefined): string {
  return (!seLePreguntaAlVendedor(tramo) ? PISTAS_DEL_SEGUNDO[campo] : PISTAS[campo]) ?? '';
}
