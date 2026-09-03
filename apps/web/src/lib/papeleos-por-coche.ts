/**
 * Los papeleos de un coche, juntos.
 *
 * Una importación abre tres —impuesto, ITV de homologación y matriculación— y
 * el tablero los enseñaba como tres tarjetas sueltas. Con un coche ya se lee
 * mal; con cinco son quince tarjetas del mismo tamaño y ninguna dice a qué
 * coche pertenece sin leerla entera.
 *
 * Y sin embargo **no se pueden fundir en uno**: cada papeleo tiene su estado y
 * su reloj, y en una sola casilla no se sabe cuál es el que lleva tres semanas
 * parado en la DGT. Que es justo lo que hay que saber.
 *
 * Así que una tarjeta por coche y los papeleos dentro, cada uno con lo suyo.
 */

export interface PapeleoDeUnCoche {
  id: string;
  tipo: string;
  estado: string;
  gestoria?: string | null;
  vehiculo_titulo?: string | null;
  matricula?: string | null;
  bastidor?: string | null;
  lead_id?: string | null;
  pedido_id?: string | null;
  coste?: string | number | null;
  fecha_enviado?: string | null;
}

export interface CocheConPapeleos<T extends PapeleoDeUnCoche> {
  /** Con qué se agrupan: el expediente, el pedido, o el coche a secas. */
  clave: string;
  /** Cómo se llama en la tarjeta. */
  titulo: string;
  /** La matrícula o el bastidor, si los hay. */
  identifica: string;
  /** Quién los lleva, si todos son de la misma. */
  gestoria: string;
  papeleos: T[];
  /** Lo que suman, para no tener que abrirlos uno a uno. */
  coste: number;
  /** Cuántos días lleva fuera el que más, que es el que manda. */
  diasFuera: number | null;
}

const numero = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function dias(desde: unknown, hoy: Date): number | null {
  const s = String(desde ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((hoy.getTime() - d.getTime()) / 86400000));
}

/**
 * Agrupa por coche, respetando el orden en que venían.
 *
 * La clave es el expediente si lo hay, y si no el pedido; lo que no cuelga de
 * ninguno se queda solo, con su propia tarjeta. Un trámite suelto —una
 * transferencia de un coche de stock— no tiene por qué caber en un grupo, y
 * meterlo con calzador en el de otro coche sería peor que dejarlo aparte.
 */
export function papeleosPorCoche<T extends PapeleoDeUnCoche>(
  papeleos: T[],
  hoy: Date = new Date()
): CocheConPapeleos<T>[] {
  const grupos = new Map<string, CocheConPapeleos<T>>();

  for (const p of papeleos ?? []) {
    const clave = String(p.lead_id ?? '').trim()
      || String(p.pedido_id ?? '').trim()
      || `suelto:${p.id}`;

    let g = grupos.get(clave);
    if (!g) {
      g = {
        clave,
        titulo: String(p.vehiculo_titulo ?? '').trim() || 'Sin coche',
        identifica: String(p.matricula ?? '').trim() || String(p.bastidor ?? '').trim(),
        gestoria: String(p.gestoria ?? '').trim(),
        papeleos: [],
        coste: 0,
        diasFuera: null,
      };
      grupos.set(clave, g);
    }

    g.papeleos.push(p);
    g.coste += numero(p.coste);

    // La matrícula aparece cuando la dan, y puede venir en uno solo de los tres.
    if (!g.identifica) {
      g.identifica = String(p.matricula ?? '').trim() || String(p.bastidor ?? '').trim();
    }
    // Si no todos la llevan igual, no se dice ninguna: media verdad aquí es
    // decir que lo lleva quien no lo lleva.
    const suya = String(p.gestoria ?? '').trim();
    if (g.gestoria && suya !== g.gestoria) g.gestoria = '';

    const d = dias(p.fecha_enviado, hoy);
    if (d !== null && (g.diasFuera === null || d > g.diasFuera)) g.diasFuera = d;
  }

  return [...grupos.values()];
}

/** Cuántos de los suyos están todavía sin resolver. */
export function sinResolver(g: CocheConPapeleos<PapeleoDeUnCoche>): number {
  return g.papeleos.filter((p) => p.estado !== 'Resuelto').length;
}
