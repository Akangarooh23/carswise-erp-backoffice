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
