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
 * **En tres idiomas, y lo elige quien lo manda.** Un tramo que sale de Múnich
 * lo hace muchas veces una empresa alemana, y otras tantas una polaca o una
 * checa que trabaja en inglés. El español de partida es el de la lista de
 * Proveedores, que hoy son de aquí; los otros dos existen porque el precio lo
 * pone quien entiende lo que se le pregunta.
 */

/** En qué idioma sale. Lo elige quien revisa, antes de mandarlo. */
export type Idioma = 'es' | 'de' | 'en';

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
   * `null` cuando no se sabe: entonces no se dice nada, en vez de afirmar que
   * sí y que el precio se caiga con el conductor en la puerta.
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

/**
 * La fecha, en el formato de quien la lee.
 *
 * «04.09.2026» en alemán y «4 September 2026» en inglés no son un adorno: un
 * alemán lee «09/04» como el 9 de abril, y esa confusión mueve un camión un mes
 * entero.
 */
function enFecha(v: unknown, idioma: Idioma): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  if (idioma === 'de') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (idioma === 'en') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Todo lo que cambia con el idioma, junto para poder leerlo de una vez. */
const TEXTOS: Record<Idioma, {
  asunto: string;
  vehiculo: string; sinMatricula: string;
  recogerEn: string; preguntarPor: string; disponibleDesde: string;
  horario: string; entregarEn: string; acceso: string;
  siPortacoches: string; noPortacoches: string; referencia: string;
  saludo: string; entradilla: string; tresCosas: string;
  puede: string; queDia: string; queDiaCon: (f: string) => string; cuanto: string;
  cierre: string; gracias: string;
}> = {
  es: {
    asunto: 'Presupuesto de transporte',
    vehiculo: 'Vehículo', sinMatricula: 'sin matricular todavía',
    recogerEn: 'Recoger en', preguntarPor: 'Preguntar por', disponibleDesde: 'Disponible desde',
    horario: 'Horario de recogida', entregarEn: 'Entregar en', acceso: 'Acceso',
    siPortacoches: 'Un portacoches llega hasta el coche',
    noPortacoches: 'NO entra un portacoches: hay que recogerlo de otra forma',
    referencia: 'Nuestra referencia',
    saludo: 'Hola,',
    entradilla: 'Nos gustaría pediros precio para traer este coche:',
    tresCosas: 'Tres cosas:',
    puede: '<strong>¿Podéis con este viaje?</strong>',
    queDia: '<strong>¿Qué día lo recogeríais?</strong>',
    queDiaCon: (f) => `<strong>¿Qué día lo recogeríais?</strong> Está listo desde el ${f}.`,
    cuanto: '<strong>¿Cuánto costaría</strong>, con todo incluido y sin IVA?',
    cierre: 'Con vuestra respuesta os confirmamos y os mandamos la orden con todos los datos.',
    gracias: 'Gracias.',
  },
  de: {
    asunto: 'Transportangebot',
    vehiculo: 'Fahrzeug', sinMatricula: 'noch nicht zugelassen',
    recogerEn: 'Abholort', preguntarPor: 'Ansprechpartner', disponibleDesde: 'Verfügbar ab',
    horario: 'Abholzeiten', entregarEn: 'Lieferort', acceso: 'Zufahrt',
    siPortacoches: 'Ein Autotransporter kommt bis zum Fahrzeug',
    noPortacoches: 'KEIN Autotransporter möglich: das Fahrzeug muss anders abgeholt werden',
    referencia: 'Unsere Referenz',
    saludo: 'Guten Tag,',
    entradilla: 'wir möchten Sie um ein Angebot für den Transport dieses Fahrzeugs bitten:',
    tresCosas: 'Drei Fragen:',
    puede: '<strong>Können Sie diesen Transport übernehmen?</strong>',
    queDia: '<strong>An welchem Tag würden Sie abholen?</strong>',
    queDiaCon: (f) => `<strong>An welchem Tag würden Sie abholen?</strong> Das Fahrzeug steht ab dem ${f} bereit.`,
    cuanto: '<strong>Was würde der Transport kosten?</strong> Bitte alles inklusive und netto.',
    cierre: 'Nach Ihrer Rückmeldung bestätigen wir Ihnen den Auftrag mit allen Daten.',
    gracias: 'Vielen Dank.',
  },
  en: {
    asunto: 'Transport quote',
    vehiculo: 'Vehicle', sinMatricula: 'not registered yet',
    recogerEn: 'Pick-up address', preguntarPor: 'Ask for', disponibleDesde: 'Available from',
    horario: 'Pick-up hours', entregarEn: 'Deliver to', acceso: 'Access',
    siPortacoches: 'A car carrier can reach the vehicle',
    noPortacoches: 'A car carrier can NOT reach it: it has to be collected another way',
    referencia: 'Our reference',
    saludo: 'Hello,',
    entradilla: 'we would like a quote to move this car:',
    tresCosas: 'Three things:',
    puede: '<strong>Can you take this job?</strong>',
    queDia: '<strong>Which day would you collect it?</strong>',
    queDiaCon: (f) => `<strong>Which day would you collect it?</strong> It is ready from ${f}.`,
    cuanto: '<strong>How much would it cost?</strong> All included, before VAT.',
    cierre: 'Once you reply we will confirm and send you the pick-up order with all the details.',
    gracias: 'Thank you.',
  },
};

export function correoDePresupuestoAlTransportista(
  d: DatosDelPresupuesto,
  idioma: Idioma = 'es'
): { subject: string; html: string } {
  const t = TEXTOS[idioma] ?? TEXTOS.es;
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const subject = `${t.asunto} ${d.referencia} — ${coche}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const quien = [String(d.contacto ?? '').trim(), String(d.telefono ?? '').trim()]
    .filter(Boolean).join(' · ');
  const desdeCuando = enFecha(d.disponibleDesde, idioma);

  const tabla =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila(t.vehiculo, coche + (mat ? ` · ${mat}` : ` · ${t.sinMatricula}`)) +
    fila(t.recogerEn, String(d.desde ?? '').trim()) +
    (quien ? fila(t.preguntarPor, quien) : '') +
    (desdeCuando ? fila(t.disponibleDesde, desdeCuando) : '') +
    (String(d.horario ?? '').trim() ? fila(t.horario, String(d.horario).trim()) : '') +
    fila(t.entregarEn, String(d.hasta ?? '').trim()) +
    // El dato que mueve el precio. Se dice siempre que se sepa, en los dos
    // sentidos: un «no entra» callado es un presupuesto que luego no vale.
    (d.entraPortacoches === true
      ? fila(t.acceso, t.siPortacoches)
      : d.entraPortacoches === false
        ? fila(t.acceso, t.noPortacoches)
        : '') +
    fila(t.referencia, d.referencia) +
    '</table>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;
  const li = (html: string) => `<li style="margin-bottom:6px">${html}</li>`;

  const preguntas =
    '<ol style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.55;color:#2A2A28">' +
    li(t.puede) +
    li(desdeCuando ? t.queDiaCon(esc(desdeCuando)) : t.queDia) +
    li(t.cuanto) +
    '</ol>';

  const html =
    p(t.saludo) +
    p(t.entradilla) +
    tabla +
    p(t.tresCosas) +
    preguntas +
    String(d.nota ?? '') +
    p(t.cierre) +
    p(t.gracias);

  return { subject, html };
}
