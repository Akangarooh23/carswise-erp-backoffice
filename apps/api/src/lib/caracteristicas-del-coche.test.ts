/**
 * Corregir el coche desde el ERP.
 *
 * Lo que se protege:
 *
 *   · Que se pueda completar lo que el cliente dejó a medias —la cilindrada, el
 *     CO₂— y que un dedo de más no guarde un año 20222.
 *   · Que el precio de un coche con encargo no se toque desde aquí: va por lo
 *     firmado.
 *   · Que lo que se escribe en el anuncio se lea como se lee y no deje huecos
 *     falsos: «CV» a secas, cilindrada cero o el CO₂ en su lugar, que es lo que
 *     tenía la ficha del T-Roc.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAMPOS, GEMELAS, ENSURE_COLUMNAS, limpiaLosCambios, loQueVaAlAnuncio, comoSeLee, CAMBIOS,
} from './caracteristicas-del-coche.js';

describe('qué se puede corregir', () => {
  test('lo que faltaba en la ficha del comprador', () => {
    const claves = CAMPOS.map((c) => c.clave);
    for (const k of ['displacement', 'co2', 'cv', 'transmission_type', 'doors', 'seats', 'vehicle_location', 'environmental_label']) {
      assert.ok(claves.includes(k), `no se puede corregir ${k}`);
    }
  });

  test('la cilindrada tiene columna', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS displacement/);
  });
});

describe('cómo se limpia', () => {
  test('los números aceptan puntos y unidades', () => {
    const { campos, errores } = limpiaLosCambios({ mileage: '30.000 km', displacement: '1.498', co2: '136,5' });
    assert.deepEqual(errores, {});
    assert.equal(campos.mileage, '30000');
    assert.equal(campos.displacement, '1498');
    assert.equal(campos.co2, '136.5');
  });

  test('un año imposible no se guarda', () => {
    assert.ok(limpiaLosCambios({ year: '20222' }).errores.year);
    assert.ok(limpiaLosCambios({ year: '1800' }).errores.year);
    assert.equal(limpiaLosCambios({ year: '2022' }).campos.year, '2022');
  });

  test('una opción que no existe, tampoco', () => {
    assert.ok(limpiaLosCambios({ transmission_type: 'semiautomático' }).errores.transmission_type);
    assert.equal(limpiaLosCambios({ transmission_type: 'Automatico' }).campos.transmission_type, 'automatico');
  });

  test('la matrícula, en mayúsculas y sin espacios', () => {
    assert.equal(limpiaLosCambios({ plate: '8888 lxr' }).campos.plate, '8888LXR');
  });

  test('vaciar un campo es corregirlo, salvo marca y modelo', () => {
    assert.equal(limpiaLosCambios({ co2: '' }).campos.co2, null);
    assert.ok(limpiaLosCambios({ brand: '' }).errores.brand);
  });

  test('lo que no se manda no se toca', () => {
    assert.deepEqual(Object.keys(limpiaLosCambios({ color: 'Blanco' }).campos), ['color']);
  });

  test('y lo que no está en la lista no se cuela', () => {
    // `user_email` es de quién es el coche: corregir características no es cambiar de dueño.
    const { campos } = limpiaLosCambios({ user_email: 'otro@example.com', id: 'x', color: 'Rojo' });
    assert.deepEqual(Object.keys(campos), ['color']);
  });
});

describe('el precio de un encargo no se toca aquí', () => {
  test('con encargo, se rechaza y dice por dónde va', () => {
    const { campos, errores } = limpiaLosCambios({ price: '18500' }, { hayEncargo: true });
    assert.equal(campos.price, undefined);
    assert.match(errores.price, /encargo/);
  });

  test('sin encargo, el precio es del dueño y se puede corregir', () => {
    assert.equal(limpiaLosCambios({ price: '18.500' }).campos.price, '18500');
  });
});

describe('las columnas repetidas se escriben juntas', () => {
  test('cada una con su gemela', () => {
    assert.equal(GEMELAS.mileage.columna, 'mileage_km');
    assert.equal(GEMELAS.year.columna, 'year_int');
    assert.equal(GEMELAS.co2.columna, 'co2_g_km');
    assert.equal(GEMELAS.price.columna, 'price_amount');
    assert.equal(GEMELAS.last_itv.columna, 'last_itv_date');
    assert.equal(GEMELAS.next_itv.columna, 'next_itv_date');
  });

  test('y la ruta las escribe en la misma sentencia', () => {
    const RUTA = readFileSync(join(import.meta.dirname, '..', 'routes', 'idcars.ts'), 'utf8');
    assert.match(RUTA, /for \(const \[clave, \{ columna, tipo \}\] of Object\.entries\(GEMELAS\)\)/);
  });
});

describe('lo que llega al anuncio', () => {
  const TROC = {
    title: 'Prueba', brand: 'Volkswagen', model: 'T-Roc', version: 'R-Line', year: '2022',
    mileage: '30000', fuel: 'gasolina', color: 'Blanco', cv: '150', displacement: '1498',
    co2: '136', transmission_type: 'automatico', body_type: 'suv', doors: '5', seats: '5',
    vehicle_location: 'Madrid', notes: 'Un solo dueño',
  };

  test('con las palabras con que se lee', () => {
    const a = loQueVaAlAnuncio(TROC);
    assert.equal(a.fuel, 'Gasolina');
    assert.equal(a.transmission, 'Automático');
    assert.equal(a.body_type, 'SUV');
  });

  test('la potencia con su número y la cilindrada la suya, no el CO₂', () => {
    const a = loQueVaAlAnuncio(TROC);
    assert.equal(a.power, '150 CV');
    assert.equal(a.displacement, 1498);
  });

  test('sin dato, vacío: nunca «CV» a secas', () => {
    const a = loQueVaAlAnuncio({ brand: 'VW', model: 'T-Roc' });
    assert.equal(a.power, '');
    assert.equal(a.displacement, 0);
    assert.equal(a.transmission, null);
  });

  test('ubicación, puertas y plazas', () => {
    const a = loQueVaAlAnuncio(TROC);
    assert.equal(a.location, 'Madrid');
    assert.equal(a.doors, 5);
    assert.equal(a.seats, 5);
  });

  test('y el precio no va: es del encargo', () => {
    assert.ok(!('price' in loQueVaAlAnuncio({ ...TROC, price: '99' })));
  });

  test('un valor antiguo fuera de la lista se enseña como está', () => {
    assert.equal(comoSeLee(CAMBIOS, 'DSG'), 'DSG');
  });
});
