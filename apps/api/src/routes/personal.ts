import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import * as personal from '../lib/personal.js';
import { registrar } from '../lib/auditoria.js';

/**
 * El equipo y lo que hace.
 *
 * Dar de alta a alguien lo hace solo un admin: es quien decide quien entra al
 * backoffice y con que permisos.
 *
 * Dos cosas que parecen paranoia y no lo son:
 *
 *   · No puedes desactivarte a ti mismo. Es el error de dedo mas facil de
 *     cometer y el mas caro: te quedas fuera y ya no puedes volver a activarte.
 *
 *   · No puedes quitar el ultimo administrador. Un ERP sin admin es un ERP
 *     donde nadie puede dar de alta a nadie, y se arregla tocando la base a
 *     mano.
 */

export const personalRouter = Router();

const ROLES = ['admin', 'support', 'operations', 'sales'] as const;

const alta = z.object({
  email: z.string().email(),
  nombre: z.string().min(2).max(80),
  rol: z.enum(ROLES),
  clave: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres'),
});

// ── Quiénes somos ───────────────────────────────────────────────────────────

personalRouter.get('/personal', requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ ok: true, data: await personal.listar() });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

personalRouter.post('/personal', requireRole(['admin']), async (req, res) => {
  const parsed = alta.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? 'datos_invalidos' });
    return;
  }
  try {
    const ya = await personal.buscar(parsed.data.email);
    if (ya && !ya.deArranque) {
      res.status(409).json({ ok: false, error: 'Ya hay alguien con ese correo.' });
      return;
    }
    const p = await personal.crear({
      ...parsed.data,
      creadoPor: (req as { actor?: { sub?: string } }).actor?.sub ?? 'desconocido',
    });
    await registrar(req, { accion: 'alta', recurso: 'personal', recursoId: p.id, datos: { email: p.email, rol: p.rol } });
    res.status(201).json({ ok: true, data: p });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

personalRouter.patch('/personal/:id/rol', requireRole(['admin']), async (req, res) => {
  const rol = String(req.body?.rol ?? '');
  if (!ROLES.includes(rol as typeof ROLES[number])) {
    res.status(400).json({ ok: false, error: 'rol_invalido' });
    return;
  }
  try {
    const p = await personal.porId(req.params.id);
    if (!p) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }

    if (p.rol === 'admin' && rol !== 'admin' && (await personal.admins()) <= 1) {
      res.status(409).json({ ok: false, error: 'Es el último administrador. Nombra otro antes de cambiarle el rol.' });
      return;
    }

    await personal.cambiarRol(p.id, rol as typeof ROLES[number]);
    await registrar(req, { accion: 'cambiar_rol', recurso: 'personal', recursoId: p.id, datos: { de: p.rol, a: rol } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

personalRouter.patch('/personal/:id/activo', requireRole(['admin']), async (req, res) => {
  const activo = Boolean(req.body?.activo);
  try {
    const p = await personal.porId(req.params.id);
    if (!p) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }

    const yo = (req as { actor?: { sub?: string } }).actor?.sub;
    if (!activo && yo && yo.toLowerCase() === p.email.toLowerCase()) {
      res.status(409).json({ ok: false, error: 'No puedes desactivarte a ti misma: te quedarías fuera.' });
      return;
    }
    if (!activo && p.rol === 'admin' && (await personal.admins()) <= 1) {
      res.status(409).json({ ok: false, error: 'Es el último administrador activo. Nombra otro antes de darle de baja.' });
      return;
    }

    await personal.cambiarActivo(p.id, activo);
    await registrar(req, { accion: activo ? 'reactivar' : 'desactivar', recurso: 'personal', recursoId: p.id, datos: { email: p.email } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

personalRouter.patch('/personal/:id/clave', requireRole(['admin']), async (req, res) => {
  const clave = String(req.body?.clave ?? '');
  if (clave.length < 10) {
    res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 10 caracteres' });
    return;
  }
  try {
    const p = await personal.porId(req.params.id);
    if (!p) { res.status(404).json({ ok: false, error: 'no_encontrado' }); return; }
    await personal.ponerClave(p.email, clave);
    // En el registro no entra la contraseña: se oculta sola, pero mejor ni pasarla.
    await registrar(req, { accion: 'cambiar_clave', recurso: 'personal', recursoId: p.id, datos: { email: p.email } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ── Qué se ha hecho ─────────────────────────────────────────────────────────

personalRouter.get('/actividad', requireRole(['admin']), async (req, res) => {
  const limite = Math.min(Number(req.query.limit) || 100, 500);
  const quien = String(req.query.actor || '').trim().toLowerCase();
  const cond: string[] = [];
  const vals: unknown[] = [];
  if (quien) { vals.push('%' + quien + '%'); cond.push(`lower(actor) LIKE $${vals.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  try {
    vals.push(limite);
    const r = await query(
      `SELECT id, actor, action, resource, resource_id, payload, ip, created_at
       FROM erp_audit_log ${where} ORDER BY created_at DESC LIMIT $${vals.length}`,
      vals
    );
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});
