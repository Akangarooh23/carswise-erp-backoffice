/**
 * Todo lo que cambia datos deja rastro, sin tener que acordarse.
 *
 * El registro existía y solo lo llamaban las cuatro operaciones de personal: de
 * las cincuenta que cambian datos, cuarenta y cinco no dejaban nada. Publicar
 * un coche, borrarlo, cambiarle el precio, cerrar un lead o tocar una factura
 * no se podía saber quién lo hizo.
 *
 * Se podría haber puesto una llamada en cada manejador. Sería lo mismo que hay
 * hoy con otro nombre: el día que alguien añada una ruta nueva se olvidará, y
 * nadie lo notará hasta que haga falta el rastro y no esté. Así que va aquí,
 * una vez, y cubre lo que exista ahora y lo que se escriba después.
 *
 * Solo se anota lo que salió bien. Un intento fallido no cambió nada, y llenar
 * el registro de ruido hace que no se lea.
 */
import type { Request, Response, NextFunction } from 'express';
import { registrar, yaAnotado } from '../lib/auditoria.js';

/** El acceso no se audita aquí: son credenciales y ruido de cada pantalla. */
const FUERA = [/^\/auth\/login$/, /^\/auth\/refresh$/, /^\/auth\/logout$/];

/**
 * De la dirección al nombre del recurso.
 *
 * Se usa el patrón de la ruta —`/marketplace/vo/:id/units`— y no la dirección
 * concreta, para que dos peticiones al mismo sitio se agrupen igual. Si no hay
 * patrón, se quitan a mano los trozos que parecen identificadores.
 */
function recursoDe(req: Request): string {
  const patron = (req as Request & { route?: { path?: string } }).route?.path;
  const camino = patron ? String(patron) : req.path;
  return camino
    .split('/')
    .filter(Boolean)
    .filter((t) => !t.startsWith(':'))
    .filter((t) => !/^[0-9a-f-]{16,}$/i.test(t) && !/^\d+$/.test(t))
    .join('.') || 'api';
}

/** Verbos que ya vienen dichos en la propia dirección: `…/publish`, `…/bulk`. */
const ACCION_POR_METODO: Record<string, string> = {
  POST: 'crear',
  PUT: 'editar',
  PATCH: 'editar',
  DELETE: 'borrar',
};

function accionDe(req: Request): string {
  const patron = (req as Request & { route?: { path?: string } }).route?.path;
  const ultimo = String(patron ?? req.path).split('/').filter(Boolean).pop() ?? '';
  // Un último tramo que no es un identificador ni un plural del recurso suele
  // ser la acción: /leads/:id/notify, /marketplace/vo/bulk, /verify/run.
  const esVerbo = ultimo && !ultimo.startsWith(':') && req.method === 'POST';
  return esVerbo ? ultimo.replace(/-/g, '_') : ACCION_POR_METODO[req.method] ?? req.method.toLowerCase();
}

/** El identificador de lo tocado, si la ruta lo lleva. */
function idDe(req: Request): string | null {
  const p = req.params ?? {};
  return String(p.id ?? p.leadId ?? p.unitId ?? p.vehicleId ?? p.ticketId ?? '') || null;
}

/** Lo que hace falta para dejar constancia. Se puede sustituir en una prueba. */
export type Anotador = (req: Request, apunte: {
  accion: string; recurso: string; recursoId: string | null; datos?: unknown;
}) => void | Promise<void>;

/**
 * El middleware. Se le puede pasar otro anotador para poder probarlo sin base
 * de datos: lo que hay que comprobar es qué se apunta y cuándo, no que Postgres
 * sepa escribir una fila.
 */
export function apuntaCambios(anota: Anotador = registrar) {
  return function apunta(req: Request, res: Response, next: NextFunction) {
    if (!ACCION_POR_METODO[req.method]) return next();
    if (FUERA.some((r) => r.test(req.path))) return next();

    // El cuerpo se guarda ahora: algunos manejadores lo modifican al trabajar.
    const cuerpo = req.body && typeof req.body === 'object' ? { ...req.body } : undefined;

    // Se lee al terminar: `req.route` y `req.params` siguen ahí, comprobado con
    // una petición de verdad en auditoria.test.ts. Envolver `res.end` para leerlo
    // antes se probó y sobraba, además de meterse en medio de las descargas.

    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      // Si el manejador ya anotó algo suyo —con más contexto del que se puede
      // deducir desde aquí—, no se duplica.
      if (yaAnotado(req)) return;
      void anota(req, { accion: accionDe(req), recurso: recursoDe(req), recursoId: idDe(req), datos: cuerpo });
      });

    next();
  };
}
