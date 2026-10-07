/**
 * Pedirle el resultado a quien fue a ver el coche, la mañana de después.
 *
 * La revisión se confirma y se recuerda el día antes. Pasada la hora no se
 * movía nada: el estado lo cierra una persona apuntando cómo salió, y hasta
 * que eso no pasa el anuncio no puede publicarse, la factura de los 60 € no se
 * apunta y el cliente sigue leyendo «Confirmada» días después.
 *
 * Nadie se olvidaba: no había nada que lo pidiera. Esto lo pide.
 *
 * ## Por qué un correo y no un formulario
 *
 * Lo bonito sería que el perito contestara en una pantalla suya, con las tres
 * opciones y un sitio para las notas. Pero eso es otra pantalla, otro permiso
 * y otra cosa que mantener, para dos o tres peritos. Lo que hay que resolver
 * hoy es que el resultado llegue; cómo de elegante llega es el problema del
 * día que haya veinte.
 *
 * ## Por qué a la mañana siguiente y no al terminar
 *
 * Una visita a las 12:00 no se cierra a las 12:40: el perito tiene otras dos y
 * escribe por la tarde. Pedírselo el mismo día es pedírselo mientras conduce,
 * y un correo que llega pronto y se lee tarde se lee igual que el que no llega.
 *
 * Vive aparte de la ruta de cron, como su gemelo de los recordatorios, para
 * poder leer qué hace y probar la regla de a quién le toca sin base ni correo.
 */
import { query } from '../db/pool.js';
import { enviar } from './correo.js';
import { elCorreoPidiendoElResultado } from './correos-del-encargo.js';
import { elDiaDeLaCita, laHoraDeLaCita } from './revision-del-taller.js';

export interface LoQuePedimos {
  miradas: number;
  pedidos: number;
  /** Los que tocaban y no tenían a quién preguntar. Salen, no se callan. */
  sin_correo: number;
  fallados: number;
}

/**
 * A quién se le pide.
 *
 * El correo apuntado a mano gana al del directorio: si alguien lo ha escrito
 * en esta revisión es porque sabe que a ése es a quien hay que escribirle —el
 * del directorio puede ser el de la oficina del taller y la visita haberla
 * hecho otro—.
 */
export function aQuienSeLePide(
  r: { perito_email?: unknown; proveedor_email?: unknown } | null | undefined,
): string {
  const aMano = String(r?.perito_email ?? '').trim();
  if (aMano) return aMano;
  return String(r?.proveedor_email ?? '').trim();
}

/**
 * Las que toca: ya pasó su hora, siguen abiertas y no se ha pedido todavía.
 *
 * `cita_at < NOW() - 12h` y no `< NOW()` a secas: una visita de las 18:00 no
 * se pide a las 19:00, se pide a la mañana siguiente. Como el cron corre a las
 * 07:00, doce horas dejan fuera todo lo de ayer por la tarde y dentro todo lo
 * de ayer por la mañana.
 *
 * Se trae el correo del proveedor por si el perito salió del directorio.
 */
export const SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO = `
  SELECT r.*, e.cliente_nombre,
         v.plate, v.brand, v.model,
         p.email AS proveedor_email
    FROM erp_revisiones_taller r
    LEFT JOIN moveadvisor_user_vehicles v ON v.id = r.vehicle_id
    LEFT JOIN erp_encargos_venta e
           ON e.vehicle_id = r.vehicle_id AND e.cerrado_at IS NULL
    LEFT JOIN erp_proveedores p
           ON p.id = NULLIF(COALESCE(r.perito_id, ''), '')
           OR p.id = NULLIF(COALESCE(r.taller_id, ''), '')
   WHERE r.estado <> 'Hecha'
     AND r.cita_at IS NOT NULL
     AND r.cita_at < NOW() - INTERVAL '12 hours'
     AND r.resultado_pedido_at IS NULL
   ORDER BY r.cita_at`;

export async function pideLosResultadosQueFalten(): Promise<LoQuePedimos> {
  const { rows } = await query<Record<string, unknown>>(SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO)
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));

  let pedidos = 0;
  let sinCorreo = 0;
  let fallados = 0;

  for (const fila of rows) {
    const a = aQuienSeLePide(fila);
    /*
     * Sin correo no se pide y **tampoco se marca**.
     *
     * Marcarlo diría que ya se le pidió a alguien que no existe, y esa
     * revisión no volvería a salir por aquí nunca. Se queda sin marcar y la
     * recoge el aviso de «visitas pasadas que nadie ha cerrado», que es donde
     * una persona la ve y llama.
     */
    if (!a) { sinCorreo += 1; continue; }

    const cita = String(fila.cita_at);
    const aDomicilio = String(fila.modalidad ?? '').trim() === 'a_domicilio';
    const { subject, html } = elCorreoPidiendoElResultado({
      quien: String((aDomicilio ? fila.perito : fila.taller) ?? ''),
      cliente_nombre: String(fila.cliente_nombre ?? ''),
      marca: String(fila.brand ?? ''),
      modelo: String(fila.model ?? ''),
      matricula: String(fila.plate ?? ''),
      dia: elDiaDeLaCita(cita),
      hora: laHoraDeLaCita(cita),
      aDomicilio,
      direccion: String(fila.direccion ?? ''),
    });

    try {
      await enviar({ to: a, subject, html });
    } catch (err) {
      console.error('[pide-resultado] no sale el correo:', (err as Error).message);
      fallados += 1;
      continue;
    }

    // Después de mandarlo, nunca antes: un fallo del envío dejaría la
    // petición dada por hecha y el resultado no llegaría nunca.
    await query(
      `UPDATE erp_revisiones_taller SET resultado_pedido_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [String(fila.id ?? '')]
    ).catch((e) => console.error('[pide-resultado] sin marcar:', (e as Error).message));

    pedidos += 1;
  }

  return { miradas: rows.length, pedidos, sin_correo: sinCorreo, fallados };
}
