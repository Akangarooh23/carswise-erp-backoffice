/**
 * ¿Le falta algo a alguna pantalla?
 *
 * `comprueba-regresion.js` mira si una pantalla sigue existiendo. Esto mira si
 * sigue teniendo lo mismo dentro: los botones, las columnas de las tablas, las
 * pestañas y las opciones de los filtros.
 *
 * Una pantalla puede sobrevivir a un refactor y haber perdido el botón de
 * exportar por el camino, y eso no lo ve nadie hasta que alguien va a usarlo.
 *
 * Compara por pantalla, no en conjunto: un botón que se mueve de sitio no
 * cuenta como pérdida si sigue en la misma pantalla.
 *
 *   node scripts/comprueba-pantallas.js [rama]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = process.argv[2] || 'origin/master';

function ficherosDe(rama) {
  const salida = rama
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', rama], { encoding: 'utf8' })
    : execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  // También los .ts: las pestañas y los filtros del marketplace viven ahora en
  // marketplace/constantes.ts, y sin esto se contarían como perdidos.
  return salida.split('\n').filter((f) => /^apps\/web\/src\/pages\/.*\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}

/**
 * Deja el texto como para compararlo.
 *
 * Sin emoji, porque quitar el emoji de un botón no es perder el botón; y sin
 * espacios de más. Si lo que queda no tiene letras, no era texto de pantalla.
 */
function comparable(t) {
  return t
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/[↓↑→←✕✓·]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Esto es texto que lee una persona, o un trozo de código que se ha colado? */
function esTextoDePantalla(t) {
  if (t.length < 2) return false;
  if (!/[a-záéíóúñ]/i.test(t)) return false;
  return !/[{}()=<>]|=>|className|\?\?/.test(t);
}

function leer(rama, f) {
  try {
    return rama ? execFileSync('git', ['show', `${rama}:${f}`], { encoding: 'utf8' }) : fs.readFileSync(f, 'utf8');
  } catch { return ''; }
}

/** El nombre de la pantalla, sin la carpeta ni la extensión. */
const pantallaDe = (f) => f.replace(/^.*\//, '').replace(/\.tsx$/, '');

/**
 * Lo que se puede usar en una pantalla.
 *
 * Se saca del texto entre etiquetas, no del código: lo que importa es lo que
 * lee alguien delante del navegador. Los textos de una sola letra y los que
 * son solo código se descartan porque no dicen nada.
 */
function elementos(fuente) {
  // `<button[^>]*>` corta en la flecha de `onClick={() => ...}`, y entonces
  // media etiqueta se cuela como si fuera el texto del botón. Era el origen de
  // casi todo el ruido de este comprobador. Se esconde la flecha antes de
  // buscar y se deshace después.
  const src = fuente.replace(/=>/g, '=');

  const fuera = new Set();
  const saca = (etiqueta, prefijo, largo) => {
    const re = new RegExp(`<${etiqueta}[^>]*>([\\s\\S]{1,${largo}}?)</${etiqueta}>`, 'g');
    for (const m of src.matchAll(re)) {
      const dentro = m[1].replace(/<[^>]*>/g, " ");
      const t = comparable(dentro);
      if (esTextoDePantalla(t)) { fuera.add(prefijo + t); continue; }
      // Un botón que dice {cargando ? "Guardando…" : "Guardar"} tiene dos
      // textos dentro de una condición: cuentan los dos.
      for (const lit of dentro.matchAll(/['`"]([^'`"]{3,40})['`"]/g)) {
        const texto = comparable(lit[1]);
        if (esTextoDePantalla(texto)) fuera.add(prefijo + texto);
      }
    }
  };
  saca('button', 'botón: ', 400);
  saca('th', 'columna: ', 80);
  saca('label', 'campo: ', 60);
  saca('option', 'opción: ', 60);
  // Pestañas y filtros declarados como datos.
  for (const m of src.matchAll(/label:\s*'([^']{2,40})'/g)) {
    const t = comparable(m[1]);
    if (esTextoDePantalla(t)) fuera.add('pestaña: ' + t);
  }
  return fuera;
}

const antes = new Map();
for (const f of ficherosDe(BASE)) antes.set(pantallaDe(f), elementos(leer(BASE, f)));

// Ahora las pantallas pueden estar repartidas en varios ficheros: lo que era
// MarketplacePage es ahora esa página más los suyos en marketplace/.
const ahora = new Map();
for (const f of ficherosDe(null)) {
  const nombre = pantallaDe(f);
  const clave = f.includes('/marketplace/') ? 'MarketplacePage' : nombre;
  const acc = ahora.get(clave) || new Set();
  for (const e of elementos(leer(null, f))) acc.add(e);
  ahora.set(clave, acc);
}

let perdidas = 0;
console.log(`  Comparando las pantallas con ${BASE}\n`);

for (const [pantalla, tenia] of [...antes].sort()) {
  const tiene = ahora.get(pantalla);
  if (!tiene) {
    console.log(`  ── ${pantalla} ──`);
    console.log('     LA PANTALLA YA NO ESTÁ');
    perdidas += tenia.size;
    continue;
  }
  const faltan = [...tenia].filter((x) => !tiene.has(x));
  if (!faltan.length) continue;
  perdidas += faltan.length;
  console.log(`  ── ${pantalla} ──  (${tenia.size} antes · ${tiene.size} ahora)`);
  for (const x of faltan) console.log(`     ${x}`);
  console.log('');
}

console.log(perdidas ? `\n  ${perdidas} cosas que estaban en una pantalla y ya no. Míralas una por una.`
                     : '  Ninguna pantalla ha perdido nada.');
process.exit(perdidas ? 1 : 0);
