/**
 * La comisión de la financiación del comprador.
 *
 * Lo que se protege: que **financiar no se deduzca de comprar**. Entre las dos
 * cosas hay una aprobación que puede no llegar, y darlo por hecho sería
 * facturarle a la entidad operaciones que no existieron.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEE_POR_FINANCIACION, TIPO_DE_FACTURA, RESULTADOS, esUnResultado,
  laComision, elConcepto, ENSURE_COLUMNAS,
  SQL_SIN_CERRAR, SQL_LAS_SIN_CERRAR, SQL_CIERRA, SQL_SIN_FACTURAR, QUE_SE_PREGUNTA,
} from './comision-de-financiacion.js';
import { IVA_GENERAL } from './dinero.js';

describe('el dinero', () => {
  test('el total es lo acordado y la base sale de dividir', () => {
    /*
     * Es el error de la garantía al revés: allí se guardó el precio de venta en
     * la base y la comisión en el total, y la factura decía que el total era
     * menor que la base.
     */
    const c = laComision();
    assert.equal(c.total, FEE_POR_FINANCIACION);
    assert.equal(c.iva, IVA_GENERAL);
    assert.ok(c.base < c.total);
  });

  test('y base más cuota suman el total, exactamente', () => {
    /*
     * La cuota se saca restando. Con dos redondeos independientes se separan un
     * céntimo para ciertos importes, y el guardián de facturación admite dos
     * céntimos de holgura: no saltaría, y la factura estaría mal sin que nadie
     * se enterara.
     */
    /*
     * En céntimos, que es como se suma el dinero.
     *
     * `base + cuota` en coma flotante da 99.99000000000001 para 99,99: los tres
     * números son correctos al céntimo y quien no cuadra es la suma de JavaScript.
     * Comparar los flotantes haría fallar la prueba por algo que no es el fallo
     * que busca — y tapar eso con una holgura dejaría pasar el que sí.
     */
    const cent = (n: number) => Math.round(n * 100);
    /*
     * El 10 y el 10,05 están aquí a propósito.
     *
     * Con 150, 200 o 99,99 restar y multiplicar dan lo mismo, así que la prueba
     * pasaba igual con el cálculo mal hecho — se saboteó y no cayó. Con 10 €:
     * la base es 8,26, restando la cuota es 1,74 y multiplicando 1,73. Ésos son
     * los importes que separan los dos métodos, y por eso son los que hay que
     * meter.
     */
    for (const total of [150, 200, 175.5, 99.99, 1234.56, 0.07, 10, 10.05, 10.11]) {
      const c = laComision(total);
      assert.equal(cent(c.base) + cent(c.cuota), cent(c.total), `no cuadra con ${total}`);
    }
  });

  test('el importe es editable: no está clavado en la función', () => {
    // No hay nada firmado con ninguna entidad. El fee de aquí es el que se
    // propone, no el único que se puede emitir.
    assert.equal(laComision(300).total, 300);
  });
});

describe('financiar no es comprar', () => {
  test('los dos resultados están escritos, y son dos', () => {
    assert.deepEqual([...RESULTADOS], ['financiada', 'no_financiada']);
  });

  test('y nada más cuela', () => {
    for (const malo of ['', 'quizas', 'compro', null, undefined, 'FINANCIADA']) {
      assert.equal(esUnResultado(malo), false, String(malo));
    }
    assert.equal(esUnResultado('financiada'), true);
  });

  test('la lista de pendientes solo mira a los que compraron', () => {
    // A quien fue a verlo y no se lo quedó no hay financiación que cerrarle.
    for (const sql of [SQL_SIN_CERRAR, SQL_LAS_SIN_CERRAR]) {
      assert.match(sql, /resultado = 'compro'/);
      assert.match(sql, /quiere_financiar = TRUE/);
    }
  });

  test('y solo a los que no tienen resultado', () => {
    // El que ya dijo que no financió no vuelve a salir: si no, la lista no se
    // vacía nunca y se deja de mirar.
    for (const sql of [SQL_SIN_CERRAR, SQL_LAS_SIN_CERRAR]) {
      assert.match(sql, /financiacion_resultado IS NULL/);
    }
  });

  test('una cancelada no cuenta', () => {
    for (const sql of [SQL_SIN_CERRAR, SQL_LAS_SIN_CERRAR]) {
      assert.match(sql, /status <> 'cancelled'/);
    }
  });
});

describe('el rastro', () => {
  test('se apunta cuándo y quién, y solo la primera vez', () => {
    /*
     * Sin el `IS NULL`, el rastro diría la última vez que alguien tocó el botón
     * y no la vez que se cerró — que es lo que hace falta el día que la entidad
     * discuta una comisión.
     */
    assert.match(SQL_CIERRA, /financiacion_resultado IS NULL/);
    assert.match(SQL_CIERRA, /financiacion_cerrada_at = NOW\(\)/);
    assert.match(SQL_CIERRA, /financiacion_cerrada_por = \$5/);
  });

  test('y guarda con quién y cuánto', () => {
    assert.match(SQL_CIERRA, /financiacion_entidad = COALESCE\(\$3, ''\)/);
    assert.match(SQL_CIERRA, /financiacion_importe = \$4/);
  });

  test('las columnas se añaden sin romper lo que ya escribe PopCar', () => {
    // PopCar pregunta y guarda el sí; lo de después es trabajo del ERP.
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(ENSURE_COLUMNAS, /NOT NULL(?! DEFAULT)/);
  });
});

describe('la factura a la entidad', () => {
  test('tiene su propio tipo, no se mezcla con las demás', () => {
    assert.equal(TIPO_DE_FACTURA, 'financing_commission');
    assert.match(SQL_SIN_FACTURAR, /type = 'financing_commission'/);
  });

  test('no se emite dos veces la misma', () => {
    /*
     * Se cruza por el identificador de la reserva en `contract_id`, igual que
     * la del concesionario. Con el `::text` puesto: la reserva es un `uuid` y
     * `contract_id` es texto, así que sin castear Postgres no compara —
     * «operator does not exist: character varying = uuid»— y la consulta revienta
     * entera. Lo cazó la comprobación contra la base, no las pruebas.
     */
    assert.match(SQL_SIN_FACTURAR, /i\.contract_id = b\.id::text/);
    assert.match(SQL_SIN_FACTURAR, /NOT EXISTS/);
  });

  test('y solo de las financiadas de verdad', () => {
    assert.match(SQL_SIN_FACTURAR, /financiacion_resultado = 'financiada'/);
  });

  test('el concepto dice qué coche y cuánto se financió', () => {
    /*
     * Una línea que solo dice «comisión» no se puede comprobar contra nada
     * dentro de seis meses, que es cuando alguien la discute.
     */
    const c = elConcepto('Volkswagen T-Roc (8888LXR)', 12000);
    assert.match(c, /Volkswagen T-Roc \(8888LXR\)/);
    assert.match(c, /12000\.00 €/);
  });

  test('y sin esos datos no dice «undefined» ni «0 €»', () => {
    const c = elConcepto(null, null);
    assert.doesNotMatch(c, /undefined|null|NaN|0\.00/);
    assert.match(c, /un coche/);
  });
});

describe('la ruta que la emite', () => {
  /*
   * Se mira el trozo de la ruta, no el fichero entero: `provider-billing.ts`
   * emite siete clases de factura y buscando en todo la prueba se daría por
   * buena leyendo las puertas de otra.
   */
  const RUTA = (() => {
    const src = readFileSync(
      join(import.meta.dirname, '..', 'routes', 'provider-billing.ts'), 'utf8'
    ).replace(/\r\n/g, '\n');
    const i = src.indexOf("'/provider-billing/financing-commissions'");
    const f = src.indexOf('Las garantías vendidas cuya comisión', i);
    assert.ok(i > 0 && f > i, 'no encuentro la ruta de la comisión de financiación');
    return src.slice(i, f);
  })();

  test('no se emite dos veces la misma', () => {
    /*
     * Es la puerta que impide cobrarle dos veces a la entidad por la misma
     * operación. El servidor la comprueba aunque la pantalla esconda el botón:
     * la pantalla no es lo que manda.
     */
    assert.match(RUTA, /WHERE type = 'financing_commission' AND contract_id = \$1 LIMIT 1/);
    assert.match(RUTA, /error: 'ya_emitida'/);
  });

  test('y no se emite si no consta financiada', () => {
    assert.match(RUTA, /financiacion_resultado !== 'financiada'/);
    assert.match(RUTA, /error: 'sin_financiacion'/);
  });

  test('ni sin saber a qué entidad', () => {
    // Una comisión sin destinatario es una operación de la que no se puede
    // cobrar, que es el agujero que esto viene a tapar.
    assert.match(RUTA, /error: 'sin_entidad'/);
  });

  test('y la factura queda atada a su ficha de proveedor', () => {
    // Si no, no sale en ninguna suma por proveedor y el total sale más bajo sin
    // que nadie lo note.
    assert.match(RUTA, /await ataLaFactura\(id, entidad\)/);
  });
});

describe('el guion de cerrarla', () => {
  test('pide la entidad siempre con el mismo nombre', () => {
    /*
     * Sin guion, «entidad» se rellena unas veces con el banco y otras con el
     * comercial que lo llevó, y entonces no se puede agrupar — que es la única
     * pregunta que dice si el acuerdo con una vale la pena.
     */
    assert.ok(QUE_SE_PREGUNTA.some((x) => /siempre el mismo/.test(x)));
  });

  test('y dice que el «no» también se marca', () => {
    assert.ok(QUE_SE_PREGUNTA.some((x) => /no financió/.test(x)));
  });
});
