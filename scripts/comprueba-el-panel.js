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
  'apps/api/src/routes/analisis.ts',
  'apps/api/src/routes/dashboard.ts',
  'apps/api/src/lib/apuntes.ts',
  'apps/api/src/lib/kpis-guardados.ts',
];

const env = fs.readFileSync(path.join(RAIZ, '.env'), 'utf8');
const url = (env.split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')) || '').slice(13).trim();
if (!url) { console.log('  sin DATABASE_URL en .env'); process.exit(0); }

/**
 * Los trozos de SQL que viven en una lib y se meten en las consultas.
 *
 * Una consulta con `${SQL_DE_LA_SECCION}` dentro no se le puede pasar a
 * Postgres tal cual: el `$` sin número es un error de sintaxis y la consulta
 * saldría rota siempre, que es peor que no comprobarla —un comprobador que
 * miente se deja de mirar—. Así que se buscan las constantes de una línea en
 * las libs y se sustituyen.
 *
 * Solo las de una línea a propósito. Una construida con `.join()` no se puede
 * leer sin ejecutar el fichero, y ejecutar el código que se quiere comprobar es
 * cómo se acaba comprobando otra cosa.
 */
function losTrozosDeSql() {
  const trozos = new Map();
  const dir = path.join(RAIZ, 'apps/api/src/lib');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/export const ([A-Z][A-Z0-9_]*) = (['"])([^\n]*?)\2;/g)) {
      trozos.set(m[1], m[3]);
    }
  }
  return trozos;
}

const TROZOS = losTrozosDeSql();
const consultas = [];
const sinResolver = [];

for (const fichero of FICHEROS) {
  const src = fs.readFileSync(path.join(RAIZ, fichero), 'utf8');
  for (const m of src.matchAll(/query(?:<[^(]*>)?\(\s*`([\s\S]*?)`/g)) {
    let sql = m[1];
    let falta = null;
    sql = sql.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, (todo, nombre) => {
      if (TROZOS.has(nombre)) return TROZOS.get(nombre);
      falta = nombre;
      return todo;
    });
    if (falta) { sinResolver.push([path.basename(fichero), falta]); continue; }
    consultas.push([fichero, sql]);
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
 * Una fecha en texto vale para casi todos: se comparan con columnas de fecha o
 * de texto y Postgres la convierte sola. Pero un `$2::jsonb` la rechaza —«2026-
 * 01-01» no es JSON— y la consulta salía **rota siendo correcta**, que es peor
 * que no comprobarla: un comprobador que da falsos positivos se deja de mirar.
 *
 * Así que se mira el cast que lleva cada parámetro y se rellena en consecuencia.
 * Lo que no lleve cast sigue con la fecha, que es lo que más hay.
 */
const RELLENO_POR_TIPO = {
  jsonb: 'null', json: 'null',
  numeric: '1', int: '1', integer: '1', bigint: '1',
};
const RELLENO_POR_DEFECTO = '2026-01-01';

function losParametros(sql) {
  const vistos = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  if (!vistos.length) return [];

  // El tipo se toma del primer sitio donde ese parámetro aparece con cast: en
  // `$6::numeric IS NULL OR ... $6::numeric` los dos dicen lo mismo.
  const tipos = new Map();
  for (const m of sql.matchAll(/\$(\d+)::([a-z]+)/gi)) {
    if (!tipos.has(Number(m[1]))) tipos.set(Number(m[1]), m[2].toLowerCase());
  }

  return Array.from({ length: Math.max(...vistos) }, (_, i) =>
    RELLENO_POR_TIPO[tipos.get(i + 1)] ?? RELLENO_POR_DEFECTO);
}

(async () => {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const rotas = [];

  for (const [fichero, sql] of consultas) {
    const valores = losParametros(sql);
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

  // Y las que no se han podido resolver se dicen. Callarse convierte «ninguna
  // rota» en «ninguna mirada», que es la clase de tranquilidad que se paga.
  const nota = sinResolver.length
    ? `  ·  ${sinResolver.length} sin comprobar, no encuentro ${[...new Set(sinResolver.map((x) => x[1]))].join(', ')}`
    : '';
  console.log(`\n  ${consultas.length} consultas del panel · ninguna rota${nota}\n`);
})();
