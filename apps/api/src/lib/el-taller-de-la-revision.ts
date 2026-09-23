/**
 * El taller al que se lleva el coche: el mismo de siempre, en los tres sitios.
 *
 * ## El lío que había
 *
 * «Taller» significaba tres cosas distintas y ninguna se hablaba con las otras:
 *
 * - **El directorio** (`workshop_locations`, 55.718 filas): de donde PopCar
 *   saca los talleres cuando el cliente pide cita, y donde ahora está su
 *   agenda.
 * - **Proveedores** (`erp_proveedores`): con quién se factura. Tenía **cero**
 *   talleres dados de alta.
 * - **Lo que se escribía a mano** en la revisión del encargo: un campo de
 *   texto. El desplegable que tenía salía de Proveedores, así que estaba vacío
 *   y se veía igual que un campo libre.
 *
 * Resultado: la única revisión apuntada decía «Norauto Alcobendas» tecleado, no
 * enlazaba con ningún taller del directorio, no ocupaba hora en la agenda de
 * nadie y la factura de los 60 € no tenía a quién ir.
 *
 * ## Lo que hace esto
 *
 * Cuando se elige un taller del directorio y se le da cita:
 *
 * 1. **Se da de alta como proveedor** de tipo taller si no lo estaba, con su
 *    dirección y su teléfono. Es a quien se le pagan los 60 €.
 * 2. **Se le ocupa la hora en su agenda**, la misma que ve el cliente en
 *    PopCar. Si esa hora ya la tiene otro, no se da la cita: se dice.
 *
 * Lo segundo es lo que evita mandarle dos coches a la misma hora, que era
 * posible porque las citas del ERP y las del cliente vivían en tablas
 * distintas.
 */
import { query } from '../db/pool.js';
import { nombreComparable } from './proveedores.js';
import { prefijoAnual, siguienteDeSerie, guardaConIdUnico } from './series.js';

/** Un taller del directorio, con lo que hace falta para darle de alta. */
export interface DelDirectorio {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  province: string;
  phone: string;
}

export async function elDelDirectorio(tallerId: string): Promise<DelDirectorio | null> {
  const id = String(tallerId ?? '').trim();
  if (!/^\d+$/.test(id)) return null;

  const r = await query<DelDirectorio>(
    `SELECT id::text, COALESCE(name,'') name, COALESCE(address,'') address,
            COALESCE(city,'') city, COALESCE(postcode,'') postcode,
            COALESCE(province,'') province, COALESCE(phone,'') phone
       FROM workshop_locations WHERE id = $1::int`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * Se asegura de que ese taller esté en Proveedores, y devuelve su id.
 *
 * Por `clave` —el nombre comparable— y no por el id del directorio, que es
 * como ya agrupa Proveedores: «Norauto Alcobendas» y «norauto alcobendas» son
 * uno. Si ya estaba pero no constaba como taller, se le añade el tipo en vez
 * de crear otro; lo que ya hacía la pantalla de Proveedores al dar de alta uno
 * repetido.
 *
 * Lo que ya está escrito no se pisa: si el proveedor existe con su NIF y su
 * dirección puestos a mano, se queda como está.
 */
export async function seaProveedor(taller: DelDirectorio, quien: string): Promise<string> {
  const nombre = taller.name.trim();
  if (!nombre) return '';
  const clave = nombreComparable(nombre);

  const yaHay = await query<{ id: string; tipos: string[] }>(
    `SELECT id, tipos FROM erp_proveedores WHERE clave = $1`,
    [clave]
  );

  if (yaHay.rows.length) {
    const previo = yaHay.rows[0];
    if ((previo.tipos ?? []).includes('taller')) return previo.id;
    const juntos = [...new Set([...(previo.tipos ?? []), 'taller'])];
    await query(`UPDATE erp_proveedores SET tipos = $2, activo = TRUE WHERE id = $1`, [previo.id, juntos]);
    return previo.id;
  }

  const direccion = [taller.address, taller.city].filter(Boolean).join(', ');
  const { id } = await guardaConIdUnico(
    () => siguienteDeSerie('erp_proveedores', prefijoAnual('PRV')),
    async (nuevoId) => {
      await query(
        `INSERT INTO erp_proveedores (id, nombre, clave, tipos, telefono, direccion,
                                      cp, municipio, provincia, creado_por, notas)
         VALUES ($1,$2,$3,ARRAY['taller'],$4,$5,$6,$7,$8,$9,$10)`,
        [nuevoId, nombre, clave, taller.phone, direccion,
         taller.postcode, taller.city, taller.province, quien,
         `Alta automática al darle una revisión. Taller ${taller.id} del directorio.`]
      );
    }
  );
  return id;
}

/** La hora, `HH:MM`, de una cita guardada como fecha completa. */
export function laHoraDe(citaAt: string | Date | null | undefined): string {
  if (!citaAt) return '';
  const d = new Date(citaAt as string);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Y el día, `YYYY-MM-DD`. */
export function elDiaDe(citaAt: string | Date | null | undefined): string {
  if (!citaAt) return '';
  const d = new Date(citaAt as string);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const HORA_COGIDA = 'hora_cogida';

/**
 * Le ocupa la hora al taller, en la misma agenda que ve el cliente.
 *
 * Quien decide si estaba libre es el índice único de la base y no una
 * comprobación previa: entre mirar y escribir cabe un cliente pidiendo esa
 * misma hora desde PopCar. Si choca, devuelve `HORA_COGIDA` y la cita no se da.
 *
 * Sin taller del directorio o sin hora no hay nada que ocupar, y no es un
 * error: hay revisiones viejas con el taller escrito a mano, y darles cita
 * tiene que seguir funcionando.
 */
export async function ocupaLaHora(
  tallerId: string,
  citaAt: string | Date | null | undefined,
  quien: string
): Promise<'' | typeof HORA_COGIDA> {
  const dia = elDiaDe(citaAt);
  const hora = laHoraDe(citaAt);
  if (!tallerId || !dia || !hora) return '';

  try {
    await query(
      `INSERT INTO moveadvisor_workshop_reservations
         (id, workshop_id, proveedor, dia, hora, estado, user_email)
       VALUES ($1, $2, 'ERP', $3::date, $4, 'booked', $5)`,
      [`wres-erp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tallerId, dia, hora, quien]
    );
    return '';
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return HORA_COGIDA;
    throw err;
  }
}

/**
 * Y la suelta cuando la cita se mueve o la revisión se cierra.
 *
 * Anulándola y no borrándola: el índice único solo mira las vivas, así que la
 * hora queda libre y queda el rastro de que ahí hubo una cita nuestra. Una
 * hora que se libra sin dejar nada es una hora que nadie sabe por qué cambió.
 */
export async function sueltaLaHora(
  tallerId: string,
  citaAt: string | Date | null | undefined
): Promise<void> {
  const dia = elDiaDe(citaAt);
  const hora = laHoraDe(citaAt);
  if (!tallerId || !dia || !hora) return;

  await query(
    `UPDATE moveadvisor_workshop_reservations
        SET estado = 'cancelled'
      WHERE workshop_id = $1 AND dia = $2::date AND hora = $3
        AND estado = 'booked' AND proveedor = 'ERP'`,
    [tallerId, dia, hora]
  );
}
