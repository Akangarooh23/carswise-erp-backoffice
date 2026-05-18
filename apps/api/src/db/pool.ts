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
