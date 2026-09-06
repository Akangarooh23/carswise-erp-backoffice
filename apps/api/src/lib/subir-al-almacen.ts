/**
 * Guardar un fichero en el almacén y devolver su dirección.
 *
 * Estaba copiado en cada ruta que sube algo: las facturas de proveedor, los
 * documentos, los IdCar, los adjuntos del correo. La misma función cuatro
 * veces, y con la misma trampa dentro —la clave nueva de Supabase necesita
 * `apikey` además del `Authorization`, y sin ella el almacén contesta que no
 * sin decir por qué—. Copiada, esa nota se arregla en un sitio y sigue rota en
 * los otros tres.
 *
 * **No lanza.** Devuelve null si no se puede guardar: quien sube un PDF a una
 * factura no puede perder la factura porque el almacén esté caído. El que llama
 * decide qué hacer con el null, que casi siempre es «guarda igual y ya se
 * adjuntará».
 */

import { config } from '../config.js';

/** Dónde va cada cosa dentro del cubo. Una carpeta por tipo, no un cajón. */
export type Carpeta = 'provider-invoices' | 'peritaciones' | 'documentos';

const TIPOS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

/** La extensión de un nombre de fichero, en minúscula y sin el punto. */
export function laExtension(nombre: unknown): string {
  const n = String(nombre ?? '').trim();
  const trozo = n.includes('.') ? n.split('.').pop() : '';
  const limpio = String(trozo ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Sin extensión reconocible se guarda como PDF, que es lo que más hay aquí:
  // el nombre no cambia el contenido, y un fichero sin extensión no se abre.
  return limpio && limpio.length <= 5 ? limpio : 'pdf';
}

/** Cómo se llama dentro del almacén: por su identificador, no por su nombre. */
export function comoSeGuarda(carpeta: Carpeta, id: string, nombre: unknown): string {
  return `${carpeta}/${id}.${laExtension(nombre)}`;
}

export async function subeAlAlmacen(
  base64: string,
  nombre: string,
  carpeta: Carpeta,
  id: string
): Promise<string | null> {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;

  try {
    const camino = comoSeGuarda(carpeta, id, nombre);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/vehicle-files/${camino}`, {
      method: 'POST',
      headers: {
        // Sin `apikey` la clave nueva de Supabase no vale: ver invoice-pdf.ts.
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': TIPOS[laExtension(nombre)] ?? 'application/octet-stream',
        // Reemplazar en vez de fallar: adjuntar dos veces el mismo documento es
        // corregirse, no un error.
        'x-upsert': 'true',
      },
      body: Buffer.from(base64, 'base64'),
    });
    if (!res.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/vehicle-files/${camino}`;
  } catch {
    return null;
  }
}
