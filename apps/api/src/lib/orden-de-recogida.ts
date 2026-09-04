/**
 * La orden de recogida que se le manda al transportista.
 *
 * Hoy esto se escribe a mano copiando de tres pantallas: el coche del pedido, la
 * dirección de origen del proveedor y la de destino del expediente. Copiar a
 * mano una dirección es donde se cuelan los errores, y en un transporte el error
 * no se ve hasta que el camión está en la puerta equivocada.
 *
 * Lo que lleva es lo que hace falta para ir a por un coche y nada más: qué
 * recoge, dónde, a quién pregunta al llegar, adónde lo lleva y desde cuándo se
 * puede. Un correo con quince datos se lee como un formulario y se contesta
 * preguntando.
 *
 * **En tres idiomas, y lo elige quien la manda.** El castellano es el de la
 * lista de Proveedores, que hoy son de aquí; pero un tramo que sale de Múnich
 * lo hace muchas veces una empresa alemana, y otras tantas una polaca o una
 * checa que trabaja en inglés. Una orden que el conductor no entiende es una
 * dirección copiada a mano otra vez, que es de donde venimos.
 */

import type { Idioma } from './presupuesto-al-transportista.js';

export type { Idioma };

export interface Punto {
  /** Dónde: la dirección, o la ciudad si no hay más. */
  donde: string;
  /** Por quién preguntar al llegar. */
  quien?: string | null;
  telefono?: string | null;
}

export interface DatosDeLaOrden {
  /** Nuestra referencia del tramo, para que pueda citarla. */
  referencia: string;
  vehiculo: string;
  matricula?: string | null;
  origen: Punto;
  destino: Punto;
  /** A partir de cuándo se puede recoger. */
  recogidaPrevista?: string | null;
  /**
   * En qué horas se puede ir, tal cual lo dijo el vendedor.
   *
   * Texto libre y no dos horas: lo que contestan es «de lunes a viernes de
   * 9 a 17, avisando antes», y eso no cabe en un desplegable sin perder la
   * mitad. Lo que hace falta es que el conductor lo lea.
   */
  horarioOrigen?: string | null;
  /**
   * El conductor que nos han dicho que viene, si nos han dado un nombre.
   *
   * Va en la tabla y **no en el saludo**. Estuvo en el saludo mientras este
   * campo era el de tráfico, el que contesta los presupuestos; desde que
   * significa el conductor, saludar con su nombre a una empresa es escribirle
   * a quien no lo va a leer. En la tabla sí sirve: les devuelve el nombre que
   * nos dieron, y así se ve si hablamos del mismo.
   */
  contactoSuyo?: string | null;
  /**
   * Si entra un portacoches hasta el coche.
   *
   * Es lo que decide si viene el camión grande o una grúa individual, y por
   * tanto el precio. Nulo mientras no se sepa: «todavía no lo sé» no es «no
   * entra», y una orden que afirma un «sí» inventado manda un portacoches a un
   * sótano.
   */
  portacoches?: boolean | null;
  /** Lo acordado, si ya está cerrado. */
  coste?: number | null;
  /** Lo que añada quien revisa antes de mandarla, ya en HTML. */
  nota?: string | null;
}

/** Lo que impide mandar la orden. Sin esto, el camión no sabe adónde ir. */
export function faltaParaLaOrden(d: DatosDeLaOrden): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  if (!String(d.origen?.donde ?? '').trim()) falta.push('de dónde se recoge');
  if (!String(d.destino?.donde ?? '').trim()) falta.push('adónde va');
  return falta;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * «2 de septiembre de 2026», y en el formato de quien la lee.
 *
 * No es un adorno: un alemán lee «09/04» como el 9 de abril, y esa confusión
 * mueve un camión un mes entero.
 */
export function enFecha(v: unknown, idioma: Idioma = 'es'): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  if (idioma === 'de') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (idioma === 'en') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un punto, escrito como se lee: dónde y por quién preguntar. */
export function puntoEscrito(p: Punto | undefined | null, idioma: Idioma = 'es'): string {
  if (!p) return '';
  const quien = String(p.quien ?? '').trim();
  const tel = String(p.telefono ?? '').trim();
  const contacto = [quien, tel].filter(Boolean).join(' · ');
  const pregunta = idioma === 'de' ? 'fragen nach' : idioma === 'en' ? 'ask for' : 'preguntar por';
  return [String(p.donde ?? '').trim(), contacto ? `${pregunta} ${contacto}` : '']
    .filter(Boolean)
    .join(' — ');
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Todo lo que cambia con el idioma, junto para poder leerlo de una vez. */
const TEXTOS: Record<Idioma, {
  asunto: string; vehiculo: string; sinMatricula: string;
  recogerEn: string; entregarEn: string; aPartirDel: string; horario: string;
  portacoches: string; portacochesSi: string; portacochesNo: string;
  conductor: string;
  precio: string; referencia: string;
  saludo: string; entradilla: string; conFecha: string; sinFecha: string; cierre: string;
}> = {
  es: {
    asunto: 'Recogida', vehiculo: 'Vehículo', sinMatricula: 'sin matricular todavía',
    recogerEn: 'Recoger en', entregarEn: 'Entregar en', aPartirDel: 'A partir del',
    horario: 'Horario de recogida',
    portacoches: '¿Entra un portacoches?',
    portacochesSi: 'Sí, llega hasta el coche',
    portacochesNo: 'No, hay que sacarlo a la calle',
    conductor: 'Conductor',
    precio: 'Precio acordado', referencia: 'Nuestra referencia',
    saludo: 'Hola,', entradilla: 'Os pasamos un coche para recoger:',
    conFecha: 'Decidnos qué día podéis y os confirmamos.',
    sinFecha: 'Todavía no tenemos fecha de salida. En cuanto la tengamos os la decimos; si necesitáis avisar con antelación, contadnos cuánta.',
    cierre: 'Cualquier cosa, respondiendo a este correo.',
  },
  de: {
    asunto: 'Abholung', vehiculo: 'Fahrzeug', sinMatricula: 'noch nicht zugelassen',
    recogerEn: 'Abholort', entregarEn: 'Lieferort', aPartirDel: 'Ab dem',
    horario: 'Abholzeiten',
    portacoches: 'Autotransporter möglich?',
    portacochesSi: 'Ja, direkt bis zum Fahrzeug',
    portacochesNo: 'Nein, das Fahrzeug muss auf die Straße gebracht werden',
    conductor: 'Fahrer',
    precio: 'Vereinbarter Preis', referencia: 'Unsere Referenz',
    saludo: 'Guten Tag,', entradilla: 'hiermit beauftragen wir Sie mit der Abholung dieses Fahrzeugs:',
    conFecha: 'Bitte teilen Sie uns mit, an welchem Tag Sie abholen, und wir bestätigen es Ihnen.',
    sinFecha: 'Ein Abholtermin steht noch nicht fest. Sobald wir ihn haben, melden wir uns; falls Sie Vorlaufzeit brauchen, sagen Sie uns bitte wie viel.',
    cierre: 'Bei Rückfragen antworten Sie einfach auf diese E-Mail.',
  },
  en: {
    asunto: 'Pick-up', vehiculo: 'Vehicle', sinMatricula: 'not registered yet',
    recogerEn: 'Collect at', entregarEn: 'Deliver to', aPartirDel: 'From',
    horario: 'Pick-up hours',
    portacoches: 'Can a car carrier reach the car?',
    portacochesSi: 'Yes, right up to the car',
    portacochesNo: 'No, it has to be brought out to the street',
    conductor: 'Driver',
    precio: 'Agreed price', referencia: 'Our reference',
    saludo: 'Hello,', entradilla: 'here is a car for you to collect:',
    conFecha: 'Tell us which day works for you and we will confirm it.',
    sinFecha: 'We do not have a departure date yet. We will tell you as soon as we do; if you need notice, tell us how much.',
    cierre: 'Any questions, just reply to this email.',
  },
};

export function correoDeOrdenDeRecogida(d: DatosDeLaOrden, idioma: Idioma = 'es'): { subject: string; html: string } {
  const t = TEXTOS[idioma] ?? TEXTOS.es;
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const subject = `${t.asunto} ${d.referencia} — ${coche}${mat ? ` (${mat})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const cuando = enFecha(d.recogidaPrevista, idioma);

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila(t.vehiculo, coche + (mat ? ` · ${mat}` : ` · ${t.sinMatricula}`)) +
    fila(t.recogerEn, puntoEscrito(d.origen, idioma)) +
    fila(t.entregarEn, puntoEscrito(d.destino, idioma)) +
    (cuando ? fila(t.aPartirDel, cuando) : '') +
    // El horario va pegado a la fecha: son la misma pregunta del conductor,
    // que es «cuándo voy». Suelto al final se lee después de haber salido.
    (String(d.horarioOrigen ?? '').trim() ? fila(t.horario, String(d.horarioOrigen).trim()) : '') +
    // Y si entra el camión grande, que es lo que decide el precio y el vehículo
    // que mandan. Solo cuando se sabe: callarlo es mejor que afirmar un «sí»
    // inventado, que es como se manda un portacoches a un sótano.
    (typeof d.portacoches === 'boolean'
      ? fila(t.portacoches, d.portacoches ? t.portacochesSi : t.portacochesNo) : '') +
    (d.coste ? fila(t.precio, eur(Number(d.coste))) : '') +
    // El conductor que nos dieron, devuelto: así se ve si hablamos del mismo.
    (String(d.contactoSuyo ?? '').trim() ? fila(t.conductor, String(d.contactoSuyo).trim()) : '') +
    fila(t.referencia, d.referencia) +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const html =
    // Sin nombre en el saludo: esto va al buzón de la empresa, y el nombre que
    // tenemos es el del conductor. Saludar a la empresa por el nombre de su
    // conductor es escribirle a quien no lo va a leer.
    p(t.saludo) +
    p(t.entradilla) +
    tabla +
    p(cuando ? t.conFecha : t.sinFecha) +
    String(d.nota ?? '') +
    p(t.cierre);

  return { subject, html };
}
