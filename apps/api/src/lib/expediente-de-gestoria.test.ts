/**
 * El expediente de gestoría de un coche de fuera.
 *
 * Lo que se sostiene: que la caja diga **qué cubre** —si no, quien la mira no
 * sabe si el impuesto está dentro y abre un trámite suelto por si acaso— y que
 * no se dé por resuelta sin los papeles de vuelta y sin el coste. Un expediente
 * cerrado sin la ficha técnica es un coche que no se puede entregar,
 * descubierto el día de la entrega.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  loQueCubre, papelesQueVuelven, faltaParaResolver, puedeDarsePorResuelto,
} from './expediente-de-gestoria.js';

const TODOS = ['Permiso de circulación', 'Ficha técnica', 'Justificante del impuesto de matriculación'];

describe('lo que va dentro del encargo', () => {
  test('los tres papeleos, dichos', () => {
    const cubre = loQueCubre('Matriculación de importación');
    assert.equal(cubre.length, 3);
    assert.ok(cubre.some((x) => /impuesto/i.test(x)));
    assert.ok(cubre.some((x) => /ITV/i.test(x)));
    assert.ok(cubre.some((x) => /matr[íi]cula/i.test(x)));
  });

  test('y un trámite cualquiera no inventa contenido', () => {
    assert.deepEqual(loQueCubre('Transferencia de titularidad'), []);
    assert.deepEqual(papelesQueVuelven('Transferencia de titularidad'), []);
  });
});

describe('lo que falta para darlo por resuelto', () => {
  test('sin nada, faltan los papeles y el coste', () => {
    const falta = faltaParaResolver({ tipo: 'Matriculación de importación' });
    assert.equal(falta.length, 4);
    assert.ok(falta.some((x) => /ha costado/i.test(x)));
    assert.equal(puedeDarsePorResuelto({ tipo: 'Matriculación de importación' }), false);
  });

  test('con los papeles pero sin el coste, falta la cuenta', () => {
    // Cerrarlo sin el coste deja un gasto que aparece semanas después, cuando
    // el margen ya se ha calculado.
    const falta = faltaParaResolver({ tipo: 'Matriculación de importación', papeles: TODOS });
    assert.deepEqual(falta, ['Lo que ha costado, partida a partida']);
  });

  test('con el coste pero sin papeles, faltan ellos', () => {
    const falta = faltaParaResolver({
      tipo: 'Matriculación de importación', papeles: ['Ficha técnica'], coste: 1754.77,
    });
    assert.equal(falta.length, 2);
    assert.ok(falta.includes('Permiso de circulación'));
  });

  test('con todo, se puede cerrar', () => {
    assert.equal(puedeDarsePorResuelto({
      tipo: 'Matriculación de importación', papeles: TODOS, coste: 1754.77,
    }), true);
  });

  test('un coste de cero no vale como coste', () => {
    // «Cero» no es lo que ha costado: es que no se ha apuntado.
    assert.ok(faltaParaResolver({
      tipo: 'Matriculación de importación', papeles: TODOS, coste: 0,
    }).some((x) => /ha costado/i.test(x)));
  });

  test('los papeles se comparan por su nombre, no por que haya alguno', () => {
    // Un documento subido como «otro» no tapa un hueco: si tapara, bastaría con
    // subir cualquier cosa para poder cerrar.
    const falta = faltaParaResolver({
      tipo: 'Matriculación de importación', papeles: ['otro', 'otro', 'otro'], coste: 100,
    });
    assert.equal(falta.length, 3);
  });

  test('y un trámite sin lista de papeles solo pide el coste', () => {
    assert.deepEqual(
      faltaParaResolver({ tipo: 'Transferencia de titularidad', coste: 120 }),
      []
    );
  });
});
