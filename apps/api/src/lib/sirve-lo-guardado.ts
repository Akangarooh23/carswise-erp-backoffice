/**
 * Entrega un fichero guardado en el almacén, por una ruta que pide sesión.
 *
 * La pantalla enlazaba directamente a la dirección del almacén. A un trabajador
 * con sesión eso no le da acceso de más —ya lo tiene—, pero deja el enlace suelto
 * por ahí y, sobre todo, ata la pantalla a que el cubo sea público: el día que
 * las facturas se muden a uno privado, esos enlaces dejan de abrir.
 *
 * Ese día ya llegó —`lib/subir-al-almacen.ts` guarda en `erp-documentos`, que es
 * privado—, y por eso esto dejó de vivir dentro de `routes/invoice-download.ts`:
 * lo necesita también la peritación, y probablemente lo siguiente que se suba.
 *
 * A un fichero de fuera —Stripe— se le manda con un redirect: no es nuestro y su
 * dirección ya lleva su propia llave.
 */
import { config } from '../config.js';

export async function sirveGuardado(
  url: string,
  res: import('express').Response,
  nombre: string
): Promise<void> {
  if (!url) { res.status(404).json({ ok: false, error: 'sin fichero' }); return; }
  if (!url.includes('/storage/v1/object/')) { res.redirect(302, url); return; }

  const clave = config.SUPABASE_SERVICE_KEY;
  // Por la dirección privada —la misma sin `/public`—, que es la que sigue
  // valiendo cuando el cubo deje de ser público. Y con `apikey`, porque las
  // claves nuevas de Supabase no son JWT y por Authorization las rechaza.
  const directa = url.replace('/object/public/', '/object/');
  const r = await fetch(directa, clave ? { headers: { apikey: clave, Authorization: `Bearer ${clave}` } } : undefined);
  if (!r.ok) { res.status(502).json({ ok: false, error: 'no se ha podido traer el fichero' }); return; }

  const buf = Buffer.from(await r.arrayBuffer());
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre.replace(/"/g, '')}"`);
  res.setHeader('Content-Length', buf.byteLength);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buf);
}
