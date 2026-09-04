/**
 * Una línea de dinero, con su base y su IVA.
 *
 * Hasta ahora cada importe era **un número suelto**: el coste de un transporte,
 * el importe de una partida, el total de una factura. Y un número suelto no
 * dice lo que hace falta saber de él.
 *
 * Una factura española de 890 € y una alemana de 890 € no son lo mismo: la
 * española lleva 154,55 € de IVA deducible dentro y la alemana viene sin IVA,
 * con la cuota autoliquidada aquí. Guardadas como «890» parecen iguales, y con
 * ellas el coste de un coche sale más alto de lo que es —el IVA soportado se
 * deduce: no es coste, es un préstamo a Hacienda— y el margen sale peor.
 *
 * Dos campos hacen el trabajo:
 *
 * - **`que`**: si es nuestro o es un suplido. Un suplido es dinero de terceros
 *   que solo pasa por nosotros: no entra en nuestra base de IVA ni en nuestro
 *   coste. Ya estaba en las partidas de la gestoría; aquí sube al resto.
 * - **`regimen`**: de dónde viene. Es lo que distingue las dos facturas de 890 €
 *   de arriba, y lo que hay que poder contestar el día que alguien pregunte.
 *
 * Y una cosa que **no** se hace: suponer el IVA de lo que ya está guardado.
 * Un importe sin desglosar se queda sin desglosar y se dice; poner un 21 %
 * encima de 253 € de gestoría —que son casi todo tasas sin IVA— es meter un
 * error donde había un hueco honesto.
 */

/** Lo que es cada euro: nuestro, o de un tercero pasando por nosotros. */
export type QueEs = 'nuestro' | 'suplido';

/**
 * De dónde viene, que cambia quién paga el IVA.
 *
 * - `nacional`: factura española con su IVA dentro, deducible.
 * - `intracomunitario`: proveedor de la UE con ROI. Factura sin IVA y la cuota
 *   se autoliquida aquí; entra y sale, así que el coste es la base.
 * - `exento`: sin IVA y sin autoliquidar. Una tasa de la DGT, un impuesto.
 */
export type Regimen = 'nacional' | 'intracomunitario' | 'exento';

export const IVA_GENERAL = 21;

/** Los tipos que existen. Un 15 % tecleado a mano es una errata. */
export const TIPOS_DE_IVA = [0, 4, 10, 21] as const;

export interface LineaDeDinero {
  /** Lo que cuesta sin IVA. */
  base?: unknown;
  /** El tipo, en tanto por ciento. Nulo o vacío = todavía no se sabe. */
  iva?: unknown;
  /** Base más cuota. Es lo que pone el total de la factura. */
  total?: unknown;
  que?: QueEs | null;
  regimen?: Regimen | null;
}

export interface Desglose {
  base: number;
  /** El tipo, o null si no se sabe. */
  tipo: number | null;
  cuota: number;
  total: number;
  /**
   * Si se sabe de verdad cómo se parte.
   *
   * Falso cuando solo hay un número: entonces base y total valen lo mismo, que
   * es lo único honesto que se puede decir, pero no es un desglose.
   */
  desglosada: boolean;
}

/**
 * Un importe, venga como venga.
 *
 * De Postgres llega como texto, de un Excel pegado con puntos de millar y coma
 * decimal, y a veces con el euro detrás. «1.420,00 €» son mil cuatrocientos
 * veinte, no uno con cuatro.
 */
export function importe(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const limpio = s
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/** El tipo de IVA, si es uno de los que existen. */
export function tipoDeIva(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.').replace('%', ''));
  if (!Number.isFinite(n)) return null;
  return (TIPOS_DE_IVA as readonly number[]).includes(n) ? n : null;
}

/**
 * Cómo se parte una línea, que depende del régimen.
 *
 * No es lo mismo el IVA que va **dentro** del total que el que se autoliquida
 * fuera de él, y confundirlos deja el coste mal en las dos direcciones:
 *
 * - **Nacional**: la factura trae el IVA dentro. 890 € al 21 % son 735,54 de
 *   base y 154,46 de cuota deducible.
 * - **Intracomunitario**: la factura viene **sin IVA**, así que su total ya es
 *   la base. La cuota se autoliquida aquí —se repercute y se deduce a la vez,
 *   así que entra y sale— y no forma parte de lo que se paga. Dividir esos
 *   890 € entre 1,21 sería inventarse un IVA que la factura no tiene y decir
 *   que el transporte costó 735,54 cuando costó 890.
 * - **Exento**: ni dentro ni fuera. Una tasa de la DGT o un impuesto.
 *
 * Y con un número a secas se dice que no está desglosada, en vez de
 * inventarle un tipo. La cuota se calcula, nunca se teclea: una cuota escrita
 * a mano que no cuadre con su base es lo que hace que un trimestre no cierre
 * por catorce céntimos.
 */
export function desglosa(l: LineaDeDinero): Desglose {
  const tipo = tipoDeIva(l.iva);
  const regimen: Regimen = l.regimen ?? 'nacional';
  const base = importe(l.base);
  const total = importe(l.total);

  if (regimen !== 'nacional') {
    // El total es la base: la factura no lleva IVA dentro.
    const suyo = redondo(base || total);
    const cuota = regimen === 'intracomunitario' && tipo !== null
      ? redondo(suyo * tipo / 100)  // autoliquidada: se repercute y se deduce
      : 0;
    return { base: suyo, tipo, cuota, total: suyo, desglosada: tipo !== null };
  }

  if (tipo !== null && base > 0) {
    const cuota = redondo(base * tipo / 100);
    return { base: redondo(base), tipo, cuota, total: redondo(base + cuota), desglosada: true };
  }
  if (tipo !== null && total > 0) {
    const suBase = redondo(total / (1 + tipo / 100));
    return { base: suBase, tipo, cuota: redondo(total - suBase), total: redondo(total), desglosada: true };
  }
  // Un número y nada más: es lo que hay, y se dice que no está desglosado.
  const solo = redondo(base || total);
  return { base: solo, tipo, cuota: 0, total: solo, desglosada: false };
}
/**
 * Lo que de verdad nos cuesta una línea.
 *
 * **La base, siempre.** El IVA soportado de una factura española se deduce, así
 * que no es coste; el de una intracomunitaria se autoliquida y entra y sale; y
 * una tasa exenta no tiene ninguno, así que su base es su total. Los tres casos
 * dan lo mismo: la base.
 *
 * Y un suplido no cuesta nada: es dinero del cliente que pasa por nuestra
 * cuenta. Contarlo como coste nuestro infla el coche y hunde el margen.
 */
export function loQueNosCuesta(l: LineaDeDinero): number {
  if ((l.que ?? 'nuestro') === 'suplido') return 0;
  return desglosa(l).base;
}

/** Y lo que sale de la cuenta, que es otra pregunta: el total, sea de quien sea. */
export function loQueSePaga(l: LineaDeDinero): number {
  return desglosa(l).total;
}

/**
 * Si los tres números se contradicen.
 *
 * Solo cuando están los tres: con base, tipo y total escritos, la cuenta tiene
 * que salir. Se avisa al teclearlo, que es cuando alguien puede mirar la
 * factura y corregirlo, y no en el cierre del trimestre.
 *
 * Con un céntimo de margen: una factura con diez líneas redondeadas no cuadra
 * al céntimo y eso no es un error.
 */
export function noCuadra(l: LineaDeDinero): string | null {
  const tipo = tipoDeIva(l.iva);
  const base = importe(l.base);
  const total = importe(l.total);
  if (tipo === null || base <= 0 || total <= 0) return null;
  // Fuera de lo nacional el IVA no va dentro del total, así que base y total
  // valen lo mismo y no hay nada que cuadrar.
  if ((l.regimen ?? 'nacional') !== 'nacional') {
    return Math.abs(base - total) <= 0.01 ? null
      : `Sin IVA dentro, la base y el total tendrían que ser iguales: ponen `
        + `${base.toLocaleString('es-ES')} € y ${total.toLocaleString('es-ES')} €.`;
  }
  const deberia = redondo(base * (1 + tipo / 100));
  if (Math.abs(deberia - total) <= 0.01) return null;
  return `Con ${base.toLocaleString('es-ES')} € de base al ${tipo} %, el total sería `
    + `${deberia.toLocaleString('es-ES')} € y pone ${total.toLocaleString('es-ES')} €.`;
}

/**
 * El IVA que le toca por defecto a un concepto.
 *
 * Un suplido no lleva: una tasa de la DGT o el impuesto de matriculación son
 * dinero público, no un servicio que nadie nos venda. Lo nuestro lleva el
 * general. Es un punto de partida para no teclear el 21 en cada línea, no una
 * afirmación: se puede cambiar, y hay conceptos al 10 y al 4.
 */
export function ivaPorDefecto(que: QueEs | null | undefined): number {
  return que === 'suplido' ? 0 : IVA_GENERAL;
}

/**
 * Y el régimen por defecto, que depende de dónde esté el proveedor.
 *
 * Lo decide el país, no el concepto: un transporte de una empresa alemana con
 * ROI viene sin IVA y se autoliquida aquí; el mismo transporte de una española
 * lleva su 21 % deducible. Sin país conocido, nacional: es lo que más hay, y
 * equivocarse hacia ahí se ve en la factura.
 */
export function regimenPorDefecto(paisONif?: string | null): Regimen {
  const s = String(paisONif ?? '').trim().toUpperCase();
  if (!s) return 'nacional';
  if (/^(ES|B|A|J|N)/.test(s) && !/^(DE|FR|IT|PT|NL|BE|AT|PL|CZ)/.test(s)) return 'nacional';
  return /^(DE|FR|IT|PT|NL|BE|AT|PL|CZ|SK|HU|RO|SE|DK|FI|IE|LU|GR|BG|HR|SI|EE|LV|LT|MT|CY)/.test(s)
    ? 'intracomunitario'
    : 'nacional';
}

export interface Cuenta {
  /** Lo que nos cuesta de verdad: la base de lo nuestro. */
  nuestro: number;
  /** Lo que pasa por nosotros y no es nuestro. */
  suplidos: number;
  /** El IVA soportado de lo nuestro, que se deduce. */
  ivaSoportado: number;
  /** Todo lo que sale de la cuenta. */
  pagado: number;
  /** Cuántas líneas no se sabe cómo se parten. */
  sinDesglosar: number;
}

/**
 * La cuenta de un montón de líneas.
 *
 * `sinDesglosar` viaja pegado al resto a propósito: un coste de 1.677 € con seis
 * líneas sin IVA conocido no es un coste de 1.677 €, es una estimación, y quien
 * lo mira tiene que saberlo sin ir a buscarlo.
 */
export function cuenta(lineas: LineaDeDinero[] | null | undefined): Cuenta {
  const r: Cuenta = { nuestro: 0, suplidos: 0, ivaSoportado: 0, pagado: 0, sinDesglosar: 0 };
  for (const l of lineas ?? []) {
    const d = desglosa(l);
    const esSuplido = (l.que ?? 'nuestro') === 'suplido';
    if (esSuplido) r.suplidos += d.total;
    else {
      r.nuestro += d.base;
      // El intracomunitario se autoliquida: entra y sale, y no se soporta nada.
      if ((l.regimen ?? 'nacional') === 'nacional') r.ivaSoportado += d.cuota;
    }
    r.pagado += d.total;
    if (!d.desglosada && d.total > 0) r.sinDesglosar += 1;
  }
  return {
    nuestro: redondo(r.nuestro),
    suplidos: redondo(r.suplidos),
    ivaSoportado: redondo(r.ivaSoportado),
    pagado: redondo(r.pagado),
    sinDesglosar: r.sinDesglosar,
  };
}

/**
 * Cómo se cuenta, dicho para quien lo mira.
 *
 * Sin esta frase, un total en la ficha de un coche parece coste nuestro y no lo
 * es. Y una cifra con líneas sin desglosar parece exacta.
 */
export function comoSeCuenta(c: Cuenta): string {
  const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const partes: string[] = [];
  partes.push(`${eur(c.nuestro)} de coste nuestro`);
  if (c.ivaSoportado > 0) partes.push(`${eur(c.ivaSoportado)} de IVA que se deduce`);
  if (c.suplidos > 0) partes.push(`${eur(c.suplidos)} de suplidos, que son del cliente`);
  const frase = partes.join(', ') + '.';
  return c.sinDesglosar > 0
    ? `${frase} ${c.sinDesglosar === 1 ? 'Una línea no dice' : `${c.sinDesglosar} líneas no dicen`} su IVA: hasta que se ponga, cuenta entera como base.`
    : frase;
}
