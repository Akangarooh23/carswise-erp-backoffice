/**
 * Los papeles que se pueden adjuntar a un correo a un proveedor.
 *
 * Salen de los documentos del coche, y el coche tiene **tres cajones**: el
 * expediente, el pedido y cada tramo de transporte. Los papeles del vehículo
 * —la ficha, el COC, la factura del vendedor— se suben en el pedido, que es
 * donde se piden; el DNI del cliente, en el expediente. Mirando uno solo, la
 * lista sale vacía justo cuando los papeles existen, y quien la ve piensa que
 * no ha subido nada.
 *
 * No se adjunta nada por defecto y **se eligen uno a uno**: un correo a la
 * gestoría con el DNI del cliente anterior no es una errata, es un incidente de
 * protección de datos, y eso no se corrige con otro correo.
 *
 * Por eso se enseñan con su nombre y su peso antes de mandar. Un adjunto se
 * reconoce por el nombre y por el tamaño: dos PDF de 200 kB llamados
 * «documento.pdf» no se distinguen, y el que se equivoca lo hace ahí.
 */
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { lineaDeAdjuntos, type IdiomaDelCorreo } from './lo-que-va-adjunto.js';

const BUCKET = 'vehicle-files';

/**
 * Lo que Resend admite de una vez.
 *
 * El límite de verdad es más alto, pero un correo de veinte megas lo rebota
 * media España. Se corta antes y se dice, en vez de mandarlo y que se pierda en
 * el buzón de alguien.
 */
export const TOPE_DE_ADJUNTOS = 8 * 1024 * 1024;

export interface PapelDisponible {
  id: string;
  papel: string;
  nombre: string;
  tipo: string;
  tamano: number;
  /** De qué cajón sale, para poder decirlo en la lista. */
  de: string;
}

/** Un cajón de papeles: de qué es y de cuál. */
export interface Cajon { ambito: string; id: string | null | undefined }

/** Los que hay en cualquiera de esos cajones, para poder elegirlos. */
export async function papelesQueSePuedenAdjuntar(cajones: Cajon[]): Promise<PapelDisponible[]> {
  const utiles = (cajones ?? []).filter((c) => c && c.ambito && c.id);
  if (!utiles.length) return [];
  const r = await query(
    `SELECT id::text AS id, papel, nombre, tipo, tamano, ambito
       FROM erp_documentos
      WHERE (ambito, ambito_id) IN (SELECT * FROM UNNEST($1::text[], $2::text[]))
      ORDER BY created_at DESC`,
    [utiles.map((c) => c.ambito), utiles.map((c) => String(c.id))]
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    papel: String(x.papel ?? ''),
    nombre: String(x.nombre ?? ''),
    tipo: String(x.tipo ?? ''),
    tamano: Number(x.tamano ?? 0),
    de: String(x.ambito ?? ''),
  }));
}

/** Lo que se dice cuando no se pueden mandar. */
export class NoSePuedenAdjuntar extends Error {}

/**
 * Los ficheros de verdad, listos para el correo.
 *
 * Se piden por su identificador **y por los cajones de este coche**: con el
 * identificador suelto se podría adjuntar el papel de otro cliente, y estos
 * correos salen fuera.
 */
export async function traeLosAdjuntos(
  cajones: Cajon[],
  quiere: unknown
): Promise<{ filename: string; content: string; papel: string }[]> {
  const ids = Array.isArray(quiere) ? quiere.map((x) => String(x)).filter(Boolean) : [];
  if (!ids.length) return [];
  const utiles = (cajones ?? []).filter((c) => c && c.ambito && c.id);
  if (!utiles.length) throw new NoSePuedenAdjuntar('No hay de dónde sacar esos papeles.');

  const r = await query(
    `SELECT id::text AS id, nombre, papel, tipo, ruta, tamano
       FROM erp_documentos
      WHERE (ambito, ambito_id) IN (SELECT * FROM UNNEST($1::text[], $2::text[]))
        AND id::text = ANY($3)`,
    [utiles.map((c) => c.ambito), utiles.map((c) => String(c.id)), ids]
  );
  const filas = r.rows as { id: string; nombre: string; papel: string; ruta: string; tamano: number }[];
  if (filas.length !== ids.length) {
    throw new NoSePuedenAdjuntar('Alguno de los papeles ya no está. Vuelve a abrirlo.');
  }

  const pesan = filas.reduce((t, f) => t + (Number(f.tamano) || 0), 0);
  if (pesan > TOPE_DE_ADJUNTOS) {
    throw new NoSePuedenAdjuntar(
      `Los papeles pesan ${Math.round(pesan / 1024 / 1024)} MB y no pueden pasar de ${TOPE_DE_ADJUNTOS / 1024 / 1024}. Manda menos de una vez.`
    );
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = config;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new NoSePuedenAdjuntar('El almacén de papeles no está configurado.');
  }

  const salida: { filename: string; content: string; papel: string }[] = [];
  for (const f of filas) {
    const bajada = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.ruta}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    // Uno que no se puede leer para el correo entero: mandarlo sin él sería
    // mandar un encargo al que le falta justo el papel que hacía falta.
    if (!bajada.ok) throw new NoSePuedenAdjuntar(`No se ha podido leer «${f.nombre}».`);
    salida.push({
      filename: String(f.nombre).replace(/[\r\n"]/g, ''),
      content: Buffer.from(await bajada.arrayBuffer()).toString('base64'),
      papel: String(f.papel ?? ''),
    });
  }
  return salida;
}

/**
 * Los ficheros y **lo que hay que decir en el cuerpo** para que se abran.
 *
 * Van juntos a propósito. Adjuntar el fichero y anunciarlo son la misma
 * decisión, y separarlas es como se llega a un correo que dice que va la
 * factura sin que vaya, o al revés. Quien manda el correo elige los papeles;
 * la frase la escribe esto, y por eso no se puede olvidar.
 */
export async function loQueSeAdjunta(
  cajones: Cajon[],
  quiere: unknown,
  idioma: IdiomaDelCorreo
): Promise<{ attachments: { filename: string; content: string }[]; linea: string }> {
  const traidos = await traeLosAdjuntos(cajones, quiere);
  return {
    attachments: traidos.map(({ filename, content }) => ({ filename, content })),
    linea: lineaDeAdjuntos(traidos.map((a) => ({ nombre: a.filename, papel: a.papel })), idioma),
  };
}
