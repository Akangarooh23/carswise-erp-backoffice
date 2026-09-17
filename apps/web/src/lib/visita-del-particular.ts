/**
 * Quién tiene que contestar una visita pendiente.
 *
 * En las de concesionario, renting o importación, nosotros: se llama a quien
 * tiene el coche y se confirma desde la Agenda. En el coche de un particular,
 * **él**: le llega un correo y la confirma, propone otra hora o la rechaza. Esa
 * no es trabajo nuestro y no puede encender el número rojo del menú.
 *
 * Salvo que no conteste. Pasado un día, el comprador sigue esperando y alguien
 * tiene que llamar al vendedor: entonces vuelve a ser nuestra.
 *
 * La misma regla que cuenta el panel en el servidor (`dashboard.ts`), para que
 * el menú, la Agenda y Pendientes digan el mismo número.
 */

export const HORAS_PARA_QUE_CONTESTE = 24;

export interface VisitaPendiente {
  status?: string | null;
  la_confirma_el_vendedor?: boolean | null;
  created_at?: string | null;
}

/** Si la visita la confirma su dueño, particular. */
export function laConfirmaElVendedor(b: VisitaPendiente | null | undefined): boolean {
  return Boolean(b?.la_confirma_el_vendedor);
}

/** Cuántas horas lleva el vendedor sin contestar. `null` si no se sabe. */
export function horasSinContestar(b: VisitaPendiente, ahora: Date = new Date()): number | null {
  if (!b.created_at) return null;
  const t = new Date(b.created_at).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 3600000));
}

/**
 * Si nos toca a nosotros.
 *
 * Sin fecha de creación legible, sí: una pendiente que no sabemos desde cuándo
 * espera no se puede dar por atendida.
 */
export function nosTocaContestarla(b: VisitaPendiente, ahora: Date = new Date()): boolean {
  if (b.status !== 'pending') return false;
  if (!laConfirmaElVendedor(b)) return true;
  const horas = horasSinContestar(b, ahora);
  return horas === null || horas >= HORAS_PARA_QUE_CONTESTE;
}
