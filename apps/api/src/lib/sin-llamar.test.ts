/**
 * La promesa de las 24 horas.
 *
 * Lo que se protege: que un señor al que se le ha dicho «te llamamos en menos
 * de 24 horas laborables» no se quede en el mismo cajón que un lead frío de
 * hace tres días, y que al sacarlo de ese cajón no acabe contado dos veces.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HORAS_PARA_LLAMAR, horasLaborablesDesde, seLePasoElPlazo,
  losQueEsperanDeMas, reparteLosLeads, SQL_SIN_LLAMAR,
} from './sin-llamar.js';

/** Fechas locales, que es como las lee `getDay()`. */
const el = (iso: string) => new Date(iso);

const VIERNES_18 = el('2026-09-04T18:00:00');
const SABADO_12 = el('2026-09-05T12:00:00');
const LUNES_09 = el('2026-09-07T09:00:00');
const MARTES_09 = el('2026-09-08T09:00:00');

describe('lo que se prometió', () => {
  test('veinticuatro horas, no tres días', () => {
    // El cajón general dice «un lead frío a los tres días ya no compra». Aquí
    // hay una frase escrita en la página y en el correo, que es otra cosa.
    assert.equal(HORAS_PARA_LLAMAR, 24);
  });
});

describe('laborables quiere decir laborables', () => {
  test('el sábado no cuenta', () => {
    /*
     * Un formulario que entra el viernes a las seis no está tarde el sábado a
     * mediodía. Contando horas de reloj llevaría 18 y saldría en rojo un día
     * que no trabaja nadie.
     */
    assert.equal(horasLaborablesDesde(VIERNES_18, SABADO_12), 6);
    assert.equal(seLePasoElPlazo(VIERNES_18, SABADO_12), false);
  });

  test('ni el fin de semana entero', () => {
    // Viernes 18:00 -> lunes 09:00: seis horas del viernes y nueve del lunes.
    assert.equal(horasLaborablesDesde(VIERNES_18, LUNES_09), 15);
    assert.equal(seLePasoElPlazo(VIERNES_18, LUNES_09), false);
  });

  test('pero el lunes entero sí, y entonces se pasó', () => {
    // Esta es la contraria de la anterior: si el finde no contara, este también
    // saldría por debajo y nadie llamaría nunca a los del viernes.
    assert.equal(horasLaborablesDesde(VIERNES_18, MARTES_09), 39);
    assert.equal(seLePasoElPlazo(VIERNES_18, MARTES_09), true);
  });
});

describe('el corte de las 24', () => {
  const MIERCOLES_10 = el('2026-09-02T10:00:00');

  test('a las 23 todavía no', () => {
    assert.equal(seLePasoElPlazo(MIERCOLES_10, el('2026-09-03T09:00:00')), false);
  });

  test('a las 24 clavadas ya sí', () => {
    // El límite es el prometido, no el prometido más un rato: «en menos de 24»
    // se incumple a las 24.
    assert.equal(seLePasoElPlazo(MIERCOLES_10, el('2026-09-03T10:00:00')), true);
  });

  test('y las horas empezadas cuentan', () => {
    // De 10:30 a 11:00 va una. Redondear hacia arriba adelanta el aviso unos
    // minutos, que es el lado bueno de equivocarse.
    assert.equal(horasLaborablesDesde(el('2026-09-02T10:30:00'), el('2026-09-02T11:00:00')), 1);
  });
});

describe('lo que no se sabe no se pinta en rojo', () => {
  test('sin fecha, no está tarde', () => {
    /*
     * Sacar a alguien en rojo por una fila mal escrita hace que la lista deje
     * de creerse, y una lista de pendientes que no se cree no la mira nadie.
     */
    for (const raro of [null, undefined, '', 'ayer por la tarde']) {
      assert.equal(seLePasoElPlazo(raro as string | null), false, String(raro));
      assert.equal(horasLaborablesDesde(raro as string | null), null, String(raro));
    }
  });

  test('una fecha en el futuro son cero horas, no un número raro', () => {
    assert.equal(horasLaborablesDesde(MARTES_09, LUNES_09), 0);
    assert.equal(seLePasoElPlazo(MARTES_09, LUNES_09), false);
  });
});

describe('el tope', () => {
  test('un lead de hace meses no recorre cuatro mil horas', () => {
    // Sin tope, esta cuenta va hora a hora desde enero cada vez que alguien
    // abre el panel.
    const enero = el('2026-01-07T09:00:00');
    assert.equal(horasLaborablesDesde(enero, MARTES_09, HORAS_PARA_LLAMAR), 24);
    assert.equal(seLePasoElPlazo(enero, MARTES_09), true);
  });
});

describe('contar los de la lista', () => {
  test('solo los que se pasaron', () => {
    const filas = [
      { created_at: VIERNES_18 },           // 15 h laborables: aun no
      { created_at: el('2026-09-02T10:00:00') }, // miercoles: si
      { created_at: null },                  // sin fecha: no
    ];
    assert.equal(losQueEsperanDeMas(filas, LUNES_09), 1);
  });

  test('sin filas, cero', () => {
    assert.equal(losQueEsperanDeMas([], LUNES_09), 0);
    assert.equal(losQueEsperanDeMas(null), 0);
  });
});

describe('el reparto', () => {
  test('el que se pasa de plazo sale del cajón general', () => {
    /*
     * Este es el fallo que se está evitando: «leads sin contestar» cuenta
     * todos los pendientes. Añadir una línea nueva sin restar pondría al mismo
     * señor en dos filas y sumaría dos en el total de arriba.
     */
    const r = reparteLosLeads(10, 3);
    assert.deepEqual(r, { leads_pendientes: 7, encargos_sin_llamar: 3 });
    assert.equal(r.leads_pendientes + r.encargos_sin_llamar, 10);
  });

  test('el que acaba de entrar se queda donde estaba', () => {
    // Todavía no se le debe nada, y una fila roja diria que si. Pero tampoco
    // desaparece del panel: sigue contado como lead pendiente.
    assert.deepEqual(reparteLosLeads(4, 0), { leads_pendientes: 4, encargos_sin_llamar: 0 });
  });

  test('nunca sale un negativo', () => {
    // Las dos cuentas vienen de consultas distintas: si una falla, un negativo
    // pintaria una fila absurda en vez de no pintar ninguna.
    assert.deepEqual(reparteLosLeads(0, 5), { leads_pendientes: 0, encargos_sin_llamar: 5 });
    assert.deepEqual(reparteLosLeads(NaN, NaN), { leads_pendientes: 0, encargos_sin_llamar: 0 });
  });
});

describe('a quién se pregunta', () => {
  test('solo los de vender su coche, y solo los pendientes', () => {
    // En cuanto alguien lo pasa a «Contactado» la promesa esta cumplida,
    // aunque queden cosas que hacer con el.
    assert.match(SQL_SIN_LLAMAR, /lead_type = 'venta_gestionada'/);
    assert.match(SQL_SIN_LLAMAR, /status = 'Pendiente'/);
  });

  test('se trae la fecha, no una cuenta', () => {
    /*
     * Lo de «laborables» en SQL seria otra implementacion del mismo calculo, y
     * el dia que cambiara una de las dos el panel diria una cosa y la pantalla
     * otra.
     */
    assert.match(SQL_SIN_LLAMAR, /SELECT l\.created_at/);
    assert.doesNotMatch(SQL_SIN_LLAMAR, /COUNT\(/);
  });

  test('y no los que ya tienen un encargo abierto', () => {
    /*
     * Abrir un encargo es la prueba de que se le llamó: nadie abre uno sin haber
     * hablado con el dueño del coche.
     *
     * Sin esto, un señor con el mandato firmado, el coche en el taller y el
     * anuncio publicado seguía contando como «le hemos prometido una llamada en
     * menos de 24 horas laborables» — porque nadie se acordó de tocar el lead. Y
     * un aviso que no se apaga es un aviso que se deja de mirar.
     */
    assert.match(SQL_SIN_LLAMAR, /NOT EXISTS \(/);
    assert.match(SQL_SIN_LLAMAR, /FROM erp_encargos_venta e/);
    assert.match(SQL_SIN_LLAMAR, /e\.cerrado_at IS NULL/);
  });

  test('se le busca por su lead y por su correo', () => {
    /*
     * Por el lead cuando el encargo se abrió desde él, que es lo normal; y por
     * el correo para los que se abrieron de otra forma. Con una sola de las dos,
     * la mitad de los casos seguirían contando.
     */
    assert.match(SQL_SIN_LLAMAR, /e\.lead_id = l\.id/);
    assert.match(SQL_SIN_LLAMAR, /lower\(COALESCE\(e\.cliente_email, ''\)\) = lower\(COALESCE\(l\.user_email, ''\)\)/);
  });
});

describe('y el lead deja de estar pendiente al abrir el encargo', () => {
  /*
   * Las dos mitades del mismo arreglo. Ésta es la que evita que vuelva a pasar;
   * la de arriba, la que apaga los que ya se quedaron así.
   */
  const RUTA = readFileSync(
    new URL('../routes/encargos.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  test('se marca «Contactado» al abrirlo', () => {
    assert.match(RUTA, /UPDATE moveadvisor_market_leads\s*\n?\s*SET status = 'Contactado'/);
  });

  test('pero solo si estaba pendiente', () => {
    // Uno que ya iba por «Vendido» no retrocede.
    assert.match(RUTA, /WHERE id = \$1 AND status = 'Pendiente'/);
  });
});
