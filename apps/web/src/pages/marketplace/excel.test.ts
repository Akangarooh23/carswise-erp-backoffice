/**
 * Exportar y volver a importar no puede perder vehículos.
 *
 * Es el camino que hace un trabajador cuando quiere cambiar cincuenta precios:
 * exporta, edita en Excel, vuelve a subir. Si por ese viaje se pierde una
 * columna, la importación no lo nota —las filas siguen siendo válidas— y se
 * queda con menos coches de los que había, sin decir nada.
 *
 * Aquí se hace el viaje entero de verdad: se escribe el .xlsx en memoria y se
 * vuelve a leer con el mismo lector que usa la pantalla.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { filasParaExcel, parseXlsx } from './excel.js';
import { EXCEL_HEADERS } from './constantes.js';
import type { VoOffer } from '../../types/index.js';

/** Un vehículo como los que devuelve la API, con lo mínimo que exige el tipo. */
const vehiculo = (extra: Partial<VoOffer> = {}): VoOffer =>
  ({
    id: 'erp-1', title: 'Volkswagen Golf 1.6 TDI Comfortline',
    brand: 'Volkswagen', model: 'Golf', year: 2020, price: 14500,
    mileage: 9000, color: 'Blanco', fuel: 'Diésel', power: '85 CV',
    location: 'Madrid', seller: 'PopCar', is_active: true,
    ...extra,
  }) as VoOffer;

/** El viaje completo: a hoja de cálculo y de vuelta. */
function idaYVuelta(items: VoOffer[]): Record<string, string>[] {
  const hoja = XLSX.utils.json_to_sheet(filasParaExcel(items), { header: EXCEL_HEADERS });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Marketplace VO');
  const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return parseXlsx(bytes);
}

describe('exportar y volver a importar', () => {
  test('vuelven todas las filas', () => {
    const items = [vehiculo(), vehiculo({ id: 'erp-2', color: 'Negro', mileage: 15000 })];
    assert.equal(idaYVuelta(items).length, 2);
  });

  test('cada coche sigue distinguiéndose de los demás', () => {
    // Tres unidades del mismo anuncio. Si el color y los kilómetros no viajan,
    // las tres filas salen idénticas y la importación se queda con una.
    const items = [
      vehiculo({ id: 'a', color: 'Blanco', mileage: 9000 }),
      vehiculo({ id: 'b', color: 'Negro', mileage: 15000 }),
      vehiculo({ id: 'c', color: 'Blanco', mileage: 18500 }),
    ];
    const vuelta = idaYVuelta(items);
    const señas = new Set(vuelta.map((f) => `${f.unit_color}|${f.unit_mileage}`));
    assert.equal(señas.size, 3, 'las tres filas tienen que seguir siendo tres coches distintos');
  });

  test('las columnas de unidad llevan el color y los kilómetros del vehículo', () => {
    const [f] = idaYVuelta([vehiculo({ color: 'Gris urano', mileage: 42000 })]);
    assert.equal(f.unit_color, 'Gris urano');
    assert.equal(f.unit_mileage, '42000');
  });

  test('no se pierde ninguna columna por el camino', () => {
    const [f] = idaYVuelta([vehiculo({ renting_available: true, renting_36m: 350 } as Partial<VoOffer>)]);
    const faltan = EXCEL_HEADERS.filter((c) => !(c in f));
    assert.deepEqual(faltan, [], 'la hoja tiene que traer todas las columnas de la plantilla');
  });

  test('las varias imágenes viajan separadas por una barra', () => {
    const [f] = idaYVuelta([vehiculo({ image_urls: ['https://a/1.jpg', 'https://a/2.jpg'] } as Partial<VoOffer>)]);
    assert.equal(f.image_urls, 'https://a/1.jpg|https://a/2.jpg');
  });

  test('los precios de renting vacíos vuelven vacíos, no a cero', () => {
    // Un cero es «cuesta cero euros al mes». Un hueco es «no se ofrece ese
    // plazo». En una hoja de precios eso no es lo mismo.
    const [f] = idaYVuelta([vehiculo({ renting_available: true, renting_36m: 350 } as Partial<VoOffer>)]);
    assert.equal(f.renting_36m, '350');
    assert.equal(f.renting_12m, '');
  });

  test('lo que sale es texto, siempre', () => {
    // El lector convierte cada celda a cadena, y de eso depende que el esquema
    // de la API sepa distinguir un hueco de un cero.
    const [f] = idaYVuelta([vehiculo()]);
    for (const [col, valor] of Object.entries(f)) {
      assert.equal(typeof valor, 'string', `${col} tendría que llegar como texto`);
    }
  });

  test('una lista vacía no revienta', () => {
    assert.deepEqual(idaYVuelta([]), []);
  });
});
