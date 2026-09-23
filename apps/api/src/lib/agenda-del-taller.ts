/**
 * La agenda de un taller: lo que tiene cogido y lo que está cerrado.
 *
 * ## Por qué está esto aquí
 *
 * Las horas de taller las reserva el cliente desde PopCar, y eso ya funciona.
 * Lo que no existía era el reverso: **decir que un día no se abre**. Las cuatro
 * acciones estaban escritas en el servidor de PopCar —cerrar un día, abrirlo,
 * cerrar una hora suelta, abrirla— y no las llamaba ninguna pantalla. Se podían
 * usar con Postman y nada más.
 *
 * El sitio de esa pantalla es el ERP y no PopCar: PopCar es la aplicación del
 * cliente, y quien sabe que un taller cierra el 24 es quien trabaja aquí.
 *
 * ## Lo que se enseña con los cierres
 *
 * También las citas ya dadas. Cerrar un día no las anula —no hay tal cosa, y no
 * se inventa aquí—, así que lo menos que se puede hacer es tenerlas delante
 * antes de cerrar.
 *
 * Las tablas se declaran en `db/schema.ts`, y son gemelas de las de
 * `lib/huecos-del-taller.js` en PopCar.
 */
import { query } from '../db/pool.js';

/** Un día cerrado, o una hora suelta cerrada. */
export interface Cierre {
  id: string;
  dia: string;
  /** Vacío = el día entero. */
  hora: string;
  motivo: string;
}

/** Una cita que ya tiene alguien. */
export interface Cita {
  id: string;
  dia: string;
  hora: string;
  cliente: string;
}

/** Un día del mes, con las horas a las que ese taller cita. */
export interface DiaDelMes {
  dia: string;
  horas: string[];
}

export interface AgendaDelMes {
  dias: DiaDelMes[];
  cierres: Cierre[];
  citas: Cita[];
}

/**
 * A qué horas cita un taller.
 *
 * GEMELO DE `getSlotsForWeekday` EN POPCAR (`lib/api/workshop-availability-
 * handler.js`), que es quien decide de verdad qué horas se le ofrecen al
 * cliente. Aquí hace falta la misma lista para poder cerrar una hora suelta:
 * cerrar una que no se ofrece no cerraría nada.
 *
 * Y sí, el horario es el mismo para todos los talleres, lo cual es falso: en
 * `workshop_locations.business_hours` está el de cada uno, escrito y sin que lo
 * lea nadie. Cambiar eso es harina de otro costal y se hace en PopCar primero;
 * lo que no se puede es que aquí diga una cosa y allí otra.
 */
const HORAS_ENTRE_SEMANA = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00'];
const HORAS_DEL_SABADO   = ['09:00', '10:00', '11:00', '12:00', '13:00'];

export function lasHorasDe(dia: string): string[] {
  const d = new Date(`${dia}T00:00:00`);
  const semana = d.getDay();
  if (semana === 0) return [];           // domingo: cerrado
  if (semana === 6) return [...HORAS_DEL_SABADO];
  return [...HORAS_ENTRE_SEMANA];
}

/** Los días de ese mes, cada uno con sus horas. */
function losDiasDelMes(mes: string): DiaDelMes[] {
  const [anio, m] = mes.split('-').map(Number);
  const cuantos = new Date(anio, m, 0).getDate();
  const dias: DiaDelMes[] = [];
  for (let n = 1; n <= cuantos; n += 1) {
    const dia = `${mes}-${String(n).padStart(2, '0')}`;
    dias.push({ dia, horas: lasHorasDe(dia) });
  }
  return dias;
}

const texto = (v: unknown): string => String(v ?? '').trim();

/** `YYYY-MM`, y nada más: lo demás no es un mes. */
export function esUnMes(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(texto(mes));
}

/** `YYYY-MM-DD`. */
export function esUnDia(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto(dia));
}

/** `HH:MM`, que es como las guarda PopCar. */
export function esUnaHora(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(texto(hora));
}

/**
 * Lo que hay ese mes en ese taller.
 *
 * Por mes, como la pantalla: pedir la agenda entera de todos los talleres para
 * pintar treinta días es la clase de consulta que va bien hasta que deja de ir.
 */
export async function laAgendaDelMes(tallerId: string, mes: string): Promise<AgendaDelMes> {
  const desde = `${mes}-01`;

  const [cierres, citas] = await Promise.all([
    query<{ id: string; dia: string; hora: string | null; motivo: string }>(
      `SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, hora, motivo
         FROM moveadvisor_workshop_blocks
        WHERE workshop_id = $1
          AND dia >= $2::date AND dia < ($2::date + INTERVAL '1 month')
        ORDER BY dia, hora NULLS FIRST`,
      [tallerId, desde]
    ),
    query<{ id: string; dia: string; hora: string; user_email: string }>(
      `SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, hora, user_email
         FROM moveadvisor_workshop_reservations
        WHERE workshop_id = $1 AND estado = 'booked'
          AND dia >= $2::date AND dia < ($2::date + INTERVAL '1 month')
        ORDER BY dia, hora`,
      [tallerId, desde]
    ),
  ]);

  return {
    dias: losDiasDelMes(mes),
    cierres: cierres.rows.map((f) => ({
      id: f.id,
      dia: f.dia,
      hora: texto(f.hora),
      motivo: texto(f.motivo),
    })),
    citas: citas.rows.map((f) => ({
      id: f.id,
      dia: f.dia,
      hora: texto(f.hora),
      cliente: texto(f.user_email),
    })),
  };
}

/**
 * Cuántas citas hay dadas en ese día, o en esa hora.
 *
 * Quien cierra tiene que saberlo antes, porque cerrar no las anula: el cliente
 * seguiría teniendo su cita y el taller cerrado.
 */
export async function cuantasCitasPisa(tallerId: string, dia: string, hora: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    hora
      ? `SELECT count(*) AS n FROM moveadvisor_workshop_reservations
          WHERE workshop_id = $1 AND dia = $2::date AND hora = $3 AND estado = 'booked'`
      : `SELECT count(*) AS n FROM moveadvisor_workshop_reservations
          WHERE workshop_id = $1 AND dia = $2::date AND estado = 'booked'`,
    hora ? [tallerId, dia, hora] : [tallerId, dia]
  );
  return Number(rows[0]?.n ?? 0);
}

const unId = (que: string): string =>
  `${que}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Cierra el día entero (`hora` vacía) o una hora suelta. */
export async function cierra(
  tallerId: string,
  dia: string,
  hora: string,
  motivo: string
): Promise<void> {
  await query(
    `INSERT INTO moveadvisor_workshop_blocks (id, workshop_id, dia, hora, motivo)
     VALUES ($1, $2, $3::date, $4, $5)
     ON CONFLICT DO NOTHING`,
    [unId(hora ? 'wslot' : 'wday'), tallerId, dia, hora || null, motivo]
  );
}

/**
 * Y lo vuelve a abrir.
 *
 * Sin hora abre el día entero, y **no se lleva por delante las horas sueltas**
 * que estén cerradas dentro: son dos decisiones distintas, y una comida de
 * mediodía no se quita porque se reabra el día.
 */
export async function abre(tallerId: string, dia: string, hora: string): Promise<boolean> {
  const { rowCount } = await query(
    hora
      ? `DELETE FROM moveadvisor_workshop_blocks
          WHERE workshop_id = $1 AND dia = $2::date AND hora = $3`
      : `DELETE FROM moveadvisor_workshop_blocks
          WHERE workshop_id = $1 AND dia = $2::date AND hora IS NULL`,
    hora ? [tallerId, dia, hora] : [tallerId, dia]
  );
  return Number(rowCount ?? 0) > 0;
}
