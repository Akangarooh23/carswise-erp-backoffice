import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { AuthContext, readStoredAuth } from './store/auth.js';
import type { AuthUser } from './types/index.js';
import './index.css';

const BASE = '/api';

function Root() {
  const stored = readStoredAuth();
  const [token, setToken] = useState<string | null>(stored.token);
  const [user, setUser]   = useState<AuthUser | null>(stored.user);

  useEffect(() => {
    function onTokenRefreshed(e: Event) {
      const newToken = (e as CustomEvent<{ token: string }>).detail.token;
      setToken(newToken);
    }
    window.addEventListener('cw:token-refreshed', onTokenRefreshed);
    return () => window.removeEventListener('cw:token-refreshed', onTokenRefreshed);
  }, []);

  function login(newToken: string, newUser: AuthUser, newRefreshToken?: string) {
    localStorage.setItem('cw_erp_token', newToken);
    localStorage.setItem('cw_erp_user', JSON.stringify(newUser));
    if (newRefreshToken) localStorage.setItem('cw_erp_refresh', newRefreshToken);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    const refreshToken = localStorage.getItem('cw_erp_refresh');
    if (refreshToken) {
      fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem('cw_erp_token');
    localStorage.removeItem('cw_erp_refresh');
    localStorage.removeItem('cw_erp_user');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
