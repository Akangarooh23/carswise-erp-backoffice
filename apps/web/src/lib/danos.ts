/**
 * Los daños de una peritación, del lado de la pantalla.
 *
 * Es el espejo de `apps/api/src/lib/danos-del-coche.ts`: las mismas partidas y
 * la misma forma de contar. Está duplicado como lo están las etapas de
 * importación, porque los dos lados se compilan por separado; si alguna vez
 * dejan de coincidir, se rompe por los dos a la vez, que es lo que se quiere.
 *
 * Lo que no se puede perder en la copia es esto: **una partida sin valorar no es
 * una partida de cero euros**. El total va corto y la pantalla tiene que decirlo,
 * porque quien lo lee está a punto de dar un precio de reacondicionamiento.
 */

export const PARTIDAS_HABITUALES = [
  'Paragolpes delantero',
  'Paragolpes trasero',
  'Capó',
  'Portón trasero',
  'Aleta delantera izquierda',
  'Aleta delantera derecha',
  'Aleta trasera izquierda',
  'Aleta trasera derecha',
  'Puerta delantera izquierda',
  'Puerta delantera derecha',
  'Puerta trasera izquierda',
  'Puerta trasera derecha',
  'Techo',
  'Retrovisor izquierdo',
  'Retrovisor derecho',
  'Faro izquierdo',
  'Faro derecho',
  'Piloto trasero izquierdo',
  'Piloto trasero derecho',
  'Parabrisas',
  'Luna trasera',
  'Llanta',
  'Neumáticos',
  'Frenos',
  'Tapicería',
  'Salpicadero',
  'Pintura general',
  'Otros',
] as const;

export interface Dano {
  id: string;
  peritacion_id?: string;
  pieza: string;
  coste: string | number | null;
  notas: string;
}

export interface ResumenDeDanos {
  cuantas: number;
  total: number;
  sinValorar: number;
}

export function resumenDeDanos(danos: readonly Dano[]): ResumenDeDanos {
  let total = 0;
  let sinValorar = 0;
  for (const d of danos) {
    const c = d.coste === null || d.coste === '' ? null : Number(d.coste);
    if (c === null || !Number.isFinite(c)) sinValorar += 1;
    else total += c;
  }
  return { cuantas: danos.length, total: Math.round(total * 100) / 100, sinValorar };
}

/** «1240 € en 3 partidas, y 2 sin valorar». */
export function comoSeCuenta(r: ResumenDeDanos): string {
  if (!r.cuantas) return 'Sin daños apuntados';
  const eur = r.total.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const partidas = `${r.cuantas} ${r.cuantas === 1 ? 'partida' : 'partidas'}`;
  if (r.sinValorar === r.cuantas) return `${partidas}, ninguna valorada`;
  return `${eur} € en ${partidas}${r.sinValorar ? `, y ${r.sinValorar} sin valorar` : ''}`;
}
