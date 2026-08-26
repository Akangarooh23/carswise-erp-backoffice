import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import type { Role } from '../middleware/auth.js';

/**
 * El personal del ERP.
 *
 * Antes eran cuatro cuentas escritas en el código, una por área, con la
 * contraseña en una variable de entorno. Tres personas en Operaciones
 * compartían cuenta: el registro solo podía decir «ops», nunca quién, y dar de
 * baja a alguien obligaba a cambiarle la clave a todo su equipo.
 *
 * Ahora las personas viven en `erp_staff` y sus contraseñas en
 * `erp_staff_passwords`, que ya existía.
 *
 * Las cuatro cuentas de siempre siguen funcionando a propósito. Son el modo de
 * arranque: si la tabla está vacía o la base no responde, alguien tiene que
 * poder entrar a arreglarlo. El día que haya personal dado de alta, dejan de
 * usarse solas — pero seguir teniendo una puerta es lo que evita quedarse
 * fuera de tu propio backoffice.
 */

const scrypt = promisify(scryptCb);

export const ROLES: Role[] = ['admin', 'support', 'operations', 'sales'];

export interface Persona {
  id: string;
  email: string;
  nombre: string;
  rol: Role;
  activo: boolean;
  /** true cuando viene de las variables de entorno y no de la tabla. */
  deArranque?: boolean;
  ultimoAcceso?: string | null;
}

// ── Contraseñas ─────────────────────────────────────────────────────────────

export async function cifrar(clave: string): Promise<string> {
  const sal = randomBytes(16).toString('hex');
  const hash = (await scrypt(clave, sal, 64)) as Buffer;
  return sal + ':' + hash.toString('hex');
}

export async function comprobar(clave: string, guardada: string): Promise<boolean> {
  const [sal, hex] = String(guardada).split(':');
  if (!sal || !hex) return false;
  const esperado = Buffer.from(hex, 'hex');
  const calculado = (await scrypt(clave, sal, 64)) as Buffer;
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(esperado, calculado);
}

// ── Las cuatro cuentas de arranque ──────────────────────────────────────────

function deArranque(): (Persona & { clave: string })[] {
  return [
    { id: 'arranque-admin', email: 'admin@carswise.es',   nombre: 'Admin PopCar', rol: 'admin',      activo: true, deArranque: true, clave: config.ERP_ADMIN_PASSWORD },
    { id: 'arranque-sup',   email: 'support@carswise.es', nombre: 'Soporte',      rol: 'support',    activo: true, deArranque: true, clave: config.ERP_SUPPORT_PASSWORD },
    { id: 'arranque-ops',   email: 'ops@carswise.es',     nombre: 'Operaciones',  rol: 'operations', activo: true, deArranque: true, clave: config.ERP_OPS_PASSWORD },
    { id: 'arranque-com',   email: 'sales@carswise.es',   nombre: 'Comercial',    rol: 'sales',      activo: true, deArranque: true, clave: config.ERP_SALES_PASSWORD },
  ];
}

// ── Consultas ───────────────────────────────────────────────────────────────

function aPersona(f: Record<string, unknown>): Persona {
  return {
    id: String(f.id),
    email: String(f.email),
    nombre: String(f.nombre),
    rol: f.rol as Role,
    activo: f.activo !== false,
    ultimoAcceso: f.last_login_at ? new Date(f.last_login_at as string).toISOString() : null,
  };
}

export async function listar(): Promise<Persona[]> {
  const r = await query(
    `SELECT id, email, nombre, rol, activo, last_login_at
     FROM erp_staff ORDER BY activo DESC, nombre ASC`
  );
  return r.rows.map(aPersona);
}

/** Busca por correo. Primero en la tabla; si no está, en las de arranque. */
export async function buscar(email: string): Promise<(Persona & { clave?: string }) | null> {
  const correo = email.trim().toLowerCase();
  try {
    const r = await query(
      `SELECT id, email, nombre, rol, activo, last_login_at
       FROM erp_staff WHERE lower(email) = $1 LIMIT 1`,
      [correo]
    );
    if (r.rows.length) return aPersona(r.rows[0]);
  } catch (e) {
    // Sin base no se puede consultar, pero las de arranque siguen valiendo:
    // es justo el caso en que hace falta poder entrar.
    console.error('[personal] no se ha podido consultar erp_staff:', (e as Error).message);
  }
  return deArranque().find((p) => p.email === correo) ?? null;
}

export async function claveGuardada(email: string): Promise<string | null> {
  try {
    const r = await query('SELECT password_hash FROM erp_staff_passwords WHERE lower(email) = $1', [
      email.trim().toLowerCase(),
    ]);
    return r.rows.length ? String(r.rows[0].password_hash) : null;
  } catch {
    return null;
  }
}

export async function anotarAcceso(email: string): Promise<void> {
  try {
    await query('UPDATE erp_staff SET last_login_at = NOW() WHERE lower(email) = $1', [
      email.trim().toLowerCase(),
    ]);
  } catch { /* que no falle el login por esto */ }
}

// ── Altas y cambios ─────────────────────────────────────────────────────────

export async function crear(datos: {
  email: string; nombre: string; rol: Role; clave: string; creadoPor: string;
}): Promise<Persona> {
  const correo = datos.email.trim().toLowerCase();
  const r = await query(
    `INSERT INTO erp_staff (email, nombre, rol, creado_por)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, nombre, rol, activo, last_login_at`,
    [correo, datos.nombre.trim(), datos.rol, datos.creadoPor]
  );
  await ponerClave(correo, datos.clave);
  return aPersona(r.rows[0]);
}

export async function ponerClave(email: string, clave: string): Promise<void> {
  const hash = await cifrar(clave);
  await query(
    `INSERT INTO erp_staff_passwords (email, password_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
    [email.trim().toLowerCase(), hash]
  );
}

export async function cambiarRol(id: string, rol: Role): Promise<void> {
  await query('UPDATE erp_staff SET rol = $1, updated_at = NOW() WHERE id = $2', [rol, id]);
}

export async function cambiarActivo(id: string, activo: boolean): Promise<void> {
  await query('UPDATE erp_staff SET activo = $1, updated_at = NOW() WHERE id = $2', [activo, id]);
}

export async function porId(id: string): Promise<Persona | null> {
  const r = await query(
    'SELECT id, email, nombre, rol, activo, last_login_at FROM erp_staff WHERE id = $1',
    [id]
  );
  return r.rows.length ? aPersona(r.rows[0]) : null;
}

/** Cuántos administradores activos quedan. Sirve para no quedarse sin ninguno. */
export async function admins(): Promise<number> {
  const r = await query(`SELECT COUNT(*)::int AS n FROM erp_staff WHERE rol = 'admin' AND activo`);
  return r.rows[0]?.n ?? 0;
}
