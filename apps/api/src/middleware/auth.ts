import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'support' | 'operations' | 'sales';

export interface AuthPayload {
  sub: string;
  role: Role;
  name: string;
  iat: number;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    req.actor = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'token_invalid_or_expired' });
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (!req.actor || !roles.includes(req.actor.role)) {
        res.status(403).json({ ok: false, error: 'forbidden' });
        return;
      }
      next();
    });
  };
}
