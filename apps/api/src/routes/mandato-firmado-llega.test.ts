/**
 * Que el mandato que sube el cliente se pueda descargar desde el ERP.
 *
 * ## El fallo
 *
 * El cliente subía su mandato firmado, el encargo se marcaba, y en el ERP el
 * botón «Descargar» seguía dando **el documento en blanco**: el que se genera
 * cada vez con lo que hay en el encargo. El papel con su firma se guardaba y no
 * lo veía nadie.
 *
 * Eran tres eslabones rotos y ninguno se notaba solo:
 *
 * 1. `encargo` no estaba entre los ámbitos válidos, así que ese documento no se
 *    podía ni listar ni descargar — la ruta lo rechazaba antes de mirar.
 * 2. PopCar guardaba en `ruta` la **URL pública** y el ERP pega ahí el camino
 *    detrás de su bucket: la descarga pedía `.../vehicle-files/https://...`.
 * 3. La pantalla no ofrecía el documento, porque el encargo no lo devolvía.
 *
 * Cada mitad era correcta por su lado. El hueco estaba entre las tres.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AMBITOS } from '../lib/documentos.js';

const lee = (...partes: string[]) => readFileSync(join(import.meta.dirname, ...partes), 'utf8');

describe('el ámbito del encargo', () => {
  test('«encargo» vale como ámbito de documentos', () => {
    /*
     * Sin esto, `ambitoValido` rechaza la petición y el papel firmado es
     * inalcanzable aunque esté guardado.
     */
    assert.ok((AMBITOS as readonly string[]).includes('encargo'));
  });
});

describe('el encargo devuelve el papel firmado', () => {
  const ENCARGOS = lee('encargos.ts').replace(/\r\n/g, '\n');

  test('se busca el documento del mandato', () => {
    assert.match(ENCARGOS, /papel = 'mandato_firmado'/);
    assert.match(ENCARGOS, /ambito = 'encargo'/);
  });

  test('y se devuelve, para que la pantalla pueda ofrecerlo', () => {
    assert.match(ENCARGOS, /mandato_subido: elPapelFirmado/);
  });

  test('vale el último, no el primero', () => {
    /*
     * Si subió una foto borrosa y luego el PDF, el que quiso que tuviéramos es
     * el segundo. Con `ASC` le daríamos siempre el malo.
     */
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("papel = 'mandato_firmado'"));
    assert.match(trozo.slice(0, 200), /ORDER BY created_at DESC LIMIT 1/);
  });
});

describe('la pantalla lo ofrece', () => {
  const PANTALLA = lee('..', '..', '..', 'web', 'src', 'pages', 'idcar', 'MandatoDeVenta.tsx')
    .replace(/\r\n/g, '\n');

  test('hay un botón para el que firmó', () => {
    assert.match(PANTALLA, /El que firmó/);
    assert.match(PANTALLA, /descargaElFirmado/);
  });

  test('y pide el documento por su ruta, con sesión', () => {
    /*
     * Con `descargaConSesion` y no con un `<a href>`: esa ruta exige sesión del
     * ERP, y un enlace suelto no la lleva.
     */
    assert.match(PANTALLA, /descargaConSesion\(\s*`\/documentos\/encargo\/\$\{encargoId\}\/\$\{mandatoSubido\.id\}`/);
  });

  test('el de siempre sigue estando, y se distingue', () => {
    // El generado se puede rehacer cuando haga falta; el firmado no. Pero
    // quitarlo sería perder el que se imprime para que lo firme otro cliente.
    assert.match(PANTALLA, /El de siempre/);
  });
});

/**
 * Y el otro lado: que PopCar guarde lo que el ERP sabe leer.
 *
 * Es la mitad que no se puede comprobar desde aquí con un tipo, porque vive en
 * otro repositorio. Se lee su fichero.
 */
describe('lo que guarda PopCar', () => {
  const POPCAR = join(
    import.meta.dirname, '..', '..', '..', '..', '..',
    'Mobility-Advisor', 'lib', 'api', 'mandato-firmado-handler.js',
  );

  test('guarda la ruta del almacén, no la URL pública', (t) => {
    if (!existsSync(POPCAR)) return t.skip('PopCar no está al lado');
    const src = readFileSync(POPCAR, 'utf8');
    /*
     * `uploadBase64ToSupabase` devuelve la URL pública. Si se guardara eso, la
     * descarga del ERP pediría `.../object/vehicle-files/https://...`.
     */
    assert.match(src, /const camino = `mandatos\//);
    assert.match(src, /SQL_GUARDA_DOCUMENTO, \[encargoId, nombre, tipo, camino/);
  });

  test('y lo cuelga del encargo, con el papel que el ERP busca', (t) => {
    if (!existsSync(POPCAR)) return t.skip('PopCar no está al lado');
    const lib = readFileSync(join(POPCAR, '..', '..', 'mandato-firmado.js'), 'utf8');
    assert.match(lib, /const AMBITO = 'encargo'/);
    assert.match(lib, /const PAPEL = 'mandato_firmado'/);
  });
});
