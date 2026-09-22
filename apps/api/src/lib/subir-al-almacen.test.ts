import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { laExtension, comoSeGuarda } from './subir-al-almacen.js';

describe('la extensión de un fichero', () => {
  test('en minúscula y sin el punto', () => {
    assert.equal(laExtension('factura.PDF'), 'pdf');
    assert.equal(laExtension('foto.JPEG'), 'jpeg');
  });

  test('de un nombre con puntos, la última', () => {
    assert.equal(laExtension('ACD-2026-0907-001.v2.pdf'), 'pdf');
  });

  test('sin extensión, se guarda como PDF', () => {
    // El nombre no cambia el contenido, y un fichero sin extensión no se abre.
    assert.equal(laExtension('factura'), 'pdf');
    assert.equal(laExtension(''), 'pdf');
    assert.equal(laExtension(null), 'pdf');
  });

  test('y una que no lo es tampoco cuela', () => {
    // «informe.de la peritación de septiembre» no acaba en una extensión.
    assert.equal(laExtension('informe.de la peritación'), 'pdf');
  });

  test('los caracteres raros se caen', () => {
    // Van en una dirección: un espacio o una tilde ahí rompe el enlace.
    assert.equal(laExtension('foto.pn g'), 'png');
  });
});

describe('cómo se guarda', () => {
  test('una carpeta por tipo y el identificador por nombre', () => {
    // Por el identificador y no por el nombre original: dos peritos pueden
    // mandar los dos «informe.pdf» y el segundo pisaría al primero.
    assert.equal(comoSeGuarda('peritaciones', 'PER-2026-001', 'informe.pdf'),
      'peritaciones/PER-2026-001.pdf');
    assert.equal(comoSeGuarda('provider-invoices', 'PROV-2026-001', 'f.PDF'),
      'provider-invoices/PROV-2026-001.pdf');
  });

  test('y respeta el tipo de imagen', () => {
    assert.equal(comoSeGuarda('peritaciones', 'PER-1', 'aleta.jpg'), 'peritaciones/PER-1.jpg');
  });
});

/**
 * Y en qué cubo cae.
 *
 * Esto guardaba en `vehicle-files`, que es público: un informe de peritación y
 * cuatro facturas de proveedor se abrían con la dirección a pelo, sin sesión, y
 * el nombre del fichero es el número de serie —sabiendo uno se piden los demás—.
 *
 * Se comprueba sobre el fuente porque la subida habla con Supabase: lo que
 * importa aquí es que no vuelva a aparecer un `object/public` ni el cubo de las
 * fotos, y eso se ve leyendo.
 */
describe('a qué cubo van los papeles', () => {
  const fuente = readFileSync(new URL('./subir-al-almacen.ts', import.meta.url), 'utf8');
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

  test('al privado, no al de las fotos', () => {
    assert.match(sinComentarios, /const CUBO = 'erp-documentos'/);
    assert.ok(!sinComentarios.includes('vehicle-files'), 'los papeles no van al cubo de los anuncios');
  });

  test('y lo que se guarda no es una dirección pública', () => {
    assert.ok(
      !/object\/public/.test(sinComentarios),
      'una dirección con /public/ abre sin sesión: eso era el problema'
    );
  });
});
