/**
 * Las versiones que su motor puede tener.
 *
 * La versión decide con qué coches se compara el suyo al tasarlo, y no viene en
 * ningún papel: la ficha trae códigos de homologación que hay que traducir con
 * una base de pago. Mientras no estemos conectados a Eurotax, las candidatas
 * salen de nuestros propios anuncios cruzando cilindrada y kilovatios.
 *
 * Lo que más se protege aquí es el emparejado del modelo: en los anuncios el
 * mismo coche está escrito de cinco maneras.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  comoSeCompara, sePuedeBuscar, yaEsLaSuya, losDatosDeLaBusqueda,
  SQL_CANDIDATAS, MARGEN_CC, MARGEN_KW, CUANTAS, type Candidata,
} from './versiones-posibles.js';

describe('el modelo, como se compara', () => {
  test('las cinco maneras de escribir el mismo coche son una', () => {
    /*
     * En la base hay «T-ROC», «T-Roc», «TRoc» y «t-roc», porque cada portal lo
     * escribe a su aire. Sin normalizar, buscar «T-Roc» deja fuera cuatro
     * quintas partes de los anuncios.
     */
    const todas = ['T-ROC', 'T-Roc', 'TRoc', 't-roc', 'T Roc'].map(comoSeCompara);
    assert.deepEqual([...new Set(todas)], ['troc']);
  });

  test('pero «T-Roc Cabrio» no es un T-Roc', () => {
    assert.notEqual(comoSeCompara('T-Roc Cabrio'), comoSeCompara('T-Roc'));
  });

  test('y lo vacío se queda vacío', () => {
    assert.equal(comoSeCompara(''), '');
    assert.equal(comoSeCompara(null), '');
    assert.equal(comoSeCompara('---'), '');
  });
});

describe('cuándo se busca y cuándo no', () => {
  const completo = { marca: 'Volkswagen', modelo: 'T-Roc', cc: 1498, kw: 110 };

  test('con marca, modelo y los dos números del motor', () => {
    assert.equal(sePuedeBuscar(completo), true);
  });

  test('a medias no se busca: devolvería las versiones de otro coche', () => {
    /*
     * Sin la potencia, «Volkswagen T-Roc 1.5» trae también el 1.5 de 150 CV y
     * el de 130, que no valen lo mismo. Ofrecer candidatas equivocadas es peor
     * que no ofrecer ninguna: el cliente elegiría de una lista con pinta de
     * comprobada.
     */
    assert.equal(sePuedeBuscar({ ...completo, kw: null }), false);
    assert.equal(sePuedeBuscar({ ...completo, cc: null }), false);
    assert.equal(sePuedeBuscar({ ...completo, modelo: '' }), false);
    assert.equal(sePuedeBuscar({ ...completo, marca: '  ' }), false);
  });

  test('ni con ceros, que no son un motor', () => {
    assert.equal(sePuedeBuscar({ ...completo, cc: 0 }), false);
    assert.equal(sePuedeBuscar({ ...completo, kw: 0 }), false);
  });
});

describe('los parámetros de la consulta', () => {
  test('van normalizados y en su orden', () => {
    const p = losDatosDeLaBusqueda({ marca: 'Volkswagen', modelo: 'T-Roc', cc: 1498, kw: 110, ano: 2022 });
    assert.deepEqual(p, ['volkswagen', 'troc', 1498, 110, MARGEN_CC, MARGEN_KW, 2022, CUANTAS]);
  });

  test('sin año se manda nulo, no un cero', () => {
    // Un cero filtraría por «año cercano a 0» y no saldría ni un anuncio.
    assert.equal(losDatosDeLaBusqueda({ marca: 'a', modelo: 'b', cc: 999, kw: 85, ano: null })[6], null);
    assert.equal(losDatosDeLaBusqueda({ marca: 'a', modelo: 'b', cc: 999, kw: 85 })[6], null);
    assert.equal(losDatosDeLaBusqueda({ marca: 'a', modelo: 'b', cc: 999, kw: 85, ano: 0 })[6], null);
  });

  test('y los márgenes dejan pasar el redondeo, no otro motor', () => {
    /*
     * Un mismo motor se anuncia como 1.498 y 1.500, y de kilovatios a caballos
     * y vuelta se pierde un entero. Entre un 1.0 y un 1.5 hay quinientos: el
     * margen no puede llegar ahí.
     */
    assert.ok(MARGEN_CC >= 10 && MARGEN_CC < 300);
    assert.ok(MARGEN_KW >= 1 && MARGEN_KW < 10);
  });
});

describe('la consulta', () => {
  test('solo mira anuncios vivos y con versión escrita', () => {
    /*
     * Una versión que solo sale en coches retirados hace año y medio no es una
     * opción que ofrecerle hoy — y es contra los vivos contra los que se tasa.
     */
    assert.match(SQL_CANDIDATAS, /COALESCE\(is_active, TRUE\)/);
    assert.match(SQL_CANDIDATAS, /btrim\(version\), ''\) <> ''/);
  });

  test('compara marca y modelo normalizados, como aquí', () => {
    // Si la consulta comparara el texto tal cual, «T-ROC» no encontraría nada.
    assert.match(SQL_CANDIDATAS, /regexp_replace\(COALESCE\(brand, ''\), '\[\^a-zA-Z0-9\]', '', 'g'\)/);
    assert.match(SQL_CANDIDATAS, /regexp_replace\(COALESCE\(model, ''\), '\[\^a-zA-Z0-9\]', '', 'g'\)/);
  });

  test('y una cilindrada sin apuntar no cuela por el margen', () => {
    /*
     * `displacement` es texto y puede venir vacío. Con un COALESCE a 0, un
     * anuncio sin cilindrada entraría en cualquier búsqueda de motores
     * pequeños. Por eso el valor de reserva está lejísimos.
     */
    assert.match(SQL_CANDIDATAS, /-9999/);
    assert.ok(!/COALESCE\([^)]*displacement[^)]*\), 0\)/.test(SQL_CANDIDATAS));
  });

  test('las más anunciadas primero, y con tope', () => {
    assert.match(SQL_CANDIDATAS, /ORDER BY anuncios DESC/);
    assert.match(SQL_CANDIDATAS, /LIMIT \$8/);
  });
});

describe('la que ya tiene puesta', () => {
  const candidatas: Candidata[] = [
    { version: '1.5 TSI Advance DSG7', anuncios: 144, cv: 150, desde: 2019, hasta: 2023 },
    { version: '1.0 TSI Life 81kW', anuncios: 157, cv: 110, desde: 2020, hasta: 2024 },
  ];

  test('se reconoce aunque esté escrita distinto', () => {
    // Enseñarle como novedad lo que ya tiene escrito hace dudar de lo demás.
    assert.equal(yaEsLaSuya(candidatas, '1.5 TSI Advance DSG-7'), true);
    assert.equal(yaEsLaSuya(candidatas, '1.5 tsi advance dsg7'), true);
  });

  test('y una que no está, no está', () => {
    assert.equal(yaEsLaSuya(candidatas, 'R-Line 1.5 eTSI 110kW DSG'), false);
    assert.equal(yaEsLaSuya(candidatas, ''), false);
    assert.equal(yaEsLaSuya([], '1.5 TSI Advance DSG7'), false);
  });
});
