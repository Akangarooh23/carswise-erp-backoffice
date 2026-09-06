import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { elPeriodo, elPeriodoAnterior, esTramo, elDia, comoHaCambiado } from './el-periodo.js';

/** Un 6 de septiembre cualquiera, en local. */
const HOY = new Date(2026, 8, 6);

describe('el mes', () => {
  test('va del 1 al último, con el día de hoy dentro', () => {
    const p = elPeriodo('mes', HOY);
    assert.equal(p.desde, '2026-09-01');
    assert.equal(p.hasta, '2026-09-30');
    assert.equal(p.etiqueta, 'septiembre de 2026');
  });

  test('febrero de un bisiesto acaba el 29', () => {
    assert.equal(elPeriodo('mes', new Date(2028, 1, 3)).hasta, '2028-02-29');
  });

  test('y de uno normal, el 28', () => {
    assert.equal(elPeriodo('mes', new Date(2026, 1, 3)).hasta, '2026-02-28');
  });
});

describe('el trimestre', () => {
  test('septiembre cae en el tercero, que acaba en septiembre', () => {
    const p = elPeriodo('trimestre', HOY);
    assert.equal(p.desde, '2026-07-01');
    assert.equal(p.hasta, '2026-09-30');
    assert.equal(p.etiqueta, '3T 2026');
  });

  test('enero cae en el primero', () => {
    const p = elPeriodo('trimestre', new Date(2026, 0, 15));
    assert.equal(p.desde, '2026-01-01');
    assert.equal(p.hasta, '2026-03-31');
  });

  test('y diciembre en el cuarto, que acaba el 31', () => {
    assert.equal(elPeriodo('trimestre', new Date(2026, 11, 31)).hasta, '2026-12-31');
  });
});

describe('el año', () => {
  test('entero, y el gráfico empieza con él', () => {
    const p = elPeriodo('anio', HOY);
    assert.equal(p.desde, '2026-01-01');
    assert.equal(p.hasta, '2026-12-31');
    assert.equal(p.desdeElGrafico, '2026-01-01');
  });
});

describe('el gráfico son doce meses siempre', () => {
  test('aunque el periodo sea un mes', () => {
    // Un mes solo no tiene forma, y la forma es para lo que sirve el gráfico.
    assert.equal(elPeriodo('mes', HOY).desdeElGrafico, '2025-10-01');
  });

  test('cruzando el año hacia atrás sin inventarse un mes 0', () => {
    assert.equal(elPeriodo('mes', new Date(2026, 0, 15)).desdeElGrafico, '2025-02-01');
    assert.equal(elPeriodo('mes', new Date(2026, 10, 15)).desdeElGrafico, '2025-12-01');
  });
});

describe('lo que se pide', () => {
  test('solo son tres tramos', () => {
    assert.ok(esTramo('mes') && esTramo('trimestre') && esTramo('anio'));
    assert.ok(!esTramo('semana'));
    assert.ok(!esTramo(''));
    assert.ok(!esTramo(null));
  });
});

describe('el día de una fecha', () => {
  test('un Date de Postgres no se convierte en «Wed Sep 07 2026»', () => {
    // Es lo que salía en la columna de fecha del fichero del asesor.
    assert.equal(elDia(new Date(2026, 8, 7)), '2026-09-07');
  });

  test('y sale en hora local: un día 1 no se cae al mes anterior', () => {
    // Con toISOString(), la medianoche del 1 de septiembre en España es el 31
    // de agosto, y esa factura cambia de mes ella sola.
    assert.equal(elDia(new Date(2026, 8, 1)), '2026-09-01');
  });

  test('lo que ya viene bien se queda como está', () => {
    assert.equal(elDia('2026-09-07'), '2026-09-07');
    assert.equal(elDia('2026-09-07T10:00:00Z'), '2026-09-07');
  });

  test('y lo que no se entiende no inventa un día', () => {
    assert.equal(elDia(null), '');
    assert.equal(elDia(''), '');
    assert.equal(elDia('cuando sea'), '');
    assert.equal(elDia(new Date('x')), '');
  });
});

describe('el tramo anterior', () => {
  test('el mes pasado entero, no los últimos treinta días', () => {
    // Lo que compara el asesor y lo que sale en el banco.
    const p = elPeriodoAnterior('mes', HOY);
    assert.equal(p.desde, '2026-08-01');
    assert.equal(p.hasta, '2026-08-31');
  });

  test('y cruzando el año, diciembre del anterior', () => {
    const p = elPeriodoAnterior('mes', new Date(2026, 0, 15));
    assert.equal(p.desde, '2025-12-01');
    assert.equal(p.hasta, '2025-12-31');
  });

  test('el 31 compara con el mes anterior entero, no con treinta días atrás', () => {
    // El 31 de mayo menos treinta días sigue siendo mayo, así que restar días
    // haría que mayo se comparase consigo mismo. Mayo y no marzo a propósito:
    // en marzo el cambio de hora tapa el fallo y el test pasaría igual.
    const p = elPeriodoAnterior('mes', new Date(2026, 4, 31));
    assert.equal(p.desde, '2026-04-01');
    assert.equal(p.hasta, '2026-04-30');
  });

  test('y febrero se compara con enero entero, con sus 31 días', () => {
    const p = elPeriodoAnterior('mes', new Date(2026, 1, 15));
    assert.equal(p.desde, '2026-01-01');
    assert.equal(p.hasta, '2026-01-31');
  });

  test('el trimestre anterior', () => {
    const p = elPeriodoAnterior('trimestre', HOY);
    assert.equal(p.desde, '2026-04-01');
    assert.equal(p.hasta, '2026-06-30');
    assert.equal(p.etiqueta, '2T 2026');
  });

  test('y el primero compara con el cuarto del año pasado', () => {
    const p = elPeriodoAnterior('trimestre', new Date(2026, 1, 10));
    assert.equal(p.desde, '2025-10-01');
    assert.equal(p.hasta, '2025-12-31');
  });

  test('el año anterior, entero', () => {
    const p = elPeriodoAnterior('anio', HOY);
    assert.equal(p.desde, '2025-01-01');
    assert.equal(p.hasta, '2025-12-31');
  });
});

describe('cuánto ha cambiado', () => {
  test('sube y baja, con un decimal', () => {
    assert.equal(comoHaCambiado(150, 100), 50);
    assert.equal(comoHaCambiado(75, 100), -25);
    assert.equal(comoHaCambiado(1333, 1000), 33.3);
  });

  test('de cero no se puede subir un porcentaje', () => {
    // Un +100 % sobre una base de cero es el gráfico que enseña todo el mundo
    // cuando quiere que algo parezca que sube.
    assert.equal(comoHaCambiado(3000, 0), null);
    assert.equal(comoHaCambiado(0, 0), null);
  });

  test('y desde un negativo se mide sobre lo que valía', () => {
    // De −500 € a −250 € es una mejora del 50 %, no un −50 %.
    assert.equal(comoHaCambiado(-250, -500), 50);
  });

  test('lo que no es un número no inventa un cambio', () => {
    assert.equal(comoHaCambiado(NaN, 100), null);
    assert.equal(comoHaCambiado(100, NaN), null);
  });
});
