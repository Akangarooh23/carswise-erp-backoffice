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

import { desglosa, cuenta, comoSeCuenta as comoSeCuentaElDinero, type Regimen } from './dinero.js';

/** Si el dinero es de un tercero o es nuestro. */
export type QueEs = 'suplido' | 'nuestro';

export interface Partida {
  /** Cómo se llama. De la lista o escrita a mano. */
  concepto: string;
  /**
   * Lo que cuesta **con IVA**, tal cual llega: puede venir como texto.
   *
   * Es el número que pone la línea de la factura, y el que se paga. Se sigue
   * llamando `importe` porque es lo que hay escrito en cientos de partidas ya
   * guardadas, y renombrarlo las dejaría todas a cero.
   */
  importe?: string | number | null;
  /**
   * Y cómo se parte, cuando se sabe.
   *
   * `base` es lo que cuesta sin IVA e `iva` el tipo. Las dos pueden faltar:
   * una partida guardada antes de que esto existiera solo tiene su importe, y
   * suponerle un 21 % —a unas tasas que no lo llevan— daría una cifra
   * plausible y equivocada. Sin ellas, la partida cuenta entera como base y se
   * dice que está sin desglosar.
   */
  base?: string | number | null;
  iva?: string | number | null;
  /**
   * De dónde viene, que cambia quién paga el IVA.
   *
   * En una gestoría española casi todo es nacional, pero las tasas y el
   * impuesto son exentos: no llevan IVA ni dentro ni fuera.
   */
  regimen?: Regimen | null;
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
  /** Lo que factura en total, con IVA: lo que se paga. */
  total: number;
  /** Lo que es de terceros y solo pasa por nosotros. */
  suplidos: number;
  /** Lo suyo con IVA dentro, que es lo que sale de la cuenta. */
  honorarios: number;
  /** Y lo suyo **sin IVA**, que es lo que de verdad nos cuesta. */
  honorariosBase: number;
  /** El IVA de sus honorarios, que se deduce. */
  iva: number;
  /** Cuántas líneas no dicen cómo se parten. */
  sinDesglosar: number;
}

/**
 * La cuenta de un expediente de gestoría.
 *
 * `honorarios` y `honorariosBase` son dos preguntas distintas y las dos hacen
 * falta: lo primero es lo que sale del banco y lo segundo lo que cuesta el
 * coche, porque el IVA de los honorarios se deduce. Con una sola cifra, o el
 * pago o el margen salen mal.
 */
export function resumenDeLaGestoria(
  partidas: Partida[] | string | null | undefined
): ResumenDeLaGestoria {
  /*
   * Lo que llegue, tratado como lo que es.
   *
   * De Postgres viene un array, pero no siempre: una columna JSONB leída por
   * otro camino llega como texto, y una fila vieja puede traer null. Un
   * `.filter` sobre eso revienta la ficha entera del pedido, y un coste que no
   * se puede ver es peor que un coste a cero.
   */
  const crudas = typeof partidas === 'string'
    ? (() => { try { return JSON.parse(partidas) as Partida[]; } catch { return []; } })()
    : partidas;
  const lista = (Array.isArray(crudas) ? crudas : [])
    .filter((p) => p && String(p.concepto ?? '').trim());
  const c = cuenta(lista.map((p) => {
    const que = p.que ?? queEsPorDefecto(p.concepto);
    return {
    base: p.base,
    /*
     * Un suplido sin tipo escrito va al 0 %, y eso no es suponer nada.
     *
     * Una tasa de la DGT o el impuesto de matriculación no llevan IVA: si lo
     * llevaran no serían un suplido. Dejarlo «sin desglosar» diría que falta un
     * dato que no existe, y ensuciaría el aviso de las que sí faltan.
     */
    iva: p.iva ?? (que === 'suplido' ? 0 : undefined),
    total: p.importe,
    que,
    regimen: p.regimen ?? (que === 'suplido' ? 'exento' as const : 'nacional' as const),
    };
  }));
  const conIva = lista
    .filter((p) => (p.que ?? queEsPorDefecto(p.concepto)) !== 'suplido')
    .reduce((s, p) => s + desglosa({ base: p.base, iva: p.iva, total: p.importe, regimen: p.regimen }).total, 0);
  const redondea = (n: number) => Math.round(n * 100) / 100;
  return {
    cuantas: lista.length,
    total: c.pagado,
    suplidos: c.suplidos,
    honorarios: redondea(conIva),
    honorariosBase: c.nuestro,
    iva: c.ivaSoportado,
    sinDesglosar: c.sinDesglosar,
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
  return comoSeCuentaElDinero({
    nuestro: r.honorariosBase,
    suplidos: r.suplidos,
    ivaSoportado: r.iva,
    pagado: r.total,
    sinDesglosar: r.sinDesglosar,
  });
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

    /*
     * El concepto es lo de delante, sin los números de en medio.
     *
     * Una factura trae columnas entre el nombre y el total —base, IVA,
     * cantidad— y arrastrarlas dejaba partidas llamadas «Placas 16,5 0,21».
     * El nombre es lo que se lee en el tablero y lo que se reconoce para
     * saber si es suplido: con la basura detrás no se reconoce ninguna.
     */
    const concepto = trozos.slice(0, iImporte)
      .filter((x, i) => i === 0 || !esDinero(x))
      .join(' ')
      .replace(/[d.,]+$/, '')
      .trim();
    if (!concepto) { malas.push(linea); continue; }

    /*
     * Y si la factura trae base e IVA, se quedan.
     *
     * Una factura de gestoría suele venir «Concepto · base · %IVA · total».
     * Antes se tiraban las dos columnas de en medio y luego había que teclear
     * el desglose a mano, línea a línea, mirando el mismo papel del que se
     * acababa de copiar.
     *
     * Solo si cuadran: base por el tipo tiene que dar el total, al céntimo.
     * Si no cuadra, es que esas columnas eran otra cosa —una cantidad, un
     * código— y quedarse con ellas sería inventarse un desglose.
     */
    const que = queEsPorDefecto(concepto);
    const total = importeQueVale(trozos[iImporte]);
    const antes = trozos.slice(0, iImporte).filter(esDinero).map(importeQueVale);
    let base: number | null = null;
    let iva: number | null = null;
    for (const posibleBase of antes) {
      for (const tipo of [21, 10, 4, 0]) {
        if (Math.abs(posibleBase * (1 + tipo / 100) - total) <= 0.01) {
          base = posibleBase; iva = tipo; break;
        }
      }
      if (base !== null) break;
    }

    partidas.push({
      concepto,
      importe: total,
      ...(base !== null ? { base, iva } : {}),
      que,
      ...(que === 'suplido' ? { regimen: 'exento' as const } : {}),
    });
  }

  return { partidas, malas };
}
