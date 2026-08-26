import type { Request } from 'express';
import { query } from '../db/pool.js';

/**
 * Quién hizo qué y cuándo.
 *
 * La tabla `erp_audit_log` existía desde el principio, con sus índices, y tenía
 * cero filas: nadie escribía en ella. Era una intención que no llegó a
 * implementarse, y mientras tanto no había forma de responder a «¿quién cambió
 * el plan de este cliente?» ni «¿quién borró esta oferta?».
 *
 * Con datos personales de por medio, eso no es solo incomodidad operativa.
 *
 * Reglas de la casa:
 *
 *   · Registrar nunca puede tumbar la operación. Si la escritura del registro
 *     falla, se avisa por consola y se sigue: perder la traza es malo, pero
 *     perder el cambio del cliente porque el registro no cabía es peor.
 *
 *   · En el `payload` no entran contraseñas ni tokens. Lo que se guarda es qué
 *     cambió y a qué valor, no el secreto de nadie.
 */

/** Campos que no se guardan aunque vengan en el cuerpo de la petición. */
const PROHIBIDOS = /^(password|pass|clave|token|secret|authorization|hash)/i;

function limpiar(datos: unknown): unknown {
  if (!datos || typeof datos !== 'object') return datos;
  if (Array.isArray(datos)) return datos.map(limpiar);
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos as Record<string, unknown>)) {
    salida[k] = PROHIBIDOS.test(k) ? '[oculto]' : limpiar(v);
  }
  return salida;
}

/** La IP real detrás del proxy de Vercel, si la hay. */
function ipDe(req?: Request): string | null {
  if (!req) return null;
  const cabecera = req.headers['x-forwarded-for'];
  const bruta = Array.isArray(cabecera) ? cabecera[0] : cabecera;
  const ip = (bruta ? String(bruta).split(',')[0] : req.ip) || '';
  return ip.trim() || null;
}

export interface Apunte {
  /** Qué se hizo: 'crear', 'cambiar_rol', 'desactivar', 'cambiar_plan'… */
  accion: string;
  /** Sobre qué: 'personal', 'usuario', 'lead', 'oferta'… */
  recurso: string;
  recursoId?: string | null;
  /** Qué cambió. Sin contraseñas ni tokens: se ocultan solos. */
  datos?: unknown;
}

/**
 * Deja constancia. Nunca lanza: si el registro falla, la operación sigue.
 */
export async function registrar(req: Request | undefined, apunte: Apunte): Promise<void> {
  const actor = (req as { actor?: { sub?: string } } | undefined)?.actor?.sub ?? 'desconocido';
  try {
    await query(
      `INSERT INTO erp_audit_log (actor, action, resource, resource_id, payload, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actor,
        apunte.accion,
        apunte.recurso,
        apunte.recursoId ?? null,
        apunte.datos === undefined ? null : JSON.stringify(limpiar(apunte.datos)),
        ipDe(req),
      ]
    );
  } catch (e) {
    console.error('[auditoria] no se ha podido registrar:', (e as Error).message);
  }
}
