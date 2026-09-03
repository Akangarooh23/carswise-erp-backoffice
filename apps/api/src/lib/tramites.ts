/**
 * Las reglas de un trámite.
 *
 * Un trámite es un papeleo que lleva una gestoría de fuera: matricular un coche
 * traído de Alemania, cambiar de nombre uno de segunda mano, pasar una ITV. Lo
 * que hace falta depende del caso —una importación pide matriculación, una venta
 * entre particulares pide transferencia, y un mismo coche puede necesitar las
 * dos—, así que **el tipo es texto libre con sugerencias, no una lista cerrada**.
 * Una lista cerrada obligaría a tocar el código cada vez que aparezca un papeleo
 * nuevo, y aparecen.
 *
 * Los estados sí son cerrados, porque describen el ir y venir con la gestoría, y
 * ese es siempre el mismo: se prepara, se manda, se espera, vuelve.
 */

export const ESTADOS_TRAMITE = [
  'Pendiente',
  'Documentación incompleta',
  'Enviado a gestoría',
  'En trámite',
  'Resuelto',
] as const;

export type EstadoTramite = (typeof ESTADOS_TRAMITE)[number];

/** Vuelve con problemas. Existe, pero no es un paso adelante. */
export const RECHAZADO = 'Rechazado';

export const QUE_TOCA_TRAMITE: Record<EstadoTramite, string> = {
  'Pendiente':                'Reunir lo que hace falta',
  'Documentación incompleta': 'Falta algo nuestro o del cliente',
  'Enviado a gestoría':       'Está fuera, esperando que lo cojan',
  'En trámite':               'La gestoría lo está tramitando',
  'Resuelto':                 'Terminado',
};

/**
 * Los papeleos que más se repiten.
 *
 * Son sugerencias para no escribirlos a mano cada vez, no una lista de lo que se
 * puede hacer: cualquier otro texto vale.
 */
export const TRAMITES_HABITUALES = [
  'Matriculación de importación',
  'Impuesto de matriculación',
  'Transferencia de titularidad',
  'ITV de homologación',
  'ITV periódica',
  'Baja temporal',
  'Cambio de domicilio',
  'Duplicado de permiso',
  'Seguro',
  'Financiación',
];

export function esEstadoTramite(v: string): v is EstadoTramite {
  return (ESTADOS_TRAMITE as readonly string[]).includes(v);
}

export function esEstadoTramiteValido(v: string): boolean {
  return esEstadoTramite(v) || v === RECHAZADO;
}

/** El estado que viene después. Null si ya está resuelto o rechazado. */
export function siguienteEstadoTramite(estado: string): EstadoTramite | null {
  const i = (ESTADOS_TRAMITE as readonly string[]).indexOf(estado);
  return i >= 0 && i < ESTADOS_TRAMITE.length - 1 ? ESTADOS_TRAMITE[i + 1] : null;
}

/**
 * Mandarlo fuera exige saber a quién.
 *
 * «Enviado a gestoría» sin gestoría es un papel que no está en ningún sitio: ni
 * lo tenemos nosotros ni se sabe a quién preguntar por él.
 */
export function puedeEnviarse(tramite: { gestoria?: string | null }): boolean {
  return Boolean((tramite.gestoria ?? '').trim());
}

/**
 * Está esperando a alguien de fuera.
 *
 * Es la pregunta que se hace todos los días: de qué coches dependemos de que
 * conteste otro. Un trámite en casa se resuelve trabajando; uno fuera, no.
 */
export function estaFuera(estado: string): boolean {
  return estado === 'Enviado a gestoría' || estado === 'En trámite';
}

/** Cuántos días lleva fuera, para poder reclamar con una fecha delante. */
export function diasFuera(enviadoEl?: string | null, ahora: Date = new Date()): number | null {
  if (!enviadoEl) return null;
  const d = new Date(enviadoEl);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
}

/** La línea que deja un cambio de estado en las notas. */
export function notaDelCambio(
  notasActuales: string,
  desde: string,
  hasta: string,
  texto: string,
  cuando: Date = new Date()
): string {
  const limpio = (texto ?? '').trim();
  if (!limpio) return notasActuales ?? '';
  const dia = cuando.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const entrada = `[${dia} · ${desde} → ${hasta}] ${limpio}`;
  const previas = (notasActuales ?? '').trim();
  return previas ? `${previas}\n${entrada}` : entrada;
}

/**
 * Qué papeleos salen de comprar un coche, según a quién se le compre.
 *
 * No es lo mismo traerlo de fuera que comprarlo aquí. Un coche alemán hay que
 * **matricularlo**: no existe en España todavía, así que se paga su impuesto, se
 * homologa y se le da matrícula. Uno que ya está matriculado aquí solo cambia de
 * dueño: se **transfiere**.
 *
 * Y comprarle a un particular añade uno que no aparece en ningún otro caso: el
 * **impuesto de transmisiones**, que lo paga quien compra. Comprándole a una
 * empresa no lo hay, porque esa venta lleva IVA en su factura.
 */
/**
 * Y una importación abre **uno**, no tres.
 *
 * Eran tres papeleos separados —impuesto, ITV de homologación y matrícula—
 * con la idea de saber cuál se atasca. Pero los lleva la misma gestoría, con
 * una sola factura y un solo interlocutor, así que lo único que se multiplicaba
 * era el trabajo: elegir gestoría tres veces, apuntar costes en tres sitios y
 * repartir los papeles en tres cajones que nadie ve juntos.
 *
 * Lo decidió Ana después de verlo en pantalla, y tiene razón: tres fichas de
 * un mismo encargo no son tres cosas, son la misma contada tres veces. Lo que
 * se cobra por dentro se ve en las **partidas**, que es donde de verdad hace
 * falta el detalle: ahí se separa lo que es de terceros de lo que es suyo.
 */
export const TRAMITES_POR_ORIGEN: Record<string, string[]> = {
  importacion: ['Matriculación de importación'],
  concesionario: ['Transferencia de titularidad'],
  'ex-renting':  ['Transferencia de titularidad'],
  particular:    ['Transferencia de titularidad', 'Impuesto de transmisiones'],
  stock:         ['Transferencia de titularidad'],
};

/**
 * Y el que sale de **vender**.
 *
 * Un coche que era nuestro y pasa a un cliente cambia de dueño otra vez. Si se
 * compró para stock, eso son dos transferencias en la vida del mismo coche: una
 * al comprarlo y otra al venderlo, cada una con su coste. Conviene saberlo antes
 * de decidir a nombre de quién se compra.
 */
export const TRAMITES_AL_VENDER = ['Transferencia de titularidad'];

/**
 * Los que tocan al comprar, según de dónde viene **y a nombre de quién va**.
 *
 * Aquí está la diferencia entre pagar un cambio de nombre o dos. PopCar vende
 * siempre —su factura, su garantía— pero no tiene por qué ser el titular:
 *
 * - **A nombre del cliente**: el coche no pasa por el medio. De aquí, una sola
 *   transferencia, y se hace al venderlo. De Alemania, **ninguna**: se matricula
 *   ya a su nombre.
 * - **A nombre de PopCar**: hay que ponerlo a nuestro nombre al comprarlo, y
 *   quitarlo al venderlo. Dos.
 *
 * El impuesto de transmisiones de un particular va con la compra, no con la
 * titularidad: se compra igual.
 */
export function tramitesQueTocan(origen: string, titularidad = 'popcar'): string[] {
  const todos = TRAMITES_POR_ORIGEN[origen] ?? [];
  if (titularidad !== 'cliente') return todos;
  // A nombre del cliente, la transferencia de entrada no existe: el coche va
  // del vendedor a él, y ese cambio de nombre se hace al venderlo.
  return todos.filter((t) => !/^Transferencia/i.test(t));
}
