/**
 * El primer correo al vendedor: si el coche sigue ahí y cuándo podemos verlo.
 *
 * Va entre que el cliente deposita y que se suelta el dinero, y es el que puede
 * pararlo todo. Un anuncio de AutoScout24 sigue publicado días después de que el
 * coche se venda —lo comprobamos: 454 de 484 coches publicados estaban vendidos
 * desde julio—, así que **que el anuncio esté vivo no significa que el coche lo
 * esté**, y el cliente ya ha transferido veintiún mil euros.
 *
 * Por eso pregunta tres cosas y en este orden:
 *
 * 1. **Si sigue disponible.** Si no lo está, aquí se acaba y se le devuelve todo.
 * 2. **Cuándo podemos ir a verlo.** Es la condición para soltarle el dinero, y
 *    conviene que él sepa desde el principio que alguien va a ir.
 * 3. **Que se le vende a un particular español.** Se lo decimos ahora y no al
 *    final porque cambia los papeles que tiene que preparar, y descubrirlo el
 *    día de la recogida retrasa el coche tres semanas.
 *
 * No promete el pago ni dice que el dinero esté esperando. Mientras no haya ido
 * nadie a ver el coche, lo único cierto es que hay un comprador.
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
    (d.importe ? fila('Preis laut Inserat / Listed price', eur(Number(d.importe))) : '') +
    (d.anuncio ? fila('Inserat / Listing', String(d.anuncio)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const li = (html: string) =>
    `<li style="margin-bottom:8px">${html}</li>`;

  const preguntas =
    '<ol style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li('<strong>Ist das Fahrzeug noch verfügbar?</strong>') +
    li('<strong>Wann könnten wir es bei Ihnen ansehen?</strong> Wir schicken jemanden vorbei, bevor wir bezahlen.') +
    li('Das Fahrzeug geht an einen <strong>Privatkunden in Spanien</strong> und wird dort zugelassen. Die Rechnung wird auf ihn ausgestellt.') +
    '</ol>';

  const html =
    p('Guten Tag,') +
    p('wir haben einen Käufer für dieses Fahrzeug:') +
    delCoche +
    p('Drei Fragen, bevor wir weitermachen:') +
    preguntas +
    String(d.nota ?? '') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we have a buyer for this vehicle. Three questions before we go ahead: <strong>is it still available</strong>, <strong>when could we come and see it</strong> —we send someone before paying— and please note it goes to a <strong>private customer in Spain</strong> and will be registered there, so the invoice will be made out to them.</em>');

  return { subject, html };
}
