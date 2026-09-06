/**
 * Cómo acabó una visita.
 *
 * El estado de la cita cuenta lo que pasó **antes** de la visita: pedida,
 * confirmada, cancelada. Después no contaba nada: pasaba el día y la visita se
 * quedaba confirmada para siempre, así que nadie sabía si el cliente fue, ni si
 * el coche se vendió. La visita es lo único que vendemos en esta línea, y sin
 * esto no hay número que diga cuántas concertamos y cuántas acaban en algo.
 *
 * Tres finales y no dos, porque «fue» y «compró» contestan preguntas distintas:
 * el primero dice si el concesionario nos falla, y el segundo si el coche
 * convence. Juntos en uno, la conversión no se puede calcular.
 */

export const RESULTADOS = ['no_fue', 'fue', 'compro'] as const;
export type Resultado = typeof RESULTADOS[number];

export function esResultado(v: unknown): v is Resultado {
  return typeof v === 'string' && (RESULTADOS as readonly string[]).includes(v);
}

/** Cómo se lee cada final. En pantalla y en el rastro, la misma frase. */
export const COMO_ACABO: Record<Resultado, string> = {
  no_fue: 'No fue',
  fue: 'Fue a verlo',
  compro: 'Fue y se lo quedó',
};

export const PORQUE_NO_SE_CIERRA = {
  sinConfirmar: 'esta visita no llegó a confirmarse, así que no hay nada que cerrar',
  cancelada: 'esta visita está cancelada',
  todaviaNo: 'la visita todavía no ha empezado',
} as const;

/**
 * Si se puede decir ya cómo acabó.
 *
 * Solo una confirmada y solo cuando ya ha empezado: cerrar una visita que no ha
 * pasado es inventarse el pasado, y es un botón que se pulsa sin querer al
 * repasar la agenda de la semana. Desde que empieza sí, sin esperar a que
 * termine: quien iba a ir ya ha aparecido o no.
 */
export function sePuedeCerrar(
  visita: { status: string | null; starts_at: string | Date },
  ahora: Date = new Date(),
): { si: boolean; porque?: string } {
  if (visita.status === 'cancelled') return { si: false, porque: PORQUE_NO_SE_CIERRA.cancelada };
  if (visita.status !== 'confirmed') return { si: false, porque: PORQUE_NO_SE_CIERRA.sinConfirmar };
  const empieza = new Date(visita.starts_at).getTime();
  if (!Number.isFinite(empieza) || empieza > ahora.getTime()) {
    return { si: false, porque: PORQUE_NO_SE_CIERRA.todaviaNo };
  }
  return { si: true };
}

/**
 * Las que están esperando a que alguien diga cómo acabaron.
 *
 * Se usa igual en el panel y en la Agenda, para que las dos cuenten lo mismo.
 */
export function estaSinCerrar(
  visita: { status: string | null; starts_at: string | Date; resultado?: string | null },
  ahora: Date = new Date(),
): boolean {
  return !visita.resultado && sePuedeCerrar(visita, ahora).si;
}
