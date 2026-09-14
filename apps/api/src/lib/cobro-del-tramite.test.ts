/**
 * El cobro del papeleo al comprador.
 *
 * Lo que se protege: que **lo que le cobramos y lo que nos cuesta sean dos
 * números distintos**. El ERP guardaba solo el coste de la gestoría, así que la
 * transferencia solo restaba en el margen del coche y el ingreso que la
 * compensa no existía en ningún sitio.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEL_COMPRADOR, loPagaElComprador, ENSURE_COLUMNAS,
  SQL_SIN_COBRAR, SQL_LOS_SIN_COBRAR, SQL_COBRA,
  loQueSeProponeCobrar, loQueDeja, QUE_SE_COBRA, TIPO_DE_FACTURA, elConcepto,
} from './cobro-del-tramite.js';

describe('quién paga qué', () => {
  test('la transferencia la paga el comprador', () => {
    /*
     * Lo dice el contrato que firman los dos: «los gastos e impuestos derivados
     * del cambio de titularidad son por cuenta del comprador».
     */
    assert.equal(loPagaElComprador('Transferencia de titularidad'), true);
    assert.deepEqual([...DEL_COMPRADOR], ['Transferencia de titularidad']);
  });

  test('y ningún otro trámite se le cobra a él por si acaso', () => {
    // Cobrarle a alguien un papeleo que no es suyo es peor que no cobrarlo.
    for (const otro of ['ITP', 'Baja temporal', '', null, undefined]) {
      assert.equal(loPagaElComprador(otro), false, String(otro));
    }
  });
});

describe('el precio y el coste son dos cosas', () => {
  test('se propone cobrar lo que cuesta, como suelo', () => {
    /*
     * Cobrar por debajo del coste es pagar por hacer el trabajo. Cuánto por
     * encima es una decisión que no está tomada, así que no se inventa aquí.
     */
    assert.equal(loQueSeProponeCobrar(87.8), 87.8);
  });

  test('sin tarifa no se propone cero', () => {
    // Proponer cero sería proponer regalarlo. La pantalla lo pide.
    assert.equal(loQueSeProponeCobrar(null), null);
    assert.equal(loQueSeProponeCobrar(0), null);
    assert.equal(loQueSeProponeCobrar('no es un numero'), null);
  });

  test('lo que deja la operación sale de los dos', () => {
    assert.equal(loQueDeja(120, 87.8), 32.2);
  });

  test('y si falta uno de los dos, no se inventa un margen', () => {
    /*
     * Un margen calculado con un hueco sale bonito y es mentira: diría que
     * ganamos 120 € cuando lo que pasa es que no sabemos lo que nos costó.
     */
    assert.equal(loQueDeja(120, null), null);
    assert.equal(loQueDeja(null, 87.8), null);
  });

  test('se guardan por separado, en dos columnas', () => {
    // Con una sola, el margen no se puede calcular sin preguntar.
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS precio/);
    assert.doesNotMatch(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS coste/);
  });
});

describe('los que faltan por cobrar', () => {
  test('solo las transferencias', () => {
    for (const sql of [SQL_SIN_COBRAR, SQL_LOS_SIN_COBRAR]) {
      assert.match(sql, /tipo = 'Transferencia de titularidad'/);
    }
  });

  test('y solo mientras no conste el cobro', () => {
    for (const sql of [SQL_SIN_COBRAR, SQL_LOS_SIN_COBRAR]) {
      assert.match(sql, /cobrado_at IS NULL/);
    }
  });

  test('un trámite anulado no se le cobra a nadie', () => {
    // Dejarlo en la lista es pedir un cobro que no toca.
    for (const sql of [SQL_SIN_COBRAR, SQL_LOS_SIN_COBRAR]) {
      assert.match(sql, /estado <> 'Anulado'/);
    }
  });

  test('la lista trae los dos números, para poder ver lo que deja', () => {
    assert.match(SQL_LOS_SIN_COBRAR, /precio/);
    assert.match(SQL_LOS_SIN_COBRAR, /coste/);
  });

  test('y a quién hay que cobrarle', () => {
    assert.match(SQL_LOS_SIN_COBRAR, /comprador_nombre/);
    assert.match(SQL_LOS_SIN_COBRAR, /comprador_email/);
  });
});

describe('el rastro del cobro', () => {
  test('se apunta cuándo y quién, y solo la primera vez', () => {
    /*
     * Sin el `IS NULL`, el rastro diría la última vez que alguien pulsó el
     * botón y no la vez que pagó — que es lo que hace falta el día que el
     * comprador diga que ya lo pagó.
     */
    assert.match(SQL_COBRA, /cobrado_at IS NULL/);
    assert.match(SQL_COBRA, /cobrado_at = NOW\(\)/);
    assert.match(SQL_COBRA, /cobrado_por = \$3/);
  });

  test('y el precio se guarda en la misma operación', () => {
    // Cobrar sin dejar escrito cuánto deja media respuesta.
    assert.match(SQL_COBRA, /SET precio = \$2/);
  });

  test('las columnas no rompen los trámites que ya existen', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(ENSURE_COLUMNAS, /NOT NULL(?! DEFAULT)/);
  });
});

describe('el guion de la pantalla', () => {
  test('dice que el precio no es el coste', () => {
    /*
     * Sin esto, «precio» se rellena unas veces con lo que nos cuesta y otras
     * con lo que le cobramos, y entonces el margen no significa nada.
     */
    assert.ok(QUE_SE_COBRA.some((x) => /no lo que nos cuesta/.test(x)));
  });

  test('y que esto apunta un cobro, no lo cobra', () => {
    assert.ok(QUE_SE_COBRA.some((x) => /apunta que se cobró/.test(x)));
  });
});

/**
 * Y su factura, que es lo que le queda a él.
 *
 * Cobrar sin darle papel deja el dinero apuntado en un sitio donde solo lo
 * vemos nosotros. El contrato dice que el papeleo es suyo; la factura es la
 * prueba de lo que pagó.
 */
describe('la factura del papeleo', () => {
  test('tiene su propio tipo, no reaprovecha el de la venta', () => {
    /*
     * `gestion_venta` es la nuestra al VENDEDOR por vender su coche. Ésta es al
     * COMPRADOR por el papeleo. Con un solo tipo no se podría contar ninguna de
     * las dos por separado, y son dos personas y dos conceptos.
     */
    assert.equal(TIPO_DE_FACTURA, 'gestion_tramite');
    assert.notEqual(TIPO_DE_FACTURA, 'gestion_venta');
  });

  test('el concepto dice qué papeleo y de qué coche', () => {
    // Una línea que solo dijera «transferencia» no se puede comprobar contra
    // nada dentro de seis meses, que es cuando alguien la discute.
    const c = elConcepto('Transferencia de titularidad', '8888LXR');
    assert.match(c, /Transferencia de titularidad/);
    assert.match(c, /8888LXR/);
  });

  test('y sin matrícula no deja un separador colgando', () => {
    const c = elConcepto('Transferencia de titularidad', null);
    assert.equal(c, 'Transferencia de titularidad');
    assert.doesNotMatch(c, /·\s*$|undefined|null/);
  });

  test('sin tipo tampoco dice «undefined»', () => {
    assert.match(elConcepto(null, '8888LXR'), /^Papeleo · 8888LXR$/);
  });
});

/**
 * Y que las dos mitades estén enchufadas.
 *
 * Las reglas de arriba pueden ser perfectas y no servir de nada si el cobro no
 * emite la factura o si la transferencia nace sin saber quién compró. Las dos
 * cosas se saboteaban sin que fallara ninguna prueba.
 */
describe('las dos mitades, enchufadas', () => {
  const lee = (f: string) =>
    readFileSync(join(import.meta.dirname, '..', 'routes', f), 'utf8').replace(/\r\n/g, '\n');

  test('apuntar el cobro emite su factura', () => {
    /*
     * Cobrar y facturar son el mismo hecho. Separarlos crearía una segunda
     * lista de «cobrados sin facturar» que se olvidaría igual que se olvidaba
     * ésta.
     */
    const t = lee('tramites.ts');
    const ruta = t.slice(t.indexOf("'/tramites/:id/cobrado'"), t.indexOf('// ── El rastro'));
    assert.ok(ruta.length > 0, 'no encuentro la ruta del cobro');
    assert.match(ruta, /await emiteLaFacturaDelTramite\(\{/);
  });

  test('y que falle la factura no deshace el cobro', () => {
    // El cobro ya está apuntado. Un cobro perdido es peor que una factura que
    // hay que volver a emitir.
    const t = lee('tramites.ts');
    const ruta = t.slice(t.indexOf("'/tramites/:id/cobrado'"), t.indexOf('// ── El rastro'));
    assert.match(ruta, /cobrado pero sin factura/);
  });

  test('la transferencia nace sabiendo quién compró', () => {
    /*
     * `cliente_email` es el vendedor: es su encargo y su coche. Sin el
     * comprador, el cobro se queda en una lista sin destinatario y la factura
     * no tiene a quién ir.
     */
    const e = lee('encargos.ts');
    const cierre = e.slice(e.indexOf('abreLaTransferenciaDelEncargo({'));
    assert.match(cierre.slice(0, 600), /compradorEmail:/);
    assert.match(cierre.slice(0, 600), /compradorNombre:/);
  });
});
