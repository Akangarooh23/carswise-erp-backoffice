/**
 * Que cada aviso de Pendientes tenga una pantalla donde atenderlo.
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
  /*
   * Éstas dos salieron del mismo barrido que la de financiación, y tenían el
   * mismo fallo: la ruta escrita y ninguna pantalla llamándola.
   *
   * La de los anuncios es la del Kia Sorento: el aviso decía «3 anuncios que
   * hay que quitar» y te dejaba en una pantalla de precios de mercado.
   * Retirarlos se podía, pero solo entrando coche a coche desde su encargo —
   * o sea, sabiendo ya cuáles son, que es lo que el aviso venía a decirte.
   */
  ['/anuncios-portal/por-retirar', 'ver qué anuncios nuestros siguen puestos'],
  ['/provider-invoices/sin-enviar', 'ver qué facturas no le han llegado a nadie'],
  /*
   * El papeleo que paga el comprador. El contrato dice que los gastos del
   * cambio de titularidad son suyos y el ERP guardaba solo lo que nos cuesta la
   * gestoría: esa operación únicamente restaba.
   */
  ['/tramites/sin-cobrar', 'ver qué transferencias no le hemos cobrado al comprador'],
  ['/cobrado', 'apuntar que el comprador ya pagó el papeleo'],
];

describe('los avisos de Pendientes llevan a algo que existe', () => {
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
describe('y los avisos que mandan ahí', () => {
  const CATALOGO = readFileSync(
    join(import.meta.dirname, '..', 'lib', 'pendientes.ts'), 'utf8'
  );

  /**
   * Cada aviso con la pantalla a la que manda.
   *
   * Si alguien quitara una línea del catálogo, las rutas de arriba seguirían
   * enchufadas y esta prueba seguiría en verde mientras el aviso deja de salir.
   * Y si le cambiara el destino, la pantalla que tiene el botón dejaría de ser
   * la que se abre. Las dos cosas son la misma promesa.
   */
  const AVISOS: ReadonlyArray<readonly [string, string]> = [
    ['financiacion_sin_cerrar', '/bookings'],
    ['anuncios_por_retirar', '/portales'],
    ['facturas_sin_enviar', '/billing'],
    ['tramites_sin_cobrar', '/gestoria'],
  ];

  for (const [clave, pantalla] of AVISOS) {
    test(`«${clave}» sigue en el catálogo y lleva a ${pantalla}`, () => {
      const i = CATALOGO.indexOf(`clave: '${clave}'`);
      assert.ok(i > 0, `«${clave}» ya no está en el catálogo de Pendientes`);
      assert.match(
        CATALOGO.slice(i, i + 400),
        new RegExp(`a: '${pantalla.replace('/', '\\/')}'`),
        `«${clave}» ya no manda a ${pantalla}, que es donde está el botón`
      );
    });
  }
});
