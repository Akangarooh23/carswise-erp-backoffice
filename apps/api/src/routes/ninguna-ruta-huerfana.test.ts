/**
 * Que no haya rutas que no llama nadie.
 *
 * ## De dónde sale esto
 *
 * Barriendo el sistema apareció `/tarifas-gestoria/estimacion`: un motor que
 * sabe qué trámites tocan según el origen del coche y los valora con la tarifa
 * real de la gestoría. Entero, probado, con datos cargados en la base — y
 * **ninguna pantalla lo llamaba**. Llevaba meses ahí.
 *
 * No es un caso aislado. El mismo día salieron la lectura de la ficha técnica
 * enganchada al lado que no usa nadie, un repaso de fichas pendientes que no
 * llamaba nadie, y un catálogo de 16.809 versiones con las columnas vacías.
 * Todas callaban: nada fallaba, simplemente no existía la funcionalidad que
 * dábamos por hecha.
 *
 * Esta prueba es la red. Una ruta nueva o se usa desde la web, o se apunta aquí
 * con el motivo por el que no. Lo que no se puede es que se quede sola y nadie
 * se entere.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

function losFicheros(dir: string, acaba: RegExp): string[] {
  const salida: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) salida.push(...losFicheros(p, acaba));
    else if (acaba.test(f)) salida.push(p);
  }
  return salida;
}

/**
 * Las que no llama la web, y por qué.
 *
 * Cada una con su motivo escrito: si mañana alguien quita el cron de KPI, esta
 * lista se queda con una entrada que ya no corresponde a nada y la prueba de
 * abajo lo dice.
 */
const LAS_QUE_LLAMA_OTRO: Record<string, string> = {
  '/auth/me': 'la usa el cliente de la API para saber quién eres, no una pantalla',
  '/cron/kpis': 'la dispara Vercel Cron',
  '/cron/recordatorios-taller': 'la dispara Vercel Cron',
  '/interno/ficha-tecnica': 'la llama PopCar cuando el cliente sube su ficha técnica',
  '/whatsapp/webhook': 'la llama Meta cuando entra un mensaje de un cliente',
  '/proveedores/tipos': 'la web tiene su propia lista de tipos; que no se separen lo vigila `tipos-de-proveedor-gemelos.test.ts`',
};

/**
 * Y las que existen enteras y todavía no usa ninguna pantalla.
 *
 * No es lo mismo que las de arriba: aquellas las llama alguien de fuera y
 * están bien así. Éstas son trabajo hecho que no ha llegado a verse, y el
 * sitio de esa deuda es una lista corta y leída, no el silencio. Cuando una
 * se enchufe, sale de aquí sola: la prueba de abajo lo comprueba.
 */
const PENDIENTES_DE_ENCHUFAR: Record<string, string> = {
  '/tarifas/estimacion': 'lo que cuesta traer un coche de Alemania; el expediente de importación todavía no lo enseña',
  '/marketplace/vo/bulk-with-units': 'publicar en bloque con unidades; hoy se publica coche a coche',
  '/pedidos/margen-por-origen': 'el margen por origen del coche; el panel todavía no lo pinta',
};

describe('ninguna ruta se queda sola', () => {
  const deLaApi = losFicheros(join(RAIZ, 'apps/api/src/routes'), /\.ts$/)
    .filter((p) => !p.includes('.test.'));
  const deLaWeb = losFicheros(join(RAIZ, 'apps/web/src'), /\.(ts|tsx)$/)
    .filter((p) => !p.includes('.test.'));
  const fuenteWeb = deLaWeb.map((p) => readFileSync(p, 'utf8')).join('\n');

  /**
   * Las direcciones que la web **llama a la API**, no las que escribe.
   *
   * Buscar el texto suelto daba falsos negativos: `/workshops` aparece en el
   * menú lateral como la dirección de una **página**, y eso hacía pasar por
   * usada una API que no llama nadie —la pantalla de Talleres pide
   * `/workshop-locations`, que es otra cosa—. Una prueba que da por bueno lo
   * que no mira es peor que no tenerla.
   */
  const loQuePideLaWeb = (): string => {
    const trozos: string[] = [];
    /*
     * Los cuatro caminos por los que la web habla con la API: el cliente
     * (`api.get`…), el `fetch` de dentro de ese cliente —por donde va el
     * login—, el bajador de ficheros con sesión, y un enlace directo a `/api`
     * para los que se abren en otra pestaña.
     */
    const contextos = [
      /api\.(?:get|post|patch|put|delete)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)/g,
      /fetch\(\s*[`'"](?:\$\{BASE\})?([^`'"]+)/g,
      /descargaConSesion\(\s*[`'"]([^`'"]+)/g,
      /href=\{?[`'"]\/api([^`'"]+)/g,
    ];
    for (const re of contextos) {
      for (const m of fuenteWeb.matchAll(re)) trozos.push(m[1]);
    }
    return trozos.join('\n');
  };

  /** Todas las rutas declaradas, con el fichero donde viven. */
  const lasRutas = (): { fichero: string; ruta: string }[] => {
    const salida: { fichero: string; ruta: string }[] = [];
    for (const p of deLaApi) {
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/Router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
        salida.push({ fichero: p.split(/[\\/]/).pop() ?? p, ruta: m[2] });
      }
    }
    return salida;
  };

  test('se encuentran las rutas y las llamadas de la web', () => {
    // Si la búsqueda fallara, las de abajo pasarían sin mirar nada.
    assert.ok(lasRutas().length > 100, String(lasRutas().length));
    assert.ok(loQuePideLaWeb().split('\n').length > 50, String(loQuePideLaWeb().split('\n').length));
  });

  test('o la llama la web, o está apuntada con su motivo', () => {
    const pide = loQuePideLaWeb();
    const solas: string[] = [];
    for (const { fichero, ruta } of lasRutas()) {
      // El trozo fijo, hasta el primer parámetro: es lo que la web escribe.
      const trozo = ruta.split('/:')[0];
      if (trozo.length < 4) continue;
      if (pide.includes(trozo)) continue;
      if (ruta in LAS_QUE_LLAMA_OTRO) continue;
      if (ruta in PENDIENTES_DE_ENCHUFAR) continue;
      solas.push(`${ruta}  (${fichero})`);
    }
    assert.deepEqual(solas, [], `estas rutas no las llama nadie:\n  ${solas.join('\n  ')}`);
  });

  test('y la lista de excepciones no se queda vieja', () => {
    /*
     * Una excepción que ya no corresponde a ninguna ruta —porque se borró, o
     * porque ahora sí la usa una pantalla— es una regla que tapa sin que nadie
     * lo sepa. El día que alguien vuelva a dejar esa ruta sola, la lista diría
     * que está bien.
     */
    const todas = new Set(lasRutas().map((r) => r.ruta));
    const sobran: string[] = [];
    for (const ruta of [...Object.keys(LAS_QUE_LLAMA_OTRO), ...Object.keys(PENDIENTES_DE_ENCHUFAR)]) {
      if (!todas.has(ruta)) { sobran.push(`${ruta} (ya no existe)`); continue; }
      const trozo = ruta.split('/:')[0];
      if (loQuePideLaWeb().includes(trozo)) sobran.push(`${ruta} (ahora sí la usa la web)`);
    }
    assert.deepEqual(sobran, [], `sobran excepciones:\n  ${sobran.join('\n  ')}`);
  });

  test('cada excepción dice por qué, no solo que sí', () => {
    for (const [ruta, porque] of [...Object.entries(LAS_QUE_LLAMA_OTRO), ...Object.entries(PENDIENTES_DE_ENCHUFAR)]) {
      assert.ok(porque.length > 15, `«${ruta}» no explica quién la llama`);
    }
  });
});
