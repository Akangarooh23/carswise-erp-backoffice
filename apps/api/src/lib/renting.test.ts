/**
 * Los precios de renting no pueden decir dos cosas distintas.
 *
 * Un renting tiene veinte precios: cinco plazos por cinco tramos de kilómetros.
 * Eso vive en `renting_prices_json`. Las cinco columnas sueltas son la fila de
 * 15.000 km de esa misma rejilla, y la web usa las dos: el «desde X €/mes» del
 * listado sale de las columnas, y lo que se cotiza al elegir plazo y kilómetros
 * sale de la rejilla.
 *
 * Si las dos se separan, el cliente ve un precio en la lista y otro al pedirlo.
 * Estas pruebas fijan que importar un precio toca las dos.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fusionaRejilla, columnasDesdeRejilla, filaSchema, KM_OPCIONES, type Rejilla } from './importacion.js';

const fila = (extra: Record<string, unknown> = {}) =>
  filaSchema.parse({
    title: 'Citroën C3 Turbo 100 CV Business',
    brand: 'Citroën', model: 'C3', year: 2024, price: 18900,
    ...extra,
  });

/** Una rejilla como las que hay hoy en la base: 5 tramos, plazos 24 y 36. */
const rejillaReal = (): Rejilla => ({
  km_options: [10000, 15000, 20000, 25000, 30000],
  '24m': [243, 259, 273, 287, 300],
  '36m': [237, 253, 267, 280, 294],
});

const i15 = KM_OPCIONES.indexOf(15000);

describe('importar un precio toca la rejilla, no solo la columna', () => {
  test('el precio del Excel entra en el tramo de 15.000 km', () => {
    const r = fusionaRejilla(fila({ renting_36m: 265 }), rejillaReal());
    assert.equal(r?.['36m']?.[i15], 265, 'lo que se importa es lo que se cotiza');
  });

  test('los demás tramos se conservan', () => {
    const r = fusionaRejilla(fila({ renting_36m: 265 }), rejillaReal());
    assert.deepEqual(r?.['36m'], [237, 265, 267, 280, 294]);
    // Y el plazo que el Excel no menciona queda intacto.
    assert.deepEqual(r?.['24m'], [243, 259, 273, 287, 300]);
  });

  test('un plazo nuevo se crea con su tramo de 15.000 km y el resto vacío', () => {
    const r = fusionaRejilla(fila({ renting_48m: 220 }), rejillaReal());
    assert.deepEqual(r?.['48m'], [null, 220, null, null, null]);
  });

  test('una oferta sin rejilla previa la estrena', () => {
    const r = fusionaRejilla(fila({ renting_24m: 300, renting_36m: 280 }), null);
    assert.deepEqual(r?.km_options, KM_OPCIONES);
    assert.equal(r?.['24m']?.[i15], 300);
    assert.equal(r?.['36m']?.[i15], 280);
    assert.equal(r?.['12m'], undefined, 'un plazo sin precio no se inventa');
  });

  test('sin ningún precio no se guarda una rejilla vacía', () => {
    // Una rejilla sin precios haría que la web anunciara renting sin poder
    // cotizarlo. Mejor nada.
    assert.equal(fusionaRejilla(fila(), null), null);
  });

  test('una celda vacía no borra el precio que ya había', () => {
    const r = fusionaRejilla(fila({ renting_36m: '' }), rejillaReal());
    assert.deepEqual(r?.['36m'], [237, 253, 267, 280, 294]);
  });

  test('si la rejilla usa otros tramos, se respetan los suyos', () => {
    const otra: Rejilla = { km_options: [8000, 12000, 20000], '36m': [200, 220, 260] };
    const r = fusionaRejilla(fila({ renting_36m: 999 }), otra);
    assert.deepEqual(r?.km_options, [8000, 12000, 20000], 'no se le cambian los tramos por debajo');
    assert.deepEqual(r?.['36m'], [200, 220, 260], 'sin tramo de 15.000 km, el dato no tiene sitio: no se inventa uno');
  });
});

describe('lo que acaba viendo el cliente', () => {
  // Las mismas reglas que aplica la web al pintar la ficha, escritas aquí para
  // que se vea qué cambia cada precio.
  const precio = (r: Rejilla | null, plazo: '24m' | '36m', km: number) => {
    const i = r?.km_options.indexOf(km) ?? -1;
    return i >= 0 ? (r?.[plazo]?.[i] ?? null) : null;
  };

  test('cambiar la columna cambia lo que se cotiza a 15.000 km', () => {
    const antes = rejillaReal();
    assert.equal(precio(antes, '36m', 15000), 253);
    const despues = fusionaRejilla(fila({ renting_36m: 265 }), antes);
    assert.equal(precio(despues, '36m', 15000), 265);
  });

  test('y no cambia lo que se cotiza a 30.000 km', () => {
    const despues = fusionaRejilla(fila({ renting_36m: 265 }), rejillaReal());
    assert.equal(precio(despues, '36m', 30000), 294);
  });
});

describe('la columna se saca de la rejilla, no al revés', () => {
  test('la columna es el tramo de 15.000 km', () => {
    const c = columnasDesdeRejilla(rejillaReal());
    assert.equal(c['24m'], 259);
    assert.equal(c['36m'], 253);
    assert.equal(c['48m'], null, 'un plazo sin precios no deja columna');
  });

  test('sin rejilla no hay columnas', () => {
    assert.deepEqual(columnasDesdeRejilla(null),
      { '12m': null, '24m': null, '36m': null, '48m': null, '60m': null });
  });

  test('una rejilla sin tramo de 15.000 km no deja columnas', () => {
    // La web solo usa las columnas cuando el cliente pide 15.000 km. Si la
    // rejilla no tiene ese tramo, no hay columna que valga: inventarla haría
    // que el listado anunciara un precio que nadie puede contratar.
    const otra: Rejilla = { km_options: [8000, 12000, 20000], '36m': [200, 220, 260] };
    assert.equal(columnasDesdeRejilla(otra)['36m'], null);
  });

  test('importar y derivar deja columna y rejilla diciendo lo mismo', () => {
    const r = fusionaRejilla(fila({ renting_36m: 265 }), rejillaReal());
    const c = columnasDesdeRejilla(r);
    assert.equal(c['36m'], r?.['36m']?.[i15]);
    assert.equal(c['36m'], 265);
  });

  test('una celda vacía no borra la columna si la rejilla mantiene el precio', () => {
    const r = fusionaRejilla(fila({ renting_36m: '' }), rejillaReal());
    assert.equal(columnasDesdeRejilla(r)['36m'], 253, 'el listado no puede perder el «desde»');
  });
});
