/**
 * Lo que cobra una gestoría.
 *
 * Lo que se comprueba aquí es sobre todo el IVA: una factura de gestoría lleva
 * honorarios, que lo llevan, y tasas de la DGT, que no. Aplicar el 21 % al total
 * infla el coste del coche, y ese coste va sumado al precio que ve el cliente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  IVA, costeDelTramite, desglosaTramite, tramiteComparable, loQueCuestaElPapeleo,
  type TarifaGestoria,
} from './tarifas-gestoria.js';

function tarifa(x: Partial<TarifaGestoria>): TarifaGestoria {
  return {
    id: 'TGE-1', proveedor_id: 'PRV-1', tramite: 'Transferencia de titularidad',
    honorarios: 20, tasas: 55.7, tasa_colegio: 7.9,
    ...x,
  };
}

describe('el IVA de una factura de gestoría', () => {
  test('va sobre los honorarios, no sobre las tasas', () => {
    // 20 × 1,21 = 24,20 · + 55,70 de la DGT · + 7,90 del colegio = 87,80
    assert.equal(costeDelTramite(tarifa({})), 87.8);
  });

  test('aplicarlo al total sería pagar IVA de dinero de la DGT', () => {
    const bien = costeDelTramite(tarifa({}));
    const mal = Math.round((20 + 55.7 + 7.9) * (1 + IVA) * 100) / 100;
    assert.ok(bien < mal, `${bien} tiene que ser menos que ${mal}`);
  });

  test('si el colegio lleva IVA, se dice y entonces sí', () => {
    const con = costeDelTramite(tarifa({ colegio_con_iva: true }));
    assert.equal(con, Math.round((20 * 1.21 + 7.9 * 1.21 + 55.7) * 100) / 100);
  });

  test('el desglose cuadra con el total', () => {
    const d = desglosaTramite(tarifa({}));
    assert.equal(d.honorarios, 20);
    assert.equal(d.iva, 4.2);
    assert.equal(d.tasas, 55.7);
    assert.equal(d.colegio, 7.9);
    assert.equal(Math.round((d.honorarios + d.iva + d.tasas + d.colegio) * 100) / 100, d.total);
  });

  test('un trámite sin tasas no las inventa', () => {
    assert.equal(costeDelTramite(tarifa({ honorarios: 70, tasas: null, tasa_colegio: null })), 84.7);
  });
});

describe('el mismo trámite escrito de otra forma', () => {
  test('la tilde y las mayúsculas no hacen dos trámites', () => {
    assert.equal(tramiteComparable('Matriculación'), tramiteComparable('MATRICULACION'));
    assert.equal(tramiteComparable('  Transferencia  de   titularidad '), 'transferencia de titularidad');
  });
});

describe('lo que cuesta el papeleo de un coche', () => {
  const transferencia = tarifa({ id: 'TGE-tr' });
  const itp = tarifa({ id: 'TGE-itp', tramite: 'Impuesto de transmisiones', honorarios: 25, tasas: 0, tasa_colegio: 0 });

  test('suma lo que le toca a ese coche', () => {
    const r = loQueCuestaElPapeleo(['Transferencia de titularidad'], [transferencia, itp]);
    assert.equal(r.total, 87.8);
    assert.deepEqual(r.sinTarifa, []);
  });

  test('dos cambios de nombre cuestan el doble, sin multiplicar nada a mano', () => {
    // Es lo que pasa con un coche a nombre de PopCar: una transferencia al
    // comprarlo y otra al venderlo. La lista las trae dos veces.
    const r = loQueCuestaElPapeleo(
      ['Transferencia de titularidad', 'Transferencia de titularidad'],
      [transferencia]
    );
    assert.equal(r.total, 175.6);
    assert.equal(r.lineas.length, 2);
  });

  test('lo que no tiene tarifa sale por su nombre, no se estima a ojo', () => {
    const r = loQueCuestaElPapeleo(
      ['Impuesto de matriculación', 'ITV de homologación', 'Matriculación de importación'],
      [transferencia]
    );
    assert.equal(r.total, 0);
    assert.deepEqual(r.sinTarifa, [
      'Impuesto de matriculación', 'ITV de homologación', 'Matriculación de importación',
    ]);
  });

  test('un total incompleto no se enseña como completo', () => {
    const r = loQueCuestaElPapeleo(
      ['Transferencia de titularidad', 'Matriculación de importación'],
      [transferencia]
    );
    assert.equal(r.total, 87.8);
    assert.equal(r.sinTarifa.length, 1,
      'quien lo lea tiene que ver que falta uno, o creerá que el coche cuesta menos');
  });

  test('con dos tarifas del mismo trámite, la más barata', () => {
    const cara = tarifa({ id: 'TGE-cara', honorarios: 40 });
    const r = loQueCuestaElPapeleo(['Transferencia de titularidad'], [cara, transferencia]);
    assert.equal(r.total, 87.8);
  });

  test('sin trámites, cero y sin huecos', () => {
    const r = loQueCuestaElPapeleo([], [transferencia]);
    assert.equal(r.total, 0);
    assert.deepEqual(r.sinTarifa, []);
  });
});
