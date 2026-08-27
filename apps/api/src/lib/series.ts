/**
 * Identificadores de serie anual: PC-RENT-2026-001, PROV-2026-004.
 *
 * Había dos formas de sacar el siguiente y las dos estaban mal igual: contaban
 * filas. `COUNT(*) + 1` da el número correcto solo mientras no se borre nada;
 * en cuanto falta uno, el siguiente repite uno ya usado. La clave primaria
 * impide que se guarde el repetido, así que el fallo no sale como dos filas
 * iguales sino como un error de base de datos en la cara de quien estaba
 * creando algo.
 *
 * Aquí está una sola vez, para que arreglarlo no haya que hacerlo dos.
 *
 * Ojo con lo que NO es esto: el número fiscal de una factura se saca de
 * `nextInvoiceNumber`, que lleva su propio contador atómico. Estos son
 * identificadores internos de fila.
 */
import { query } from '../db/pool.js';

/** `PROV-2026-`, `PC-RENT-2026-`. */
export function prefijoAnual(serie: string, anio = new Date().getFullYear()): string {
  return `${serie}-${anio}-`;
}

/** El identificador a partir del último número emitido. */
export function conNumero(prefijo: string, ultimo: number, digitos = 3): string {
  return prefijo + String(ultimo + 1).padStart(digitos, '0');
}

/**
 * El siguiente identificador libre de una serie.
 *
 * Se mira el último sufijo emitido, no cuántas filas hay. Y solo se miran los
 * que acaban en dígitos: un identificador escrito a mano que no siga el formato
 * no puede tumbar la creación del siguiente, que es lo que pasaba antes —el
 * paso a entero fallaba y con él la consulta entera—.
 */
export async function siguienteDeSerie(tabla: string, prefijo: string, digitos = 3): Promise<string> {
  const r = await query(
    `SELECT COALESCE(MAX(substring(id from '[0-9]+$')::int), 0) AS ultimo
       FROM ${tabla}
      WHERE id LIKE $1 AND id ~ '[0-9]+$'`,
    [`${prefijo}%`]
  );
  return conNumero(prefijo, Number((r.rows[0] as { ultimo: number }).ultimo), digitos);
}

/** El código con el que Postgres dice «esa clave ya existe». */
const CLAVE_REPETIDA = '23505';

/**
 * Guarda reintentando si el identificador ya estaba cogido.
 *
 * Dos personas creando a la vez leen el mismo máximo y escriben el mismo
 * número. Uno de los dos gana; el otro, en vez de llevarse un error de base de
 * datos, vuelve a pedir número.
 *
 * `pideId` se llama en cada intento: tiene que dar uno nuevo cada vez.
 */
export async function guardaConIdUnico<T>(
  pideId: () => Promise<string>,
  guarda: (id: string) => Promise<T>,
  intentos = 3
): Promise<{ id: string; resultado: T }> {
  let ultimoError: unknown;
  for (let i = 0; i < intentos; i++) {
    const id = await pideId();
    try {
      return { id, resultado: await guarda(id) };
    } catch (e) {
      if ((e as { code?: string }).code !== CLAVE_REPETIDA) throw e;
      ultimoError = e;
    }
  }
  throw ultimoError;
}
