/**
 * Entregar el coche.
 *
 * Entregar no es un estado, es un acto: alguien está delante, recibe unas llaves
 * y unos papeles, y firma. Lo que no se le dé ese día se convierte en una
 * llamada la semana siguiente, y lo que no quede escrito se convierte en su
 * palabra contra la nuestra.
 *
 * Y ahí empieza algo que hoy no lleva nadie: **la garantía**. Un coche entregado
 * con doce meses es una obligación con fecha de caducidad. Si no está apuntada,
 * el día que alguien llame no habrá forma de saber si está dentro o fuera.
 */

/**
 * Lo que se le da al cliente el día de la entrega.
 *
 * Se marca delante de él, uno a uno. La segunda llave está en la lista por lo
 * mismo que en la recepción: es lo que más se olvida y lo que más cuesta.
 */
export const QUE_SE_ENTREGA = [
  { clave: 'permiso', que: 'Permiso de circulación' },
  { clave: 'ficha_tecnica', que: 'Ficha técnica' },
  { clave: 'llaves', que: 'Todas las llaves' },
  { clave: 'libro', que: 'Libro de mantenimiento' },
  { clave: 'factura', que: 'Factura' },
  { clave: 'contrato', que: 'Contrato de compraventa' },
  { clave: 'garantia', que: 'Documento de garantía' },
];

export interface Entrega {
  fecha?: string;
  km_salida?: number | null;
  entregado_por?: string;
  /** Qué se le ha dado, marcado uno a uno. */
  entregado?: Record<string, boolean>;
  garantia_meses?: number | null;
  /** Hasta cuándo, calculado al entregar. */
  garantia_hasta?: string | null;
  firmado?: boolean;
  notas?: string;
}

/** Lo que todavía no se le ha dado. */
export function faltaPorEntregar(e: Entrega | null | undefined): { clave: string; que: string }[] {
  const dado = e?.entregado ?? {};
  return QUE_SE_ENTREGA.filter((x) => dado[x.clave] !== true);
}

/**
 * Si se puede dar la entrega por hecha.
 *
 * Hacen falta los kilómetros de salida y la firma. Los kilómetros porque son el
 * punto de partida de cualquier garantía, y la firma porque sin ella no hay
 * entrega: hay un coche que ya no está.
 *
 * Que falte algún papel **no lo impide**: a veces se entrega el coche y la ficha
 * llega después. Pero se ve lo que falta, que es distinto de no saberlo.
 */
export function puedeCerrarseLaEntrega(e: Entrega | null | undefined): boolean {
  const ent = e ?? {};
  return ent.km_salida != null && !Number.isNaN(Number(ent.km_salida)) && ent.firmado === true;
}

export function faltaParaCerrar(e: Entrega | null | undefined): string[] {
  const ent = e ?? {};
  const falta: string[] = [];
  if (ent.km_salida == null || Number.isNaN(Number(ent.km_salida))) falta.push('Los kilómetros de salida');
  if (ent.firmado !== true) falta.push('La firma del cliente');
  return falta;
}

/**
 * Hasta cuándo cubre la garantía.
 *
 * Se calcula al entregar y se guarda, no se recalcula después. Si mañana se
 * cambia la política a veinticuatro meses, los coches ya entregados siguen
 * teniendo lo que se les prometió.
 */
export function garantiaHasta(desde: Date, meses: number): string {
  const dia = desde.getUTCDate();
  const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + meses, 1));
  // El último día del mes de destino, para cuando el de origen no existe allí.
  //
  // Seis meses desde un 30 de agosto no es el 2 de marzo: sumar sin más se
  // desborda a marzo y regala dos días de garantía. Se queda en el 28.
  const ultimo = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0)).getUTCDate();
  hasta.setUTCDate(Math.min(dia, ultimo));
  return hasta.toISOString().slice(0, 10);
}

/** Si una garantía sigue viva hoy. */
export function garantiaEnVigor(hasta?: string | null, ahora: Date = new Date()): boolean {
  if (!hasta) return false;
  const d = new Date(hasta);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= ahora.getTime();
}

/** Cuántos días le quedan. Negativo si ya se pasó. */
export function diasDeGarantia(hasta?: string | null, ahora: Date = new Date()): number | null {
  if (!hasta) return null;
  const d = new Date(hasta);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - ahora.getTime()) / 86_400_000);
}
