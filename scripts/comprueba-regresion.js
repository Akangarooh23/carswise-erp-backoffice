/**
 * ¿Se ha perdido algo por el camino?
 *
 * Compara lo que hay ahora con lo que hay en producción —`origin/master`— y
 * lista lo que existía y ya no: rutas de la API, pantallas, entradas del menú y
 * funciones exportadas.
 *
 * No dice si algo está mal: dice qué desapareció. Cada desaparición puede ser
 * un descuido o algo que se quitó a propósito, y hay que mirarla una por una.
 *
 *   node scripts/comprueba-regresion.js [rama]
 */
const { execFileSync } = require('child_process');

const BASE = process.argv[2] || 'origin/master';

/** Los ficheros de una rama, o del árbol de trabajo si se pasa null. */
function ficheros(rama, filtro) {
  const salida = rama
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', rama], { encoding: 'utf8' })
    : execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return salida.split('\n').filter((f) => filtro.test(f));
}

function leer(rama, fichero) {
  try {
    return rama
      ? execFileSync('git', ['show', `${rama}:${fichero}`], { encoding: 'utf8' })
      : require('fs').readFileSync(fichero, 'utf8');
  } catch {
    return '';
  }
}

/** Rutas de la API: «GET /marketplace/vo». */
function rutasApi(rama) {
  const fuera = new Set();
  for (const f of ficheros(rama, /^apps\/api\/src\/routes\/.*\.ts$/)) {
    if (/\.test\.ts$/.test(f)) continue;
    const src = leer(rama, f);
    for (const m of src.matchAll(/Router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
      fuera.add(`${m[1].toUpperCase()} ${m[2]}`);
    }
  }
  return fuera;
}

/** Pantallas del ERP: las rutas del enrutador. */
function pantallas(rama) {
  const src = leer(rama, 'apps/web/src/router.tsx');
  const fuera = new Set();
  for (const m of src.matchAll(/path:\s*'([^']*)'/g)) fuera.add(m[1] || '(inicio)');
  return fuera;
}

/** Entradas del menú lateral. */
function menu(rama) {
  const src = leer(rama, 'apps/web/src/components/layout/Sidebar.tsx');
  const fuera = new Set();
  for (const m of src.matchAll(/label:\s*'([^']+)'/g)) fuera.add(m[1]);
  return fuera;
}

/** Funciones y constantes exportadas, por nombre. */
function exportados(rama) {
  const fuera = new Set();
  for (const f of ficheros(rama, /^apps\/(api|web)\/src\/.*\.(ts|tsx)$/)) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const src = leer(rama, f);
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)) {
      fuera.add(m[1]);
    }
    for (const m of src.matchAll(/^export\s+default\s+function\s+([A-Za-z0-9_]+)/gm)) fuera.add(m[1]);
  }
  return fuera;
}

/**
 * Direcciones que la web pide, sin el prefijo ni los parámetros.
 *
 * Comparar nombres de rutas no basta: lo que rompe una pantalla es que la web
 * llame a algo que la API ya no sirve. Esto saca lo que pide la web para poder
 * cruzarlo con lo que la API expone.
 */
function llamadasDeLaWeb(rama) {
  const fuera = new Set();
  for (const f of ficheros(rama, /^apps\/web\/src\/.*\.tsx?$/)) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const src = leer(rama, f);
    // El tipo genérico y la dirección pueden ir en líneas distintas —así está
    // escrita la importación de Excel—, así que el patrón salta los saltos de
    // línea. Sin eso daba por perdida una llamada que seguía ahí.
    for (const m of src.matchAll(/api\.(?:get|post|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*[`'"]([^`'"?]+)/g)) {
      fuera.add(m[1]);
    }
    for (const m of src.matchAll(/descargaConSesion\(\s*[`'"]([^`'"?]+)/g)) fuera.add(m[1]);
    for (const m of src.matchAll(/downloadInvoicePdf\(\s*[`'"]([^`'"?]+)/g)) fuera.add(m[1]);
  }
  return fuera;
}

/** ¿Sirve la API lo que la web pide? Compara sin los parámetros de la ruta. */
function cruzaWebConApi() {
  const rutas = [...rutasApi(null)].map((r) => r.split(' ')[1]);
  const patrones = rutas.map((r) =>
    new RegExp('^' + r.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/') + '$')
  );
  const huerfanas = [];
  for (const llamada of llamadasDeLaWeb(null)) {
    // La web arma direcciones con plantillas: `/idcars/${id}/files` llega aquí
    // con el hueco dentro. Se compara lo que se puede comparar.
    const limpia = llamada.replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '');
    if (!limpia.startsWith('/')) continue;
    const encaja = patrones.some((p) => p.test(limpia)) ||
      rutas.some((r) => limpia.startsWith(r.split('/:')[0]));
    if (!encaja) huerfanas.push(llamada);
  }
  return huerfanas;
}

const COMPROBACIONES = [
  ['Rutas de la API', rutasApi],
  ['Pantallas', pantallas],
  ['Entradas del menú', menu],
  ['Funciones exportadas', exportados],
  ['Direcciones que pide la web', llamadasDeLaWeb],
];

let perdidas = 0;
console.log(`  Comparando el árbol de trabajo con ${BASE}\n`);

for (const [titulo, fn] of COMPROBACIONES) {
  const antes = fn(BASE);
  const ahora = fn(null);
  const faltan = [...antes].filter((x) => !ahora.has(x));
  const nuevas = [...ahora].filter((x) => !antes.has(x));

  console.log(`  ── ${titulo} ──`);
  console.log(`     antes ${antes.size} · ahora ${ahora.size} · nuevas ${nuevas.length}`);
  if (faltan.length) {
    perdidas += faltan.length;
    console.log(`     YA NO ESTÁN (${faltan.length}):`);
    for (const x of faltan) console.log(`        ${x}`);
  } else {
    console.log('     no falta ninguna');
  }
  console.log('');
}

// Y lo que de verdad rompe una pantalla: que la web pida algo que no existe.
const huerfanas = cruzaWebConApi();
console.log('  ── La web pide cosas que la API no sirve ──');
if (huerfanas.length) {
  perdidas += huerfanas.length;
  for (const h of huerfanas) console.log(`     ${h}`);
} else {
  console.log('     ninguna: todo lo que pide la web existe');
}
console.log('');

console.log(perdidas ? `  ${perdidas} cosas que estaban y ya no. Míralas una por una.`
                     : '  No se ha perdido nada.');
process.exit(perdidas ? 1 : 0);
