/**
 * Qué se puede subir al garaje de un cliente.
 *
 * Se subía sin mirar el tipo, y los ficheros acaban en un bucket público de
 * Supabase: lo que se suba se sirve desde una dirección nuestra. Un .html o un
 * .svg ahí dentro puede llevar guion, y aunque no toque el ERP, deja un sitio
 * nuestro sirviendo lo que alguien quiera.
 *
 * Lo guardado hoy son fotos —png, jpeg, webp— y PDF, con 2,6 MB como mayor. La
 * lista se hizo mirando eso, no de memoria.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { revisaFichero, tamanoDeBase64, TAMANO_MAXIMO } from './ficheros.js';

const pequeño = 1024;

describe('lo que se acepta', () => {
  const buenos: [string, string][] = [
    ['ficha.pdf', 'application/pdf'],
    ['foto.png', 'image/png'],
    ['foto.jpg', 'image/jpeg'],
    ['foto.jpeg', 'image/jpeg'],
    ['foto.webp', 'image/webp'],
    ['foto.gif', 'image/gif'],
  ];

  for (const [nombre, tipo] of buenos) {
    test(`${nombre} pasa`, () => {
      assert.equal(revisaFichero(nombre, tipo, pequeño), null);
    });
  }

  test('da igual cómo esté escrito el nombre', () => {
    assert.equal(revisaFichero('FOTO.PNG', 'image/png', pequeño), null);
    assert.equal(revisaFichero('Ficha Técnica.PDF', 'application/pdf', pequeño), null);
  });

  test('el tipo puede venir con su juego de caracteres detrás', () => {
    // Algunos navegadores mandan «application/pdf; charset=binary».
    assert.equal(revisaFichero('ficha.pdf', 'application/pdf; charset=binary', pequeño), null);
  });
});

describe('lo que no se acepta', () => {
  test('una página web no es un documento del coche', () => {
    const r = revisaFichero('nota.html', 'text/html', pequeño);
    assert.ok(r, 'un .html en un bucket público se sirve y puede llevar guion');
    assert.match(r!.motivo, /Solo se aceptan/);
  });

  test('ni un SVG, que también lleva guion dentro', () => {
    assert.ok(revisaFichero('logo.svg', 'image/svg+xml', pequeño));
  });

  test('ni un ejecutable', () => {
    assert.ok(revisaFichero('cosa.exe', 'application/x-msdownload', pequeño));
  });

  test('el nombre y el tipo tienen que decir lo mismo', () => {
    // Mentir en uno solo es lo fácil: se declara PDF y se sube un .html.
    const r = revisaFichero('nota.html', 'application/pdf', pequeño);
    assert.ok(r);
    assert.match(r!.motivo, /acaba en/);
  });

  test('un fichero sin extensión no pasa', () => {
    assert.ok(revisaFichero('documento', 'application/pdf', pequeño));
  });

  test('un fichero sin nombre tampoco', () => {
    assert.match(revisaFichero('', 'application/pdf', pequeño)!.motivo, /no tiene nombre/);
  });

  test('lo que pesa de más se rechaza diciendo cuánto', () => {
    const r = revisaFichero('foto.png', 'image/png', 5 * 1024 * 1024);
    assert.ok(r);
    assert.match(r!.motivo, /5,0 MB/);
    assert.match(r!.motivo, /máximo son 3 MB/);
  });

  test('justo en el límite todavía pasa', () => {
    assert.equal(revisaFichero('foto.png', 'image/png', TAMANO_MAXIMO), null);
    assert.ok(revisaFichero('foto.png', 'image/png', TAMANO_MAXIMO + 1));
  });

  test('el motivo se puede enseñar tal cual', () => {
    // Quien sube tiene que poder leer qué ha pasado: «no se pudo subir» no dice
    // si el problema es el tipo, el tamaño o el nombre.
    const r = revisaFichero('cosa.exe', 'application/x-msdownload', pequeño);
    assert.ok(r!.motivo.endsWith('.'), 'es una frase, no un código');
  });
});

describe('cuánto ocupa lo que llega', () => {
  test('se mide sobre lo que viene, no sobre lo que digan que pesa', () => {
    // El tamaño lo mandaba el navegador y podía mentir.
    const tres = Buffer.from('abc').toString('base64');
    assert.equal(tamanoDeBase64(tres), 3);
  });

  test('el relleno del final no cuenta', () => {
    assert.equal(tamanoDeBase64(Buffer.from('a').toString('base64')), 1);
    assert.equal(tamanoDeBase64(Buffer.from('ab').toString('base64')), 2);
    assert.equal(tamanoDeBase64(Buffer.from('abcd').toString('base64')), 4);
  });

  test('sin contenido, cero', () => {
    assert.equal(tamanoDeBase64(''), 0);
    assert.equal(tamanoDeBase64(undefined), 0);
  });

  test('una foto de verdad se mide bien', () => {
    const foto = Buffer.alloc(261303, 7).toString('base64');
    assert.equal(tamanoDeBase64(foto), 261303);
  });
});

describe('las hojas de cálculo', () => {
  /**
   * Entraron con el primer informe de un perito: el informe va en PDF y la
   * lista de puntos revisados en un Excel, y esa lista es la que se pega en los
   * daños. Rechazarla obligaba a dejarla en el correo, que es donde los papeles
   * de un coche dejan de existir el día que esa persona no está.
   */
  const MB = 1024 * 1024;

  test('un xlsx entra', () => {
    assert.equal(
      revisaFichero(
        'checklist_peritacion.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        20 * 1024
      ),
      null
    );
  });

  test('y un xls, un ods y un csv también', () => {
    assert.equal(revisaFichero('a.xls', 'application/vnd.ms-excel', 1000), null);
    assert.equal(revisaFichero('a.ods', 'application/vnd.oasis.opendocument.spreadsheet', 1000), null);
    assert.equal(revisaFichero('a.csv', 'text/csv', 1000), null);
  });

  test('pero no un xlsm: eso es un programa, no un papel', () => {
    // Un Excel con macros ejecuta código al abrirlo. Esto es un cajón de
    // papeles de un coche, y acaba en un almacén público.
    assert.ok(revisaFichero('a.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', 1000));
  });

  test('el nombre y el tipo tienen que decir lo mismo', () => {
    // Un ejecutable renombrado a .xlsx no entra por decir que es una hoja.
    const r = revisaFichero(
      'virus.exe',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      1000
    );
    assert.ok(r && /acaba en/.test(r.motivo));
  });

  test('y el tope de tamaño sigue siendo el mismo', () => {
    assert.ok(revisaFichero('a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 4 * MB));
  });
});

describe('las presentaciones', () => {
  test('un pptx, un ppt y un odp entran', () => {
    assert.equal(revisaFichero(
      'informe.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      50 * 1024
    ), null);
    assert.equal(revisaFichero('a.ppt', 'application/vnd.ms-powerpoint', 1000), null);
    assert.equal(revisaFichero('a.odp', 'application/vnd.oasis.opendocument.presentation', 1000), null);
  });

  test('pero no un pptm, que también ejecuta código', () => {
    assert.ok(revisaFichero('a.pptm', 'application/vnd.ms-powerpoint.presentation.macroEnabled.12', 1000));
  });
});
