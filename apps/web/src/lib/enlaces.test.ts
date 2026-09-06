/**
 * Que ningún enlace de la aplicación lleve a una pantalla que no existe.
 *
 * Un enlace roto no se ve al escribirlo ni al compilar: `<Link to="/colas/x">`
 * es una cadena, TypeScript la da por buena, y el router contesta con la
 * redirección de «no encontrado» —que aquí lleva al panel—. Así que pinchas, te
 * devuelve al sitio del que venías, y parece que no ha pasado nada.
 *
 * Lo mismo con los que llevan a la pantalla equivocada, que es peor: «Seguros»
 * llevaba a Usuarios porque un seguro cuelga de un usuario. Eso no lo puede
 * comprobar una máquina; lo que sí puede es que el destino exista, y eso quita
 * de en medio la mitad de los fallos.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function losFicheros(dir: string): string[] {
  const salida: string[] = [];
  for (const f of readdirSync(dir)) {
    const camino = join(dir, f);
    if (statSync(camino).isDirectory()) { salida.push(...losFicheros(camino)); continue; }
    if (/\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')) salida.push(camino);
  }
  return salida;
}

/** Los caminos que el router sabe pintar. */
function lasRutas(): { fijas: Set<string>; conParametro: string[] } {
  const src = readFileSync(join(RAIZ, 'router.tsx'), 'utf8');
  const fijas = new Set<string>();
  const conParametro: string[] = [];
  for (const m of src.matchAll(/path:\s*'([^']+)'/g)) {
    const p = m[1];
    if (p === '*') continue;
    if (p.includes(':')) conParametro.push(p);
    else fijas.add('/' + p.replace(/^\//, ''));
  }
  return { fijas, conParametro };
}

/** Si un camino encaja con una ruta que lleva parámetros. */
function encajaConParametro(camino: string, patron: string): boolean {
  const a = camino.replace(/^\//, '').split('/');
  const b = patron.replace(/^\//, '').split('/');
  if (a.length !== b.length) return false;
  return b.every((t, i) => t.startsWith(':') || t === a[i]);
}

describe('los enlaces llevan a algún sitio', () => {
  const { fijas, conParametro } = lasRutas();

  test('el router tiene rutas, o esta comprobación no comprueba nada', () => {
    // Sin esto, un cambio en la forma del router dejaría el test en verde
    // porque no encontraría ningún destino contra el que fallar.
    assert.ok(fijas.size > 10, `solo he encontrado ${fijas.size} rutas`);
  });

  test('y ninguno apunta a una pantalla que no existe', () => {
    const rotos: string[] = [];

    for (const fichero of losFicheros(RAIZ)) {
      const src = readFileSync(fichero, 'utf8');
      // `to="/x"` de los Link y `a="/x"` de las tarjetas del panel. Solo los
      // literales: los que se arman con una plantilla llevan un identificador
      // dentro y no se pueden comprobar sin datos.
      for (const m of src.matchAll(/\b(?:to|a)="(\/[^"{}]*)"/g)) {
        const camino = m[1].split('?')[0].replace(/\/$/, '') || '/';
        if (fijas.has(camino)) continue;
        if (conParametro.some((p) => encajaConParametro(camino, p))) continue;
        rotos.push(`${relative(RAIZ, fichero).replace(/\\/g, '/')} → ${camino}`);
      }
    }

    assert.deepEqual(rotos, [], 'enlaces a pantallas que no existen:\n  ' + rotos.join('\n  '));
  });
});
