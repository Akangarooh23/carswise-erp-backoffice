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
 * Va en castellano: los transportistas son los de la lista de Proveedores, y son
 * de aquí. Si un día hay uno alemán, esto se traduce; hoy sería inventarse un
 * problema.
 */

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
  /** Lo acordado, si ya está cerrado. */
  coste?: number | null;
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

/** «2 de septiembre de 2026», o vacío si no hay fecha. */
export function enFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un punto, escrito como se lee: dónde y por quién preguntar. */
export function puntoEscrito(p: Punto | undefined | null): string {
  if (!p) return '';
  const quien = String(p.quien ?? '').trim();
  const tel = String(p.telefono ?? '').trim();
  const contacto = [quien, tel].filter(Boolean).join(' · ');
  return [String(p.donde ?? '').trim(), contacto ? `preguntar por ${contacto}` : '']
    .filter(Boolean)
    .join(' — ');
}

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export function correoDeOrdenDeRecogida(d: DatosDeLaOrden): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const subject = `Recogida ${d.referencia} — ${coche}${mat ? ` (${mat})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const cuando = enFecha(d.recogidaPrevista);

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Vehículo', coche + (mat ? ` · ${mat}` : ' · sin matricular todavía')) +
    fila('Recoger en', puntoEscrito(d.origen)) +
    fila('Entregar en', puntoEscrito(d.destino)) +
    (cuando ? fila('A partir del', cuando) : '') +
    (d.coste ? fila('Precio acordado', eur(Number(d.coste))) : '') +
    fila('Nuestra referencia', d.referencia) +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const html =
    p('Hola,') +
    p('Os pasamos un coche para recoger:') +
    tabla +
    p(cuando
      ? 'Decidnos qué día podéis y os confirmamos.'
      : 'Todavía no tenemos fecha de salida. En cuanto la tengamos os la decimos; si necesitáis avisar con antelación, contadnos cuánta.') +
    p('Cualquier cosa, respondiendo a este correo.');

  return { subject, html };
}
