/**
 * Lo que cobra una gestoría, trámite a trámite.
 *
 * Es la otra mitad de lo que cuesta un coche además del transporte, y hasta hoy
 * era un número suelto dentro de la fórmula que puntúa las ofertas: 400 € para
 * todos, sin que nadie supiera de qué.
 *
 * Una factura de gestoría tiene **tres partes que no se comportan igual**:
 *
 * - Los **honorarios**, que es lo que cobra por el trabajo. Llevan IVA.
 * - Las **tasas** públicas —la DGT—, que no son suyas: las adelanta y las
 *   repercute tal cual. No llevan IVA, son un suplido.
 * - La **tasa del colegio** de gestores, que va aparte en su tarifa.
 *
 * Meterlas en un solo número parece más simple y luego no cuadra: al aplicar el
 * 21 % sobre el total se paga IVA de unas tasas que no lo llevan, y el coste del
 * coche sale más alto de lo que es. Por eso se guardan separadas.
 */

export const IVA = 0.21;

export interface TarifaGestoria {
  id: string;
  proveedor_id: string;
  proveedor?: string;
  /** El trámite tal y como lo llama el ERP, para poder casarlo con el expediente. */
  tramite: string;
  honorarios: number | null;
  tasas: number | null;
  tasa_colegio: number | null;
  /**
   * Si la tasa del colegio lleva IVA.
   *
   * No lo doy por sabido: en unas gestorías va como suplido y en otras como
   * parte de sus honorarios. Se pregunta y se marca, en vez de suponerlo.
   */
  colegio_con_iva?: boolean;
  vigente_hasta?: string | null;
  notas?: string;
}

/**
 * Lo que se paga de verdad por ese trámite.
 *
 * El IVA solo sobre los honorarios. Las tasas van tal cual: son dinero de la
 * DGT que la gestoría adelanta, no un servicio que nos venda.
 */
export function costeDelTramite(t: TarifaGestoria): number {
  const honorarios = Number(t.honorarios ?? 0);
  const tasas = Number(t.tasas ?? 0);
  const colegio = Number(t.tasa_colegio ?? 0);
  const conIva = honorarios * (1 + IVA) + (t.colegio_con_iva ? colegio * (1 + IVA) : colegio);
  return Math.round((conIva + tasas) * 100) / 100;
}

/** Lo mismo desglosado, que es como hay que enseñárselo a quien lo pague. */
export interface Desglose {
  honorarios: number;
  iva: number;
  tasas: number;
  colegio: number;
  total: number;
}

export function desglosaTramite(t: TarifaGestoria): Desglose {
  const honorarios = Number(t.honorarios ?? 0);
  const tasas = Number(t.tasas ?? 0);
  const colegio = Number(t.tasa_colegio ?? 0);
  const baseIva = honorarios + (t.colegio_con_iva ? colegio : 0);
  const redondea = (n: number) => Math.round(n * 100) / 100;
  return {
    honorarios: redondea(honorarios),
    iva: redondea(baseIva * IVA),
    tasas: redondea(tasas),
    colegio: redondea(colegio),
    total: costeDelTramite(t),
  };
}

/** El mismo trámite escrito de otra forma sigue siendo el mismo trámite. */
export function tramiteComparable(tramite: string): string {
  return (tramite ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lo que costaría el papeleo de un coche, según los trámites que le tocan.
 *
 * Los trámites los decide el ERP —de dónde viene el coche y a nombre de quién
 * va—, y aquí solo se les pone precio. Por eso **dos cambios de nombre cuestan
 * el doble**: no hay que multiplicar nada a mano, es que la lista trae la
 * transferencia dos veces.
 *
 * Lo que no tiene tarifa **no se estima a ojo**: sale aparte, por su nombre. Un
 * coste incompleto que parece completo es lo que hace que un coche salga barato
 * en pantalla y caro en la cuenta.
 */
export interface CosteDelPapeleo {
  total: number;
  lineas: { tramite: string; coste: number }[];
  /** Los que no tienen tarifa de esta gestoría. */
  sinTarifa: string[];
}

export function loQueCuestaElPapeleo(
  tramites: string[],
  tarifas: TarifaGestoria[]
): CosteDelPapeleo {
  const porNombre = new Map<string, TarifaGestoria>();
  for (const t of tarifas) {
    const k = tramiteComparable(t.tramite);
    // Con dos tarifas del mismo trámite, la más barata: es la que pediríamos.
    const previa = porNombre.get(k);
    if (!previa || costeDelTramite(t) < costeDelTramite(previa)) porNombre.set(k, t);
  }

  const lineas: { tramite: string; coste: number }[] = [];
  const sinTarifa: string[] = [];

  for (const nombre of tramites) {
    const tarifa = porNombre.get(tramiteComparable(nombre));
    if (!tarifa) { sinTarifa.push(nombre); continue; }
    lineas.push({ tramite: nombre, coste: costeDelTramite(tarifa) });
  }

  const total = Math.round(lineas.reduce((s, l) => s + l.coste, 0) * 100) / 100;
  return { total, lineas, sinTarifa };
}
