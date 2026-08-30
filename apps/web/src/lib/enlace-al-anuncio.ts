/**
 * El enlace al anuncio, entero.
 *
 * En la base hay solicitudes cuyo `vehicle_url` se guardó a medias, solo con el
 * trozo final: `/marketplace-vo/<id>`. En PopCar eso funciona; aquí no, porque
 * el ERP vive en otro dominio y el navegador lo resolvía contra él. Se pinchaba
 * «ver el anuncio» y salía una página que no existe.
 *
 * Devuelve null cuando no hay nada que abrir, para que quien lo llame pinte
 * texto en vez de un enlace roto.
 */
const POPCAR = 'https://www.popcar.tech';

export function enlaceAlAnuncio(url?: string | null): string | null {
  const s = (url ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Cualquier otro esquema —mailto:, javascript:— no es un anuncio.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  return s.startsWith('/') ? POPCAR + s : `${POPCAR}/${s}`;
}
