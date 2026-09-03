/**
 * Las facturas que sabemos que van a llegar y todavía no han llegado.
 *
 * Facturación proveedores solo conocía las facturas ya recibidas, así que
 * «cuánto debemos» dependía de lo rápido que facturasen los demás. Con un coche
 * recién peritado había 289 € comprometidos y 0 € a la vista.
 *
 * ## Una factura esperada no es una factura
 *
 * Es la regla que da forma a todo lo de aquí. No tiene número, ni fecha, ni PDF,
 * porque no los tiene todavía: nadie la ha emitido. Va con **estado propio** y
 * en **su propio bloque**, y no suma en «pendiente de pagar».
 *
 * Mezclarla con las recibidas tendría dos consecuencias, y las dos son caras:
 * alguien acabaría pagando contra una línea que nadie ha emitido, y la cifra de
 * lo que debemos incluiría dinero que nadie nos ha reclamado. Son dos preguntas
 * distintas —**qué facturas me faltan** y **cuánto me falta por pagar**— y cada
 * una necesita su número.
 *
 * ## Nace cuando el servicio está hecho
 *
 * No cuando se contrata. Antes de que el perito vaya no falta ninguna factura:
 * nadie puede facturar lo que todavía no ha hecho. La revisión hecha, el tramo
 * entregado, el trámite resuelto.
 *
 * ## Y vence
 *
 * Si nadie las cierra, en tres meses hay cuarenta líneas de coches ya
 * entregados y la pantalla se vuelve ruido. A los diez días sin llegar, la
 * espera pasa a ser una tarea: reclamarla.
 *
 * ## Lo que no es
 *
 * **Esto no es contabilidad.** Es una previsión. No entra en ningún total
 * fiscal ni genera asiento: lo que se declara es lo que está facturado.
 */

/** El estado de una línea que espera factura. */
export const ESPERADA = 'esperada';

/** Lo que se aguanta esperando una factura antes de reclamarla. */
export const DIAS_PARA_RECLAMAR = 10;

export interface ServicioPrestado {
  /** Quién nos lo va a facturar. */
  proveedor?: string | null;
  /** Lo acordado. Sin importe no hay línea: una fila sin cifra no dice nada. */
  importe?: number | string | null;
  /** Si el servicio ya está hecho. Antes de eso no falta ninguna factura. */
  hecho?: boolean;
}

/**
 * Si de este servicio hay que esperar una factura.
 *
 * Con proveedor **y** con importe. Sin proveedor no hay a quién reclamarle;
 * sin importe, la línea engorda la lista sin decir cuánto, y una lista de
 * cifras desconocidas no se puede sumar ni sirve para decidir nada.
 */
export function seEsperaFactura(s: ServicioPrestado): boolean {
  if (!s.hecho) return false;
  if (!String(s.proveedor ?? '').trim()) return false;
  const importe = Number(s.importe);
  return Number.isFinite(importe) && importe > 0;
}

/** Cuántos días lleva esperándose. */
export function diasEsperando(desde: unknown, hoy: Date = new Date()): number {
  const d = desde ? new Date(String(desde)) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((hoy.getTime() - d.getTime()) / 86400000));
}

/**
 * Si ya toca reclamarla.
 *
 * Es lo que impide que «esperando» sea donde las facturas se quedan a morir:
 * pasado el plazo deja de ser una espera y pasa a ser algo que hacer.
 */
export function hayQueReclamarla(desde: unknown, hoy: Date = new Date()): boolean {
  return diasEsperando(desde, hoy) > DIAS_PARA_RECLAMAR;
}

/** Cómo se cuenta en una línea: «289 € · esperando desde hace 3 días». */
export function comoSeCuenta(importe: unknown, desde: unknown, hoy: Date = new Date()): string {
  const eur = (Number(importe) || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const dias = diasEsperando(desde, hoy);
  if (hayQueReclamarla(desde, hoy)) {
    return `${eur} € · sin llegar desde hace ${dias} días, reclámala`;
  }
  if (dias === 0) return `${eur} € · esperando desde hoy`;
  return `${eur} € · esperando desde hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
