/**
 * El primer correo al vendedor: si el coche sigue ahí y cuándo podemos verlo.
 *
 * Va entre que el cliente deposita y que se suelta el dinero, y es el que puede
 * pararlo todo. Un anuncio de AutoScout24 sigue publicado días después de que el
 * coche se venda —lo comprobamos: 454 de 484 coches publicados estaban vendidos
 * desde julio—, así que **que el anuncio esté vivo no significa que el coche lo
 * esté**, y el cliente ya ha transferido veintiún mil euros.
 *
 * Pregunta tres cosas, y en este orden:
 *
 * 1. **Si sigue disponible**, y que si lo está lo reserve. Si no lo está, aquí
 *    se acaba y se le devuelve todo al cliente.
 * 2. **Cuándo podemos ir a verlo.** Es la condición para soltarle el dinero, y
 *    conviene que sepa desde el principio que va a ir alguien: enterarse al
 *    final de que hay una visita retrasa la recogida.
 * 3. **La dirección exacta donde está el coche**, y que confirme que tiene
 *    tiempo para atender a nuestro perito. Son los dos datos con los que se
 *    encarga la revisión, y eran los que había que perseguir después.
 *
 * No promete el pago ni dice que el dinero esté esperando. Mientras no haya ido
 * nadie a ver el coche, lo único cierto es que hay un comprador: reservar no es
 * pagar, y la reserva se pide sabiendo que la visita va antes.
 *
 * **Aquí ya no se piden datos bancarios.** Se pedían y se han quitado: un IBAN
 * antes de saber si el coche siquiera existe se pide antes de tiempo, y es el
 * hilo por el que entra el fraude más común de esto —alguien se mete en medio
 * del correo y contesta con otra cuenta—. El IBAN se pide cuando se va a pagar y
 * se confirma por teléfono; el ERP no deja soltar el dinero sin él.
 */

export interface DatosDeLaReserva {
  vehiculo: string;
  anuncio?: string | null;
  /** Lo que pide en el anuncio, para confirmar que sigue siendo ese. */
  importe?: number | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

export function faltaParaLaReserva(d: DatosDeLaReserva): string[] {
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

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

export function correoDeReservaAlVendedor(d: DatosDeLaReserva): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const subject = `Verfügbarkeit / Still available? — ${coche}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    (d.importe ? fila('Preis / Price', eur(Number(d.importe))) : '') +
    (d.anuncio ? fila('Anzeige / Listing', String(d.anuncio)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const li = (html: string) =>
    `<li style="margin-bottom:8px">${html}</li>`;

  /**
   * Tres preguntas, y tres van en la lista.
   *
   * Antes decía «tres» y enumeraba cuatro. Un correo que no sabe contar lo que
   * él mismo pide se lee como un formulario, y un formulario se contesta a
   * medias.
   */
  const preguntas =
    '<ol style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li('<strong>Ist das Fahrzeug noch verfügbar?</strong> Falls ja, würden wir es gerne reservieren.') +
    li('<strong>Wann könnten wir das Fahrzeug besichtigen?</strong> Wir schicken jemanden zur Inspektion vorbei, bevor wir bezahlen.') +
    li('<strong>Unter welcher genauen Adresse steht das Fahrzeug?</strong> Bitte bestätigen Sie uns auch, dass Sie Zeit für unseren Prüfer haben.') +
    '</ol>';

  const html =
    p('Guten Tag,') +
    p('wir haben einen Käufer für dieses Fahrzeug:') +
    delCoche +
    p('Drei Fragen, bevor wir fortfahren:') +
    preguntas +
    String(d.nota ?? '') +
    p('Bitte antworten Sie uns einfach auf diese E-Mail.') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we have a buyer for this vehicle. Three questions before we go ahead: <strong>is it still available</strong> —if so, we would like to reserve it—; <strong>when could we come and see it</strong>, since we send someone to inspect it before paying; and <strong>at exactly which address is the car</strong>, confirming that you can make time for our inspector. Just reply to this email.</em>');

  return { subject, html };
}
