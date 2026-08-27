/**
 * La consulta que saca el último número de contrato, contra Postgres de verdad.
 *
 * La parte que se razona sola está en routes/contracts.test.ts. Lo que no se
 * puede probar ahí es la expresión SQL: si un identificador escrito a mano no
 * acaba en dígitos, el paso a entero tumba la consulta entera y con ella la
 * creación del contrato. Eso solo lo dice Postgres.
 *
 * No escribe nada: los identificadores de prueba van en un VALUES, no en la
 * tabla.
 *
 *   node scripts/comprueba-contratos.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();

let mal = 0;
const ok = (t, b, extra = '') => { if (!b) mal++; console.log((b ? '  OK  ' : '  MAL ') + t + (extra ? '  · ' + extra : '')); };

/** La misma expresión que usa generateContractId, sobre una lista de ejemplo. */
const CONSULTA = `
  SELECT COALESCE(MAX(substring(id from '[0-9]+$')::int), 0) AS ultimo
    FROM (SELECT unnest($1::text[]) AS id) t
   WHERE id LIKE $2 AND id ~ '[0-9]+$'`;

(async () => {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const ultimo = async (ids, prefijo = 'PC-RENT-2026-') =>
    Number((await pool.query(CONSULTA, [ids, prefijo + '%'])).rows[0].ultimo);

  try {
    ok('sin contratos, el último es 0', (await ultimo([])) === 0);

    ok('con tres seguidos, el último es 3',
       (await ultimo(['PC-RENT-2026-001', 'PC-RENT-2026-002', 'PC-RENT-2026-003'])) === 3);

    ok('si falta uno por el medio, el último sigue siendo el mayor',
       (await ultimo(['PC-RENT-2026-001', 'PC-RENT-2026-003'])) === 3,
       'contar filas daría 2, y el 3 ya está emitido');

    ok('los de otro año no cuentan',
       (await ultimo(['PC-RENT-2025-009', 'PC-RENT-2026-002'])) === 2);

    ok('los de la serie anterior tampoco',
       (await ultimo(['CW-RENT-2026-014', 'PC-RENT-2026-002'])) === 2);

    // El motivo del cambio: antes esto reventaba la consulta entera.
    const torcidos = [
      'PC-RENT-2026-001',
      'PC-RENT-2026-002-bis',   // acaba en letras
      'PC-RENT-2026-',          // sin número
      'PC-RENT-2026-abc',       // sin número
      'PC-RENT-2026-004',
    ];
    let sobrevive = true;
    let valor = -1;
    try { valor = await ultimo(torcidos); } catch { sobrevive = false; }
    ok('un identificador torcido no tumba la consulta', sobrevive);
    ok('y el último sigue saliendo bien', valor === 4, 'ha salido ' + valor);

    ok('pasar de mil no se rompe',
       (await ultimo(['PC-RENT-2026-999', 'PC-RENT-2026-1000'])) === 1000);

    // Y la tabla de verdad responde igual.
    const real = await pool.query(
      `SELECT COALESCE(MAX(substring(id from '[0-9]+$')::int), 0) AS ultimo
         FROM moveadvisor_renting_contracts
        WHERE id LIKE $1 AND id ~ '[0-9]+$'`,
      ['PC-RENT-' + new Date().getFullYear() + '-%']
    );
    ok('la consulta corre sobre la tabla real', true, 'último emitido: ' + real.rows[0].ultimo);
  } finally {
    await pool.end();
  }

  console.log(mal ? '\n' + mal + ' FALLOS' : '\ntodo correcto');
  process.exit(mal ? 1 : 0);
})();
