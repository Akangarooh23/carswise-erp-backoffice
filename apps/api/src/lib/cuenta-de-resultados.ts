/**
 * Lo que se ha ganado y lo que se ha gastado, dicho sin trampa.
 *
 * Tres cosas que parecen ingreso y no lo son, y las tres estaban sumadas en el
 * primer número que uno se inventa:
 *
 * 1. **El IVA no es nuestro.** Una factura de 3.630 € son 3.000 € de ingreso y
 *    630 € que hay que ingresar en Hacienda. Contar el total infla el negocio
 *    un 21 % y hace que el margen parezca sano cuando no lo está.
 * 2. **Un suplido tampoco.** Los 16.890 € del coche y los 1.420 € del impuesto
 *    pasan por la cuenta y salen. Sumarlos convierte una operación de 3.000 €
 *    en una de 21.500 € y no hemos ganado un euro más.
 * 3. **Una factura esperada no ha pasado.** Se sabe que va a llegar y cuánto,
 *    pero mientras no llega no hay gasto que deducir. Va aparte, dicho como lo
 *    que es: comprometido.
 *
 * El resultado se cuenta siempre en **bases**: la base de lo emitido menos la
 * base de lo recibido. Es la única resta en la que los dos lados miden lo
 * mismo.
 */

import { desglosa, laAutorepercusion } from './dinero.js';
import type { Apunte } from './libro-para-el-asesor.js';
import {
  NOMBRE_DEL_INGRESO, NOMBRE_DEL_GASTO, ORDEN_DE_INGRESOS, ORDEN_DE_GASTOS,
  type LineaDeIngreso, type LineaDeGasto,
} from './lineas-de-negocio.js';

const redondo = (n: number) => Math.round(n * 100) / 100;

/** Un apunte ya clasificado, que es como llega desde la base. */
export interface ApunteConLinea extends Apunte {
  linea?: LineaDeIngreso | LineaDeGasto | null;
}

/** Una línea del desglose, tal como se pinta. */
export interface Trozo {
  clave: string;
  nombre: string;
  /** Sin IVA. Es lo que se compara con las demás. */
  base: number;
  /** Cuántas facturas hay detrás, para poder ir a mirarlas. */
  n: number;
  /** Qué parte del total es, de 0 a 100. */
  porcentaje: number;
}

export interface Mes {
  /** `2026-09`. Se ordena solo y no depende del idioma. */
  mes: string;
  ingresos: number;
  gastos: number;
  margen: number;
}

export interface Resultado {
  ingresos: number;
  gastos: number;
  margen: number;
  /** Sobre los ingresos. Null cuando no hay ingresos: no es 0 %, es que no hay. */
  margenPorcentaje: number | null;
  porLinea: Trozo[];
  porConcepto: Trozo[];
  /** Dinero de terceros que pasa por la cuenta. Ni ingreso ni gasto. */
  suplidos: number;
  /** Gasto que ya está comprometido y cuya factura no ha llegado. */
  comprometido: number;
  comprometidoN: number;
  /** Facturas que no dicen su IVA: el número de arriba es aproximado. */
  sinDesglosar: number;
  /**
   * Y facturas de la UE sin decidir a qué tipo se autorepercuten.
   *
   * No mueve el margen —lo que se autorepercute se deduce a la vez— pero sí
   * el 349 y el modelo del trimestre, y el sitio donde alguien lo va a ver es
   * este.
   */
  sinAutorepercusion: number;
}

/** Si un apunte suma en la cuenta de resultados. */
function cuenta(a: ApunteConLinea): boolean {
  return !a.pendiente && (a.que ?? 'nuestro') !== 'suplido';
}

function trozos<C extends string>(
  suma: Map<string, { base: number; n: number }>,
  orden: readonly C[],
  nombres: Record<C, string>,
  total: number
): Trozo[] {
  const salida: Trozo[] = [];
  for (const clave of orden) {
    const v = suma.get(clave);
    if (!v || (v.base === 0 && v.n === 0)) continue;
    salida.push({
      clave,
      nombre: nombres[clave],
      base: redondo(v.base),
      n: v.n,
      // Un porcentaje sobre cero no es cero, es que no hay de qué.
      porcentaje: total > 0 ? redondo((v.base / total) * 100) : 0,
    });
  }
  return salida;
}

/**
 * La cuenta de un periodo.
 *
 * Los suplidos y las esperadas salen del total y se dicen aparte, cada uno con
 * su nombre. Sin ese aparte, quien lo mira no tiene forma de saber que el
 * número de arriba deja cosas fuera —y las deja a propósito—.
 */
export function cuentaDeResultados(apuntes: readonly ApunteConLinea[] | null | undefined): Resultado {
  const porLinea = new Map<string, { base: number; n: number }>();
  const porConcepto = new Map<string, { base: number; n: number }>();
  let ingresos = 0, gastos = 0, suplidos = 0, comprometido = 0, comprometidoN = 0;
  let sinDesglosar = 0, sinAutorepercusion = 0;

  for (const a of apuntes ?? []) {
    const d = desglosa({ base: a.base, iva: a.iva, cuota: a.cuota, total: a.total, regimen: a.regimen });

    if (a.pendiente) {
      // Solo el gasto comprometido: una factura nuestra sin emitir no existe.
      if (a.sentido === 'recibida') { comprometido += d.total; comprometidoN += 1; }
      continue;
    }
    if (!cuenta(a)) { suplidos += d.total; continue; }
    if (!d.desglosada && d.total > 0) sinDesglosar += 1;
    if (laAutorepercusion({
      base: a.base, iva: a.iva, total: a.total,
      regimen: a.regimen, autorepercusion: a.autorepercusion,
    }).hayQueDecidirlo) sinAutorepercusion += 1;

    const clave = String(a.linea ?? 'otros');
    const donde = a.sentido === 'emitida' ? porLinea : porConcepto;
    const v = donde.get(clave) ?? { base: 0, n: 0 };
    v.base += d.base;
    v.n += 1;
    donde.set(clave, v);

    if (a.sentido === 'emitida') ingresos += d.base;
    else gastos += d.base;
  }

  ingresos = redondo(ingresos);
  gastos = redondo(gastos);
  const margen = redondo(ingresos - gastos);

  return {
    ingresos,
    gastos,
    margen,
    margenPorcentaje: ingresos > 0 ? redondo((margen / ingresos) * 100) : null,
    porLinea:    trozos(porLinea,    ORDEN_DE_INGRESOS, NOMBRE_DEL_INGRESO, ingresos),
    porConcepto: trozos(porConcepto, ORDEN_DE_GASTOS,   NOMBRE_DEL_GASTO,   gastos),
    suplidos: redondo(suplidos),
    comprometido: redondo(comprometido),
    comprometidoN,
    sinDesglosar,
    sinAutorepercusion,
  };
}

/**
 * Mes a mes, para poder ver la forma en vez de un número suelto.
 *
 * Se devuelven **todos** los meses del tramo, también los que no tienen nada.
 * Un gráfico que salta de julio a septiembre porque agosto estuvo vacío miente
 * sobre la pendiente, que es justo lo que se va a mirar.
 */
export function mesAMes(
  apuntes: readonly ApunteConLinea[] | null | undefined,
  desde: string,
  hasta: string
): Mes[] {
  const suma = new Map<string, { ingresos: number; gastos: number }>();

  for (const a of apuntes ?? []) {
    if (!cuenta(a)) continue;
    const mes = String(a.fecha ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const d = desglosa({ base: a.base, iva: a.iva, cuota: a.cuota, total: a.total, regimen: a.regimen });
    const v = suma.get(mes) ?? { ingresos: 0, gastos: 0 };
    if (a.sentido === 'emitida') v.ingresos += d.base;
    else v.gastos += d.base;
    suma.set(mes, v);
  }

  const salida: Mes[] = [];
  for (const mes of losMeses(desde, hasta)) {
    const v = suma.get(mes) ?? { ingresos: 0, gastos: 0 };
    const ingresos = redondo(v.ingresos);
    const gastos = redondo(v.gastos);
    salida.push({ mes, ingresos, gastos, margen: redondo(ingresos - gastos) });
  }
  return salida;
}

/** Los meses de un tramo, `2026-01` … `2026-09`, ambos dentro. */
export function losMeses(desde: string, hasta: string): string[] {
  const a = String(desde ?? '').slice(0, 7);
  const b = String(hasta ?? '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(a) || !/^\d{4}-\d{2}$/.test(b) || b < a) return [];

  const salida: string[] = [];
  let anio = Number(a.slice(0, 4));
  let mes = Number(a.slice(5, 7));
  // Un tope duro: un tramo mal pedido no puede colgar el servidor pintando
  // cuarenta mil barras.
  for (let i = 0; i < 120; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}`;
    salida.push(clave);
    if (clave >= b) break;
    mes += 1;
    if (mes > 12) { mes = 1; anio += 1; }
  }
  return salida;
}
