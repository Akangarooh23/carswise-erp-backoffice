/**
 * Lo leído, puesto al lado del coche.
 *
 * Aquí se protegen sobre todo dos cosas que se rompieron al montar la lectura
 * automática, y las dos callan en vez de gritar:
 *
 *   · Una lectura que **falló** llegaba con la lista de diferencias vacía, y
 *     una lista vacía se lee como «todo coincide». Quien lo mira da por
 *     comprobado un coche que nadie ha mirado.
 *   · Y ese fallo se quedaba guardado como resultado, así que el botón seguía
 *     enseñando para siempre un error ya arreglado —la clave que faltaba, el
 *     almacén que no respondía—.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { comoQuedaContraElCoche, cuantosNoCuadran, type LaLectura } from './la-ficha-leida.js';

const DEL_ARONA = {
  'D.1': 'SEAT', 'D.3': 'ARONA', 'P.1': '999', 'P.2': '85',
  'P.3': 'M / G', 'S.1': '5', 'R': 'BL', 'V.7': '110',
};

const leida = (extra: Partial<LaLectura> = {}): LaLectura => ({
  documento: 'https://almacen/ficha.pdf',
  nombre: 'Ficha técnica · 0296DYJ.pdf',
  codigos: DEL_ARONA,
  confianza: 'alta',
  fallo: '',
  leida_at: new Date().toISOString(),
  ...extra,
});

describe('una lectura que falló no es una lectura sin diferencias', () => {
  test('sale el fallo, y nada dice que esté comprobado', () => {
    const x = comoQuedaContraElCoche(leida({ fallo: 'sin_lector', codigos: {} }), { brand: 'SEAT' });
    assert.equal(x?.fallo, 'sin_lector');
    assert.equal(x?.no_es_una_ficha, false, 'un fallo del lector no es «ese papel no es una ficha»');
    assert.deepEqual(x?.diferencias, []);
  });

  test('y no se confunde con el documento que no es una ficha técnica', () => {
    /*
     * Son dos cosas distintas y se arreglan de dos maneras: una es nuestra
     * —la clave, el almacén— y la otra es pedirle al cliente el papel bueno.
     */
    const noEsFicha = comoQuedaContraElCoche(leida({ codigos: {} }), { brand: 'SEAT' });
    assert.equal(noEsFicha?.no_es_una_ficha, true);
    assert.equal(noEsFicha?.fallo, '');
  });
});

describe('lo leído contra el coche', () => {
  test('marca lo que no cuadra, y deja en paz lo que sí', () => {
    // El error del cliente: la potencia en kilovatios metida en la casilla de CV.
    const x = comoQuedaContraElCoche(leida(), { brand: 'SEAT', cv: '85', displacement: '999' });
    const cv = x?.diferencias.find((d) => d.clave === 'cv');
    assert.equal(cv?.corrige, true);
    assert.equal(cv?.ahora, '85');
    assert.equal(cv?.segunLaFicha, '116');
    // La cilindrada estaba bien y no se toca.
    assert.equal(x?.diferencias.find((d) => d.clave === 'displacement')?.corrige, false);
  });

  test('y lo que está vacío cuenta como que no cuadra: completar es la mitad', () => {
    /*
     * Este coche solo trae marca, potencia y cilindrada. Los cinco que faltan
     * —modelo, CO₂, plazas, combustible y color— los trae la ficha y no están
     * puestos: son seis cosas que hacer, no una.
     */
    const x = comoQuedaContraElCoche(leida(), { brand: 'SEAT', cv: '85', displacement: '999' });
    assert.equal(cuantosNoCuadran(x), 6);
  });

  test('y con todo bien no queda nada que corregir', () => {
    const x = comoQuedaContraElCoche(leida(), {
      brand: 'SEAT', model: 'ARONA', cv: '116', displacement: '999',
      co2: '110', seats: '5', fuel: 'gasolina', color: 'Blanco',
    });
    assert.equal(cuantosNoCuadran(x), 0);
  });

  test('sin lectura no hay nada que enseñar', () => {
    assert.equal(comoQuedaContraElCoche(null, { brand: 'SEAT' }), null);
  });
});

describe('la versión que eligió el cliente', () => {
  test('si contradice al papel, se dice antes que nada', () => {
    /*
     * Es el aviso que más vale: la tasación compara su coche con los de su
     * versión, y una gama tiene tres «1.5» que no valen lo mismo.
     */
    const x = comoQuedaContraElCoche(leida(), { version: 'FR 1.5 TSI 150 CV' });
    assert.match(x?.avisos[0] ?? '', /versión no cuadra/i);
    assert.match(x?.avisos[0] ?? '', /1\.5 y la ficha 999 cc/);
  });

  test('y si cuadra, no se dice nada de ella', () => {
    const x = comoQuedaContraElCoche(leida(), { version: 'Style 1.0 TSI 115 CV' });
    assert.ok(!(x?.avisos ?? []).some((a) => /versión no cuadra/i.test(a)));
  });

  test('una versión que no dice nada del motor tampoco se inventa un aviso', () => {
    // La mayoría no lleva la potencia escrita, y un aviso que salta siempre
    // deja de leerse.
    const x = comoQuedaContraElCoche(leida(), { version: 'Style' });
    assert.ok(!(x?.avisos ?? []).some((a) => /versión no cuadra/i.test(a)));
  });
});
