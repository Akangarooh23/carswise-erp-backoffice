/**
 * Que las consultas del panel funcionen de verdad.
 *
 * El panel se traga sus propios fallos: cada consulta lleva un `.catch` que
 * escribe en el log y devuelve ceros o una lista vacía, para que una tabla que
 * falte no deje la pantalla en blanco. El precio es que una columna mal escrita
 * —`updated_at` por `created_at`— no rompe nada: la tarjeta enseña 0 para
 * siempre y nadie se entera, porque un cero es un valor legítimo.
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

/**
 * Los dos ficheros de los que sale el panel: las tarjetas y las cuentas.
 *
 * Los dos se tragan sus fallos de la misma manera, que es lo que hay que
 * comprobar desde fuera.
 */
const FICHEROS = [
  'apps/api/src/routes/dashboard.ts',
  'apps/api/src/lib/apuntes.ts',
];

const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();
if (!url) { console.log('  sin DATABASE_URL en .env'); process.exit(0); }

const consultas = [];
for (const fichero of FICHEROS) {
  const src = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
  for (const m of src.matchAll(/query(?:<[^(]*>)?\(\s*`([\s\S]*?)`/g)) {
    consultas.push([fichero, m[1]]);
  }
}

if (!consultas.length) {
  console.error('  no he encontrado ninguna consulta — ¿han cambiado de forma?');
  process.exit(1);
}

/** El nombre por el que se reconoce en la salida: la primera tabla que toca. */
function comoSeLlama(sql) {
  const m = sql.match(/FROM\s+([a-z_][a-z0-9_]*)/i);
  return m ? m[1] : sql.trim().slice(0, 40).replace(/\s+/g, ' ');
}

/**
 * Con qué se rellenan los `$1`, `$2`… para poder pedir el plan.
 *
 * Una fecha en texto vale para todos los que hay: se comparan con columnas de
 * fecha o de texto, y Postgres la convierte sola. Si algún día hay uno que no
 * admita esto, el plan fallará y saldrá aquí como consulta rota — que es
 * ruidoso, pero es el lado correcto en el que equivocarse.
 */
const RELLENO = '2026-01-01';

function cuantosParametros(sql) {
  const vistos = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  return vistos.length ? Math.max(...vistos) : 0;
}

(async () => {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const rotas = [];

  for (const [fichero, sql] of consultas) {
    const valores = Array.from({ length: cuantosParametros(sql) }, () => RELLENO);
    // Solo el plan: valida tablas y columnas y no toca una fila.
    try { await pool.query('EXPLAIN ' + sql, valores); }
    catch (e) { rotas.push([path.basename(fichero), comoSeLlama(sql), e.message]); }
  }

  await pool.end();

  if (rotas.length) {
    console.error(`\n  ${rotas.length} consulta(s) del panel rotas — enseñarían 0 sin decir nada:\n`);
    for (const [fichero, nombre, fallo] of rotas) console.error(`    ${fichero} · ${nombre}: ${fallo}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\n  ${consultas.length} consultas del panel · ninguna rota\n`);
})();
