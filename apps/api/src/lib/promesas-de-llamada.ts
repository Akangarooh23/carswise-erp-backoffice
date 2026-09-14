/**
 * Los plazos de llamada que prometemos por escrito, y quién los mide.
 *
 * ## El desajuste que esto arregla
 *
 * «Leads sin contestar» decía en su motivo *«un lead frío a los tres días ya no
 * compra»*, la web promete *«te llamamos en menos de dos horas»*, y la consulta
 * **no filtraba por tiempo**: contaba todo lo que estuviera en Pendiente,
 * tuviera cinco minutos o tres semanas.
 *
 * Las tres cosas decían algo distinto, así que la línea no servía para ninguna
 * de las dos preguntas: ni «¿a quién le debo una llamada ahora?» ni «¿a quién
 * he perdido?». Y un número que siempre tiene algo dentro —porque cuenta también
 * al que acaba de entrar— se deja de mirar.
 *
 * ## Dos líneas, no una
 *
 * Son dos trabajos distintos. A las dos horas laborables hay que **llamar ya**,
 * porque se lo prometimos y todavía sirve de algo. A los tres días lo que hay es
 * un lead perdido del que como mucho se aprende algo. Ponerlos en el mismo
 * número obliga a abrir la lista para saber cuál de las dos cosas toca.
 *
 * No se cuentan dos veces: el que lleva cuatro días sale **solo** en la de los
 * fríos, que es la que describe su situación. Es la misma disciplina que
 * `reparteLosLeads` con los encargos.
 *
 * ## Y los encargos van aparte
 *
 * A quien nos pide que le vendamos el coche se le prometen 24 horas laborables,
 * no dos, y eso ya lo mide `sin-llamar.ts` en su propia línea. Aquí se excluyen
 * expresamente: si entraran, tendrían dos avisos con dos plazos distintos.
 */
import { horasLaborablesDesde } from './sin-llamar.js';

/**
 * Lo que promete la web al que pide información o visita.
 *
 * Dos horas **laborables**. El texto del correo no decía «laborables» y el de
 * los encargos sí, así que un formulario de las 23:00 prometía una llamada a la
 * una de la madrugada. Se mide en laborables porque es lo único que se puede
 * cumplir, y el correo se ha corregido para que diga lo mismo que se mide.
 */
export const HORAS_PARA_LLAMAR_LEAD = 2;

/**
 * Cuándo se da por frío.
 *
 * Días de calendario, no laborables: enfriarse es algo que le pasa a él, y a él
 * el fin de semana le pasa igual que a todos.
 */
export const DIAS_PARA_ENFRIARSE = 3;

/**
 * Y lo que se le promete al que pide un servicio: «24-48 horas hábiles».
 *
 * Se mide por el extremo corto. Avisar a las 48 sería avisar cuando ya se ha
 * incumplido; a las 24 todavía se está a tiempo, que es para lo que sirve un
 * aviso.
 */
export const HORAS_PARA_LLAMAR_SERVICIO = 24;

/** Los tipos de lead que tienen su propia línea y su propio plazo. */
export const CON_PLAZO_PROPIO = ['venta_gestionada'] as const;

/**
 * Los leads que esperan una llamada, con su fecha.
 *
 * Se traen las fechas en vez de contarlas en SQL por lo mismo que en
 * `sin-llamar.ts`: «laborables» en SQL sería otra implementación del mismo
 * cálculo, y el día que cambiara una de las dos el panel diría una cosa y la
 * pantalla otra.
 */
export const SQL_LEADS_PENDIENTES = `
  SELECT created_at
    FROM moveadvisor_market_leads
   WHERE status = 'Pendiente'
     AND COALESCE(lead_type, '') <> 'venta_gestionada'`;

/** Y las solicitudes de servicio que siguen abiertas. */
export const SQL_SERVICIOS_ABIERTOS = `
  SELECT created_at
    FROM moveadvisor_service_requests
   WHERE LOWER(COALESCE(status, '')) NOT IN ('cerrada', 'cancelada', 'atendida')`;

const dias = (desde: string | Date | null | undefined, ahora: Date): number | null => {
  if (!desde) return null;
  const d = new Date(desde);
  if (Number.isNaN(d.getTime())) return null;
  return (ahora.getTime() - d.getTime()) / 86_400_000;
};

/**
 * El reparto: a quién hay que llamar ya y a quién se ha perdido.
 *
 * Una fecha ilegible no cuenta en ninguna de las dos. Sacar a alguien en rojo
 * por una fila mal escrita hace que la lista deje de creerse, y de las dos
 * maneras de equivocarse ésta es la que se nota.
 */
export function reparteLosLeadsPorPlazo(
  filas: readonly { created_at?: string | Date | null }[] | null | undefined,
  ahora: Date = new Date(),
): { leads_sin_llamar: number; leads_pendientes: number } {
  let sinLlamar = 0;
  let frios = 0;
  for (const f of filas ?? []) {
    const d = dias(f?.created_at, ahora);
    if (d === null) continue;
    if (d >= DIAS_PARA_ENFRIARSE) { frios += 1; continue; }
    const h = horasLaborablesDesde(f?.created_at, ahora, HORAS_PARA_LLAMAR_LEAD);
    if (h !== null && h >= HORAS_PARA_LLAMAR_LEAD) sinLlamar += 1;
  }
  return { leads_sin_llamar: sinLlamar, leads_pendientes: frios };
}

/**
 * Cuántas solicitudes de servicio han pasado de plazo.
 *
 * Sin segunda línea de «frías»: aquí no hay nada que se enfríe de la misma
 * manera —quien pide cita de taller la sigue necesitando la semana que viene—,
 * así que una sola cuenta dice todo lo que hay que saber.
 */
export function losServiciosSinLlamar(
  filas: readonly { created_at?: string | Date | null }[] | null | undefined,
  ahora: Date = new Date(),
): number {
  let n = 0;
  for (const f of filas ?? []) {
    const h = horasLaborablesDesde(f?.created_at, ahora, HORAS_PARA_LLAMAR_SERVICIO);
    if (h !== null && h >= HORAS_PARA_LLAMAR_SERVICIO) n += 1;
  }
  return n;
}
