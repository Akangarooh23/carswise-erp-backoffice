/**
 * Que las columnas que escribe el código existan en la base.
 *
 * Las rutas de lectura se pueden barrer llamándolas (comprueba-rutas.js). Las
 * de escritura no: llamarlas crearía facturas y contratos de mentira. Pero el
 * fallo es el mismo —`assigned_to` por `assignee`, `plan_type` por `plan_id`—
 * y se puede ver sin ejecutar nada, comparando lo que dice el SQL con lo que
 * dice el esquema.
 *
 * Se leen las listas de columnas de cada INSERT y de cada SET de un UPDATE, y
 * se comprueban contra la tabla a la que van. Solo lee.
 *
 *   node scripts/comprueba-columnas.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const RAIZ = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();

/** `INSERT INTO tabla (a, b, c)` → [tabla, [a, b, c]] */
function inserts(src) {
  const out = [];
  for (const m of src.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const columnas = m[2]
      .split(',')
      .map((c) => c.trim().replace(/["`]/g, ''))
      .filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c));
    out.push([m[1], columnas]);
  }
  return out;
}

/** `UPDATE tabla SET a = $1, b = $2` → [tabla, [a, b]] */
function updates(src) {
  const out = [];
  for (const m of src.matchAll(/UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+([\s\S]*?)(?:WHERE|RETURNING|`)/gi)) {
    const columnas = [...m[2].matchAll(/([a-z_][a-z0-9_]*)\s*=/gi)]
      .map((c) => c[1])
      // `updated_at = NOW()` es una columna; `COALESCE(x, y)` no.
      .filter((c) => !['coalesce', 'case', 'when', 'then', 'else', 'end'].includes(c.toLowerCase()));
    out.push([m[1], columnas]);
  }
  return out;
}

(async () => {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const filas = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const esquema = new Map();
  for (const f of filas.rows) {
    if (!esquema.has(f.table_name)) esquema.set(f.table_name, new Set());
    esquema.get(f.table_name).add(f.column_name);
  }
  await pool.end();

  const dirs = [
    path.join(RAIZ, 'apps', 'api', 'src', 'routes'),
    path.join(RAIZ, 'apps', 'api', 'src', 'services'),
  ];

  let malas = 0;
  let revisadas = 0;
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      // Una columna que el propio fichero crea con ADD COLUMN IF NOT EXISTS no
      // falta: se crea sola la primera vez. Es el caso de `sort_order`, que
      // ordena las fotos de un IDCar.
      const seCrean = new Set(
        [...src.matchAll(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1])
      );

      for (const [tabla, columnas] of [...inserts(src), ...updates(src)]) {
        const reales = esquema.get(tabla);
        // Una tabla que no existe puede ser una temporal o un alias: se avisa aparte.
        if (!reales) { console.log('  ¿?    ' + f.padEnd(24) + 'tabla desconocida: ' + tabla); continue; }
        revisadas++;
        const fantasma = columnas.filter((c) => !reales.has(c) && !seCrean.has(c));
        if (fantasma.length) {
          malas++;
          console.log('  MAL   ' + f.padEnd(24) + tabla + ' → ' + fantasma.join(', '));
        }
      }
    }
  }

  console.log('\n  ' + revisadas + ' escrituras revisadas · ' + (malas || 'ninguna') + (malas ? ' con columnas que no existen' : ' con columnas inventadas'));
  process.exit(malas ? 1 : 0);
})();
