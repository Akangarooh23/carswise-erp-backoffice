import { config } from '../config.js';

/**
 * El enlace al anuncio, entero.
 *
 * Hay solicitudes cuyo `vehicle_url` se guardó a medias, solo con el trozo
 * final: `/marketplace-vo/<id>`. Dentro de PopCar eso vale; en un correo no,
 * porque no hay ninguna página contra la que resolverlo, y el cliente recibía
 * un enlace que no llevaba a ningún sitio.
 *
 * Devuelve null cuando no hay nada que abrir, para no poner un botón muerto.
 */
export function enlaceAlAnuncio(url?: string | null): string | null {
  const s = (url ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Cualquier otro esquema —mailto:, javascript:— no es un anuncio.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  const base = config.PUBLIC_SITE_URL.replace(/\/+$/, '');
  return s.startsWith('/') ? base + s : `${base}/${s}`;
}
