/**
 * Las peritaciones: la revisión del coche en Alemania, que sostiene el producto.
 *
 * «No se le paga al vendedor hasta que uno de los nuestros ve el coche» es la
 * única promesa que hace este negocio, y hasta ahora era **una casilla**: alguien
 * pulsaba «Hemos visto el coche en Alemania» y el sistema se lo creía. Sin saber
 * quién fue, qué día, ni qué encontró.
 *
 * Aquí hay dos cosas y las dos hacen falta:
 *
 * - **El encargo al perito**: dónde está el coche, por quién pregunta y qué
 *   tiene que mirar. Una lista concreta, porque «revísalo» devuelve «está bien».
 * - **Lo que vio**: quién fue, qué día y su veredicto. Y solo un veredicto
 *   —que es el coche que se anunció— abre la puerta a soltar el dinero.
 *
 * Lo que no se hace aquí es opinar sobre el coche. Un perito dice lo que ve; si
 * dice que no es el que se anunció, el dinero vuelve al cliente y no hay nada
 * que interpretar.
 */

/**
 * Lo que se le pide que mire, en su idioma y en el nuestro.
 *
 * **En alemán, porque el perito es alemán.** El que hay dado de alta es
 * checkdenwagen.de, y una lista de comprobación en castellano se lee mal o no
 * se lee: es justo la clase de correo que se contesta con «ok» sin haberlo
 * mirado punto por punto.
 *
 * En inglés debajo por lo mismo que los correos al vendedor: quien lo manda
 * desde aquí tiene que poder leer lo que envía en su nombre.
 *
 * No es exhaustiva: es lo que se discute después.
 */
export const QUE_MIRA_EL_PERITO = [
  {
    de: 'Dass es das Fahrzeug aus dem Inserat ist: Fahrgestellnummer, Ausstattungslinie, Motor und Ausstattung',
    en: 'That it is the car from the listing: VIN, trim, engine and equipment',
  },
  {
    de: 'Tatsächlicher Kilometerstand am Tacho, und ob er zum Inserat passt',
    en: 'Actual mileage on the dash, and whether it matches the listing',
  },
  {
    de: 'Karosserie und Lack: Schäden, Nachlackierungen, Farbunterschiede',
    en: 'Body and paint: damage, respray, colour differences',
  },
  {
    de: 'Reifen, Bremsen und sichtbarer Zustand der Technik',
    en: 'Tyres, brakes and visible mechanical condition',
  },
  {
    de: 'Innenraum, und ob beide Schlüssel da sind',
    en: 'Interior, and whether both keys are there',
  },
  {
    de: 'Die Papiere: Zulassungsbescheinigung Teil I und II, und der COC',
    en: 'The papers: registration parts I and II, and the COC',
  },
  {
    de: 'Fotos von allem, auch von den Mängeln',
    en: 'Photos of all of the above, including the defects',
  },
] as const;

/**
 * Por dónde pasa una peritación.
 *
 * - `Por encargar` — el coche está pagado y hay que mandar a alguien.
 * - `Encargada`    — se le ha pedido a un perito y está por ir.
 * - `Hecha`        — ha ido y ha dicho lo que vio.
 *
 * No hay «cancelada»: si el coche no era el que se anunció, eso **es** el
 * resultado de la peritación y se guarda como tal. Borrarla escondería el
 * único momento en que este sistema dijo que no.
 */
export const ESTADOS_PERITACION = ['Por encargar', 'Encargada', 'Hecha'] as const;
export type EstadoPeritacion = (typeof ESTADOS_PERITACION)[number];

export const QUE_TOCA_PERITACION: Record<EstadoPeritacion, string> = {
  'Por encargar': 'Elegir perito y mandarle el encargo',
  'Encargada': 'Esperando a que vaya',
  'Hecha': 'Ya se sabe lo que hay',
};

export function esEstadoPeritacion(v: string): v is EstadoPeritacion {
  return (ESTADOS_PERITACION as readonly string[]).includes(v);
}

export type Veredicto = 'es_el_que_se_anuncio' | 'no_es_el_que_se_anuncio';

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  es_el_que_se_anuncio: 'Es el coche que se anunció',
  no_es_el_que_se_anuncio: 'No es el que se anunció',
};

export function esVeredicto(v: unknown): v is Veredicto {
  return v === 'es_el_que_se_anuncio' || v === 'no_es_el_que_se_anuncio';
}

/**
 * Si esta revisión permite soltar el dinero.
 *
 * Solo el veredicto bueno. Una revisión con pegas se anota igual —para eso está
 * el campo de notas— pero no abre la puerta: el que decide si un golpe en la
 * puerta es aceptable es el cliente, no nosotros.
 */
export function abreLaPuertaAlPago(veredicto: unknown): boolean {
  return veredicto === 'es_el_que_se_anuncio';
}

/**
 * Avisar al vendedor de qué día va el perito.
 *
 * Es el correo que cierra la cita, y va desde el ERP para que quede apuntado:
 * quién dijo qué día y a quién se le avisó. Dos que se llaman por su cuenta no
 * dejan rastro, y el día que el coche no esté preparado no hay dónde mirar.
 *
 * Pide dos cosas concretas además de la hora: que el coche esté **accesible**
 * —no bloqueado en el fondo de la nave— y que **estén los papeles y las dos
 * llaves**. Son las tres cosas que hacen que una revisión se quede a medias y
 * haya que volver, y volver son otros 289 €.
 */
export interface DatosDeLaCita {
  vehiculo: string;
  /** El día, ya escrito como se lee. */
  cuando?: string | null;
  /** Y la hora que él mismo propuso, para confirmársela. */
  hora?: string | null;
  /** Quién va a ir, para que sepan a quién esperan. */
  perito?: string | null;
  /** Lo que añada quien revisa, ya en HTML. */
  nota?: string | null;
}

export function faltaParaAvisarDeLaCita(d: DatosDeLaCita): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  if (!String(d.cuando ?? '').trim()) falta.push('qué día va');
  return falta;
}

export function correoDeLaCitaAlVendedor(d: DatosDeLaCita): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  // El día y la hora juntos: se le confirma la cita que él propuso, no otra.
  const cuando = [String(d.cuando ?? '').trim(), String(d.hora ?? '').trim()]
    .filter(Boolean)
    .join(' · ');
  const quien = String(d.perito ?? '').trim();
  const subject = `Termin zur Fahrzeugprüfung / Inspection appointment — ${coche}`;

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;
  const li = (html: string) => `<li style="margin-bottom:8px">${html}</li>`;

  const pide =
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.6;color:#2A2A28">' +
    li('Dass das Fahrzeug <strong>zugänglich</strong> ist und bewegt werden kann.') +
    li('Dass die <strong>Papiere</strong> da sind: Zulassungsbescheinigung Teil I und II, und der COC.') +
    li('Dass <strong>beide Schlüssel</strong> da sind.') +
    '</ul>';

  const html =
    p('Guten Tag,') +
    p(`wir haben den Termin zur Prüfung von <strong>${esc(coche)}</strong> für den <strong>${esc(cuando)}</strong> vorgesehen.`) +
    p(quien
      ? `Es kommt <strong>${esc(quien)}</strong>, ein unabhängiger Prüfer. Er meldet sich vorher bei Ihnen.`
      : 'Es kommt ein unabhängiger Prüfer. Er meldet sich vorher bei Ihnen.') +
    p('Damit der Termin nicht umsonst ist, bitten wir um Folgendes:') +
    pide +
    String(d.nota ?? '') +
    p('Passt der Termin nicht? Sagen Sie uns einfach, wann es Ihnen besser passt.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p(`<em>we have scheduled the inspection of <strong>${esc(coche)}</strong> for <strong>${esc(cuando)}</strong>` +
      (quien ? `, with <strong>${esc(quien)}</strong>, an independent inspector` : '') +
      '. Please make sure the car is <strong>accessible</strong>, and that the <strong>papers</strong> —registration parts I and II, and the COC— and <strong>both keys</strong> are there, so the visit is not wasted. If the date does not suit you, just tell us when it does.</em>');

  return { subject, html };
}

export interface DatosDelEncargoAlPerito {
  vehiculo: string;
  anuncio?: string | null;
  /** Dónde está el coche, si el vendedor ya lo ha dicho. */
  donde?: string | null;
  /** Por quién preguntar al llegar. */
  contacto?: string | null;
  /** Su teléfono: es lo que marca el perito cuando llega y no ve a nadie. */
  telefono?: string | null;
  /** El día que dio el vendedor, ya escrito como se lee. */
  cuando?: string | null;
  /** Y la hora, tal cual: «10:00». */
  hora?: string | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

export function faltaParaEncargarLaRevision(d: DatosDelEncargoAlPerito): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  return falta;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function correoDeEncargoAlPerito(d: DatosDelEncargoAlPerito): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const subject = `Fahrzeugprüfung / Vehicle inspection — ${coche}`;

  /**
   * La cita, si el vendedor ya la dio.
   *
   * Ahora se le pide en el primer correo —día y hora concretos—, así que lo
   * normal es que el encargo salga con la cita puesta. Al perito le queda
   * confirmar que puede, no proponer. Cuadrar una hora entre tres por correo
   * son cuatro correos y dos días.
   */
  const cita = [String(d.cuando ?? '').trim(), String(d.hora ?? '').trim()]
    .filter(Boolean)
    .join(' · ');

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    fila('Standort / Where it is', String(d.donde ?? '').trim() || 'noch offen, wir melden uns / not yet known, we will confirm') +
    (cita ? fila('Termin / Appointment', cita) : '') +
    (String(d.contacto ?? '').trim() ? fila('Ansprechpartner / Ask for', String(d.contacto)) : '') +
    (String(d.telefono ?? '').trim() ? fila('Telefon / Phone', String(d.telefono)) : '') +
    (d.anuncio ? fila('Inserat / Listing', String(d.anuncio)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const lista = (idioma: 'de' | 'en') =>
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.7;color:#2A2A28">' +
    QUE_MIRA_EL_PERITO.map((x) => `<li>${esc(x[idioma])}</li>`).join('') +
    '</ul>';

  const html =
    p('Guten Tag,') +
    p('wir bitten Sie, dieses Fahrzeug zu prüfen, bevor wir bezahlen:') +
    delCoche +
    p('Worauf es ankommt:') +
    lista('de') +
    /**
     * Lo que se le pide es una respuesta clara, no un permiso.
     *
     * Antes ponía que el dinero del cliente no sale hasta que él confirme. Es
     * verdad, pero dicho a quien tiene que dar un veredicto suena a lo que no
     * queremos que suene: que su «sí» es lo que desbloquea una compra. Un
     * perito al que le cuelgas dieciséis mil euros del dictamen acaba matizando
     * todo, y un dictamen lleno de matices no sirve para decidir.
     *
     * Lo que sí hace falta decirle es lo otro: que un «no» vale igual. Es lo que
     * le quita la presión de complacer a quien le paga, que es el sesgo real de
     * este encargo.
     */
    p('Wir brauchen eine klare Aussage: <strong>Ist es das Fahrzeug aus dem Inserat oder nicht?</strong> Ein Nein ist für uns genauso nützlich wie ein Ja — dann kaufen wir es einfach nicht.') +
    String(d.nota ?? '') +
    /**
     * La cita la cerramos nosotros.
     *
     * Él dice qué día puede y se lo decimos al vendedor desde el ERP. Es un
     * correo más, pero deja las dos puntas apuntadas en el expediente: quién
     * dijo qué día y a quién se le avisó. Dos que se llaman por su cuenta no
     * dejan rastro, y el día que el coche no esté preparado no hay dónde mirar.
     */
    p(cita
      ? `<strong>Der Termin ist mit dem Verkäufer bereits vereinbart: ${esc(cita)}.</strong> Bitte bestätigen Sie uns kurz, dass Sie ihn wahrnehmen können. Falls nicht, sagen Sie uns, wann es Ihnen passt, und wir stimmen es neu ab.`
      : 'Sagen Sie uns bitte, <strong>wann Sie hinfahren können</strong>. Den Termin stimmen wir mit dem Verkäufer ab und bestätigen ihn Ihnen.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we need you to inspect this car before we pay for it. What matters:</em>') +
    lista('en') +
    p('<em>We need a clear answer: <strong>is it the car from the listing or not?</strong> A no is as useful to us as a yes — we simply do not buy it. ' +
      (cita
        ? `The appointment is <strong>already agreed with the seller: ${esc(cita)}</strong>. Please confirm you can make it; if not, tell us when suits you and we will rearrange it.`
        : 'Please tell us <strong>when you can go</strong>: we arrange the date with the seller and confirm it back to you.') +
      '</em>');

  return { subject, html };
}
