/**
 * En qué fase va una peritación, que es lo que decide qué se enseña.
 *
 * El panel tenía los doce campos abiertos desde el primer momento: elegir
 * perito, lo que nos cobra, avisar al vendedor, lo que vio, los daños, su
 * factura y sus papeles. Enseñarlo todo a la vez no es enseñar más información,
 * es enseñar menos — entre «lo que vio» vacío y «su factura» vacía se pierde el
 * único botón que se puede pulsar hoy.
 *
 * Y algunos ni siquiera se podían usar: **lo que nos cobra no se sabe hasta que
 * el perito contesta**, y avisar al vendedor del día antes de que el perito
 * confirme es mandarle una fecha que no sostiene nadie.
 *
 * Lo que no toca no desaparece: se pliega abajo. Plegar y esconder no es lo
 * mismo — alguien querrá mirar el informe de una que aún no ha ido, o corregir
 * algo de una fase pasada.
 */

/** Lo que ya se sabe de una peritación, para saber por dónde va. */
export interface DondeVa {
  estado: string;
  /** Cuándo se le mandó el encargo, si se le mandó. */
  encargo_enviado_at?: string | null;
}

export const FASES = [
  'Por encargar',
  'Encargada',
  'Hecha',
] as const;

/**
 * 0 · hay que elegir perito y mandarle el encargo.
 * 1 · se le ha mandado: toca esperar a que confirme y diga el precio.
 * 2 · ha ido y ha dicho lo que vio.
 *
 * La fase 1 no la marca el estado sino **el correo**: el estado se puede haber
 * cambiado a mano en el tablero, y lo que habilita avisar al vendedor y apuntar
 * lo que cobra es que se le haya pedido de verdad.
 */
export function faseDeLaPeritacion(p: DondeVa): 0 | 1 | 2 {
  if (p.estado === 'Hecha') return 2;
  return p.encargo_enviado_at ? 1 : 0;
}

/** Lo que toca hacer ahora, dicho antes de que empiecen los campos. */
export const QUE_TOCA_AHORA: Record<0 | 1 | 2, string> = {
  0: 'Elige quién va a verlo, comprueba los datos de la visita y mándale el encargo.',
  1: 'Esperando su respuesta: si puede ir ese día y cuánto nos cobra.',
  2: 'Ya se sabe lo que hay. Apunta lo que vio, sus daños, su informe y su factura.',
};
