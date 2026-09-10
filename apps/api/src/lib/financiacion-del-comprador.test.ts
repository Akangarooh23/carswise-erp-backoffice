/**
 * El comprador que quiere financiación.
 *
 * Lo que se protege: que donde irá el scoring no quede un hueco. Ese comprador
 * ha levantado la mano, es la operación que deja margen —una hora al teléfono—
 * y hasta ahora se veía en la Agenda sin que nada pidiera llamarle. Verlo no es
 * atenderlo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SQL_SIN_LLAMAR, SQL_LOS_SIN_LLAMAR, SQL_MARCA_LLAMADA,
  ENSURE_COLUMNAS, QUE_SE_LE_DICE, LO_QUE_FALTA,
} from './financiacion-del-comprador.js';

describe('a quién hay que llamar', () => {
  test('solo a los que lo pidieron', () => {
    for (const sql of [SQL_SIN_LLAMAR, SQL_LOS_SIN_LLAMAR]) {
      assert.match(sql, /quiere_financiar = TRUE/);
    }
  });

  test('y solo mientras nadie haya llamado', () => {
    /*
     * Sin la marca, la única forma de saber si alguien llamó es preguntar en la
     * oficina — que es lo mismo que no saberlo.
     */
    for (const sql of [SQL_SIN_LLAMAR, SQL_LOS_SIN_LLAMAR]) {
      assert.match(sql, /financiacion_llamada_at IS NULL/);
    }
  });

  test('las canceladas no cuentan', () => {
    /*
     * Esa visita ya no va a pasar. Llamarle para ofrecerle financiación de un
     * coche que no va a ver es la clase de llamada que hace que te cuelguen.
     */
    for (const sql of [SQL_SIN_LLAMAR, SQL_LOS_SIN_LLAMAR]) {
      assert.match(sql, /status <> 'cancelled'/);
    }
  });

  test('la lista sale por fecha de visita, no por cuándo se pidió', () => {
    // Hay que llamar antes de que vaya, así que el que va mañana es el urgente
    // aunque lo pidiera después.
    assert.match(SQL_LOS_SIN_LLAMAR, /ORDER BY starts_at ASC/);
  });

  test('y trae el teléfono, que es para lo que se abre la lista', () => {
    assert.match(SQL_LOS_SIN_LLAMAR, /buyer_phone/);
  });
});

describe('apuntar la llamada', () => {
  test('deja quién y cuándo', () => {
    assert.match(SQL_MARCA_LLAMADA, /financiacion_llamada_at = NOW\(\)/);
    assert.match(SQL_MARCA_LLAMADA, /financiacion_llamada_por = \$2/);
  });

  test('y volver a pulsar no reescribe el rastro', () => {
    /*
     * Lo que hace falta saber el día que el comprador dice que nadie le ha
     * contado nada es la vez que se le llamó, no la última vez que alguien tocó
     * el botón.
     */
    assert.match(SQL_MARCA_LLAMADA, /AND financiacion_llamada_at IS NULL/);
    assert.match(SQL_MARCA_LLAMADA, /RETURNING id/);
  });

  test('las columnas son del ERP y nulables', () => {
    /*
     * PopCar pregunta y guarda la respuesta; atenderla es trabajo de aquí,
     * igual que el resultado de la visita. Lo que ya escribe la otra aplicación
     * tiene que seguir funcionando sin enterarse.
     */
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS financiacion_llamada_at TIMESTAMPTZ/);
    assert.doesNotMatch(ENSURE_COLUMNAS, /financiacion_llamada_at[^,]*NOT NULL/);
  });
});

describe('qué se le dice, mientras no haya scoring', () => {
  test('hay guion, y dice que el coche lo vende un particular', () => {
    /*
     * Sin guion, cada uno cuenta una cosa y la mitad no menciona lo único que
     * cambia la conversación: enfrente no hay un concesionario.
     */
    assert.ok(QUE_SE_LE_DICE.length >= 3);
    assert.ok(QUE_SE_LE_DICE.some((x) => /particular/i.test(x)), 'no se dice que vende un particular');
  });

  test('y que se le llama antes de la visita', () => {
    assert.ok(QUE_SE_LE_DICE.some((x) => /antes de la visita/i.test(x)));
  });

  test('se dice qué falta, en vez de dejar un botón muerto', () => {
    /*
     * Un botón que abre una página en blanco es peor que no tenerlo: se pulsa
     * igual y nadie sabe si ha funcionado. Quien lee esto sabe por qué no está.
     */
    assert.match(LO_QUE_FALTA, /scoring/i);
    assert.match(LO_QUE_FALTA, /plataforma/i);
  });
});
