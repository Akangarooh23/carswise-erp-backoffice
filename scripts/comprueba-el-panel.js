/**
 * Que las consultas del panel funcionen de verdad.
 *
 * El panel se traga sus propios fallos: cada consulta lleva un `.catch` que
 * escribe en el log y devuelve ceros, para que una tabla que falte no deje la
 * pantalla en blanco. El precio es que una columna mal escrita —`updated_at`
 * por `created_at`— no rompe nada: la tarjeta enseña 0 para siempre y nadie
 * se entera, porque un cero es un valor legítimo.
 *
 * Por eso el barrido de rutas no sirve aquí: la ruta contesta 200 igual. Lo
 * que se hace es pedirle a Postgres el plan de cada consulta, que valida
 * tablas y columnas sin ejecutar nada.
 *
 *   node scripts/comprueba-el-panel.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const RAIZ = path.join(__dirname, '..');
const RUTA = path.join(RAIZ, 'apps/api/src/routes/dashboard.ts');

const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();
if (!url) { console.log('  sin DATABASE_URL en .env'); process.exit(0); }

const src = fs.readFileSync(RUTA, 'utf8');
const consultas = [...src.matchAll(/query\(`([\s\S]*?)`\)/g)].map((m) => m[1]);

if (!consultas.length) {
  console.error('  no he encontrado ninguna consulta en dashboard.ts — ¿ha cambiado de forma?');
  process.exit(1);
}

/** El nombre por el que se reconoce en la salida: la primera tabla que toca. */
function comoSeLlama(sql) {
  const m = sql.match(/FROM\s+([a-z_][a-z0-9_]*)/i);
  return m ? m[1] : sql.trim().slice(0, 40).replace(/\s+/g, ' ');
}

(async () => {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const rotas = [];

  for (const sql of consultas) {
    // Solo el plan: valida tablas y columnas y no toca una fila.
    try { await pool.query('EXPLAIN ' + sql); }
    catch (e) { rotas.push([comoSeLlama(sql), e.message]); }
  }

  await pool.end();

  if (rotas.length) {
    console.error(`\n  ${rotas.length} consulta(s) del panel rotas — la tarjeta enseñaría 0 sin decir nada:\n`);
    for (const [nombre, fallo] of rotas) console.error(`    ${nombre}: ${fallo}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\n  ${consultas.length} consultas del panel · ninguna rota\n`);
})();
