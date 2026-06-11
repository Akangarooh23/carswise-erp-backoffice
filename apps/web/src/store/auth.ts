import { createContext, useContext } from 'react';
import type { AuthUser } from '../types/index.js';

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser, refreshToken?: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function readStoredAuth(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem('cw_erp_token');
    const raw   = localStorage.getItem('cw_erp_user');
    const user  = raw ? (JSON.parse(raw) as AuthUser) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}
