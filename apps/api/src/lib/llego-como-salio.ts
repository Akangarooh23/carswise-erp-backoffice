/**
 * Mirar el coche al bajarlo del camión, antes de firmar nada.
 *
 * Es otra revisión distinta de la del pedido, y las dos se confundían en el
 * mismo sitio. La del pedido pregunta **¿es el coche que compramos?** —los
 * kilómetros, las llaves, los papeles— y lo que salga de ahí se le reclama al
 * vendedor alemán. Esta pregunta **¿ha llegado como salió?**, y lo que salga se
 * le reclama al transportista. Un golpe apuntado en el sitio equivocado es una
 * reclamación mandada a quien no fue.
 *
 * Y esta tiene un reloj que la otra no tiene. Un Múnich → Zaragoza va bajo
 * **CMR**, y ahí:
 *
 * - los **daños visibles** se reservan **en el momento de la entrega**, por
 *   escrito en la carta de porte. Si el conductor se va con el albarán firmado
 *   y sin reservas, se presume que el coche llegó bien;
 * - los **no aparentes**, dentro de **siete días** desde la entrega.
 *
 * Pasado ese plazo, el golpe lo pagamos nosotros aunque lo hiciera el camión.
 * Por eso las fotos de la recogida importan tanto: son lo único que distingue un
 * golpe que ya venía de uno que se hizo por el camino.
 */

/** Lo que dice el plazo del CMR para los daños que no se ven de entrada. */
export const DIAS_PARA_RECLAMAR = 7;

export interface LlegoComoSalio {
  /** Si el coche ha llegado como salió. */
  conforme?: boolean;
  /** Lo que ha aparecido: el golpe, el arañazo, la llanta. */
  danos?: string;
  /** Lo que se le reclama al transportista, si hay algo. */
  reclamacion?: string;
  /** Si la reserva se puso por escrito en la carta de porte, delante del conductor. */
  reservaEnAlbaran?: boolean;
  mirado_por?: string;
  mirado_el?: string;
}

/**
 * Lo mínimo para dar un tramo por entregado: **contestar a la pregunta**.
 *
 * No es un formulario largo a propósito. Lo único que no se puede conseguir
 * después es que alguien haya mirado el coche con el camión todavía delante, y
 * un «sí» o un «no» es lo que deja constancia de que se miró.
 */
export function faltaPorMirarAlLlegar(l: LlegoComoSalio | null | undefined): string[] {
  const falta: string[] = [];
  const lle = l ?? {};
  if (typeof lle.conforme !== 'boolean') falta.push('Decir si ha llegado como salió');
  // Decir que no sin decir qué no sirve de nada: quien lo lea dentro de un mes
  // tiene que saber qué apareció, no solo que algo estaba mal.
  if (lle.conforme === false && !String(lle.danos ?? '').trim()) {
    falta.push('Apuntar qué ha aparecido');
  }
  return falta;
}

export function puedeDarsePorEntregado(l: LlegoComoSalio | null | undefined): boolean {
  return faltaPorMirarAlLlegar(l).length === 0;
}

/**
 * Cuántos días quedan para reclamarle al transportista.
 *
 * `null` si no hay fecha de entrega. Cero o menos significa que el plazo se ha
 * pasado: entonces no se dice «quedan -2 días», se dice que ya no hay plazo.
 */
export function diasQueQuedan(
  entregadoEl?: string | null,
  hoy: Date = new Date()
): number | null {
  const s = String(entregadoEl ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const pasados = Math.floor((hoy.getTime() - d.getTime()) / 86400000);
  return DIAS_PARA_RECLAMAR - pasados;
}

/** Si todavía se puede reclamar. */
export function sePuedeReclamar(entregadoEl?: string | null, hoy: Date = new Date()): boolean {
  const quedan = diasQueQuedan(entregadoEl, hoy);
  return quedan == null ? true : quedan > 0;
}


/**
 * «quedan 5 días», «queda 1 día».
 *
 * El verbo también concuerda: «quedan 1 día» es de las cosas que hacen dudar
 * de todo lo demás que dice la pantalla.
 */
function cuantos(dias: number): string {
  return dias === 1 ? 'queda 1 día' : `quedan ${dias} días`;
}

/**
 * Lo que hay que decirle a quien está mirando el coche.
 *
 * Cambia con lo contestado y con el plazo, porque las tres situaciones piden
 * cosas distintas: mirarlo, reclamar deprisa, o saber que ya es tarde.
 */
export function queHacerAlLlegar(
  l: LlegoComoSalio | null | undefined,
  entregadoEl?: string | null,
  hoy: Date = new Date()
): string {
  const lle = l ?? {};
  if (typeof lle.conforme !== 'boolean') {
    return 'Míralo con el camión todavía delante. Un golpe descubierto mañana ya no es del transportista.';
  }
  if (lle.conforme) return 'Llegó como salió.';

  const quedan = diasQueQuedan(entregadoEl, hoy);
  if (quedan != null && quedan <= 0) {
    return 'El plazo de siete días para reclamarle al transportista ya se ha pasado: a partir de aquí el arreglo lo pagamos nosotros.';
  }
  if (!lle.reservaEnAlbaran) {
    return quedan == null
      ? 'Ponlo por escrito en la carta de porte antes de que el conductor se vaya. Sin reserva, se presume que el coche llegó bien.'
      : `Ponlo por escrito en la carta de porte y reclámaselo: ${cuantos(quedan)}.`;
  }
  return quedan == null
    ? 'Con la reserva puesta, reclámaselo por escrito.'
    : `Con la reserva puesta, reclámaselo por escrito: ${cuantos(quedan)}.`;
}

/** Lo apuntado, con quién lo miró y cuándo. */
export function anotaLaLlegada(
  previa: LlegoComoSalio | null | undefined,
  cambios: LlegoComoSalio,
  quien: string,
  cuando: Date = new Date()
): LlegoComoSalio {
  return {
    ...(previa ?? {}),
    ...cambios,
    mirado_por: quien,
    mirado_el: cuando.toISOString(),
  };
}
