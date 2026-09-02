/**
 * Pedirle al perito su factura, cuando la revisión ya está hecha.
 *
 * No bloquea nada —el pago al vendedor se libera con el veredicto, no con esta
 * factura—, y precisamente por eso se olvida: nadie está esperando a que llegue
 * para poder seguir. Pero 289 € que nadie apunta no llegan al coste del coche
 * ni a la lista de lo que hay que pagar, y el margen sale mejor de lo que es.
 *
 * Va en alemán con el inglés debajo, como los otros seis. Y dice tres cosas que
 * hacen que la factura vuelva bien a la primera:
 *
 * 1. **De qué revisión hablamos** — coche, día y sitio. Un perito con quince
 *    inspecciones esa semana no sabe cuál es «la del Kia».
 * 2. **Lo que se acordó** — el importe que él mismo dio al confirmar la cita.
 *    Una factura que no coincide con lo acordado se descubre al pagarla, y
 *    entonces hay que rehacerla.
 * 3. **A nombre de quién va** — a PopCar, no al cliente. Es lo contrario que la
 *    factura del coche, y es el error que se comete si no se dice: aquí el
 *    peritaje es un gasto nuestro, no dinero pagado en nombre de nadie.
 */

export interface DatosDeLaFacturaDelPerito {
  vehiculo: string;
  /** Cuándo fue a verlo, ya escrito como se lee. */
  cuando?: string | null;
  /** Dónde lo revisó, para acabar de situarlo. */
  donde?: string | null;
  /** Lo que quedó acordado, que lo dijo él mismo. */
  importe?: number | null;
  /** Nuestro número de peritación, por si él quiere referenciarlo. */
  referencia?: string | null;
  /** A dónde nos la manda. */
  paraFacturas?: string | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

export function faltaParaPedirleLaFactura(d: DatosDeLaFacturaDelPerito): string[] {
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

const eur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

export function correoDeFacturaAlPerito(d: DatosDeLaFacturaDelPerito): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const ref = String(d.referencia ?? '').trim();
  const subject = `Rechnung für die Fahrzeugprüfung / Invoice for the inspection — ${coche}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const deLaRevision =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    (d.cuando ? fila('Prüfung am / Inspected on', String(d.cuando)) : '') +
    (d.donde ? fila('Ort / Place', String(d.donde)) : '') +
    (d.importe ? fila('Vereinbarter Preis / Agreed price', eur(Number(d.importe))) : '') +
    (ref ? fila('Unsere Referenz / Our reference', ref) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const donde = String(d.paraFacturas ?? '').trim();

  const html =
    p('Guten Tag,') +
    p('vielen Dank für den Prüfbericht. Für unsere Buchhaltung fehlt uns noch <strong>Ihre Rechnung</strong> zu dieser Prüfung:') +
    deLaRevision +
    /*
     * A nombre nuestro, y dicho con todas las letras.
     *
     * Es lo contrario que la factura del coche —esa va a nombre del cliente— y
     * es el error que se comete si no se aclara. El peritaje es un gasto de
     * PopCar, no dinero pagado en nombre de nadie.
     */
    p('Bitte stellen Sie die Rechnung <strong>auf PopCar</strong> aus, nicht auf den Endkunden.') +
    (donde ? p(`Schicken Sie sie einfach an <strong>${esc(donde)}</strong>.`) : '') +
    String(d.nota ?? '') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>thank you for the inspection report. For our accounts we are still missing <strong>your invoice</strong> for this inspection. Please make it out <strong>to PopCar</strong>, not to the end customer' +
      (donde ? `, and send it to <strong>${esc(donde)}</strong>` : '') +
      '.</em>');

  return { subject, html };
}
