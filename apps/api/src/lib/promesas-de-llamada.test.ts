/**
 * Los plazos de llamada que prometemos por escrito.
 *
 * Lo que se protege: que el que **acaba de entrar no salga en rojo**, y que el
 * que lleva cuatro días no salga en dos sitios. La línea contaba todo lo
 * pendiente sin mirar la hora, así que nunca estaba a cero y no contestaba
 * ninguna de las dos preguntas — ni «¿a quién llamo ahora?» ni «¿a quién he
 * perdido?».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HORAS_PARA_LLAMAR_LEAD, DIAS_PARA_ENFRIARSE, HORAS_PARA_LLAMAR_SERVICIO,
  SQL_LEADS_PENDIENTES, SQL_SERVICIOS_ABIERTOS,
  reparteLosLeadsPorPlazo, losServiciosSinLlamar,
} from './promesas-de-llamada.js';

/** Un miércoles a mediodía, para que las horas laborables sean las del reloj. */
const MIERCOLES = new Date('2026-09-16T12:00:00');
const haceHoras = (h: number) => new Date(MIERCOLES.getTime() - h * 3600_000).toISOString();
const haceDias = (d: number) => new Date(MIERCOLES.getTime() - d * 86_400_000).toISOString();
const fila = (created_at: string) => ({ created_at });

describe('a quién hay que llamar ya', () => {
  test('el que acaba de entrar NO sale', () => {
    /*
     * Es el fallo entero. Contando todo lo pendiente, la línea tenía algo
     * dentro siempre que alguien rellenara un formulario — y un número que
     * nunca está a cero se deja de mirar.
     */
    const r = reparteLosLeadsPorPlazo([fila(haceHoras(0.5))], MIERCOLES);
    assert.equal(r.leads_sin_llamar, 0);
    assert.equal(r.leads_pendientes, 0);
  });

  test('y el que lleva más de dos horas laborables, sí', () => {
    const r = reparteLosLeadsPorPlazo([fila(haceHoras(3))], MIERCOLES);
    assert.equal(r.leads_sin_llamar, 1);
  });

  test('justo en el plazo ya cuenta', () => {
    // Se cuenta hora empezada: a las dos en punto la promesa está vencida.
    assert.equal(
      reparteLosLeadsPorPlazo([fila(haceHoras(HORAS_PARA_LLAMAR_LEAD))], MIERCOLES).leads_sin_llamar,
      1,
    );
  });

  test('el fin de semana no cuenta', () => {
    /*
     * Un formulario del sábado por la mañana no está tarde el sábado por la
     * tarde: no hay nadie para llamarle, y un rojo el domingo es un rojo que no
     * se puede apagar.
     */
    const domingo = new Date('2026-09-20T12:00:00');
    const sabado = new Date('2026-09-19T10:00:00').toISOString();
    assert.equal(reparteLosLeadsPorPlazo([fila(sabado)], domingo).leads_sin_llamar, 0);
  });
});

describe('y a quién se ha perdido', () => {
  test('a los tres días pasa a la línea de fríos', () => {
    const r = reparteLosLeadsPorPlazo([fila(haceDias(DIAS_PARA_ENFRIARSE))], MIERCOLES);
    assert.equal(r.leads_pendientes, 1);
  });

  test('y NO sale a la vez en la de llamar ya', () => {
    /*
     * Es lo que evita contar a la misma persona dos veces y que el total diga
     * dos. Sale en la que describe su situación, que es la de frío.
     */
    const r = reparteLosLeadsPorPlazo([fila(haceDias(5))], MIERCOLES);
    assert.equal(r.leads_pendientes, 1);
    assert.equal(r.leads_sin_llamar, 0);
  });

  test('cada uno en su sitio cuando hay de los dos', () => {
    const r = reparteLosLeadsPorPlazo(
      [fila(haceHoras(0.2)), fila(haceHoras(4)), fila(haceDias(6)), fila(haceDias(9))],
      MIERCOLES,
    );
    assert.deepEqual(r, { leads_sin_llamar: 1, leads_pendientes: 2 });
  });
});

describe('lo que no se cuenta', () => {
  test('una fecha ilegible no saca a nadie en rojo', () => {
    // Sacar a alguien en rojo por una fila mal escrita hace que la lista deje
    // de creerse.
    const r = reparteLosLeadsPorPlazo([{ created_at: 'esto no es una fecha' }, { created_at: null }], MIERCOLES);
    assert.deepEqual(r, { leads_sin_llamar: 0, leads_pendientes: 0 });
  });

  test('sin filas no revienta', () => {
    assert.deepEqual(reparteLosLeadsPorPlazo(null), { leads_sin_llamar: 0, leads_pendientes: 0 });
    assert.deepEqual(reparteLosLeadsPorPlazo([]), { leads_sin_llamar: 0, leads_pendientes: 0 });
  });

  test('y los encargos no entran aquí: tienen su plazo y su línea', () => {
    /*
     * A ellos se les prometen 24 horas laborables, no dos. Si entraran, el
     * mismo señor tendría dos avisos con dos plazos distintos.
     */
    assert.match(SQL_LEADS_PENDIENTES, /lead_type, ''\) <> 'venta_gestionada'/);
  });

  test('ni los leads que ya se han contestado', () => {
    assert.match(SQL_LEADS_PENDIENTES, /status = 'Pendiente'/);
  });
});

describe('las solicitudes de servicio', () => {
  test('se avisa a las 24 horas hábiles, no a las 48', () => {
    /*
     * Se prometen «24-48 horas hábiles». Avisar a las 48 sería avisar cuando ya
     * se ha incumplido; a las 24 todavía se está a tiempo, que es para lo que
     * sirve un aviso.
     */
    assert.equal(HORAS_PARA_LLAMAR_SERVICIO, 24);
  });

  test('la que acaba de entrar no sale', () => {
    assert.equal(losServiciosSinLlamar([fila(haceHoras(3))], MIERCOLES), 0);
  });

  test('y la de hace tres días laborables sí', () => {
    assert.equal(losServiciosSinLlamar([fila(haceDias(3))], MIERCOLES), 1);
  });

  test('las cerradas y las canceladas no cuentan', () => {
    // Llamar por una solicitud que ya se atendió es la clase de llamada que
    // hace que te cuelguen.
    assert.match(SQL_SERVICIOS_ABIERTOS, /NOT IN \('cerrada', 'cancelada', 'atendida'\)/);
  });

  test('y una fecha ilegible tampoco', () => {
    assert.equal(losServiciosSinLlamar([{ created_at: 'nada' }], MIERCOLES), 0);
  });
});
