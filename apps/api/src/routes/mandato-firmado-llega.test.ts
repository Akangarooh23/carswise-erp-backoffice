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
const POPCAR_HANDLER = join(
  import.meta.dirname, '..', '..', '..', '..', '..',
  'Mobility-Advisor', 'lib', 'api', 'mandato-firmado-handler.js',
);

describe('lo que guarda PopCar', () => {
  test('guarda la ruta del almacén, no la URL pública', (t) => {
    if (!existsSync(POPCAR_HANDLER)) return t.skip('PopCar no está al lado');
    const src = readFileSync(POPCAR_HANDLER, 'utf8');
    /*
     * `uploadBase64ToSupabase` devuelve la URL pública. Si se guardara eso, la
     * descarga del ERP pediría `.../object/vehicle-files/https://...`.
     */
    assert.match(src, /const camino = `mandatos\//);
    /*
     * El segundo parámetro es el nombre con el que se ve el papel y cambió de
     * `nombre` a `comoSeLlama` al empezar a renombrarlos —«Mandato firmado ·
     * 8888LXR.docx» en vez de lo que traía el móvil—. Lo que aquí se protege no
     * es cómo se llame esa variable sino que en el **cuarto** hueco, la ruta,
     * vaya `camino` y no la URL pública.
     */
    assert.match(src, /SQL_GUARDA_DOCUMENTO, \[encargoId, [A-Za-z]+, tipo, camino/);
  });

  test('y lo cuelga del encargo, con el papel que el ERP busca', (t) => {
    if (!existsSync(POPCAR_HANDLER)) return t.skip('PopCar no está al lado');
    const lib = readFileSync(join(POPCAR_HANDLER, '..', '..', 'mandato-firmado.js'), 'utf8');
    assert.match(lib, /const AMBITO = 'encargo'/);
    assert.match(lib, /const PAPEL = 'mandato_firmado'/);
  });
});

/**
 * Y que el papel no acabe en un cajón público.
 *
 * `vehicle-files` es público —ahí van las fotos de los anuncios, y así tiene
 * que ser—, pero un mandato firmado lleva el nombre, la matrícula y la firma de
 * una persona. Con el bucket público, la ruta del ERP pedía sesión y el fichero
 * era alcanzable sin ella: bastaba la dirección.
 *
 * Se cambió con la tabla a cero documentos: no había nada que migrar.
 */
describe('los papeles van a un cajón privado', () => {
  const DOCS = lee('documentos.ts').replace(/\r\n/g, '\n');

  test('el ERP los lee del bucket privado', () => {
    assert.match(DOCS, /const BUCKET = 'erp-documentos'/);
  });

  test('y no del de las fotos', () => {
    /*
     * Si volviera a `vehicle-files`, la sesión que pide esta ruta dejaría de
     * significar nada: el fichero se bajaría por URL directa.
     */
    assert.doesNotMatch(DOCS, /const BUCKET = 'vehicle-files'/);
  });

  test('PopCar sube ahí también', (t) => {
    if (!existsSync(POPCAR_HANDLER)) return t.skip('PopCar no está al lado');
    const src = readFileSync(POPCAR_HANDLER, 'utf8');
    assert.match(src, /uploadBase64ToSupabase\(contenido, tipo, camino, BUCKET_PRIVADO\)/);
  });

  test('y los dos nombran el mismo cajón', (t) => {
    if (!existsSync(POPCAR_HANDLER)) return t.skip('PopCar no está al lado');
    // Dos nombres distintos y el ERP buscaría el fichero donde no está.
    const storage = readFileSync(join(POPCAR_HANDLER, '..', '..', 'supabaseStorage.js'), 'utf8');
    const m = storage.match(/BUCKET_PRIVADO\s*=\s*'([^']+)'/);
    assert.ok(m, 'no encuentro el bucket privado en PopCar');
    assert.match(DOCS, new RegExp(`const BUCKET = '${m[1]}'`));
  });
});
