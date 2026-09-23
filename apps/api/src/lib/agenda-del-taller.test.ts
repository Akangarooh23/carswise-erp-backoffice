/**
 * Cerrar un día de taller, que hasta ahora no se podía.
 *
 * Las cuatro acciones —cerrar un día, abrirlo, cerrar una hora, abrirla—
 * estaban escritas en el servidor de PopCar desde hacía tiempo y no las
 * llamaba ninguna pantalla. Un taller que cerraba por vacaciones seguía
 * ofreciendo sus horas, y no había manera de decir lo contrario que no fuera
 * un Postman.
 *
 * Lo que se fija aquí es lo que decide si el cierre sirve de algo: que el día
 * entero y la hora suelta no se pisen, que las horas que se ofrecen sean las
 * mismas que ofrece PopCar —cerrar una hora que allí no existe no cerraría
 * nada— y que quien cierra sepa a cuántas citas dadas les está cerrando la
 * puerta.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

import {
  laAgendaDelMes, cuantasCitasPisa, cierra, abre, lasHorasDe, esUnMes, esUnDia, esUnaHora,
} from './agenda-del-taller.js';

/** Las consultas que han salido, para poder mirarlas. */
let consultas: { sql: string; params: unknown[] }[] = [];
/** Lo que contesta la base a cada una. */
let contesta: (sql: string) => Record<string, unknown>[] = () => [];

const queryOriginal = pg.Pool.prototype.query;

before(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pg.Pool.prototype as any).query = async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    const rows = contesta(sql);
    return { rows, rowCount: rows.length };
  };
});

after(() => { pg.Pool.prototype.query = queryOriginal; });

beforeEach(() => { consultas = []; contesta = () => []; });

describe('que horas tiene un taller', () => {
  test('los domingos no se cita', () => {
    // 2026-09-20 es domingo.
    assert.deepEqual(lasHorasDe('2026-09-20'), []);
  });

  test('el sabado solo por la mañana', () => {
    assert.deepEqual(lasHorasDe('2026-09-19'), ['09:00', '10:00', '11:00', '12:00', '13:00']);
  });

  test('y entre semana, mañana y tarde', () => {
    /*
     * Esta lista es la de PopCar, que es quien se las ofrece al cliente. Si
     * aquí dijera otra cosa, se podrian cerrar horas que no existen y quedarse
     * sin cerrar las que si.
     */
    assert.deepEqual(lasHorasDe('2026-09-23'), [
      '09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00',
    ]);
  });
});

describe('lo que se acepta como fecha', () => {
  test('un mes es YYYY-MM y nada mas', () => {
    assert.equal(esUnMes('2026-09'), true);
    assert.equal(esUnMes('2026-13'), false, 'no hay mes trece');
    assert.equal(esUnMes('2026-9'), false);
    assert.equal(esUnMes("2026-09'; DROP TABLE"), false);
  });

  test('y una hora es HH:MM', () => {
    assert.equal(esUnaHora('09:00'), true);
    assert.equal(esUnaHora('24:00'), false);
    assert.equal(esUnaHora('9:00'), false);
    assert.equal(esUnDia('2026-09-23'), true);
    assert.equal(esUnDia('23/09/2026'), false);
  });
});

describe('la agenda de un mes', () => {
  test('trae los dias con sus horas, los cierres y las citas', async () => {
    contesta = (sql) => {
      if (/FROM moveadvisor_workshop_blocks/.test(sql)) {
        return [{ id: 'b1', dia: '2026-09-24', hora: null, motivo: 'vacaciones' }];
      }
      return [{ id: 'r1', dia: '2026-09-23', hora: '10:00', user_email: 'cliente@ejemplo.es' }];
    };

    const agenda = await laAgendaDelMes('7', '2026-09');

    assert.equal(agenda.dias.length, 30, 'septiembre tiene treinta dias');
    assert.equal(agenda.cierres.length, 1);
    assert.equal(agenda.cierres[0].hora, '', 'un cierre de dia entero no lleva hora');
    assert.equal(agenda.citas[0].cliente, 'cliente@ejemplo.es');
  });

  test('y solo las citas vivas', async () => {
    contesta = () => [];
    await laAgendaDelMes('7', '2026-09');

    const deCitas = consultas.find((c) => /FROM moveadvisor_workshop_reservations/.test(c.sql));
    assert.match(deCitas!.sql, /estado = 'booked'/, 'contaria tambien las anuladas');
  });
});

describe('cerrar y abrir', () => {
  test('el dia entero va sin hora; una hora suelta, con ella', async () => {
    contesta = () => [];

    await cierra('7', '2026-09-24', '', 'vacaciones');
    await cierra('7', '2026-09-25', '14:00', 'comida');

    const [delDia, deLaHora] = consultas.filter((c) => /INSERT INTO moveadvisor_workshop_blocks/.test(c.sql));
    // El nulo es lo que distingue «este dia no» de «esta hora no».
    assert.equal(delDia.params[3], null);
    assert.equal(deLaHora.params[3], '14:00');
  });

  test('abrir el dia no se lleva por delante las horas cerradas dentro', async () => {
    /*
     * Son dos decisiones distintas: una comida de mediodia no se quita porque
     * se reabra el dia. Con un DELETE sin el `hora IS NULL` se irian las dos.
     */
    contesta = () => [];

    await abre('7', '2026-09-24', '');

    const borrado = consultas.find((c) => /DELETE FROM moveadvisor_workshop_blocks/.test(c.sql));
    assert.match(borrado!.sql, /hora IS NULL/);
  });

  test('y se cuentan las citas que el cierre deja plantadas', async () => {
    contesta = () => [{ n: '2' }];

    const delDia = await cuantasCitasPisa('7', '2026-09-24', '');
    const deLaHora = await cuantasCitasPisa('7', '2026-09-24', '10:00');

    assert.equal(delDia, 2);
    assert.equal(deLaHora, 2);
    // La del dia mira el dia entero; la de la hora, solo esa hora.
    assert.doesNotMatch(consultas[0].sql, /hora = /);
    assert.match(consultas[1].sql, /hora = \$3/);
  });
});
