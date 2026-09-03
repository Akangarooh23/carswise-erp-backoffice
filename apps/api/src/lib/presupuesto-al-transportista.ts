/**
 * Preguntarle al transportista **si puede y cuánto cobra**.
 *
 * Es el paso que faltaba entre la respuesta del vendedor y la orden de
 * recogida. La orden se manda cuando ya se ha quedado con alguien por un
 * precio; antes hay que preguntar, y a más de uno, porque un tramo Múnich →
 * Zaragoza se mueve varios cientos de euros entre el primero y el tercero.
 *
 * Lleva lo que el vendedor acaba de contestar y nada inventado: la dirección
 * exacta, desde cuándo está listo, en qué horas se abre y por quién preguntar.
 * Un presupuesto pedido con «un coche en Múnich» vuelve con un precio de
 * mentira, y luego se discute con el camión ya cargado.
 *
 * Y dice **si entra un portacoches**, que es el dato que cambia el precio: uno
 * lleva ocho coches y sale a un tercio por coche; una grúa individual cuesta lo
 * que cuesta. Si el vendedor ha dicho que no entra, callarlo es pedir un precio
 * que luego no vale.
 *
 * Va en castellano: los transportistas son los de Proveedores, y son de aquí.
 */

export interface DatosDelPresupuesto {
  /** Nuestra referencia del tramo, para que pueda citarla. */
  referencia: string;
  vehiculo: string;
  matricula?: string | null;
  /** De dónde sale: la calle, no la ciudad. */
  desde: string;
  /** Adónde va. */
  hasta: string;
  /** Por quién pregunta el conductor al llegar, y en qué teléfono. */
  contacto?: string | null;
  telefono?: string | null;
  /** Desde cuándo está listo el coche. */
  disponibleDesde?: string | null;
  /** En qué horas se puede ir, tal cual lo dijo el vendedor. */
  horario?: string | null;
  /**
   * Si cabe un camión portacoches hasta el coche.
   *
   * `null` cuando no se sabe: entonces se pregunta, en vez de afirmar que sí
   * y que el precio se caiga con el conductor en la puerta.
   */
  entraPortacoches?: boolean | null;
  /** Lo que añada quien revisa antes de mandarlo, ya en HTML. */
  nota?: string | null;
}

/** Lo que impide pedir precio. Sin esto, lo que vuelve no es un precio. */
export function faltaParaPedirPresupuesto(d: DatosDelPresupuesto): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('decir qué coche es');
  if (!String(d.desde ?? '').trim()) falta.push('apuntar de dónde sale');
  if (!String(d.hasta ?? '').trim()) falta.push('apuntar adónde va');
  return falta;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** «4 de septiembre de 2026», o vacío si no hay fecha. */
function enFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function correoDePresupuestoAlTransportista(
  d: DatosDelPresupuesto
): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const subject = `Presupuesto de transporte ${d.referencia} — ${coche}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const quien = [String(d.contacto ?? '').trim(), String(d.telefono ?? '').trim()]
    .filter(Boolean).join(' · ');
  const desdeCuando = enFecha(d.disponibleDesde);

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Vehículo', coche + (mat ? ` · ${mat}` : ' · sin matricular todavía')) +
    fila('Recoger en', String(d.desde ?? '').trim()) +
    (quien ? fila('Preguntar por', quien) : '') +
    (desdeCuando ? fila('Disponible desde', desdeCuando) : '') +
    (String(d.horario ?? '').trim() ? fila('Horario de recogida', String(d.horario).trim()) : '') +
    fila('Entregar en', String(d.hasta ?? '').trim()) +
    // El dato que mueve el precio. Se dice siempre que se sepa, en los dos
    // sentidos: un «no entra» callado es un presupuesto que luego no vale.
    (d.entraPortacoches === true
      ? fila('Acceso', 'Un portacoches llega hasta el coche')
      : d.entraPortacoches === false
        ? fila('Acceso', 'NO entra un portacoches: hay que recogerlo de otra forma')
        : '') +
    fila('Nuestra referencia', d.referencia) +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;
  const li = (html: string) => `<li style="margin-bottom:6px">${html}</li>`;

  const preguntas =
    '<ol style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li('<strong>¿Podéis con este viaje?</strong>') +
    li(desdeCuando
      ? `<strong>¿Qué día lo recogeríais?</strong> Está listo desde el ${esc(desdeCuando)}.`
      : '<strong>¿Qué día lo recogeríais?</strong>') +
    li('<strong>¿Cuánto costaría</strong>, con todo incluido y sin IVA?') +
    '</ol>';

  const html =
    p('Hola,') +
    p('Nos gustaría pediros precio para traer este coche:') +
    tabla +
    p('Tres cosas:') +
    preguntas +
    String(d.nota ?? '') +
    p('Con vuestra respuesta os confirmamos y os mandamos la orden con todos los datos.') +
    p('Gracias.');

  return { subject, html };
}
