/**
 * Que lo que pide el cliente sobre su cita llegue y se resuelva.
 *
 * Lo que había: el correo decía «contesta y lo cambiamos», la respuesta se
 * quedaba en una bandeja de entrada, la cita seguía en pie en el ERP y el día
 * señalado el coche no aparecía. Nadie se enteraba hasta que llamaba el taller.
 *
 * Aquí se protege el circuito entero: que lo que pide se apunte, que se vea, que
 * se apague al atenderlo y que no se pueda «atender» sin hacer nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const leer = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\r\n/g, '\n');

const RUTAS = leer('revisiones-taller.ts');
const ENCARGOS = leer('encargos.ts');
const PANTALLA = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'web', 'src', 'pages', 'idcar', 'RevisionDelTaller.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('lo que pide el cliente se ve donde se atiende', () => {
  test('la ficha de la revisión lo enseña', () => {
    assert.match(PANTALLA, /El cliente pide que le cambiemos la cita/);
    assert.match(PANTALLA, /El cliente pide que le anulemos la cita/);
  });

  test('con sus palabras, si las escribió', () => {
    // El motivo es lo que decide qué se hace: «no puedo por las mañanas» y «me
    // lo he vendido» son dos llamadas distintas.
    assert.match(PANTALLA, /cliente_motivo/);
  });
});

describe('y se apaga cuando se atiende', () => {
  test('guardar la cita da por atendido lo que pidió', () => {
    /*
     * Si pidió otra hora y se le pone otra hora, ya no espera nada. Un segundo
     * botón de «ya está» es un botón que alguien se olvida de pulsar, y el aviso
     * viviría para siempre.
     */
    assert.match(RUTAS, /const tocaLaCita = req\.body\?\.cita_at !== undefined/);
    assert.match(RUTAS, /cliente_pidio\s*=\s*CASE WHEN \$8 THEN NULL ELSE cliente_pidio END/);
  });

  test('pero apuntar el resultado del taller no atiende nada', () => {
    // Son dos cosas distintas: el taller contesta y el cliente pide. Con la
    // condición puesta en cualquier PATCH, cerrar la revisión borraría una
    // petición que nadie ha mirado.
    assert.doesNotMatch(RUTAS, /cliente_pidio\s*=\s*NULL,\s*\n\s*cliente_pidio_at\s*=\s*NULL,\s*\n\s*hecha_at/);
  });

  test('y anular la cita la deja sin fecha, no cerrada', () => {
    /*
     * El coche sigue necesitando la revisión para poder publicarse. Cerrarla y
     * abrir otra apuntaría una segunda factura de 60 € que nadie ha pedido.
     */
    const anular = RUTAS.slice(RUTAS.indexOf("'/revisiones-taller/:id/anular-cita'"));
    assert.match(anular, /SET estado = 'Por llevar'/);
    assert.match(anular, /cita_at = NULL/);
    assert.match(anular, /avisado_at = NULL/);
    assert.match(anular, /cliente_pidio = NULL/);
  });

  test('una revisión hecha no se desanda', () => {
    const anular = RUTAS.slice(RUTAS.indexOf("'/revisiones-taller/:id/anular-cita'"));
    assert.match(anular, /WHERE id = \$1 AND estado <> 'Hecha'/);
  });
});

describe('y mientras tanto no se pierde', () => {
  test('sale en la lista de pendientes del panel', () => {
    /*
     * Tiene fecha: si nadie lo mira antes del día de la cita, se pierde igual
     * que si no lo hubiera dicho — y encima habiéndolo dicho, que es peor.
     */
    assert.match(ENCARGOS, /avisos\.push\('citas_taller_que_pide_mover'\)/);
  });

  test('y la consulta trae el dato que hace falta para saberlo', () => {
    // Contarlo sobre una fila que no trae `cliente_pidio` daría cero siempre.
    assert.match(ENCARGOS, /tal\.cliente_pidio AS taller_cliente_pidio/);
    assert.match(ENCARGOS, /SELECT rt\.estado, rt\.resultado, rt\.cliente_pidio/);
  });
});
