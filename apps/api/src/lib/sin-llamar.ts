/**
 * Los que piden que les vendamos el coche y siguen esperando la llamada.
 *
 * En la página y en el correo se les dice **«te llamamos en menos de 24 horas
 * laborables»**. Esa promesa no la cumple ningún sistema: la cumple alguien
 * cogiendo el teléfono, y lo único que puede hacer el ERP es no dejar que se
 * olvide.
 *
 * Hasta ahora caían en «leads sin contestar», cuyo criterio es *«un lead frío a
 * los tres días ya no compra»*. Tres días contra veinticuatro horas: en el mismo
 * cajón, nada distinguía al que tiene una promesa encima.
 */

/**
 * Laborables quiere decir laborables.
 *
 * Un formulario que entra el viernes por la tarde no está tarde el sábado. Se
 * cuentan solo los días de lunes a viernes, que es lo que se le prometió — y
 * contarlo de otra forma llenaría la lista los lunes por la mañana con gente a
 * la que no se le debe nada todavía.
 *
 * Los festivos no se miran. Hacerlo bien pediría un calendario por comunidad, y
 * el error es de un día en catorce fechas al año: se prefiere llamar de más.
 */
export const HORAS_PARA_LLAMAR = 24;

/** Domingo y sábado, tal y como los numera `Date.getDay()`. */
const FINDE = [0, 6];

/**
 * Cuántas horas laborables han pasado desde que entró.
 *
 * Se cuenta hora a hora en vez de con una fórmula: son como mucho unos días, y
 * la fórmula —con fines de semana, cambios de hora y medias jornadas— se
 * equivoca de una manera que nadie revisa.
 *
 * Cuenta **horas empezadas**: de las 10:30 a las 11:00 va una. Redondear hacia
 * arriba adelanta el aviso unos minutos, que es el lado bueno de equivocarse.
 *
 * `tope` corta la cuenta en cuanto se llega, para no recorrer hora a hora un
 * lead de hace ocho meses cuando lo único que se pregunta es si pasó de 24.
 * Devuelve `null` si la fecha no se puede leer.
 */
export function horasLaborablesDesde(
  desde: string | Date | null | undefined,
  ahora: Date = new Date(),
  tope = Number.POSITIVE_INFINITY,
): number | null {
  if (!desde) return null;
  const d = new Date(desde);
  if (Number.isNaN(d.getTime())) return null;
  if (d >= ahora) return 0;

  let horas = 0;
  const cursor = new Date(d);
  cursor.setMinutes(0, 0, 0);
  while (cursor < ahora && horas < tope) {
    if (!FINDE.includes(cursor.getDay())) horas += 1;
    cursor.setHours(cursor.getHours() + 1);
  }
  return horas;
}

/**
 * Si a ese lead se le ha pasado el plazo.
 *
 * Una fecha ilegible **no** cuenta como tarde: sacar a alguien en rojo por una
 * fila mal escrita hace que la lista deje de creerse, y de las dos maneras de
 * equivocarse esta es la que se nota.
 */
export function seLePasoElPlazo(
  creadoAt: string | Date | null | undefined,
  ahora: Date = new Date(),
): boolean {
  const horas = horasLaborablesDesde(creadoAt, ahora, HORAS_PARA_LLAMAR);
  return horas !== null && horas >= HORAS_PARA_LLAMAR;
}

/** Cuántos de esos leads llevan esperando más de la cuenta. */
export function losQueEsperanDeMas(
  filas: readonly { created_at?: string | Date | null }[] | null | undefined,
  ahora: Date = new Date(),
): number {
  if (!filas) return 0;
  return filas.filter((f) => seLePasoElPlazo(f?.created_at, ahora)).length;
}

/**
 * Y el reparto, que es lo que evita contar a la misma persona dos veces.
 *
 * «Leads sin contestar» cuenta *todos* los pendientes, así que sacar una línea
 * nueva sin más pondría al mismo señor en dos filas y sumando dos en el total.
 * Los que se pasan de plazo salen del cajón general y se van al suyo; los que
 * acaban de entrar se quedan donde estaban, porque todavía no se les debe nada
 * y una línea roja diría que sí.
 *
 * Nunca por debajo de cero: si las dos cuentas vienen de consultas distintas y
 * una falla, un negativo pintaría una fila absurda en vez de no pintar ninguna.
 */
export function reparteLosLeads(
  pendientesEnTotal: number,
  sinLlamar: number,
): { leads_pendientes: number; encargos_sin_llamar: number } {
  const tarde = Math.max(0, Math.round(Number(sinLlamar) || 0));
  const total = Math.max(0, Math.round(Number(pendientesEnTotal) || 0));
  return {
    leads_pendientes: Math.max(0, total - tarde),
    encargos_sin_llamar: tarde,
  };
}

/**
 * Los que están sin llamar, para contarlos.
 *
 * Solo los pendientes: en cuanto alguien los pasa a «Contactado» ya se ha
 * cumplido, aunque después queden cosas que hacer con ellos.
 *
 * Se traen las fechas en vez de contarlas en SQL porque lo de «laborables» en
 * SQL sería otra implementación del mismo cálculo, y el día que cambiara una de
 * las dos el panel diría una cosa y la pantalla otra.
 */
export const SQL_SIN_LLAMAR = `
  SELECT created_at
    FROM moveadvisor_market_leads
   WHERE lead_type = 'venta_gestionada'
     AND status = 'Pendiente'`;
