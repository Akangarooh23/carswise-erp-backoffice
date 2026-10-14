import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[]
) {
  const start = Date.now();
  const result = await pool.query<T>(text, values);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.warn(`[db] Slow query (${duration}ms):`, text.slice(0, 120));
  }
  return result;
}

/**
 * Una consulta de las que tardan, con más tiempo del que da la base.
 *
 * La base corta a los **30 segundos**. Para una pantalla eso está bien: una
 * consulta que tarda medio minuto en contestarle a una persona es una consulta
 * rota, y matarla protege a las demás.
 *
 * Pero las tareas de madrugada no le contestan a nadie. Recorrer los 2,6
 * millones de ofertas son veinte segundos y comparar nuestros precios contra
 * el mercado son veintitrés: cada una por separado **roza** el tope, así que
 * unas noches entraban y otras las mataban. Eso dejó
 * `precio_contra_el_mercado` sin moverse desde el 22 de septiembre, y nadie lo
 * supo porque el error se tragaba y un número viejo se ve igual que uno nuevo.
 *
 * ## Por qué así y no subiendo el tope de la base
 *
 * Porque ese tope es la red que protege a las pantallas, y subirlo para todos
 * es quitarla para que corran dos tareas nocturnas.
 *
 * ## Y por qué `SET LOCAL` dentro de una transacción
 *
 * Porque el cliente sale de un montón compartido: un `SET` suelto se quedaría
 * pegado a esa conexión y la siguiente pantalla que la cogiera heredaría el
 * tope largo sin pedirlo —y perdería la red sin que nadie lo decidiera—.
 * `LOCAL` se deshace al cerrar la transacción, y por eso además sobrevive al
 * pooler, que reparte por transacción y no por sesión.
 */
export async function consultaLarga<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
  tope = '10min'
) {
  const cliente = await pool.connect();
  const empezo = Date.now();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`SET LOCAL statement_timeout = '${tope}'`);
    const result = await cliente.query<T>(text, values);
    await cliente.query('COMMIT');
    console.log(`[db] consulta larga: ${Date.now() - empezo} ms`);
    return result;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
