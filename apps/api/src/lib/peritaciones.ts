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

export interface DatosDelEncargoAlPerito {
  vehiculo: string;
  anuncio?: string | null;
  /** Dónde está el coche, si el vendedor ya lo ha dicho. */
  donde?: string | null;
  /** Por quién preguntar al llegar. */
  contacto?: string | null;
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

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    fila('Standort / Where it is', String(d.donde ?? '').trim() || 'noch offen, wir melden uns / not yet known, we will confirm') +
    (String(d.contacto ?? '').trim() ? fila('Ansprechpartner / Ask for', String(d.contacto)) : '') +
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
    p('<strong>Das Geld unseres Kunden geht erst raus, wenn Sie uns bestätigen, dass es das Fahrzeug aus dem Inserat ist.</strong> Wenn nicht, sagen Sie es uns mit dem, was Sie gesehen haben, und wir stoppen den Kauf. Es ist kein Problem, zu stoppen.') +
    String(d.nota ?? '') +
    p('Sagen Sie uns, wann Sie hinfahren können, und wir stimmen es mit dem Verkäufer ab.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we need you to inspect this car before we pay for it. What matters:</em>') +
    lista('en') +
    p('<em><strong>Our customer\u2019s money does not go out until you confirm it is the car from the listing.</strong> If it is not, tell us what you saw and we stop the purchase — stopping is not a problem. Let us know when you can go and we will arrange it with the seller.</em>');

  return { subject, html };
}
