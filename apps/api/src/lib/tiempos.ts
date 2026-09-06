/**
 * Cuánto se tarda en cada cosa.
 *
 * El panel decía cuántos leads hay y cuántos coches se han entregado, pero no
 * **cuánto se tarda**, que es la mitad de cómo va una operación. Dos leads
 * pendientes es un número tranquilo; dos leads pendientes desde hace ochenta
 * días es otra cosa, y hasta ahora las dos frases eran el mismo dato.
 *
 * ## La mediana, no la media
 *
 * Con cinco leads contestados en 0, 15, 16, 624 y 696 horas, la media son 270 h
 * y no describe ninguno: los dos de junio se quedaron olvidados y arrastran la
 * cifra. La mediana son 16 h, que sí es lo que suele pasar.
 *
 * El peor va al lado, que es la otra mitad: una mediana buena con un caso de
 * ochocientas horas es una mediana buena y un cliente perdido.
 */

const redondo = (n: number) => Math.round(n * 10) / 10;

/** La mediana de una lista. Null si está vacía: no es cero, es que no hay. */
export function mediana(valores: readonly number[] | null | undefined): number | null {
  const buenos = (valores ?? []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!buenos.length) return null;
  const medio = Math.floor(buenos.length / 2);
  return redondo(buenos.length % 2 ? buenos[medio] : (buenos[medio - 1] + buenos[medio]) / 2);
}

export interface Tramo {
  /** Lo que suele tardar. */
  tipico: number | null;
  /** Y el que más tardó, que es la otra mitad de la historia. */
  peor: number | null;
  /** De cuántos casos sale. Sin esto, una mediana de uno parece una ley. */
  casos: number;
}

export function elTramo(valores: readonly number[] | null | undefined): Tramo {
  const buenos = (valores ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    tipico: mediana(buenos),
    peor: buenos.length ? redondo(Math.max(...buenos)) : null,
    casos: buenos.length,
  };
}

/**
 * Lo que va de una fecha a otra, en milisegundos.
 *
 * Null si alguna no se entiende, y null también si la segunda es anterior: una
 * entrega antes de su solicitud es un dato mal metido, no un tiempo negativo, y
 * restaría de la mediana en vez de descartarse.
 */
function loQueVa(desde: unknown, hasta: unknown): number | null {
  const a = new Date(String(desde ?? ''));
  const b = new Date(String(hasta ?? ''));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const ms = b.getTime() - a.getTime();
  return ms < 0 ? null : ms;
}

/** Días entre dos fechas. */
export function diasEntre(desde: unknown, hasta: unknown): number | null {
  const ms = loQueVa(desde, hasta);
  return ms === null ? null : redondo(ms / 86400000);
}

/**
 * Y horas, para lo que se mide en horas.
 *
 * Se calcula del original y no de los días ya redondeados: por ahí, quince
 * horas salían catorce coma cuatro.
 */
export function horasEntre(desde: unknown, hasta: unknown): number | null {
  const ms = loQueVa(desde, hasta);
  return ms === null ? null : redondo(ms / 3600000);
}

/**
 * Cómo se dice un tiempo para que se lea de un vistazo.
 *
 * «0,3 días» y «7,2 horas» son el mismo dato y solo uno se entiende. La unidad
 * se elige por el tamaño: horas hasta dos días, días hasta dos meses, y meses
 * a partir de ahí.
 */
export function comoSeDice(dias: number | null): string {
  if (dias === null || !Number.isFinite(dias)) return '–';
  if (dias < 2) {
    const horas = Math.round(dias * 24);
    return horas <= 1 ? 'el mismo día' : `${horas} h`;
  }
  if (dias < 60) return `${Math.round(dias)} días`;
  return `${Math.round(dias / 30)} meses`;
}
