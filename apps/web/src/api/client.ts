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

/**
 * La respuesta, con una forma sola.
 *
 * La API no contesta siempre igual: la mayoría de las rutas devuelven
 * `{ ok, data }`, pero unas cuantas —las de visitas— devuelven lo suyo al
 * nivel de arriba: `{ ok, slots }`, `{ ok, pasos }`, `{ ok, bookings }`. Cada
 * pantalla tenía que saber cuál era cuál, y el día que se acertó mal el cuadro
 * salió vacío y el botón de copiar copió «undefined»: sin error, sin aviso, y
 * sin manera de notarlo hasta que alguien lo usó.
 *
 * Aquí se le da una forma sola: lo que venga suelto se mete también en `data`,
 * así que `r.data.slots` funciona en todas. Y se deja donde estaba, porque hay
 * pantallas que lo leen de arriba y no tienen por qué cambiar hoy.
 *
 * El tipo `ApiResponse<T>` declara `data: T`. Antes eso era mentira en esas
 * rutas: decía que estaba y no venía.
 */
export function conFormaUnica<T>(cuerpo: unknown): ApiResponse<T> {
  if (!cuerpo || typeof cuerpo !== 'object') {
    return { ok: false, data: undefined as T, error: 'invalid_json' };
  }
  const c = cuerpo as Record<string, unknown>;
  if ('data' in c) return c as unknown as ApiResponse<T>;
  const { ok, error, meta, ...resto } = c;
  // `resto` va primero: si una ruta devolviera una clave llamada `ok` dentro de
  // lo suyo, manda la de fuera, que es la que dice si salió bien.
  return { ...resto, ok: ok === true, error, meta, data: resto } as unknown as ApiResponse<T>;
}

/**
 * Cuando no se llega al servidor.
 *
 * `fetch` **rechaza** —no devuelve— si no hay red: sin conexión, DNS caído,
 * servidor inalcanzable, CORS. Y este cliente promete lo contrario: que los
 * errores son valores, `{ ok, data, error }`, para que las pantallas puedan
 * hacer `if (res.ok) … else …` sin `try/catch`.
 *
 * Esa promesa estaba rota justo en ese caso, y la consecuencia era grande:
 * **46 de las 91 pantallas apagan su indicador de carga en la línea recta**
 * —correctamente, porque confían en esta promesa—, así que un corte de red
 * dejaba la rueda girando para siempre y sin mensaje. Un 500 o un 404 sí
 * estaban cubiertos; lo que se escapaba era no llegar.
 *
 * En un back-office que se usa desde un taller con wifi regular, ése es el
 * caso más probable de los dos.
 */
const SIN_CONEXION = 'sin_conexion';

async function pide(url: string, options: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, options);
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getToken();
  const res = await pide(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res) return { ok: false, data: undefined as T, error: SIN_CONEXION } as ApiResponse<T>;

  const body = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      // El reintento tenía el mismo agujero: si la red se va entre la renovación
      // del token y esta segunda petición, rechazaba igual.
      const retryRes = await pide(`${BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...(options.headers ?? {}),
        },
      });
      if (!retryRes) return { ok: false, data: undefined as T, error: SIN_CONEXION } as ApiResponse<T>;
      const reintento = await retryRes.json().catch(() => ({ ok: false, error: 'invalid_json' }));
      return conFormaUnica<T>(reintento);
    }
    window.location.href = '/login';
  }

  return conFormaUnica<T>(body);
}

/**
 * Descarga un fichero que la API solo entrega con sesión.
 *
 * Un <a href> normal no lleva la cabecera de autorización, así que la descarga
 * se pide con fetch y se entrega como blob. Vale para el PDF de una factura y
 * para el CSV de todas: lo que cambia es la dirección.
 */
export async function descargaConSesion(path: string, filename: string) {
  const token = getToken();
  const res = await pide(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  // Esta sí lanza a propósito —quien la llama espera una excepción— pero el
  // mensaje tiene que distinguir «no hay red» de «el servidor ha dicho no».
  if (!res) throw new Error('Sin conexión: no se ha podido descargar el fichero');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { message?: string }).message || 'No se ha podido descargar el fichero';
    throw new Error(msg);
  }
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
