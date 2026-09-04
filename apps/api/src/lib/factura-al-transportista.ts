/**
 * Pedirle al transportista su factura, con el coche ya entregado.
 *
 * No bloquea nada, y por eso se olvida: el coche llegó, el tramo está cerrado y
 * nadie está esperando ese papel para poder seguir. Pero 890 € que no llegan al
 * coste del coche hacen que el margen salga mejor de lo que es, y el día que
 * aparece la factura ya se han sacado cuentas con un número que no era.
 *
 * Dice tres cosas, que son las que hacen que la factura vuelva bien a la
 * primera:
 *
 * 1. **De qué viaje hablamos** — coche, de dónde a dónde y qué día. Una empresa
 *    con cuarenta portes esa semana no sabe cuál es «el del Kia».
 * 2. **Lo acordado** — el precio que ellos mismos dieron al aceptar. Una
 *    factura que no coincide se descubre al pagarla, y entonces hay que
 *    rehacerla.
 * 3. **Nuestra referencia del tramo**, que es la que ellos pueden citar.
 *
 * En los tres idiomas, como la orden: el primer viaje lo hace muchas veces una
 * empresa alemana o del este que trabaja en inglés, y una petición que no se
 * entiende se queda sin contestar.
 */

import type { Idioma } from './presupuesto-al-transportista.js';

export interface DatosDeLaFacturaDelTransporte {
  vehiculo: string;
  matricula?: string | null;
  /** De dónde a dónde, ya escrito. */
  desde?: string | null;
  hasta?: string | null;
  /** Cuándo se entregó, ya escrito como se lee. */
  cuando?: string | null;
  /** Lo acordado, que lo dijeron ellos. */
  importe?: number | null;
  /** Nuestra referencia del tramo. */
  referencia?: string | null;
  /** A dónde nos la mandan. */
  paraFacturas?: string | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lo que impide pedirla.
 *
 * Sin saber de qué viaje se habla, la petición llega a una empresa que hace
 * cuarenta portes al mes y se queda esperando a que alguien adivine.
 */
export function faltaParaPedirLaFactura(d: DatosDeLaFacturaDelTransporte): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  if (!String(d.referencia ?? '').trim()) falta.push('nuestra referencia del tramo');
  return falta;
}

const TEXTOS: Record<Idioma, {
  asunto: string; saludo: string; entradilla: string;
  vehiculo: string; sinMatricula: string; recogido: string; entregado: string;
  cuando: string; precio: string; referencia: string;
  aNombre: string; donde: (a: string) => string; cierre: string;
}> = {
  es: {
    asunto: 'Factura del transporte',
    saludo: 'Hola,',
    entradilla: 'El coche llegó bien. Para cerrar la cuenta nos falta <strong>vuestra factura</strong> de este viaje:',
    vehiculo: 'Vehículo', sinMatricula: 'sin matrícula todavía',
    recogido: 'Recogido en', entregado: 'Entregado en',
    cuando: 'Entregado el', precio: 'Precio acordado', referencia: 'Nuestra referencia',
    aNombre: 'A nombre de <strong>PopCar</strong>, con nuestro CIF.',
    donde: (a) => `Mandádnosla a <strong>${a}</strong>.`,
    cierre: 'Gracias.',
  },
  de: {
    asunto: 'Rechnung für den Transport',
    saludo: 'Guten Tag,',
    entradilla: 'das Fahrzeug ist gut angekommen. Für unsere Buchhaltung fehlt uns noch <strong>Ihre Rechnung</strong> zu diesem Transport:',
    vehiculo: 'Fahrzeug', sinMatricula: 'noch nicht zugelassen',
    recogido: 'Abgeholt in', entregado: 'Geliefert nach',
    cuando: 'Geliefert am', precio: 'Vereinbarter Preis', referencia: 'Unsere Referenz',
    aNombre: 'Bitte stellen Sie die Rechnung <strong>auf PopCar</strong> aus.',
    donde: (a) => `Schicken Sie sie bitte an <strong>${a}</strong>.`,
    cierre: 'Vielen Dank.',
  },
  en: {
    asunto: 'Invoice for the transport',
    saludo: 'Hello,',
    entradilla: 'the car arrived fine. To close our accounts we are still missing <strong>your invoice</strong> for this trip:',
    vehiculo: 'Vehicle', sinMatricula: 'not registered yet',
    recogido: 'Collected at', entregado: 'Delivered to',
    cuando: 'Delivered on', precio: 'Agreed price', referencia: 'Our reference',
    aNombre: 'Please make it out <strong>to PopCar</strong>.',
    donde: (a) => `Send it to <strong>${a}</strong>.`,
    cierre: 'Thank you.',
  },
};

export function correoDeFacturaAlTransportista(
  d: DatosDeLaFacturaDelTransporte, idioma: Idioma = 'es'
): { subject: string; html: string } {
  const t = TEXTOS[idioma] ?? TEXTOS.es;
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const ref = String(d.referencia ?? '').trim();
  const subject = `${t.asunto} ${ref} — ${coche}${mat ? ` (${mat})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:4px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delViaje =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila(t.vehiculo, coche + (mat ? ` · ${mat}` : ` · ${t.sinMatricula}`)) +
    (String(d.desde ?? '').trim() ? fila(t.recogido, String(d.desde).trim()) : '') +
    (String(d.hasta ?? '').trim() ? fila(t.entregado, String(d.hasta).trim()) : '') +
    (String(d.cuando ?? '').trim() ? fila(t.cuando, String(d.cuando).trim()) : '') +
    // El precio solo si está cerrado: pedirle una factura citando un importe
    // que no se acordó es invitarle a discutirlo ahora.
    (d.importe ? fila(t.precio, eur(Number(d.importe))) : '') +
    fila(t.referencia, ref) +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const donde = String(d.paraFacturas ?? '').trim();

  return {
    subject,
    html:
      p(t.saludo) +
      p(t.entradilla) +
      delViaje +
      p(t.aNombre) +
      (donde ? p(t.donde(esc(donde))) : '') +
      String(d.nota ?? '') +
      p(t.cierre),
  };
}
