/**
 * Traer el papel y pasárselo al lector.
 *
 * Aparte de `la-ficha-tecnica.ts` a propósito: allí están las reglas —qué
 * código es qué, cómo se pasa de kilovatios a caballos— y se pueden probar sin
 * red ni claves. Aquí está lo que no se puede probar así: bajar el fichero del
 * almacén y hablar con el modelo.
 *
 * El lector es Gemini, que es el que ya está montado en PopCar para el informe
 * de venta y lee PDF sin convertirlo a imagen. Misma clave, ningún proveedor
 * nuevo.
 */
import { config } from '../config.js';
import { elPrompt } from './la-ficha-tecnica.js';

/** Lo más grande que se manda a leer. Una ficha técnica no pesa esto. */
const LIMITE_BYTES = 12 * 1024 * 1024;

/** Los alias sin número no caducan; los que llevan versión se retiran. */
const MODELOS = ['gemini-flash-latest', 'gemini-2.5-flash'];

export interface ElPapel {
  bytes: Buffer;
  tipo: string;
}

/**
 * Baja el documento del almacén.
 *
 * Con la clave del servicio, porque el cubo es privado. Es el mismo camino que
 * `sirve-lo-guardado.ts` usa para enseñar una factura; aquí no se enseña, se
 * lee.
 */
export async function bajaElPapel(url: string): Promise<ElPapel> {
  if (!url) throw new Error('sin_fichero');

  const clave = config.SUPABASE_SERVICE_KEY;
  const esDelAlmacen = url.includes('/storage/v1/object/');
  const directa = url.replace('/object/public/', '/object/');

  const r = await fetch(
    directa,
    esDelAlmacen && clave
      ? { headers: { apikey: clave, Authorization: `Bearer ${clave}` } }
      : undefined,
  );
  if (!r.ok) throw new Error('no_se_ha_podido_bajar');

  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error('fichero_vacio');
  if (bytes.byteLength > LIMITE_BYTES) throw new Error('fichero_demasiado_grande');

  return { bytes, tipo: r.headers.get('content-type') || 'application/pdf' };
}

export interface LoLeido {
  codigos: Record<string, unknown>;
  confianza: string;
}

/**
 * Lo que el lector saca del papel.
 *
 * Devuelve los códigos tal como vienen; traducirlos es de `la-ficha-tecnica`.
 *
 * Temperatura a cero: esto no es una redacción, es copiar lo que pone. Dos
 * lecturas del mismo papel tienen que dar lo mismo, porque si no, nadie puede
 * decir si un dato raro es del papel o del día.
 */
export async function leeElPapel(papel: ElPapel): Promise<LoLeido> {
  const clave = config.GEMINI_API_KEY;
  if (!clave) throw new Error('sin_lector');

  const cuerpo = {
    contents: [{
      parts: [
        { text: elPrompt() },
        { inlineData: { mimeType: papel.tipo, data: papel.bytes.toString('base64') } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 900, responseMimeType: 'application/json' },
  };

  // Un minuto: un PDF escaneado tarda, y reintentar por impaciencia es pagar
  // dos lecturas para quedarse con una.
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), 60_000);
  try {
    let texto: string | null = null;
    for (const modelo of MODELOS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${clave}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo),
            signal: ctrl.signal,
          },
        );
        if (!res.ok) continue;
        const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        texto = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        if (texto) break;
      } catch {
        // El siguiente modelo. Si se acaban, cae en `no_se_ha_podido_leer`.
      }
    }
    if (!texto) throw new Error('no_se_ha_podido_leer');

    const trozo = texto.match(/\{[\s\S]*\}/);
    if (!trozo) throw new Error('no_se_ha_podido_leer');

    const leido = JSON.parse(trozo[0]) as Record<string, unknown>;
    const confianza = String(leido.confianza ?? '').toLowerCase();
    delete leido.confianza;
    return { codigos: leido, confianza: confianza === 'baja' ? 'baja' : 'alta' };
  } finally {
    clearTimeout(reloj);
  }
}
