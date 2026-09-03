/**
 * Lo que factura la gestoría, partida a partida.
 *
 * Un solo número no vale, y no es un detalle contable: de lo que te cobra una
 * gestoría por matricular un coche de fuera, la mayor parte **no es suya**. El
 * impuesto de matriculación es de Hacienda, la tasa es de la DGT y la ITV es de
 * la estación; todo eso pasa por sus manos a nombre del cliente. Lo suyo son
 * los honorarios, y son la parte pequeña.
 *
 * Metido todo en un `coste` de 1.754 €, ese número entra en lo que cuesta el
 * coche como si fuera gasto nuestro. No lo es: 1.664 € son dinero de terceros,
 * y el margen del coche sale mal por esa diferencia. La columna que dice si es
 * **suplido o nuestro** es la que hace que la cuenta sea verdad.
 *
 * Y hay una segunda razón, fiscal: un suplido va fuera de la base del IVA y se
 * repercute tal cual; los honorarios llevan su 21%. Sumarlos en una sola cifra
 * es perder la única distinción que Hacienda mira.
 */

/** Si el dinero es de un tercero o es nuestro. */
export type QueEs = 'suplido' | 'nuestro';

export interface Partida {
  /** Cómo se llama. De la lista o escrita a mano. */
  concepto: string;
  /** Lo que cuesta, tal cual llega: puede venir como texto de Postgres. */
  importe?: string | number | null;
  /**
   * De quién es ese dinero.
   *
   * Por defecto **suplido**, que es lo que más hay y lo que más duele
   * equivocarse: un suplido contado como nuestro infla el coste del coche.
   */
  que?: QueEs;
}

/**
 * Las que salen casi siempre, para no escribirlas cada vez.
 *
 * Con lo que es cada una: el que las rellena no tiene por qué saber de suplidos,
 * y equivocarse aquí es equivocarse en el margen de todos los coches.
 */
export const PARTIDAS_HABITUALES: { concepto: string; que: QueEs }[] = [
  { concepto: 'Impuesto de matriculación', que: 'suplido' },
  { concepto: 'Tasa DGT', que: 'suplido' },
  { concepto: 'ITV de homologación', que: 'suplido' },
  { concepto: 'Ficha técnica reducida', que: 'suplido' },
  { concepto: 'Placas de matrícula', que: 'suplido' },
  { concepto: 'Impuesto de transmisiones', que: 'suplido' },
  { concepto: 'Transferencia en la DGT', que: 'suplido' },
  { concepto: 'Honorarios de la gestoría', que: 'nuestro' },
];

/** Lo que se sabe de una partida por su nombre, si es de las habituales. */
export function queEsPorDefecto(concepto: string): QueEs {
  const limpio = String(concepto ?? '').trim().toLowerCase();
  const conocida = PARTIDAS_HABITUALES.find((p) => p.concepto.toLowerCase() === limpio);
  if (conocida) return conocida.que;
  // Honorarios, minuta, gestión: lo que suena a su trabajo es suyo.
  return /honorario|minuta|gesti[oó]n|tramitaci[oó]n|servicio/i.test(limpio) ? 'nuestro' : 'suplido';
}

/**
 * Lo que vale una partida, venga como venga.
 *
 * De Postgres llega como texto, de un Excel pegado llega con puntos de millar y
 * coma decimal, y a veces con el euro detrás. «1.420,00 €» son mil cuatrocientos
 * veinte, no uno con cuatro.
 */
export function importeQueVale(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const limpio = s
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

export interface ResumenDeLaGestoria {
  /** Cuántas partidas hay. */
  cuantas: number;
  /** Lo que factura en total. */
  total: number;
  /** Lo que es de terceros y solo pasa por nosotros. */
  suplidos: number;
  /** Lo suyo, que es lo que de verdad nos cuesta el servicio. */
  honorarios: number;
}

export function resumenDeLaGestoria(partidas: Partida[] | null | undefined): ResumenDeLaGestoria {
  const lista = (partidas ?? []).filter((p) => p && String(p.concepto ?? '').trim());
  let suplidos = 0;
  let honorarios = 0;
  for (const p of lista) {
    const cuanto = importeQueVale(p.importe);
    if ((p.que ?? queEsPorDefecto(p.concepto)) === 'nuestro') honorarios += cuanto;
    else suplidos += cuanto;
  }
  // Con dos decimales: sumar céntimos en coma flotante deja 1754.7700000000002,
  // y eso acaba impreso en una pantalla.
  const redondo = (n: number) => Math.round(n * 100) / 100;
  return {
    cuantas: lista.length,
    total: redondo(suplidos + honorarios),
    suplidos: redondo(suplidos),
    honorarios: redondo(honorarios),
  };
}

/**
 * Cómo se cuenta, dicho para quien lo mira.
 *
 * Sin esta frase, un total de 1.754,77 € en la ficha de un coche parece coste
 * nuestro, y no lo es.
 */
export function comoSeCuenta(r: ResumenDeLaGestoria): string {
  if (!r.cuantas) return 'Sin partidas todavía.';
  const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!r.suplidos) return `${eur(r.total)} €, todo honorarios.`;
  if (!r.honorarios) return `${eur(r.total)} €, todo suplidos: dinero de terceros que solo pasa por nosotros.`;
  return `${eur(r.total)} €, de los que ${eur(r.suplidos)} € son suplidos —dinero de terceros— y ${eur(r.honorarios)} € honorarios de la gestoría.`;
}

/**
 * Lo pegado de una hoja de cálculo.
 *
 * La factura de una gestoría llega en PDF o en Excel, y volver a teclear ocho
 * líneas es donde se cuela un cero. Se acepta tabulador, punto y coma o dos o
 * más espacios como separador, que es lo que sale al copiar de cualquier hoja.
 *
 * El importe es **la última columna que parece dinero**: las facturas traen
 * columnas de por medio —código, base, IVA— y la que importa suele ser la
 * última. Y las líneas de cabecera o de total se descartan: un «TOTAL 1.754,77»
 * metido como partida duplica la factura.
 */
export function leeLoPegado(texto: string): { partidas: Partida[]; malas: string[] } {
  const partidas: Partida[] = [];
  const malas: string[] = [];

  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (/^(total|suma|base|iva|importe|concepto|descripci|n[ºo°]|factura)\b/i.test(linea)) continue;

    const trozos = linea.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (trozos.length < 2) { malas.push(linea); continue; }

    const esDinero = (x: string) => /^-?[\d.,]+\s*€?$/.test(x) && /\d/.test(x);
    let iImporte = -1;
    for (let i = trozos.length - 1; i >= 1; i -= 1) {
      if (esDinero(trozos[i])) { iImporte = i; break; }
    }
    if (iImporte < 0) { malas.push(linea); continue; }

    const concepto = trozos.slice(0, iImporte).join(' ').trim();
    if (!concepto) { malas.push(linea); continue; }

    partidas.push({
      concepto,
      importe: importeQueVale(trozos[iImporte]),
      que: queEsPorDefecto(concepto),
    });
  }

  return { partidas, malas };
}
