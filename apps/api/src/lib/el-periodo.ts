/**
 * De cuándo a cuándo se mira el dinero.
 *
 * Tres tramos y no una fecha suelta, porque son tres preguntas distintas: el
 * mes contesta «cómo va esto», el trimestre es el que se declara, y el año es
 * el único en el que un negocio de quince coches al año tiene forma.
 *
 * Todo en horario local y con el día entero dentro: pedir «este mes» un día 1 y
 * que no salga lo de hoy porque la comparación se hizo en UTC es el tipo de
 * fallo que se descubre tarde y con un número mal.
 */

export type Tramo = 'mes' | 'trimestre' | 'anio';

export interface Periodo {
  tramo: Tramo;
  /** `2026-09-01`. */
  desde: string;
  /** `2026-09-30`, dentro. */
  hasta: string;
  /** Cómo se llama, para el título. */
  etiqueta: string;
  /**
   * Desde dónde empieza el gráfico.
   *
   * Siempre doce meses, aunque el periodo sea uno: un mes solo no tiene forma,
   * y la forma es para lo que sirve un gráfico. El total de arriba es del
   * periodo; la serie de abajo es del año largo, y se dice.
   */
  desdeElGrafico: string;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');
const comoFecha = (a: number, m: number, d: number) => `${a}-${dosCifras(m)}-${dosCifras(d)}`;
/** El último día de un mes, contando bisiestos. */
const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate();

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function esTramo(v: unknown): v is Tramo {
  return v === 'mes' || v === 'trimestre' || v === 'anio';
}

/** El tramo pedido, situado en una fecha. */
export function elPeriodo(tramo: Tramo, hoy: Date = new Date()): Periodo {
  const a = hoy.getFullYear();
  const m = hoy.getMonth() + 1;

  const doceMeses = () => {
    // Once atrás más el corriente son doce.
    const mes = m - 11;
    return mes > 0 ? comoFecha(a, mes, 1) : comoFecha(a - 1, mes + 12, 1);
  };

  if (tramo === 'anio') {
    return {
      tramo, desde: comoFecha(a, 1, 1), hasta: comoFecha(a, 12, 31),
      etiqueta: String(a), desdeElGrafico: comoFecha(a, 1, 1),
    };
  }

  if (tramo === 'trimestre') {
    const t = Math.floor((m - 1) / 3) + 1;
    const primero = (t - 1) * 3 + 1;
    return {
      tramo,
      desde: comoFecha(a, primero, 1),
      hasta: comoFecha(a, primero + 2, ultimoDia(a, primero + 2)),
      etiqueta: `${t}T ${a}`,
      desdeElGrafico: doceMeses(),
    };
  }

  return {
    tramo: 'mes',
    desde: comoFecha(a, m, 1),
    hasta: comoFecha(a, m, ultimoDia(a, m)),
    etiqueta: `${MESES[m - 1]} de ${a}`,
    desdeElGrafico: doceMeses(),
  };
}

/**
 * El día de una fecha, como `2026-09-07`, venga como venga.
 *
 * De Postgres una columna `date` no llega como texto: llega como un `Date` de
 * JavaScript, y al pasarlo por `String()` sale «Wed Sep 07 2026 00:00:00
 * GMT+0200». Eso no se puede comparar con un `2026-09-01`, no se puede recortar
 * a un mes, y en el fichero del asesor sale una columna de fechas ilegible.
 *
 * Se saca en **hora local** a propósito. Un `date` de Postgres llega como la
 * medianoche local de ese día; en `toISOString()` un 7 de septiembre español se
 * convierte en el 6, y entonces una factura del día 1 cae en el mes anterior.
 */
export function elDia(v: unknown): string {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime())
      ? ''
      : comoFecha(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  const s = String(v ?? '').trim();
  // Ya viene bien: `2026-09-07` o `2026-09-07T10:00:00Z`.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : comoFecha(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * El mismo tramo, un paso atrás.
 *
 * Un número absoluto no dice si vamos bien. «19.805 €» se lee igual siendo el
 * doble del año pasado que la mitad, y la dirección es lo que hace falta para
 * decidir algo. Comparar contra el tramo anterior completo —el mes pasado
 * entero, no los treinta días anteriores— es lo que espera quien mira: es lo
 * que compara su asesor y lo que sale en el banco.
 *
 * El mes anterior va **al último día del mes**, no al mismo día: el 31 de marzo
 * comparado con «el 31 de febrero» no existe, y restar 30 días haría que
 * febrero empezara en enero.
 */
export function elPeriodoAnterior(tramo: Tramo, hoy: Date = new Date()): Periodo {
  const a = hoy.getFullYear();
  const m = hoy.getMonth() + 1;

  if (tramo === 'anio') return elPeriodo('anio', new Date(a - 1, 0, 1));
  if (tramo === 'trimestre') {
    // El primer día del trimestre menos uno cae siempre en el anterior.
    const primero = Math.floor((m - 1) / 3) * 3 + 1;
    return elPeriodo('trimestre', new Date(a, primero - 1, 0));
  }
  // Día 0 del mes corriente es el último del anterior.
  return elPeriodo('mes', new Date(a, m - 1, 0));
}

/**
 * Cuánto ha cambiado una cifra respecto a la anterior, en tanto por ciento.
 *
 * Null cuando antes no había nada. Pasar de 0 € a 3.000 € no es «+100 %» ni
 * «+∞»: es que antes no había con qué comparar, y decirlo así es lo único
 * honesto. Un porcentaje inventado sobre una base de cero es el gráfico que
 * enseña todo el mundo cuando quiere que algo parezca que sube.
 */
export function comoHaCambiado(ahora: number, antes: number): number | null {
  if (!Number.isFinite(ahora) || !Number.isFinite(antes) || antes === 0) return null;
  return Math.round(((ahora - antes) / Math.abs(antes)) * 1000) / 10;
}
