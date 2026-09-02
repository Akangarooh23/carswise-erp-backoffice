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

/** Lo que se le pide que mire. No es exhaustivo: es lo que se discute después. */
export const QUE_MIRA_EL_PERITO = [
  'Que es el coche del anuncio: bastidor, versión, motor y equipamiento',
  'Kilómetros reales en el cuadro, y que cuadren con el anuncio',
  'Carrocería y pintura: golpes, retoques, diferencias de tono',
  'Neumáticos, frenos y estado general de la mecánica a la vista',
  'Interior, y que estén las dos llaves',
  'Los papeles: Zulassungsbescheinigung I y II, y el COC',
  'Fotos de todo lo anterior, incluidos los defectos',
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
  const subject = `Revisión en Alemania — ${coche}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Vehículo', coche) +
    fila('Dónde está', String(d.donde ?? '').trim() || 'todavía no lo tenemos, te lo decimos en cuanto lo sepamos') +
    (String(d.contacto ?? '').trim() ? fila('Preguntar por', String(d.contacto)) : '') +
    (d.anuncio ? fila('El anuncio', String(d.anuncio)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const lista =
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.7;color:#2A2A28">' +
    QUE_MIRA_EL_PERITO.map((x) => `<li>${esc(x)}</li>`).join('') +
    '</ul>';

  const html =
    p('Hola,') +
    p('Necesitamos que vayas a ver este coche antes de que paguemos:') +
    delCoche +
    p('Lo que hay que mirar:') +
    lista +
    p('<strong>El dinero del cliente no sale hasta que nos digas que es el coche que se anunció.</strong> Si no lo es, dilo con lo que hayas visto y lo paramos: no pasa nada por parar.') +
    String(d.nota ?? '') +
    p('Dinos qué día puedes ir y lo cerramos con el vendedor.');

  return { subject, html };
}
