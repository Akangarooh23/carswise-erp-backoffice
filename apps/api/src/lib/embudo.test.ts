import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { elEmbudo, dondeSePierde, PASOS, SQL_HONDURA, SQL_QUIEN } from './embudo.js';

/** Lo que devuelve la base: cuánta gente llegó **como mucho** hasta cada nivel. */
const REAL = [
  { hondura: 1, personas: 392 },  // se quedaron en la portada
  { hondura: 2, personas: 5 },    // llegaron al marketplace y no abrieron nada
  { hondura: 4, personas: 3 },    // pidieron información
];

describe('el embudo', () => {
  test('cada escalón son los que llegaron al menos hasta ahí', () => {
    // Quien pidió información también pasó por la ficha, aunque su fila solo
    // diga «solicitud».
    const e = elEmbudo(REAL);
    assert.deepEqual(e.map((x) => x.personas), [400, 8, 3, 3]);
  });

  test('nunca sube: un embudo que se ensancha no es un embudo', () => {
    // Contando cada paso por su cuenta, quien entra directo a una ficha por un
    // enlace haría que «abren un coche» tuviera más gente que «llegan a la web».
    const e = elEmbudo([{ hondura: 3, personas: 50 }, { hondura: 1, personas: 2 }]);
    for (let i = 1; i < e.length; i += 1) {
      assert.ok(e[i].personas <= e[i - 1].personas,
        `${e[i].nombre} (${e[i].personas}) no puede tener más que ${e[i - 1].nombre} (${e[i - 1].personas})`);
    }
  });

  test('la conversión es contra el escalón anterior y contra el principio', () => {
    const e = elEmbudo(REAL);
    assert.equal(e[0].desdeElAnterior, null, 'el primero no viene de ninguno');
    assert.equal(e[0].desdeElPrincipio, 100);
    assert.equal(e[1].desdeElAnterior, 2, '8 de 400');
    assert.equal(e[3].desdeElPrincipio, 0.8, '3 de 400');
  });

  test('y se dice cuánta gente se cae en cada paso', () => {
    const e = elEmbudo(REAL);
    assert.equal(e[1].seCaen, 392);
    assert.equal(e[2].seCaen, 5);
    assert.equal(e[3].seCaen, 0);
  });

  test('sin nadie, todo a cero y sin porcentajes inventados', () => {
    const e = elEmbudo([]);
    assert.deepEqual(e.map((x) => x.personas), [0, 0, 0, 0]);
    assert.equal(e[1].desdeElAnterior, null, 'un 0 % sobre cero se lee como que alguien pasó');
    assert.equal(elEmbudo(null).length, 4);
  });

  test('un nivel que no existe no se cuela', () => {
    assert.deepEqual(elEmbudo([{ hondura: 9, personas: 100 }]).map((x) => x.personas), [0, 0, 0, 0]);
    assert.deepEqual(elEmbudo([{ hondura: 0, personas: 100 }]).map((x) => x.personas), [0, 0, 0, 0]);
  });
});

describe('dónde se pierde la gente', () => {
  test('en el paso donde más gente se cae, no en el de peor porcentaje', () => {
    /*
     * Aquí las dos reglas dan respuestas distintas, que es lo que hace que el
     * test sirva:
     *
     *   1.000 → 500 (pierde 500, pasa el 50 %)
     *     500 → 490 (pierde  10, pasa el 98 %)
     *     490 →   1 (pierde 489, pasa el 0,2 %)
     *
     * El peor porcentaje es el último; donde más gente se pierde es el
     * primero. Se señala el primero: quinientas personas son quinientas.
     */
    const donde = dondeSePierde(elEmbudo([
      { hondura: 1, personas: 500 },
      { hondura: 2, personas: 10 },
      { hondura: 3, personas: 489 },
      { hondura: 4, personas: 1 },
    ]));
    assert.equal(donde?.clave, 'marketplace');
    assert.equal(donde?.seCaen, 500);
  });

  test('y con los datos de verdad, el cuello está en entrar al marketplace', () => {
    const donde = dondeSePierde(elEmbudo(REAL));
    assert.equal(donde?.clave, 'marketplace');
    assert.equal(donde?.seCaen, 392);
  });

  test('y si no se cae nadie, no se dice nada', () => {
    const donde = dondeSePierde(elEmbudo([{ hondura: 4, personas: 10 }]));
    assert.equal(donde, null);
  });

  test('un embudo vacío tampoco inventa un cuello de botella', () => {
    assert.equal(dondeSePierde(elEmbudo([])), null);
    assert.equal(dondeSePierde([]), null);
  });
});

describe('cómo se leen los datos', () => {
  test('una persona es su correo, y si no lo dejó, su navegador', () => {
    // Sin esto se contarían eventos: 1.511 recargas de portada son 400
    // personas, y quien decide dónde invertir necesita la segunda cifra.
    assert.match(SQL_QUIEN, /user_email/);
    assert.match(SQL_QUIEN, /anon_id/);
  });

  test('el paso más hondo puntúa más', () => {
    const solicitud = SQL_HONDURA.indexOf("'lead_request'");
    const portada = SQL_HONDURA.indexOf("'landing'");
    assert.ok(solicitud >= 0 && portada > solicitud, SQL_HONDURA);
    assert.match(SQL_HONDURA, /ELSE 0 END/, 'lo que no es un paso del embudo no cuenta');
  });

  test('va en una línea, para que se pueda comprobar contra Postgres', () => {
    assert.doesNotMatch(SQL_HONDURA, /\n/);
    assert.doesNotMatch(SQL_QUIEN, /\n/);
  });

  test('los cuatro pasos tienen nombre y explicación', () => {
    assert.equal(PASOS.length, 4);
    for (const p of PASOS) {
      assert.ok(p.nombre && p.queEs && p.evento, `falta algo en ${p.clave}`);
      assert.match(SQL_HONDURA, new RegExp(`'${p.evento}'`), `${p.evento} no puntúa en el SQL`);
    }
  });
});
