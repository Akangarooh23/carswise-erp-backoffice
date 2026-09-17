/**
 * El recordatorio de la cita del taller, el día de antes.
 *
 * La cita se le cuenta cuando se cierra, y entre medias pasan días. El que la
 * apuntó en su calendario no necesita nada; el que no, no vuelve a abrir aquel
 * correo — y el día señalado el coche no aparece. Eso nos cuesta la cita,
 * retrasa su anuncio y no lo sabe nadie hasta que llama el taller.
 *
 * Vive aparte de la ruta de cron a propósito: así se puede leer qué hace y, más
 * importante, probar la regla de a quién le toca sin base de datos ni correo.
 */
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { enviar } from './correo.js';
import { elRecordatorioDeLaCitaDelTaller } from './correos-del-encargo.js';
import {
  SQL_CANDIDATAS_A_RECORDATORIO, elRecordatorioToca, elDiaDeLaCita, laHoraDeLaCita,
} from './revision-del-taller.js';

export interface LoQueSeRecordo {
  mirados: number;
  mandados: number;
  /** Los que tocaban y no se pudieron mandar. Salen en el resultado, no se callan. */
  fallados: number;
}

/**
 * Se recuerdan las citas que toquen y se apunta cuáles.
 *
 * Se marca **después** de mandar, no antes: al revés, un fallo de Resend dejaría
 * la cita marcada como recordada y ese cliente no recibiría nada nunca. Marcar
 * de más es un correo perdido; marcar de menos, en la siguiente pasada se
 * reintenta.
 */
export async function recuerdaLasCitasDelTaller(ahora: Date = new Date()): Promise<LoQueSeRecordo> {
  const r = await query(SQL_CANDIDATAS_A_RECORDATORIO).catch(() => ({ rows: [] }));
  const filas = r.rows as Record<string, unknown>[];

  let mandados = 0;
  let fallados = 0;

  for (const fila of filas) {
    if (!elRecordatorioToca(fila, ahora)) continue;

    const correo = String(fila.cliente_email ?? '').trim();
    /*
     * Sin correo no hay recordatorio y tampoco se marca.
     *
     * Marcarlo daría por hecho algo que no ha pasado. Que se quede sin marcar
     * cuesta una consulta más por pasada y deja la puerta abierta a que se
     * mande el día que su encargo tenga correo.
     */
    if (!correo) continue;

    const cita = String(fila.cita_at);
    const { subject, html } = elRecordatorioDeLaCitaDelTaller({
      cliente_nombre: String(fila.cliente_nombre ?? ''),
      marca: String(fila.brand ?? ''),
      modelo: String(fila.model ?? ''),
      matricula: String(fila.plate ?? ''),
      taller: String(fila.taller ?? ''),
      direccion: String(fila.direccion ?? ''),
      dia: elDiaDeLaCita(cita),
      hora: laHoraDeLaCita(cita),
      panel: `${config.PUBLIC_SITE_URL.replace(/\/+$/, '')}/panel/solicitudes`,
    });

    try {
      // `alClienteSiempre`: un desvío de pruebas olvidado en producción dejaría
      // al cliente sin su propio recordatorio, y el envío saldría bien.
      await enviar({
        to: correo, subject, html, alClienteSiempre: true,
        movil: {
          titulo: 'Recuerda tu cita en el taller',
          cuerpo: [elDiaDeLaCita(cita), laHoraDeLaCita(cita) && `a las ${laHoraDeLaCita(cita)}`, fila.direccion || fila.taller]
            .filter(Boolean).join(' · '),
        },
      });
    } catch (err) {
      console.error('[recordatorio-taller] no sale el correo:', (err as Error).message);
      fallados += 1;
      continue;
    }

    await query(
      `UPDATE erp_revisiones_taller SET recordado_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [String(fila.id ?? '')]
    ).catch((e) => console.error('[recordatorio-taller] sin marcar:', (e as Error).message));

    mandados += 1;
  }

  return { mirados: filas.length, mandados, fallados };
}
