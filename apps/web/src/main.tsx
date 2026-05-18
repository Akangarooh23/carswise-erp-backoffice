import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { AuthContext, readStoredAuth } from './store/auth.js';
import type { AuthUser } from './types/index.js';
import './index.css';

function Root() {
  const stored = readStoredAuth();
  const [token, setToken] = useState<string | null>(stored.token);
  const [user, setUser]   = useState<AuthUser | null>(stored.user);

  function login(newToken: string, newUser: AuthUser) {
    localStorage.setItem('cw_erp_token', newToken);
    localStorage.setItem('cw_erp_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem('cw_erp_token');
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
