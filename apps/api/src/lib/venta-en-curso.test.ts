/**
 * La venta en curso: en qué paso está y qué se puede hacer en cada uno.
 *
 * Lo que se protege es el orden que decidió Ana: si el comprador financia, la
 * financiación va primero y bloquea lo demás; denegada, o lo paga él o se
 * anula. Y que el panel no diga «vendido sin cerrar» de una venta que se está
 * cerrando.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENSURE_COLUMNAS, enQuePasoEsta, porQueNoSeDecideLaFinanciacion, porQueNoPagaEl, porQueNoSeAnula,
  correoFinanciacionAprobada, correoFinanciacionDenegada, correoVentaAnuladaAlVendedor,
  QUE_TOCA, comoSeReparte, FEE_DE_GESTION,
  porQueNoSeApuntaElIngreso, porQueNoSeMandaLaGestoria, porQueNoSeCierraLaGestoria,
  porQueNoSeLibera, porQueNoSeEntrega,
  correoIngresoRecibido, correoIngresoRecibidoAlVendedor, correoDineroLiberado,
  type LaVenta, type Paso,
} from './venta-en-curso.js';

describe('en qué paso está', () => {
  test('sin venta, ninguno', () => {
    assert.equal(enQuePasoEsta(null), null);
    assert.equal(enQuePasoEsta({ venta_estado: 'anulada' }), null);
  });

  test('si financia, primero la financiación', () => {
    assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: 'en_estudio' }), 'financiacion_en_estudio');
  });

  test('denegada, se para ahí', () => {
    assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: 'denegada' }), 'financiacion_denegada');
  });

  test('aprobada, sin financiar o pagándolo él: al ingreso', () => {
    for (const estado of ['aprobada', 'sin_financiacion', null]) {
      assert.equal(enQuePasoEsta({ venta_estado: 'en_curso', financiacion_estado: estado }), 'esperando_ingreso', String(estado));
    }
  });
});

describe('qué se puede hacer', () => {
  const enEstudio = { venta_estado: 'en_curso', financiacion_estado: 'en_estudio' };

  test('aprobarla pide la entidad: sin ella no se factura la comisión', () => {
    assert.match(porQueNoSeDecideLaFinanciacion(enEstudio, 'aprobada', ''), /entidad/);
    assert.equal(porQueNoSeDecideLaFinanciacion(enEstudio, 'aprobada', 'Banco X'), '');
    assert.equal(porQueNoSeDecideLaFinanciacion(enEstudio, 'denegada', ''), '');
  });

  test('solo se decide una que está en estudio', () => {
    assert.ok(porQueNoSeDecideLaFinanciacion({ venta_estado: 'en_curso', financiacion_estado: 'aprobada' }, 'denegada', ''));
    assert.ok(porQueNoSeDecideLaFinanciacion({ venta_estado: 'anulada', financiacion_estado: 'en_estudio' }, 'aprobada', 'X'));
  });

  test('«lo paga él» solo después de una denegación', () => {
    assert.ok(porQueNoPagaEl(enEstudio));
    assert.equal(porQueNoPagaEl({ venta_estado: 'en_curso', financiacion_estado: 'denegada' }), '');
  });

  test('se anula una venta en curso, no otra cosa', () => {
    assert.equal(porQueNoSeAnula(enEstudio), '');
    assert.ok(porQueNoSeAnula({ venta_estado: 'anulada' }));
  });
});

describe('los correos', () => {
  const d = { comprador_nombre: 'Sergio', coche: 'Volkswagen T-Roc', precio: 17900, entidad: 'Banco X', importe: 12000, sitio: 'https://popcar.com.es', oferta_id: 'idcar-veh-1' };

  test('aprobada: con la entidad, el importe y que lo siguiente es el ingreso', () => {
    const c = correoFinanciacionAprobada(d);
    assert.match(c.html, /Banco X/);
    assert.match(c.html, /12\.000 €/);
    assert.match(c.html, /ingreso/);
  });

  test('denegada: le pregunta si lo paga él, sin coste si no', () => {
    const c = correoFinanciacionDenegada(d);
    assert.match(c.html, /17\.900 €/);
    assert.match(c.html, /sin ningún coste/);
  });

  test('anulada: al vendedor, que vuelve a estar a la venta', () => {
    assert.match(correoVentaAnuladaAlVendedor(d).html, /vuelve a estar a la venta/);
  });
});

describe('cableado', () => {
  const ENCARGOS = readFileSync(join(import.meta.dirname, '..', 'routes', 'encargos.ts'), 'utf8').replace(/\r\n/g, '\n');

  test('las columnas se crean al preparar el encargo', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS venta_estado/);
    assert.match(ENCARGOS, /await query\(ENSURE_COLUMNAS_DE_LA_VENTA\)/);
  });

  test('una venta en curso no sale como «vendido sin cerrar»: tiene su paso', () => {
    assert.match(ENCARGOS, /if \(fila\.se_vendio && !paso\) avisos\.push\('encargos_vendidos'\)/);
    assert.match(ENCARGOS, /avisos\.push\('ventas_financiacion_en_estudio'\)/);
    assert.match(ENCARGOS, /avisos\.push\('ventas_financiacion_denegada'\)/);
  });

  test('aprobada, se apunta también en la visita: de ahí sale la comisión', () => {
    assert.match(ENCARGOS, /SET financiacion_resultado = 'financiada', financiacion_entidad = \$2/);
  });

  test('anulada, el anuncio se vuelve a publicar y la visita deja de contar como venta', () => {
    assert.match(ENCARGOS, /UPDATE moveadvisor_marketplace_vo_offers SET is_active = TRUE/);
    assert.match(ENCARGOS, /SET resultado = 'fue'/);
  });
});

/**
 * La fase del dinero.
 *
 * El orden es una promesa hecha por escrito a dos personas: al comprador se le
 * dice que su dinero no sale hasta que el coche es suyo, y al vendedor que no
 * entregue hasta haber cobrado. Cada guarda de abajo es una de esas dos frases
 * escrita en código; si una se cae, la que se rompe es la promesa.
 */

/** Una venta en curso, ya con la financiación resuelta. */
const VENTA: LaVenta = { venta_estado: 'en_curso', financiacion_estado: 'aprobada', precio_venta: 17900 };
const AYER = new Date(Date.now() - 86400000).toISOString();

describe('los pasos del dinero, por sus fechas', () => {
  test('sin nada apuntado, falta el ingreso', () => {
    assert.equal(enQuePasoEsta(VENTA), 'esperando_ingreso');
  });

  test('y van en orden según se van poniendo', () => {
    const pasos: [Partial<LaVenta>, Paso][] = [
      [{ ingreso_at: AYER }, 'toca_la_gestoria'],
      [{ ingreso_at: AYER, gestoria_at: AYER }, 'gestoria_en_curso'],
      [{ ingreso_at: AYER, gestoria_at: AYER, gestoria_hecha_at: AYER }, 'toca_liberar'],
      [{ ingreso_at: AYER, gestoria_at: AYER, gestoria_hecha_at: AYER, liberado_at: AYER }, 'toca_entregar'],
      [{ ingreso_at: AYER, gestoria_at: AYER, gestoria_hecha_at: AYER, liberado_at: AYER, entregado_at: AYER }, 'entregado'],
    ];
    for (const [fechas, esperado] of pasos) {
      assert.equal(enQuePasoEsta({ ...VENTA, ...fechas }), esperado, JSON.stringify(fechas));
    }
  });

  test('el paso no retrocede aunque falte una fecha por el medio', () => {
    /*
     * Las fechas se leen de atrás hacia delante a propósito. Si se leyeran al
     * revés, una venta ya entregada a la que le faltara —por lo que sea— la
     * fecha de la gestoría volvería a decir «toca la gestoría», y alguien
     * mandaría a Tráfico un cambio de nombre que ya está hecho.
     */
    assert.equal(enQuePasoEsta({ ...VENTA, ingreso_at: AYER, entregado_at: AYER }), 'entregado');
  });

  test('pero la financiación sigue mandando por encima de todo', () => {
    // Con dinero dentro y la financiación en estudio, algo se ha hecho mal: lo
    // que hay que mirar es la financiación, no seguir adelante.
    assert.equal(
      enQuePasoEsta({ ...VENTA, financiacion_estado: 'en_estudio', ingreso_at: AYER }),
      'financiacion_en_estudio',
    );
  });

  test('y cada paso dice qué toca, sin dejar ninguno mudo', () => {
    for (const paso of Object.keys(QUE_TOCA) as Paso[]) {
      assert.ok(QUE_TOCA[paso] && QUE_TOCA[paso].length > 10, paso);
    }
  });
});

describe('el ingreso', () => {
  test('se apunta cuando toca', () => {
    assert.equal(porQueNoSeApuntaElIngreso(VENTA, 17900), '');
  });

  test('no se le pide dinero a quien espera respuesta de la entidad', () => {
    const enEstudio = { ...VENTA, financiacion_estado: 'en_estudio' };
    assert.match(porQueNoSeApuntaElIngreso(enEstudio, 17900), /en estudio/);
  });

  test('ni a quien se la han denegado', () => {
    const denegada = { ...VENTA, financiacion_estado: 'denegada' };
    assert.match(porQueNoSeApuntaElIngreso(denegada, 17900), /denegada/);
  });

  test('no se apunta dos veces', () => {
    assert.match(porQueNoSeApuntaElIngreso({ ...VENTA, ingreso_at: AYER }, 17900), /ya está apuntado/);
  });

  test('y lo que entra tiene que ser lo que vale el coche', () => {
    /*
     * Un ingreso de menos no es «va llegando»: significa que falta dinero y
     * que el vendedor cobraría de menos. Si de verdad se paga a plazos, eso se
     * decide antes y no se cuela por esta casilla.
     */
    assert.match(porQueNoSeApuntaElIngreso(VENTA, 10000), /no cuadra/);
    assert.match(porQueNoSeApuntaElIngreso(VENTA, 0), /cuánto ha entrado/);
    // Un euro de diferencia es un redondeo del banco, no un problema.
    assert.equal(porQueNoSeApuntaElIngreso(VENTA, 17899.5), '');
  });
});

describe('la gestoría', () => {
  test('no sale hasta que hay dinero dentro', () => {
    assert.match(porQueNoSeMandaLaGestoria(VENTA), /todavía no ha entrado/i);
  });

  test('con el ingreso hecho, adelante', () => {
    assert.equal(porQueNoSeMandaLaGestoria({ ...VENTA, ingreso_at: AYER }), '');
  });

  test('y no se manda dos veces', () => {
    assert.match(porQueNoSeMandaLaGestoria({ ...VENTA, ingreso_at: AYER, gestoria_at: AYER }), /ya está mandada/);
  });

  test('ni se cierra una que no ha salido', () => {
    assert.match(porQueNoSeCierraLaGestoria({ ...VENTA, ingreso_at: AYER }), /todavía no se ha mandado/);
  });
});

describe('liberarle el dinero al vendedor', () => {
  const conGestoria = { ...VENTA, ingreso_at: AYER, gestoria_at: AYER };

  test('no se suelta antes del cambio de nombre', () => {
    /*
     * Ésta es la guarda que sostiene lo que se le promete al comprador: paga
     * tranquilo, que el dinero no sale de ahí hasta que el coche es tuyo.
     * Soltarlo antes deja la promesa sin nada detrás.
     */
    assert.match(porQueNoSeLibera(conGestoria), /no está hecho/);
  });

  test('con el coche ya a su nombre, sí', () => {
    assert.equal(porQueNoSeLibera({ ...conGestoria, gestoria_hecha_at: AYER }), '');
  });

  test('y no dos veces', () => {
    assert.match(
      porQueNoSeLibera({ ...conGestoria, gestoria_hecha_at: AYER, liberado_at: AYER }),
      /ya se le ha liberado/,
    );
  });
});

describe('la entrega del coche', () => {
  test('no se entrega hasta que el vendedor ha cobrado', () => {
    const sinCobrar = { ...VENTA, ingreso_at: AYER, gestoria_at: AYER, gestoria_hecha_at: AYER };
    assert.match(porQueNoSeEntrega(sinCobrar), /todavía no ha cobrado/);
  });

  test('y una vez cobrado, sí', () => {
    const cobrado = { ...VENTA, ingreso_at: AYER, gestoria_at: AYER, gestoria_hecha_at: AYER, liberado_at: AYER };
    assert.equal(porQueNoSeEntrega(cobrado), '');
  });
});

describe('anular con dinero dentro', () => {
  test('sin ingreso se anula como siempre', () => {
    assert.equal(porQueNoSeAnula(VENTA), '');
  });

  test('con el dinero retenido, no es un botón', () => {
    /*
     * Hay un importe a nombre de la operación y quizá un cambio de nombre en
     * marcha. Deshacer eso es una devolución, no una fila que se tacha: si se
     * pudiera desde aquí, el dinero de un comprador se quedaría colgado sin
     * que constara por qué.
     */
    assert.match(porQueNoSeAnula({ ...VENTA, ingreso_at: AYER }), /devolverlo/);
  });
});

describe('el reparto', () => {
  test('nuestros 299 € y el resto del vendedor', () => {
    const r = comoSeReparte(17900, FEE_DE_GESTION);
    assert.equal(r.total, 17900);
    assert.equal(r.nuestro, 299);
    assert.equal(r.delVendedor, 17601);
  });

  test('y son los mismos 299 € del encargo, no otra cifra', () => {
    // Dos cifras para lo mismo acaban diciendo cosas distintas, y la que ve el
    // cliente en su encargo y la que se le transfiere tienen que cuadrar.
    assert.equal(FEE_DE_GESTION, 299);
  });

  test('sin precio no se reparte nada', () => {
    assert.deepEqual(comoSeReparte(null, FEE_DE_GESTION), { total: 0, nuestro: 0, delVendedor: 0 });
    assert.deepEqual(comoSeReparte(0, FEE_DE_GESTION), { total: 0, nuestro: 0, delVendedor: 0 });
  });

  test('y un coche más barato que el fee no deja al vendedor a deber', () => {
    const r = comoSeReparte(200, FEE_DE_GESTION);
    assert.equal(r.nuestro, 200);
    assert.equal(r.delVendedor, 0);
  });
});

describe('lo que se le escribe a cada uno', () => {
  const d = {
    comprador_nombre: 'Sergio', coche: 'Volkswagen T-Roc', precio: 17900,
    vendedor_nombre: 'Ana', sitio: 'https://www.popcar.com.es', importe: 17900,
  };

  test('al comprador, que su dinero no sale hasta que el coche sea suyo', () => {
    const c = correoIngresoRecibido(d);
    assert.match(c.html, /retenido/);
    assert.match(c.html, /no sale de ahí hasta que el coche esté a tu nombre/);
  });

  test('al vendedor, que no entregue el coche todavía', () => {
    /*
     * Es el momento en que más tentado está: ya sabe que hay dinero. Sin esta
     * frase, entrega el coche y se queda sin coche y sin cobrar.
     */
    const c = correoIngresoRecibidoAlVendedor(d);
    assert.match(c.html, /No entregues el coche hasta que te avisemos/);
  });

  test('y al liberar, los tres números del reparto', () => {
    const r = comoSeReparte(17900, FEE_DE_GESTION);
    const c = correoDineroLiberado({ ...d, precio: r.total, importe: r.delVendedor });
    assert.match(c.html, /17\.900/);
    assert.match(c.html, /17\.601/);
    assert.match(c.html, /299/);
  });
});

describe('las columnas de la fase del dinero', () => {
  test('están todas, y con fecha', () => {
    // Cada momento con su fecha y no con un sí/no: «cuándo entró» es la
    // pregunta que se hace cuando alguien llama por su dinero.
    for (const col of ['ingreso_at', 'gestoria_at', 'gestoria_hecha_at', 'liberado_at', 'entregado_at']) {
      assert.match(ENSURE_COLUMNAS, new RegExp(col + ' TIMESTAMPTZ'), col);
    }
    assert.match(ENSURE_COLUMNAS, /ingreso_importe NUMERIC/);
    assert.match(ENSURE_COLUMNAS, /liberado_importe NUMERIC/);
  });
});
