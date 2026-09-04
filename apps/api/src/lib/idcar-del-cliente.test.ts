/**
 * El coche entregado pasa a ser el IdCar del cliente.
 *
 * El día de la entrega el expediente se cerraba y ahí se acababa todo: el
 * cliente tenía un coche y en su panel no tenía nada. Sus papeles —el permiso,
 * la ficha técnica, el COC, las facturas— se quedaban en nuestros cajones, que
 * son los del ERP y él no ve. Y son suyos: los va a necesitar el día que lo
 * venda, el día que le paren y el día que pida un presupuesto de taller.
 *
 * Lo que se sostiene aquí son las dos cosas que harían daño: darle papeles
 * nuestros —el presupuesto del transportista, la factura del perito— que le
 * dejarían leer nuestros costes, y meter un papel en el hueco de otro para que
 * entre.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  esSuyo, dondeVaEnSuPanel, marcaYModelo, faltaParaDarleElIdCar, urlDelFichero,
  PAPELES_DEL_CLIENTE,
} from './idcar-del-cliente.js';

describe('qué papeles son suyos', () => {
  test('los del coche, sí', () => {
    assert.ok(esSuyo('Permiso de circulación'));
    assert.ok(esSuyo('Ficha técnica'));
    assert.ok(esSuyo('COC (certificado de conformidad)'));
    assert.ok(esSuyo('Factura del vendedor alemán'));
  });

  test('los de nuestra operación, no', () => {
    // Meterlos en su garaje es darle a leer nuestros costes.
    assert.ok(!esSuyo('Presupuesto del transportista'));
    assert.ok(!esSuyo('Factura del perito'));
    assert.ok(!esSuyo('Fotos de la recogida'));
    assert.ok(!esSuyo(''));
  });
});

describe('dónde va cada uno', () => {
  test('el permiso y la ficha, al cajón con tipo', () => {
    // Son los que su pantalla sabe enseñar con su nombre y su hueco.
    assert.deepEqual(dondeVaEnSuPanel('Permiso de circulación'),
      { donde: 'documento', tipo: 'circulation_permit' });
    assert.deepEqual(dondeVaEnSuPanel('Ficha técnica'),
      { donde: 'documento', tipo: 'technical_sheet' });
  });

  test('y las dos partes de la ficha alemana también son ficha técnica', () => {
    assert.equal(dondeVaEnSuPanel('Ficha del vehículo (parte I)')?.tipo, 'technical_sheet');
    assert.equal(dondeVaEnSuPanel('Ficha del vehículo (parte II)')?.tipo, 'technical_sheet');
  });

  test('lo demás, al cajón sin tipo', () => {
    // Meter una factura como «ficha técnica» para que entre en el hueco bonito
    // sería mentirle a su propia pantalla: el día que busque su ficha técnica
    // encontraría una factura.
    for (const papel of [
      'COC (certificado de conformidad)',
      'Factura del vendedor alemán',
      'Justificante del impuesto de matriculación',
    ]) {
      assert.equal(dondeVaEnSuPanel(papel)?.donde, 'fichero', papel);
    }
  });

  test('los tipos con hueco propio son solo los tres que admite la base', () => {
    // La tabla tiene un CHECK cerrado. Un tipo inventado no entra, y el papel
    // se pierde en silencio.
    const conTipo = Object.values(PAPELES_DEL_CLIENTE)
      .filter((x) => x.donde === 'documento')
      .map((x) => x.tipo);
    for (const tipo of conTipo) {
      assert.ok(['circulation_permit', 'technical_sheet', 'itv'].includes(tipo), tipo);
    }
  });

  test('y uno que no es suyo no va a ninguna parte', () => {
    assert.equal(dondeVaEnSuPanel('Presupuesto del transportista'), null);
  });
});

describe('la marca y el modelo, del título del anuncio', () => {
  test('lo normal', () => {
    assert.deepEqual(marcaYModelo('Kia Sorento 2.4 GDI AWD Automatik Kamera LED'), {
      brand: 'Kia', model: 'Sorento', version: '2.4 GDI AWD Automatik Kamera LED',
    });
  });

  test('las marcas de dos palabras no se parten', () => {
    // «Land» no es una marca, y un coche con marca «Land» no sale en ninguna
    // búsqueda de su propio panel.
    assert.equal(marcaYModelo('Land Rover Discovery Sport 2.0').brand, 'Land Rover');
    assert.equal(marcaYModelo('Land Rover Discovery Sport 2.0').model, 'Discovery');
    assert.equal(marcaYModelo('Alfa Romeo Giulia Veloce').brand, 'Alfa Romeo');
  });

  test('un título de una palabra no inventa modelo', () => {
    assert.deepEqual(marcaYModelo('Seat'), { brand: 'Seat', model: '', version: '' });
  });

  test('y uno vacío no deja basura', () => {
    assert.deepEqual(marcaYModelo(''), { brand: '', model: '', version: '' });
    assert.deepEqual(marcaYModelo('   '), { brand: '', model: '', version: '' });
  });
});

describe('lo que hace falta para dárselo', () => {
  test('con correo y coche, se puede', () => {
    assert.deepEqual(faltaParaDarleElIdCar({ correo: 'ana@x.es', vehiculo: 'Kia Sorento' }), []);
  });

  test('sin correo no hay a quién dárselo', () => {
    assert.deepEqual(faltaParaDarleElIdCar({ vehiculo: 'Kia Sorento' }), ['el correo del cliente']);
  });
});

describe('la url del fichero', () => {
  test('apunta al mismo almacén, sin copiar nada', () => {
    // Duplicar un PDF por cada coche entregado es pagar dos veces por el mismo
    // byte y quedarse con dos copias que pueden acabar diciendo cosas distintas.
    assert.equal(
      urlDelFichero('https://x.supabase.co', 'documentos/tramite/TRA-1/abc-permiso.pdf'),
      'https://x.supabase.co/storage/v1/object/public/vehicle-files/documentos/tramite/TRA-1/abc-permiso.pdf'
    );
  });

  test('con barras de más, tampoco se rompe', () => {
    assert.equal(
      urlDelFichero('https://x.supabase.co/', '/documentos/a.pdf'),
      'https://x.supabase.co/storage/v1/object/public/vehicle-files/documentos/a.pdf'
    );
  });

  test('y sin almacén configurado no se inventa una url', () => {
    // Una url a ninguna parte en el panel del cliente es un enlace roto con su
    // permiso de circulación detrás.
    assert.equal(urlDelFichero('', 'documentos/a.pdf'), '');
    assert.equal(urlDelFichero('https://x.supabase.co', ''), '');
  });
});
