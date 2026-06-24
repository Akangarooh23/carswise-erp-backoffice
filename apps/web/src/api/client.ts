import type { ApiResponse } from '../types/index.js';

const BASE = '/api';

function getToken(): string {
  return localStorage.getItem('cw_erp_token') ?? '';
}

function getRefreshToken(): string {
  return localStorage.getItem('cw_erp_refresh') ?? '';
}

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (isRefreshing) {
    return new Promise((resolve) => refreshQueue.push(resolve));
  }

  isRefreshing = true;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('refresh_failed');
    const body = await res.json();
    if (!body.ok || !body.token) throw new Error('refresh_failed');

    localStorage.setItem('cw_erp_token', body.token);
    if (body.refresh_token) localStorage.setItem('cw_erp_refresh', body.refresh_token);
    window.dispatchEvent(new CustomEvent('cw:token-refreshed', { detail: { token: body.token } }));

    refreshQueue.forEach((cb) => cb(body.token));
    refreshQueue = [];
    return body.token;
  } catch {
    localStorage.removeItem('cw_erp_token');
    localStorage.removeItem('cw_erp_refresh');
    localStorage.removeItem('cw_erp_user');
    refreshQueue.forEach((cb) => cb(null));
    refreshQueue = [];
    return null;
  } finally {
    isRefreshing = false;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retryRes = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...(options.headers ?? {}),
        },
      });
      return retryRes.json().catch(() => ({ ok: false, error: 'invalid_json' })) as Promise<ApiResponse<T>>;
    }
    window.location.href = '/login';
  }

  return body as ApiResponse<T>;
}

export async function downloadInvoicePdf(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('pdf_download_failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path, { method: 'GET' }),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => request<T>(path, { method: 'DELETE' }),
  login: async (email: string, password: string) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },
};
