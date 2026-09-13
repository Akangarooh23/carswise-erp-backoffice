/**
 * Que lo de la financiación esté enchufado a una pantalla.
 *
 * ## Por qué existe
 *
 * Se construyeron las cuatro rutas —la lista de las que faltan por cerrar, el
 * cierre, las comisiones pendientes y su emisión— y **ninguna pantalla las
 * llamaba**. Encima la línea de Pendientes ya estaba puesta, así que el panel
 * decía «2 financiaciones sin cerrar», llevaba a la Agenda, y allí no había
 * ningún botón para cerrarlas.
 *
 * Es el mismo fallo que el aviso de retirar el anuncio del portal: la alarma
 * montada y el sensor sin conectar. Las dos mitades estaban bien y el hueco
 * estaba entre ellas — y como cada mitad tenía sus pruebas, las dos pasaban.
 *
 * ## Qué mira
 *
 * Que cada ruta que hace falta para atender un aviso de Pendientes la llame
 * alguien del web. No comprueba que la pantalla esté bien hecha: comprueba que
 * existe, que es justo lo que faltaba.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Todo el código del web, de una vez. */
const ELWEB = (() => {
  const raiz = join(import.meta.dirname, '..', '..', '..', 'web', 'src');
  let junto = '';
  const anda = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const camino = join(dir, f);
      if (statSync(camino).isDirectory()) { anda(camino); continue; }
      if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) {
        junto += readFileSync(camino, 'utf8');
      }
    }
  };
  anda(raiz);
  return junto;
})();

/**
 * Las rutas que tienen que estar enchufadas, con qué aviso atienden.
 *
 * Escrita a mano porque no todas las rutas de la API tienen que tener pantalla
 * —muchas las llama otra ruta—. Lo que no puede pasar es que una que atiende un
 * aviso de Pendientes no la llame nadie: ese aviso mandaría a un sitio donde no
 * se puede hacer nada.
 */
const HACEN_FALTA: ReadonlyArray<readonly [string, string]> = [
  ['/visit-bookings/financiacion/sin-cerrar', 'ver las financiaciones que faltan por cerrar'],
  ['financiacion-cierre', 'cerrar una financiación desde la Agenda'],
  ['/provider-billing/pending-financing-commissions', 'ver las comisiones de financiación pendientes'],
  ['/provider-billing/financing-commissions', 'emitirle la factura a la entidad'],
];

describe('la financiación está enchufada a una pantalla', () => {
  test('el web se lee entero', () => {
    // Si esto quedara vacío, todas las comprobaciones de abajo pasarían sin
    // mirar nada — que es peor que no tenerlas.
    assert.ok(ELWEB.length > 100_000, `solo ${ELWEB.length} caracteres de web leídos`);
  });

  for (const [ruta, paraQue] of HACEN_FALTA) {
    test(`alguien llama a «${ruta}», que es como se hace ${paraQue}`, () => {
      assert.ok(
        ELWEB.includes(ruta),
        `ninguna pantalla llama a ${ruta}: el aviso de Pendientes llevaría a un sitio donde no se puede hacer nada`
      );
    });
  }
});

/**
 * Y que el aviso siga existiendo.
 *
 * Si alguien quitara la línea del catálogo, las rutas de arriba seguirían
 * enchufadas y esta prueba seguiría en verde mientras el aviso deja de salir.
 * Se mira aquí porque las dos cosas son la misma promesa.
 */
describe('y el aviso que las manda ahí', () => {
  const CATALOGO = readFileSync(
    join(import.meta.dirname, '..', 'lib', 'pendientes.ts'), 'utf8'
  );

  test('«financiacion_sin_cerrar» sigue en el catálogo de Pendientes', () => {
    assert.match(CATALOGO, /clave: 'financiacion_sin_cerrar'/);
  });

  test('y lleva a la Agenda, que es donde está el botón', () => {
    const trozo = CATALOGO.slice(CATALOGO.indexOf("clave: 'financiacion_sin_cerrar'"));
    assert.match(trozo.slice(0, 400), /a: '\/bookings'/);
  });
});
