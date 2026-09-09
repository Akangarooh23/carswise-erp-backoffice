/**
 * El manual que se descarga tiene que decir lo mismo que el de la pantalla.
 *
 * La forma de estropear esto es sutil: en el navegador, cada caja esconde
 * detrás de un clic en qué pantalla se hace y qué se teclea. Un documento
 * generado a partir de lo que se ve saldría con las cajas y sin ninguna de las
 * dos cosas, y nadie lo notaría hasta que alguien intentara trabajar con el
 * Word delante.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { interpreta } from './markdown.js';
import { aWord, escapa, nombreDelFichero } from './manual-a-word.js';

const desdeAqui = (rel: string) =>
  new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CARPETA = desdeAqui('../../../../docs/ejecucion/');

describe('el manual en Word', () => {
  test('lo que en pantalla está plegado, aquí se escribe', () => {
    const bloques = interpreta([
      ':::flujo',
      'erp: Se emite la factura',
      '@ Comisiones → la venta → «Emitir la factura»',
      '+ nada: son 200 €',
      ':::',
    ].join('\n'));

    const doc = aWord('Prueba', bloques);
    assert.match(doc, /Se emite la factura/);
    assert.match(doc, /Comisiones/, 'falta la pantalla: el manual no sirve con el ERP al lado');
    assert.match(doc, /200/, 'faltan los datos que hay que meter');
  });

  test('y eso vale para todas las cajas de todos los manuales', () => {
    /*
     * La prueba de arriba pasa con un flujo de una caja escrito aquí. Esta se
     * hace sobre los documentos de verdad: si algún día se exporta solo la
     * primera caja, o se pierde el «Se mete» de las que llevan tabla, salta.
     */
    for (const fichero of readdirSync(CARPETA).filter((f) => f.endsWith('.md'))) {
      const fuente = readFileSync(join(CARPETA, fichero), 'utf8');
      const bloques = interpreta(fuente);
      const doc = aWord(fichero, bloques);

      const cajas = bloques
        .filter((b) => b.tipo === 'flujo')
        .flatMap((b) => (b.tipo === 'flujo' ? b.pasos : []))
        .filter((p) => p.tipo === 'paso');

      /*
       * Trozo a trozo, no la línea entera: un «dónde» con negrita sale del
       * intérprete partido en varios, y en el documento van con su etiqueta en
       * medio. Comparar la concatenación diría que falta algo que sí está.
       */
      const perdidas = cajas
        .filter((c) => c.tipo === 'paso' && c.donde)
        .filter((c) => {
          if (c.tipo !== 'paso' || !c.donde) return false;
          return c.donde.some((t) => !doc.includes(escapa(t.texto)));
        })
        .map((c) => (c.tipo === 'paso' ? c.trozos.map((t) => t.texto).join('') : ''));

      assert.deepEqual(perdidas, [], `${fichero}: cajas cuyo «dónde» no llegó al Word:\n  ${perdidas.join('\n  ')}`);
      assert.ok(cajas.length > 0, `${fichero}: ninguna caja`);
    }
  });

  test('el rótulo dice quién hace cada paso', () => {
    const bloques = interpreta([':::flujo', 'trabajador: Se le llama por teléfono', ':::'].join('\n'));
    assert.match(aWord('Prueba', bloques), /Una persona/);
  });

  test('nada del documento se cuela como etiqueta', () => {
    // Los manuales llevan nombres de columna y comparaciones. Un `<b` del texto
    // metido tal cual convierte el resto del documento en negrita.
    const bloques = interpreta('Si `a < b` entonces <b>esto no es negrita</b>');
    const doc = aWord('Prueba', bloques);
    assert.match(doc, /&lt;b&gt;esto no es negrita/);
    assert.ok(!doc.includes('<b>esto no es negrita'), 'ha colado una etiqueta del texto');
  });

  test('el título del documento tampoco', () => {
    assert.match(aWord('<script>x</script>', []), /&lt;script&gt;/);
  });

  test('las tablas van como tablas, no como párrafos sueltos', () => {
    const bloques = interpreta(['| Qué | Dónde |', '|---|---|', '| La cita | Agenda |'].join('\n'));
    const doc = aWord('Prueba', bloques);
    assert.match(doc, /<table/);
    assert.match(doc, /Agenda/);
  });

  test('Word necesita saber en qué juego de caracteres viene', () => {
    // Sin esto los manuales, que están en español, se abren llenos de símbolos.
    assert.match(aWord('Prueba', []), /<meta charset="utf-8">/);
  });

  describe('el nombre del fichero', () => {
    test('sale del título, sin tildes ni signos', () => {
      assert.equal(nombreDelFichero('Flujo de importación'), 'flujo-de-importacion.doc');
      assert.equal(nombreDelFichero('Flujo marketplace — concesionario'), 'flujo-marketplace-concesionario.doc');
    });

    test('las tildes dejan la letra, no un guion', () => {
      // Con NFD, «ó» son dos caracteres; si se quitaran los dos, saldría
      // «importaci-n» y el fichero no se reconocería de un vistazo.
      assert.ok(!nombreDelFichero('importación').includes('-'));
    });

    test('y un título imposible no deja un fichero sin nombre', () => {
      assert.equal(nombreDelFichero('¿¡—!?'), 'manual.doc');
      assert.equal(nombreDelFichero(''), 'manual.doc');
    });
  });
});
