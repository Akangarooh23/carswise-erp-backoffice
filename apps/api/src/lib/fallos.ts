/**
 * Qué se le cuenta al navegador cuando algo falla.
 *
 * Las rutas devolvían el mensaje de Postgres tal cual: «column t.assigned_to
 * does not exist», «duplicate key value violates constraint
 * fk_ticket_user»... Ochenta y seis sitios. Dos problemas:
 *
 * - Va nombres de tablas, columnas y restricciones a la respuesta. El ERP está
 *   detrás de sesión, así que no es grave, pero es el mapa de la base saliendo
 *   por la puerta y no hace falta que salga.
 *
 * - A quien está delante no le sirve de nada. Un trabajador que lee «violates
 *   foreign key constraint» no sabe qué hacer; y quien tiene que arreglarlo lo
 *   necesita en el registro del servidor, no en una captura de pantalla.
 *
 * Así que el mensaje va siempre a la consola del servidor, y solo se devuelve
 * en desarrollo, donde el que mira y el que arregla son la misma persona.
 */
import type { Response } from 'express';
import { config } from '../config.js';

/**
 * Responde un fallo del servidor dejando el detalle donde se puede leer.
 *
 * `codigo` es lo que la pantalla usa para decidir qué enseñar; el mensaje de la
 * excepción es para quien lea el registro.
 */
export function falloInterno(res: Response, codigo: string, err: unknown): void {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error(`[${codigo}]`, mensaje);
  res.status(500).json({
    ok: false,
    error: codigo,
    // En desarrollo se devuelve: quien mira la pantalla es quien arregla.
    ...(config.NODE_ENV === 'production' ? {} : { detail: mensaje }),
  });
}
