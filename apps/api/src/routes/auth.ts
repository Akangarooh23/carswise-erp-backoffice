import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import type { Role } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
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

authRouter.post('/auth/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  const { email, password } = parsed.data;
  const user = getStaffUsers().find(
    (u) => u.email === email.toLowerCase() && u.password === password
  );

  if (!user) {
    res.status(401).json({ ok: false, error: 'invalid_credentials' });
    return;
  }

  const token = jwt.sign(
    { sub: user.email, role: user.role, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    ok: true,
    token,
    user: { email: user.email, role: user.role, name: user.name },
  });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.actor });
});
