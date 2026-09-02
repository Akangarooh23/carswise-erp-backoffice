/**
 * Pedirle al vendedor alemán la factura del coche.
 *
 * Es el papel que falta para que los 16.890 € del coche sean lo que decimos que
 * son: **un suplido**, dinero pagado en nombre del cliente que no es ingreso de
 * PopCar. Un suplido se justifica con la factura del tercero **a nombre del
 * cliente**; sin ella, Hacienda lo trata como ingreso nuestro y habría que
 * repercutir su IVA — unos 3.500 € sobre dinero que no es nuestro.
 *
 * Por eso el correo pide una cosa concreta y da los datos exactos con los que
 * tiene que emitirla. «Mándanos la factura» a secas vuelve con la factura a
 * nombre de PopCar, que es justo la que no sirve.
 *
 * Va en alemán y en inglés, en ese orden. En alemán porque es el idioma del que
 * lo recibe y una petición formularia se contesta antes en el idioma propio; en
 * inglés debajo porque quien lo manda desde aquí tiene que poder leer lo que
 * está enviando en su nombre.
 */

export interface DatosDeLaPeticion {
  /** Cómo se llama el coche en el anuncio. */
  vehiculo: string;
  /** El anuncio, para que sepa de cuál de sus coches hablamos. */
  anuncio?: string | null;
  /** Nuestro número de pedido, para que pueda referenciarlo. */
  pedido?: string | null;
  /** Lo que se le paga por el coche. */
  importe?: number | null;
  /** A nombre de quién tiene que ir la factura. */
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
  cliente: {
    nombre?: string | null;
    nif?: string | null;
    direccion?: string | null;
    cp?: string | null;
    provincia?: string | null;
  };
}

/** Lo que impide mandar la petición, si algo lo impide. */
export function faltaParaPedirLaFactura(d: DatosDeLaPeticion): string[] {
  const falta: string[] = [];
  if (!String(d.cliente?.nombre ?? '').trim()) falta.push('el nombre del cliente');
  if (!String(d.cliente?.nif ?? '').trim()) falta.push('su NIF');
  if (!String(d.cliente?.direccion ?? '').trim()) falta.push('su dirección');
  return falta;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** «Calle Mauricio Legendre 45 G2B, 28046 Madrid (MADRID), España» */
export function direccionEnUnaLinea(c: DatosDeLaPeticion['cliente']): string {
  const ciudad = [c.cp, c.provincia].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
  return [String(c.direccion ?? '').trim(), ciudad, 'Spanien / Spain']
    .filter(Boolean)
    .join(', ');
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

/**
 * El correo, montado.
 *
 * Los datos del cliente van en una tabla y no dentro de un párrafo: quien la
 * teclea en su programa de facturación los va a copiar uno a uno, y en un
 * párrafo corrido se salta uno.
 */
export function correoDeFacturaAlVendedor(d: DatosDeLaPeticion): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const ref = String(d.pedido ?? '').trim();
  const subject = `Rechnung auf den Endkunden / Invoice to the end customer — ${coche}${ref ? ` (${ref})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const datosDelCliente =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Name / Name', String(d.cliente.nombre ?? '')) +
    fila('Steuernummer / Tax ID (NIF)', String(d.cliente.nif ?? '')) +
    fila('Anschrift / Address', direccionEnUnaLinea(d.cliente)) +
    '</table>';

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Fahrzeug / Vehicle', coche) +
    (ref ? fila('Unsere Bestellnummer / Our order no.', ref) : '') +
    (d.importe ? fila('Betrag / Amount', eur(Number(d.importe))) : '') +
    (d.anuncio ? fila('Inserat / Listing', String(d.anuncio)) : '') +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const html =
    p('Guten Tag,') +
    p('wir kaufen dieses Fahrzeug im Auftrag unseres Kunden. <strong>Die Rechnung muss auf den Endkunden ausgestellt werden</strong>, nicht auf PopCar: wir handeln als Vermittler, das Fahrzeug geht direkt vom Verkäufer an den Käufer.') +
    p('Bitte stellen Sie die Rechnung mit diesen Daten aus:') +
    datosDelCliente +
    p('Fahrzeug:') +
    delCoche +
    String(d.nota ?? '') +
    p('Vielen Dank.') +
    '<hr style="border:none;border-top:1px solid #E4E4DF;margin:22px 0">' +
    p('<em>Hello,</em>') +
    p('<em>we are buying this vehicle on behalf of our customer. <strong>The invoice must be made out to the end customer</strong>, not to PopCar: we act as an intermediary and the car goes directly from the seller to the buyer. Please issue the invoice with the details above.</em>');

  return { subject, html };
}
