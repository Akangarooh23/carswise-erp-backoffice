/**
 * Qué ficheros se aceptan para un IDCar.
 *
 * Se subían sin mirar el tipo, y acaban en un bucket público de Supabase. Un
 * .html o un .svg subido ahí se sirve desde una dirección pública y puede
 * llevar guion dentro: no revienta el ERP, pero deja un sitio nuestro sirviendo
 * lo que alguien quiera. Y un ejecutable en el garaje de un cliente no es un
 * documento del coche.
 *
 * Lo que hay guardado hoy son fotos —png, jpeg, webp— y PDF, y nada más. La
 * lista no quita nada que se esté usando.
 *
 * Se mira el tipo declarado y la extensión, y tienen que decir lo mismo: el
 * navegador manda los dos y mentir en uno solo es lo fácil.
 */

/** Tipo declarado → extensiones que le corresponden. */
const PERMITIDOS: Record<string, string[]> = {
  'image/png':       ['png'],
  'image/jpeg':      ['jpg', 'jpeg'],
  'image/webp':      ['webp'],
  'image/gif':       ['gif'],
  'application/pdf': ['pdf'],
};

/** Lo que se le puede decir a quien sube. */
export const TIPOS_ACEPTADOS = 'imágenes (PNG, JPG, WEBP, GIF) o PDF';

/**
 * El tamaño máximo, en bytes.
 *
 * El cuerpo de la petición ya está limitado a 4 MB, y en base64 un fichero
 * ocupa un tercio más, así que por encima de 3 MB no llegaría entero de todas
 * formas. Mejor decirlo que dejar que falle sin explicación.
 */
export const TAMANO_MAXIMO = 3 * 1024 * 1024;

export interface Rechazo { motivo: string }

/**
 * `null` si el fichero vale; si no, por qué no.
 *
 * Devuelve el motivo en vez de un booleano porque quien sube tiene que poder
 * leer qué ha pasado: «no se pudo subir» no dice si el problema es el tipo, el
 * tamaño o el nombre.
 */
export function revisaFichero(
  nombre: unknown,
  tipo: unknown,
  tamanoBytes: number
): Rechazo | null {
  const nom = String(nombre ?? '').trim();
  const mime = String(tipo ?? '').trim().toLowerCase().split(';')[0];

  if (!nom) return { motivo: 'El fichero no tiene nombre.' };

  const extensiones = PERMITIDOS[mime];
  if (!extensiones) return { motivo: `Solo se aceptan ${TIPOS_ACEPTADOS}.` };

  const ext = nom.includes('.') ? nom.split('.').pop()!.toLowerCase() : '';
  if (!extensiones.includes(ext)) {
    return { motivo: `El nombre acaba en «.${ext || '' }» y el fichero dice ser ${mime}.` };
  }

  if (tamanoBytes > TAMANO_MAXIMO) {
    const mb = (tamanoBytes / 1024 / 1024).toFixed(1).replace('.', ',');
    return { motivo: `El fichero pesa ${mb} MB y el máximo son 3 MB.` };
  }

  return null;
}

/** Cuánto ocupa de verdad lo que viene en base64. */
export function tamanoDeBase64(base64: unknown): number {
  const s = String(base64 ?? '');
  // Cada 4 caracteres son 3 bytes, menos el relleno del final.
  const relleno = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - relleno);
}
