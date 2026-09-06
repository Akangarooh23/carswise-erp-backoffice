import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
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
