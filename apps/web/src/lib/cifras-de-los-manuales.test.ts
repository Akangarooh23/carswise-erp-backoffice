/**
 * Que las cifras de los manuales sean las del código.
 *
 * ## Por qué existe
 *
 * Un manual afirma cosas concretas —299 €, seis fotos, 200 € por coche— y se
 * lee con el ERP abierto al lado para decidir qué decirle a un cliente por
 * teléfono. Si el código cambia y el manual no, lo que se le dice al cliente
 * deja de ser verdad y nadie se entera: el manual no se ejecuta, así que nada
 * falla.
 *
 * Ya pasó en este proyecto, y no con una cifra sino con un criterio: el manual
 * decía que «leads sin contestar» miraba tres días, y la consulta no miraba el
 * tiempo en absoluto. Estaba escrito con seguridad y era mentira.
 *
 * ## La regla, y la que se descartó
 *
 * **Si un manual da una cifra, tiene que ser la del código.** La primera
 * versión hacía lo contrario —si el manual nombra el concepto, que dé la
 * cifra— y saltaba con «cobrar un fee por venta» en el índice, que describe el
 * modelo de negocio y manda al manual del flujo para el detalle. Eso no es un
 * error del manual: es un manual bien escrito.
 *
 * Por eso cada cifra trae la frase exacta con la que se escribe, y la prueba
 * **captura el número de ahí**. Donde no aparece esa frase, no hay nada que
 * comprobar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const desdeAqui = (rel: string) =>
  new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CARPETA = desdeAqui('../../../../docs/ejecucion/');
const LIB = desdeAqui('../../../api/src/lib/');

const MANUALES = readdirSync(CARPETA)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ nombre: f, texto: readFileSync(join(CARPETA, f), 'utf8') }));

/** El número que dice el código. */
function delCodigo(fichero: string, nombre: string): number {
  const src = readFileSync(join(LIB, fichero), 'utf8');
  const m = src.match(new RegExp(`export const ${nombre} = (\\d+)`));
  assert.ok(m, `no encuentro ${nombre} en ${fichero}`);
  return Number(m![1]);
}

/**
 * Cada cifra con la frase por la que se reconoce en el texto.
 *
 * El grupo de captura es el número. Si la frase no está en un manual, ese
 * manual no dice nada del asunto y no hay nada que comparar.
 */
const CIFRAS: ReadonlyArray<{
  que: string; fichero: string; constante: string; frase: RegExp;
}> = [
  {
    que: 'el fee de gestión del encargo',
    fichero: 'encargo-de-venta.ts', constante: 'FEE_DE_GESTION',
    frase: /(\d+)\s*€ de gestión/g,
  },
  {
    que: 'el fee por coche vendido del concesionario',
    fichero: 'comision-del-concesionario.ts', constante: 'FEE_POR_VENTA',
    frase: /(\d+)\s*€[^.\n]{0,20}por coche(?: vendido)?/g,
  },
  {
    que: 'el fee por operación financiada',
    fichero: 'comision-de-financiacion.ts', constante: 'FEE_POR_FINANCIACION',
    frase: /(\d+)\s*€[^.\n]{0,20}por operación/g,
  },
  {
    que: 'lo que cuesta la revisión del taller',
    fichero: 'revision-del-taller.ts', constante: 'LO_QUE_CUESTA',
    frase: /Cuesta (\d+)\s*€/g,
  },
  {
    que: 'las franjas mínimas',
    fichero: 'encargo-de-venta.ts', constante: 'FRANJAS_MINIMAS',
    frase: /(\d+|[a-zé]+) franjas/g,
  },
  {
    que: 'los días de plazo de las franjas',
    fichero: 'encargo-de-venta.ts', constante: 'DIAS_DE_FRANJAS',
    frase: /pr[óo]ximos (\d+|[a-zé]+) días/g,
  },
  {
    que: 'los días para irse sin pagar',
    fichero: 'encargo-de-venta.ts', constante: 'DIAS_HASTA_SALIR_GRATIS',
    frase: /los (\d+) días/g,
  },
  {
    que: 'las fotos mínimas',
    fichero: 'encargo-de-venta.ts', constante: 'FOTOS_MINIMAS',
    frase: /(\d+|[a-zé]+) fotos/g,
  },
];

/**
 * Los manuales escriben los números pequeños en letra.
 *
 * «seis franjas», «catorce días». Los primeros patrones solo miraban cifras, no
 * casaban con nada y la comprobación pasaba sin mirar — que es peor que no
 * tenerla. Solo los que de verdad aparecen: inventarse la lista entera del
 * castellano sería fingir una cobertura que no hace falta.
 */
const EN_LETRA: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, doce: 12, catorce: 14, veinte: 20, treinta: 30,
};

/** El número que dice un trozo de manual, venga en cifra o en letra. */
function elNumero(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  return s in EN_LETRA ? EN_LETRA[s] : null;
}

describe('las cifras de los manuales son las del código', () => {
  test('hay manuales que mirar', () => {
    // Si la carpeta quedara vacía, todo lo de abajo pasaría sin mirar nada.
    assert.ok(MANUALES.length >= 4, `solo ${MANUALES.length} manuales`);
  });

  /** Cuántas veces ha encontrado algo cada cifra, para el guardián de abajo. */
  const encontradas: Record<string, number> = {};

  for (const c of CIFRAS) {
    test(`${c.que}`, () => {
      const n = delCodigo(c.fichero, c.constante);
      let vistas = 0;
      for (const m of MANUALES) {
        for (const hallado of m.texto.matchAll(c.frase)) {
          const dicho = elNumero(hallado[1]);
          // Una palabra que no es un número —«las franjas», «sus fotos»— no es
          // una cifra que comprobar.
          if (dicho === null) continue;
          vistas += 1;
          assert.equal(
            dicho, n,
            `${m.nombre} dice «${hallado[0].trim()}» y el código dice ${n}`,
          );
        }
      }
      encontradas[c.que] = vistas;
    });
  }

  test('y ninguna de las comprobaciones se ha quedado sin mirar nada', () => {
    /*
     * El guardián del guardián.
     *
     * Dos de estos patrones no casaban con nada —los manuales escriben «seis
     * franjas», no «6 franjas»— y pasaban en verde sin comprobar una sola
     * cifra. Una prueba que no mira nada es peor que no tenerla, porque además
     * tranquiliza.
     */
    const mudas = Object.entries(encontradas).filter(([, n]) => n === 0).map(([q]) => q);
    assert.deepEqual(mudas, [], `estas cifras no aparecen en ningún manual: ${mudas.join(', ')}`);
  });

  test('el teléfono de los anuncios es el de la marca', () => {
    /*
     * Va en los anuncios de los portales y es la mitad de lo que el cliente
     * está pagando: que no le llamen a él. Un número viejo en el manual es un
     * anuncio con el número viejo.
     */
    const marca = readFileSync(
      desdeAqui('../../../../../Mobility-Advisor/lib/marca.js'), 'utf8',
    );
    const m = marca.match(/telefono:\s*"\+34 ([\d ]+)"/);
    assert.ok(m, 'no encuentro el teléfono en la marca de PopCar');
    const suyo = m![1].trim();
    for (const man of MANUALES) {
      for (const t of man.texto.matchAll(/\b6\d{2} \d{3} \d{3}\b/g)) {
        assert.equal(t[0], suyo, `${man.nombre} dice ${t[0]} y el de la marca es ${suyo}`);
      }
    }
  });
});
