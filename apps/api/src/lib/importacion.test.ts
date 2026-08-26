/**
 * La importación de Excel no puede perder filas en silencio.
 *
 * Es la operación con más volumen del ERP y la única donde un fallo no se ve:
 * si de 120 filas entran 40, la pantalla dice «40 unidades añadidas» y parece
 * que ha ido bien. Estas pruebas fijan la cuenta: cada fila que entra sale por
 * algún sitio —importada, rechazada o repetida— y la suma cuadra siempre.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepara, llaveAnuncio, filaSchema } from './importacion.js';

/** Una fila válida mínima; se le cambia lo que pida cada prueba. */
const fila = (extra: Record<string, unknown> = {}) => ({
  title: 'Volkswagen Golf 1.6 TDI',
  brand: 'Volkswagen',
  model: 'Golf',
  year: 2020,
  price: 14500,
  unit_color: 'Blanco',
  unit_mileage: 9000,
  ...extra,
});

/** Lo que importa de un resultado: que no se haya evaporado nada. */
function cuenta(p: ReturnType<typeof prepara>) {
  return {
    unidades: p.grupos.reduce((n, g) => n + g.length, 0),
    anuncios: p.grupos.length,
    rechazadas: p.rechazadas.length,
    repetidas: p.repetidas.length,
  };
}

describe('agrupar', () => {
  test('tres colores del mismo coche son un anuncio con tres unidades', () => {
    const p = prepara([
      fila({ unit_color: 'Blanco', unit_mileage: 9000 }),
      fila({ unit_color: 'Negro', unit_mileage: 15000 }),
      fila({ unit_color: 'Blanco', unit_mileage: 18500 }),
    ]);
    assert.deepEqual(cuenta(p), { unidades: 3, anuncios: 1, rechazadas: 0, repetidas: 0 });
  });

  test('el mismo modelo a otro precio es otro anuncio', () => {
    const p = prepara([fila(), fila({ price: 15900 })]);
    assert.equal(p.grupos.length, 2);
  });

  test('la marca agrupa sin importar mayúsculas ni espacios', () => {
    assert.equal(
      llaveAnuncio(filaSchema.parse(fila({ brand: '  VOLKSWAGEN ', model: 'Golf' }))),
      llaveAnuncio(filaSchema.parse(fila({ brand: 'Volkswagen', model: 'golf' })))
    );
  });
});

describe('nada se pierde en silencio', () => {
  test('la exportación del ERP no trae columnas de unidad, y eso colapsaba el fichero', () => {
    // Esto es exactamente lo que sale del botón «Exportar Excel»: las columnas
    // unit_color y unit_mileage van vacías. Sin ellas las cinco filas son
    // indistinguibles, así que solo puede entrar una.
    const exportadas = Array.from({ length: 5 }, (_, i) =>
      fila({ title: `Golf unidad ${i + 1}`, unit_color: '', unit_mileage: '' })
    );
    const p = prepara(exportadas);

    assert.equal(cuenta(p).unidades, 1, 'solo se puede quedar una');
    assert.equal(cuenta(p).repetidas, 4, 'las otras cuatro tienen que aparecer como repetidas');
    // Y con un motivo que explique qué mirar en el Excel.
    assert.match(p.repetidas[0].motivo, /sin color ni kilómetros/);
  });

  test('cada fila descartada dice qué fila del Excel es', () => {
    const p = prepara([fila(), fila({ brand: '' }), fila({ unit_color: 'Rojo' })]);
    assert.equal(p.rechazadas.length, 1);
    // La 1 es la de cabeceras, así que la segunda fila de datos es la 3.
    assert.equal(p.rechazadas[0].numero, 3);
    assert.equal(p.rechazadas[0].motivo, 'falta brand', 'una celda vacía es «falta», no «demasiado pequeño»');
  });

  test('la suma cuadra siempre', () => {
    const filas = [
      fila(),                                   // entra
      fila({ unit_color: 'Negro' }),            // entra
      fila(),                                   // repetida de la primera
      fila({ year: 'no es un año' }),           // rechazada
      fila({ brand: 'Seat', model: 'León' }),   // entra, otro anuncio
      fila({ year: 1820 }),                     // rechazada: fuera de rango
    ];
    const c = cuenta(prepara(filas));
    assert.equal(c.unidades + c.rechazadas + c.repetidas, filas.length);
    assert.deepEqual(c, { unidades: 3, anuncios: 2, rechazadas: 2, repetidas: 1 });
  });

  test('una lista vacía no revienta', () => {
    assert.deepEqual(cuenta(prepara([])), { unidades: 0, anuncios: 0, rechazadas: 0, repetidas: 0 });
  });
});

describe('lo que llega del Excel es texto, siempre', () => {
  // El lector de xlsx convierte cada celda a cadena antes de mandarla, celdas
  // vacías incluidas. Todo lo numérico tiene que aguantar eso.
  test('los números vienen como texto y se leen igual', () => {
    const f = filaSchema.parse(fila({ year: '2020', price: '14500', unit_mileage: '9000' }));
    assert.equal(f.year, 2020);
    assert.equal(f.price, 14500);
    assert.equal(f.unit_mileage, 9000);
  });

  test('un precio de renting vacío no puede convertirse en cero euros al mes', () => {
    const f = filaSchema.parse(fila({ renting_12m: '', renting_36m: '350' }));
    assert.equal(f.renting_36m, 350);
    assert.equal(f.renting_12m, null, 'vacío es «no hay precio», no «cuesta cero»');
  });

  test('un precio vacío deja el vehículo a cero, no lo rechaza', () => {
    // Es lo que hace hoy. Queda escrito para que si un día se decide que un
    // precio vacío debe rechazar la fila, esta prueba avise del cambio.
    assert.equal(filaSchema.parse(fila({ price: '' })).price, 0);
  });
});
