/**
 * Decirle al origen **quién va a por el coche y qué día**.
 *
 * Es el último correo al vendedor antes de que aparezca un camión en su puerta,
 * y va antes de confirmarle nada al transportista: quien tiene que preparar el
 * coche y sacar los papeles del cajón es él, y enterarse el mismo día no le
 * deja tiempo. Un conductor que llega a una nave donde nadie le espera se va
 * vacío, y ese viaje se paga igual.
 *
 * Lleva tres cosas y no una: **el día**, **la empresa** y **el nombre y el
 * teléfono de quien llama**. Sin el nombre, el vendedor no sabe si el que se
 * presenta es el que esperaba; con él, puede negarse a entregar un coche de
 * dieciséis mil euros a quien no toca, que es justo lo que queremos que haga.
 *
 * Y le repite qué se lleva el conductor. Ya se lo confirmó al contestar, pero
 * eso fue en otro correo y hace días: la Zulassungsbescheinigung Teil II que no
 * se mete en el sobre no se echa en falta hasta que el coche está en Zaragoza y
 * no se puede matricular.
 *
 * **Y el origen no siempre es el vendedor.** Una importación hace dos viajes:
 * el primero sale de la nave alemana y el segundo de la nuestra, en Zaragoza.
 * En el segundo, quien tiene que tener el coche listo y las llaves a mano es
 * nuestra propia persona de allí, y merece el mismo aviso: que no le espere
 * nadie es igual de caro tanto si la nave es suya como si es nuestra.
 *
 * Cambia el idioma y cambia lo que se entrega. Al vendedor alemán se le
 * recuerdan la Zulassungsbescheinigung Teil I y II y el COC, que son los
 * papeles que hacen falta para matricular aquí. A los nuestros no: para
 * entonces el coche ya está matriculado, y lo que sale con él son las llaves,
 * el permiso de circulación y la ficha técnica.
 *
 * Y al vendedor se le pide el **justificante de baja alemán**, que solo se
 * puede pedir aquí. Ese papel no existe cuando se organiza la recogida —la baja
 * se tramita al exportar el coche, o sea después de que salga— y pedirlo
 * después tampoco se puede, porque **este es el último correo que le
 * escribimos**. Así que se pide en futuro: cuando lo dé de baja, que lo mande.
 *
 * No bloquea nada, y por eso llevaba desde el principio en la lista de papeles
 * de una importación sin que ningún correo lo pidiera.
 */

export interface DatosDelAviso {
  vehiculo: string;
  /** Nuestra referencia del tramo, para que pueda citarla. */
  referencia?: string | null;
  /** Nuestro número de pedido, que es el que él conoce. */
  pedido?: string | null;
  /** El día que va el camión. */
  cuando: string;
  /** La empresa de transporte. */
  transportista: string;
  /** Quién llama y en qué teléfono, si lo sabemos. */
  contacto?: string | null;
  telefono?: string | null;
  /** Por quién pregunta el conductor al llegar: lo que él mismo nos dijo. */
  preguntarPor?: string | null;
  /**
   * Quién está en el origen: el vendedor de fuera, o los nuestros.
   *
   * No es solo el idioma: al vendedor se le piden los papeles alemanes que
   * hacen falta para matricular, y a los nuestros no, porque para el segundo
   * viaje el coche ya lleva matrícula española.
   */
  aQuien?: 'vendedor' | 'los-nuestros';
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

/** Lo que impide avisarle. Sin esto, el aviso no avisa de nada. */
export function faltaParaAvisarDeLaRecogida(d: DatosDelAviso): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('decir qué coche es');
  if (!String(d.cuando ?? '').trim()) falta.push('cerrar el día de la recogida');
  if (!String(d.transportista ?? '').trim()) falta.push('saber quién lo trae');
  /*
   * Y el nombre de quien viene, que es la mitad del aviso.
   *
   * El de la nave tiene que saber a quién esperar y a quién entregarle las
   * llaves. Con la empresa sola, el aviso dice que irá alguien de una
   * empresa algún día, y eso es no avisar: el conductor se presenta y le
   * piden que espere mientras llaman aquí.
   */
  if (!String(d.contacto ?? '').trim()) falta.push('el nombre de quien va a ir');
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
 * La fecha como la lee un alemán, con el día de la semana delante.
 *
 * «Freitag, 04.09.2026» y no «04/09»: el día de la semana es lo que hace que se
 * lea de un vistazo, y en cifras un alemán entiende «09/04» como el 9 de abril.
 */
function enAleman(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function enIngles(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** «Viernes, 4 de septiembre de 2026», para quien lo lee en castellano. */
function enCastellano(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const parrafo = (html: string) =>
  `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;
const punto = (html: string) => `<li style="margin-bottom:6px">${html}</li>`;
const celda = (k: string, v: string) =>
  `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
  `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

/**
 * El mismo aviso, para los nuestros y en castellano.
 *
 * Lo que cambia de verdad no es el idioma: es que aquí no se piden los
 * papeles alemanes. Para el segundo viaje el coche ya está matriculado, y lo
 * que sale con él son las llaves, el permiso y la ficha técnica.
 */
function paraLosNuestros(d: DatosDelAviso): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const ref = String(d.pedido ?? d.referencia ?? '').trim();
  const dia = enCastellano(d.cuando);
  const subject = `Recogida del ${coche}${ref ? ` (${ref})` : ''}`;

  const quien = [String(d.contacto ?? '').trim(), String(d.telefono ?? '').trim()]
    .filter(Boolean).join(' · ');

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    celda('Coche', coche) +
    (ref ? celda('Nuestro pedido', ref) : '') +
    (dia ? celda('Día de recogida', dia) : '') +
    celda('Empresa de transporte', String(d.transportista).trim()) +
    (quien ? celda('Viene', quien) : '') +
    (String(d.preguntarPor ?? '').trim()
      ? celda('Pregunta por', String(d.preguntarPor).trim())
      : '') +
    '</table>';

  const papeles =
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    punto('Las llaves <em>(todas)</em>') +
    punto('El permiso de circulación') +
    punto('La ficha técnica') +
    '</ul>';

  const html =
    parrafo('Hola,') +
    parrafo('El transporte está organizado. Estos son los datos de la recogida:') +
    tabla +
    parrafo('Llama antes de ir.') +
    parrafo('<strong>Hay que darle al conductor:</strong>') +
    papeles +
    parrafo('Confírmame que el día vale y que el coche está listo para cargar.') +
    String(d.nota ?? '') +
    parrafo('Gracias.');

  return { subject, html };
}

export function correoDeAvisoDeRecogida(d: DatosDelAviso): { subject: string; html: string } {
  if (d.aQuien === 'los-nuestros') return paraLosNuestros(d);
  const coche = String(d.vehiculo ?? '').trim();
  const ref = String(d.pedido ?? d.referencia ?? '').trim();
  const dia = enAleman(d.cuando);
  const day = enIngles(d.cuando);
  const subject = `Abholtermin / Pick-up date — ${coche}${ref ? ` (${ref})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const quien = [String(d.contacto ?? '').trim(), String(d.telefono ?? '').trim()]
    .filter(Boolean).join(' · ');

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    (ref ? fila('Unsere Bestellnummer / Our order no.', ref) : '') +
    (dia ? fila('Abholtermin / Pick-up date', dia) : '') +
    fila('Spedition / Carrier', String(d.transportista).trim()) +
    (quien ? fila('Kontakt / Contact', quien) : '') +
    (String(d.preguntarPor ?? '').trim()
      ? fila('Fragt nach / Will ask for', String(d.preguntarPor).trim())
      : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;
  const li = (html: string) => `<li style="margin-bottom:6px">${html}</li>`;

  const papeles =
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li('Fahrzeugschlüssel <em>(alle)</em>') +
    li('Zulassungsbescheinigung Teil I') +
    li('Zulassungsbescheinigung Teil II') +
    li('COC-Bescheinigung') +
    '</ul>';

  const html =
    p('Guten Tag,') +
    p('der Transport ist organisiert. Hier die Angaben zur Abholung:') +
    tabla +
    p('Die Spedition meldet sich vor der Ankunft telefonisch bei Ihnen.') +
    p('<strong>Bitte übergeben Sie dem Fahrer:</strong>') +
    papeles +
    p('Bitte bestätigen Sie uns kurz, dass der Termin passt und das Fahrzeug bereitsteht.') +
    // Y la baja, que solo se puede pedir aquí: no existe hasta que el coche
    // sale, y después de esto ya no le escribimos.
    p('Sobald Sie das Fahrzeug zur Ausfuhr abgemeldet haben, senden Sie uns bitte die <strong>Abmeldebescheinigung</strong>.') +
    String(d.nota ?? '') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p(
      '<em>the transport is arranged. ' +
      (day ? `The car will be collected on <strong>${esc(day)}</strong> by ` : 'The car will be collected by ') +
      `<strong>${esc(String(d.transportista).trim())}</strong>` +
      (quien ? `, contact ${esc(quien)}` : '') +
      '. They will call you before arriving. Please hand the driver <strong>all keys, ' +
      'registration parts I and II, and the COC</strong>, and let us know the date works ' +
      'and the car will be ready. Once you have deregistered it for export, please send us the <strong>deregistration certificate</strong>.</em>'
    );

  return { subject, html };
}
