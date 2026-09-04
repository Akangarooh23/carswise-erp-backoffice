/**
 * Preguntarle al vendedor **dónde y cuándo** se recoge el coche.
 *
 * Falta un dato que no está en ningún sitio: el tramo dice «München → Zaragoza»
 * porque la ciudad es lo único que trae el anuncio. Un transportista no va a una
 * ciudad, va a una calle, un día, a una hora y preguntando por alguien.
 *
 * Se manda cuando el pedido está confirmado —él ha aceptado y ha cobrado— y
 * antes de contratar el transporte, porque la respuesta es justo lo que hay que
 * escribir en «Desde» y en «Recogida prevista» para que la orden al transportista
 * valga para algo.
 *
 * Pregunta también **qué se lleva el conductor**. Un coche que sale de Alemania
 * sin la Zulassungsbescheinigung II no se puede matricular aquí, y eso se
 * descubre semanas después, con el coche ya en Zaragoza.
 *
 * Y desde hoy pide tres papeles que el ERP esperaba y que **nadie pedía nunca**:
 * el contrato de compraventa, el justificante de baja alemán y el libro de
 * mantenimiento. Los tres estaban en la lista de lo que hay que reunir o en la
 * de lo que se le entrega al cliente, y ninguno salía en ningún correo: se
 * quedaban esperando a que alguien se acordara de pedirlos por su cuenta, que
 * es otra forma de decir que no llegaban.
 *
 * El contrato es a lo que se agarra una reclamación contra el vendedor; el
 * libro es lo que hace que un coche valga mil euros más el día que el cliente
 * lo venda. Ninguno bloquea nada, y por eso mismo se piden aquí: lo que no se
 * pide en el correo que ya se manda no se pide nunca.
 *
 * Y una que parece de detalle y decide el precio del viaje: **si puede entrar
 * un camión portacoches**. Un portacoches lleva ocho y sale a un tercio por
 * coche; una grúa individual cuesta lo que cuesta. Si el coche está en un
 * sótano, en una calle estrecha o en un patio con altura limitada, el camión
 * no entra — y eso se descubre con el conductor en la puerta, que es cuando ya
 * se paga igual. Preguntarlo antes cambia a quién se contrata.
 */

export interface DatosDeLaRecogida {
  vehiculo: string;
  matricula?: string | null;
  /** Nuestro número de pedido, para que pueda referenciarlo. */
  pedido?: string | null;
  /** La ciudad que tenemos, que suele ser lo único que trae el anuncio. */
  ciudad?: string | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

export function faltaParaPedirLaRecogida(d: DatosDeLaRecogida): string[] {
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

export function correoDeDatosDeRecogida(d: DatosDeLaRecogida): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const ref = String(d.pedido ?? '').trim();
  const subject = `Abholung / Pick-up — ${coche}${ref ? ` (${ref})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    (String(d.matricula ?? '').trim() ? fila('Kennzeichen / Plate', String(d.matricula)) : '') +
    (ref ? fila('Unsere Bestellnummer / Our order no.', ref) : '') +
    (String(d.ciudad ?? '').trim() ? fila('Ort laut Inserat / City in the listing', String(d.ciudad)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const li = (html: string) => `<li style="margin-bottom:8px">${html}</li>`;

  const preguntas =
    '<ol style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li('<strong>Genaue Abholadresse</strong> — Straße, Hausnummer und PLZ.') +
    li('<strong>An welchem Tag und zu welcher Uhrzeit</strong> können wir es abholen? Falls es flexibel ist: ab wann steht es bereit und zu welchen Öffnungszeiten?') +
    li('<strong>Ansprechpartner und Telefonnummer</strong> vor Ort. Der Fahrer fragt nach ihm.') +
    li('<strong>Was bekommt der Fahrer mit?</strong> Schlüssel, Zulassungsbescheinigung Teil I und II, COC, Serviceheft.') +
    /*
     * Y los papeles que se mandan por correo, que son otra cosa.
     *
     * Estos no viajan con el coche: los queremos antes, escaneados. El
     * contrato es a lo que se agarra una reclamación y la baja es lo que
     * prueba que allí ya no está matriculado; pedirlos cuando el coche ya está
     * aquí es pedirle un favor a alguien que ya ha cobrado.
     */
    li('<strong>Bitte senden Sie uns vorab per E-Mail</strong> den <strong>Kaufvertrag</strong> und, falls vorhanden, die <strong>Abmeldebescheinigung</strong>.') +
    li('<strong>Kommt ein Autotransporter bis zum Fahrzeug?</strong> Ein LKW mit mehreren Fahrzeugen braucht Platz und Höhe. Wenn nicht — Tiefgarage, enge Straße, Innenhof —, sagen Sie uns bitte, wo wir es stattdessen übernehmen können.') +
    '</ol>';

  const html =
    p('Guten Tag,') +
    p('wir organisieren jetzt die Abholung dieses Fahrzeugs:') +
    delCoche +
    p('Dafür brauchen wir sechs Angaben:') +
    preguntas +
    String(d.nota ?? '') +
    p('Sobald wir das haben, melden wir uns mit dem Abholtermin.') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we are arranging the pick-up. We need six things: the <strong>exact pick-up address</strong>; <strong>which day and time</strong> we can collect it —or from when it is ready and your opening hours—; a <strong>contact person and phone number</strong> on site, the driver will ask for them; <strong>what the driver takes with the car</strong>: keys, registration parts I and II, the COC and the service book; whether a <strong>car-carrier truck can reach the vehicle</strong> —if it cannot, underground parking, narrow street or inner courtyard, tell us where we can collect it instead—; and please <strong>email us the sales contract in advance</strong>, and the deregistration certificate if you have it.</em>');

  return { subject, html };
}
