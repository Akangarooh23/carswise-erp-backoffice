/**
 * Cómo acabó una visita. La copia de pantalla de `api/src/lib`.
 *
 * Está dos veces porque el navegador no puede importar del servidor, y una
 * prueba comprueba que las dos digan lo mismo: si en la API se añade un final y
 * aquí no, la Agenda enseñaría la clave cruda de algo que sí existe.
 *
 * El estado de la cita cuenta lo que pasó **antes** de la visita: pedida,
 * confirmada, cancelada. Esto cuenta lo de después, que hasta ahora no se
 * guardaba: pasaba el día y la visita se quedaba confirmada para siempre.
 */

export const RESULTADOS = ['no_fue', 'fue', 'compro'] as const;
export type Resultado = typeof RESULTADOS[number];

/** Cómo se lee cada final. En el botón, en la ficha y en el rastro. */
export const COMO_ACABO: Record<Resultado, string> = {
  no_fue: 'No fue',
  fue: 'Fue a verlo',
  compro: 'Fue y se lo quedó',
};

/** El color de cada uno: lo que va bien en verde, lo que no en rojo. */
export const TONO: Record<Resultado, string> = {
  no_fue: 'bg-red-50 text-red-700 border-red-200',
  fue: 'bg-brand-50 text-brand-600 border-brand-200',
  compro: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function comoAcabo(v: string | null | undefined): string {
  return v && v in COMO_ACABO ? COMO_ACABO[v as Resultado] : '';
}

/**
 * Si ya se puede decir cómo acabó: confirmada y empezada.
 *
 * La misma regla que en la API. Aquí decide si sale el botón; allí decide si se
 * guarda, que es lo que de verdad manda.
 */
export function sePuedeCerrar(
  visita: { status: string | null; starts_at: string },
  ahora: Date = new Date(),
): boolean {
  if (visita.status !== 'confirmed') return false;
  const empieza = new Date(visita.starts_at).getTime();
  return Number.isFinite(empieza) && empieza <= ahora.getTime();
}

export function estaSinCerrar(
  visita: { status: string | null; starts_at: string; resultado?: string | null },
  ahora: Date = new Date(),
): boolean {
  return !visita.resultado && sePuedeCerrar(visita, ahora);
}
