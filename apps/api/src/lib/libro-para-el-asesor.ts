/**
 * Lo que necesita un asesor contable, y solo eso.
 *
 * El ERP **no lleva la contabilidad**. Los libros los lleva el asesor con su
 * programa, y hacerlos aquí también sería garantizar que las dos versiones
 * difieren y que un día hay que decidir cuál vale.
 *
 * Lo que sí hace falta es el puente, que hoy no existe: hoy alguien le manda un
 * correo con unos PDF y él teclea. Teclear es donde se pierde una factura y
 * donde un 890 € alemán entra con 154,46 € de IVA que nadie soportó.
 *
 * Así que esto contesta tres preguntas y las contesta con lo que hay guardado:
 *
 * 1. **Qué facturas hay** en un periodo, emitidas y recibidas, cada una con su
 *    base, su cuota y su régimen.
 * 2. **Cuánto IVA sale** de ahí: el repercutido, el soportado, y el
 *    intracomunitario aparte —que se repercute y se deduce a la vez, y en el
 *    modelo va en sus casillas propias—.
 * 3. **Qué no es IVA**: los suplidos, que van fuera de la base y son la
 *    distinción que más se equivoca cuando se teclea a mano.
 *
 * Y lo entrega en un fichero que se carga sin teclear nada.
 */

import { desglosa, importe, type Regimen, type QueEs } from './dinero.js';

/** Una factura, emitida o recibida, tal como la ve el asesor. */
export interface Apunte {
  /** El número que le puso quien la emitió. Es como la va a buscar. */
  numero: string;
  fecha: string;
  /** Emitida por nosotros o recibida de un proveedor. */
  sentido: 'emitida' | 'recibida';
  /** A quién o de quién. */
  contraparte: string;
  nif?: string | null;
  concepto?: string | null;
  /** El coche, que es como se agrupa todo aquí. */
  vehiculo?: string | null;
  base?: unknown;
  iva?: unknown;
  total?: unknown;
  regimen?: Regimen | null;
  que?: QueEs | null;
  /** Si todavía no ha llegado. Una esperada no es un apunte contable. */
  pendiente?: boolean;
}

export interface Resumen {
  /** El IVA de lo que hemos facturado. Se ingresa. */
  repercutido: number;
  /** El de lo que nos han facturado en España. Se deduce. */
  soportado: number;
  /**
   * El de las compras a la UE.
   *
   * Se repercute y se deduce a la vez, así que no mueve el resultado —pero va
   * en sus casillas y sin él no cuadra el modelo, ni sale el 349.
   */
  intracomunitario: number;
  /** Lo que hay que ingresar, o devolver si sale negativo. */
  aIngresar: number;
  /** Fuera de todo lo anterior: dinero de terceros. */
  suplidos: number;
  /** Cuántos apuntes no dicen su IVA, que es lo que hace falta arreglar. */
  sinDesglosar: number;
  /** Y cuántas facturas se esperan y no han llegado. */
  pendientes: number;
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/**
 * Si un apunte cuenta para el IVA de este trimestre.
 *
 * Una esperada no: es una factura que sabemos que va a llegar, y hasta que
 * llega no hay ni número ni fecha que declarar. Meterla deduciría un IVA de un
 * papel que no existe.
 */
export function cuentaEnElModelo(a: Apunte): boolean {
  return !a.pendiente && (a.que ?? 'nuestro') !== 'suplido';
}

/**
 * El resumen de un periodo.
 *
 * Los suplidos se cuentan aparte y a propósito: no son ni base ni cuota, y
 * meterlos en cualquiera de las dos es el error que hace que a una gestoría le
 * salga un IVA repercutido de las tasas de la DGT.
 */
export function resumeElPeriodo(apuntes: Apunte[] | null | undefined): Resumen {
  const r: Resumen = {
    repercutido: 0, soportado: 0, intracomunitario: 0,
    aIngresar: 0, suplidos: 0, sinDesglosar: 0, pendientes: 0,
  };

  for (const a of apuntes ?? []) {
    if (a.pendiente) { r.pendientes += 1; continue; }
    const d = desglosa({ base: a.base, iva: a.iva, total: a.total, regimen: a.regimen });

    if ((a.que ?? 'nuestro') === 'suplido') { r.suplidos += d.total; continue; }
    if (!d.desglosada && d.total > 0) r.sinDesglosar += 1;

    if (a.sentido === 'emitida') r.repercutido += d.cuota;
    else if ((a.regimen ?? 'nacional') === 'intracomunitario') r.intracomunitario += d.cuota;
    else r.soportado += d.cuota;
  }

  r.repercutido = redondo(r.repercutido);
  r.soportado = redondo(r.soportado);
  r.intracomunitario = redondo(r.intracomunitario);
  r.suplidos = redondo(r.suplidos);
  // El intracomunitario entra y sale: suma en las dos casillas y no mueve esto.
  r.aIngresar = redondo(r.repercutido - r.soportado);
  return r;
}

/**
 * Qué hay que arreglar antes de mandárselo.
 *
 * Un fichero con huecos le llega al asesor y vuelve en forma de correo
 * preguntando, dos días después. Es más barato decirlo aquí.
 */
export function queFaltaAntesDeMandarlo(r: Resumen): string[] {
  const falta: string[] = [];
  if (r.sinDesglosar > 0) {
    falta.push(r.sinDesglosar === 1
      ? 'una factura no dice su IVA'
      : `${r.sinDesglosar} facturas no dicen su IVA`);
  }
  if (r.pendientes > 0) {
    falta.push(r.pendientes === 1
      ? 'una factura esperada sin llegar'
      : `${r.pendientes} facturas esperadas sin llegar`);
  }
  return falta;
}

/** Cómo se llama cada trimestre, para no discutir de fechas. */
export function trimestreDe(fecha: string | Date): { anio: number; trimestre: number } | null {
  const d = fecha instanceof Date ? fecha : new Date(String(fecha ?? ''));
  if (Number.isNaN(d.getTime())) return null;
  return { anio: d.getFullYear(), trimestre: Math.floor(d.getMonth() / 3) + 1 };
}

/** El primer y el último día de un trimestre, para pedir el periodo. */
export function delTrimestre(anio: number, trimestre: number): { desde: string; hasta: string } {
  const t = Math.min(4, Math.max(1, Math.round(trimestre) || 1));
  const mes = (t - 1) * 3;
  const dosCifras = (n: number) => String(n).padStart(2, '0');
  const ultimo = new Date(Date.UTC(anio, mes + 3, 0)).getUTCDate();
  return {
    desde: `${anio}-${dosCifras(mes + 1)}-01`,
    hasta: `${anio}-${dosCifras(mes + 3)}-${dosCifras(ultimo)}`,
  };
}

/*
 * ── El fichero ────────────────────────────────────────────────────────────
 *
 * CSV con punto y coma, que es lo que abre un Excel español sin preguntar
 * nada, y los decimales con coma por lo mismo. Un fichero que hay que
 * configurar al abrirlo se abre mal una de cada tres veces.
 */

const CABECERA = [
  'Fecha', 'Sentido', 'Numero', 'Contraparte', 'NIF', 'Concepto', 'Vehiculo',
  'Base', 'TipoIVA', 'Cuota', 'Total', 'Regimen', 'Que',
];

function celda(v: unknown): string {
  const s = String(v ?? '');
  // El punto y coma y las comillas dentro de una celda parten la fila.
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const conComa = (n: number) => n.toFixed(2).replace('.', ',');

/**
 * Los apuntes, en un fichero que se carga sin teclear.
 *
 * Van **todos**, también los suplidos y los que no dicen su IVA: el asesor
 * tiene que ver lo que hay, no una versión limpia de lo que hay. Lo que sí van
 * es marcados, para que sepa cuáles mirar.
 *
 * Las esperadas se quedan fuera: no son un apunte contable todavía, y una
 * factura sin número ni fecha en un libro es un problema, no un aviso.
 */
export function comoFichero(apuntes: Apunte[] | null | undefined): string {
  const filas = [CABECERA.join(';')];
  for (const a of apuntes ?? []) {
    if (a.pendiente) continue;
    const d = desglosa({ base: a.base, iva: a.iva, total: a.total, regimen: a.regimen });
    filas.push([
      celda(String(a.fecha ?? '').slice(0, 10)),
      celda(a.sentido),
      celda(a.numero),
      celda(a.contraparte),
      celda(a.nif),
      celda(a.concepto),
      celda(a.vehiculo),
      conComa(d.base),
      d.tipo === null ? '' : String(d.tipo),
      conComa(d.cuota),
      conComa(d.total),
      celda(a.regimen ?? 'nacional'),
      celda(a.que ?? 'nuestro'),
    ].join(';'));
  }
  return filas.join('\r\n');
}

/** Cómo se llama el fichero, para que no acaben cuatro «export.csv» en una carpeta. */
export function comoSeLlamaElFichero(anio: number, trimestre: number): string {
  return `popcar-${anio}-T${Math.min(4, Math.max(1, Math.round(trimestre) || 1))}.csv`;
}

/** Lo que vale `importe` para quien solo quiere el número. */
export { importe };
