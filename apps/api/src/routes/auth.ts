import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import type { Role } from '../middleware/auth.js';

export const authRouter = Router();

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const derivedBuf = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hashBuf, derivedBuf);
}

async function sendResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const recipient = config.RESEND_TEST_EMAIL || to;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'CarsWise <support@carswiseai.com>',
      to: recipient,
      subject: 'Recuperación de contraseña — CarsWise ERP',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
          <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🔐</div>
            <h1 style="color:#fff;margin:0;font-size:20px">Recuperación de contraseña</h1>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
            <p>Hola <strong>${name}</strong>,</p>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>CarsWise ERP</strong>.</p>
            <p>Haz clic en el botón para crear una nueva contraseña:</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${resetUrl}"
                 style="background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
                Restablecer contraseña
              </a>
            </div>
            <p style="font-size:13px;color:#64748b">
              Este enlace es válido durante <strong>1 hora</strong>.<br>
              Si no solicitaste este cambio, ignora este email — tu contraseña no se modificará.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
            <p style="font-size:12px;color:#94a3b8;margin:0">
              El equipo de CarsWise — <a href="https://carswiseai.com" style="color:#94a3b8">carswiseai.com</a>
            </p>
          </div>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message || `Resend error ${res.status}`);
  }
}

const ENSURE_REFRESH_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token      TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: false, error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface StaffUser { email: string; password: string; role: Role; name: string }

function getStaffUsers(): StaffUser[] {
  return [
    { email: 'admin@carswise.es',   password: config.ERP_ADMIN_PASSWORD,   role: 'admin',      name: 'Admin CarsWise' },
    { email: 'support@carswise.es', password: config.ERP_SUPPORT_PASSWORD, role: 'support',    name: 'Soporte' },
    { email: 'ops@carswise.es',     password: config.ERP_OPS_PASSWORD,     role: 'operations', name: 'Operaciones' },
    { email: 'sales@carswise.es',   password: config.ERP_SALES_PASSWORD,   role: 'sales',      name: 'Comercial' },
  ];
}

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  const { email, password } = parsed.data;
  const staffUser = getStaffUsers().find((u) => u.email === email.toLowerCase());

  if (!staffUser) {
    res.status(401).json({ ok: false, error: 'invalid_credentials' });
    return;
  }

  // Check DB-stored password first (set via password reset), fall back to env var
  let authenticated = false;
  try {
    const dbPw = await query('SELECT password_hash FROM erp_staff_passwords WHERE email = $1', [staffUser.email]);
    if (dbPw.rows.length) {
      authenticated = await verifyPassword(password, dbPw.rows[0].password_hash);
    } else {
      authenticated = staffUser.password === password;
    }
  } catch {
    authenticated = staffUser.password === password;
  }

  if (!authenticated) {
    res.status(401).json({ ok: false, error: 'invalid_credentials' });
    return;
  }

  const token = jwt.sign(
    { sub: staffUser.email, role: staffUser.role, name: staffUser.name },
    config.JWT_SECRET,
    { expiresIn: '8h' }
  );

  const refreshToken = randomBytes(40).toString('hex');
  const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  try {
    await query(ENSURE_REFRESH_TABLE, []).catch(() => {});
    await query(
      `INSERT INTO erp_refresh_tokens (token, email, expires_at) VALUES ($1, $2, $3)`,
      [refreshToken, staffUser.email, refreshExpiry]
    );
  } catch (err) {
    console.error('[auth] refresh token insert failed:', (err as Error).message);
  }

  res.json({
    ok: true,
    token,
    refresh_token: refreshToken,
    user: { email: staffUser.email, role: staffUser.role, name: staffUser.name },
  });
});

authRouter.post('/auth/refresh', async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || '').trim();
  if (!refreshToken) {
    res.status(401).json({ ok: false, error: 'missing_refresh_token' });
    return;
  }

  try {
    await query(ENSURE_REFRESH_TABLE, []).catch(() => {});
    const result = await query(
      `SELECT * FROM erp_refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );
    if (!result.rows.length) {
      res.status(401).json({ ok: false, error: 'invalid_or_expired_refresh_token' });
      return;
    }

    const row = result.rows[0] as { email: string };
    const staffUser = getStaffUsers().find((u) => u.email === row.email);
    if (!staffUser) {
      res.status(401).json({ ok: false, error: 'user_not_found' });
      return;
    }

    // Rotate: delete old, issue new refresh token
    await query(`DELETE FROM erp_refresh_tokens WHERE token = $1`, [refreshToken]);
    const newRefreshToken = randomBytes(40).toString('hex');
    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO erp_refresh_tokens (token, email, expires_at) VALUES ($1, $2, $3)`,
      [newRefreshToken, staffUser.email, refreshExpiry]
    );

    const token = jwt.sign(
      { sub: staffUser.email, role: staffUser.role, name: staffUser.name },
      config.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ ok: true, token, refresh_token: newRefreshToken });
  } catch (err) {
    console.error('[auth] refresh error:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'refresh_failed' });
  }
});

authRouter.post('/auth/logout', async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || '').trim();
  if (refreshToken) {
    try {
      await query(ENSURE_REFRESH_TABLE, []).catch(() => {});
      await query(`DELETE FROM erp_refresh_tokens WHERE token = $1`, [refreshToken]);
    } catch (err) {
      console.error('[auth] logout error:', (err as Error).message);
    }
  }
  res.json({ ok: true });
});

authRouter.post('/auth/forgot-password', forgotLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const staffUser = getStaffUsers().find((u) => u.email === email);

  // Always respond success to avoid email enumeration
  if (!staffUser) {
    res.json({ ok: true });
    return;
  }

  try {
    // Invalidate any previous unused tokens for this email
    await query(`UPDATE erp_password_resets SET used_at = NOW() WHERE email = $1 AND used_at IS NULL`, [email]);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await query(
      `INSERT INTO erp_password_resets (email, token, expires_at) VALUES ($1, $2, $3)`,
      [email, token, expiresAt]
    );

    const resetUrl = `${config.APP_URL}/reset-password?token=${token}`;
    await sendResetEmail(email, staffUser.name, resetUrl);
  } catch (err) {
    console.error('[auth] forgot-password error:', (err as Error).message);
  }

  res.json({ ok: true });
});

authRouter.post('/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!token || password.length < 8) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  try {
    const result = await query(
      `SELECT * FROM erp_password_resets WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [token]
    );

    if (!result.rows.length) {
      res.status(400).json({ ok: false, error: 'invalid_or_expired_token' });
      return;
    }

    const reset = result.rows[0];
    const hash = await hashPassword(password);

    await query(
      `INSERT INTO erp_staff_passwords (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, updated_at = NOW()`,
      [reset.email, hash]
    );
    await query(`UPDATE erp_password_resets SET used_at = NOW() WHERE id = $1`, [reset.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] reset-password error:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'reset_failed' });
  }
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.actor });
});
