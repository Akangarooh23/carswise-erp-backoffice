/**
 * Cuándo se suelta el dinero de un cliente.
 *
 * Esto no es una comprobación técnica: es la promesa entera del producto. El
 * cliente deposita veinte mil euros y lo que le vendemos es que nadie los toca
 * hasta que uno de los nuestros ha visto el coche en Alemania.
 *
 * Si esta lógica se rompe en silencio, lo que se rompe es la razón de existir
 * del servicio. Por eso está en su propio fichero, sin base de datos ni
 * pantalla, y tiene más pruebas de las que su tamaño sugiere.
 */
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  ESTADOS_DEPOSITO, TRANSICIONES,
  sePuedeLiberar, PORQUE_NO_SE_LIBERA, transicionValida, liquidacionDelImpuesto,
  escritoEnLista, faltanDatosDelVendedor,
} from './escrow.js';

describe('liberar el dinero', () => {
  test('solo si alguien nuestro ha visto el coche', () => {
    assert.deepEqual(
      sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true }),
      { puede: true, motivo: null }
    );
  });

  test('sin verificar, no', () => {
    // Es la única condición además de que el dinero esté, y es la que sostiene
    // todo lo demás.
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: false });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_verificar');
  });

  test('si no ha depositado, tampoco: no hay nada que soltar', () => {
    const r = sePuedeLiberar({ estado: 'pendiente', verificadoEnAlemania: true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_pagar');
  });

  test('sin estado guardado se trata como pendiente', () => {
    // Una fila vieja, de antes de que existiera el depósito, no puede parecer
    // que tiene dinero dentro.
    assert.equal(sePuedeLiberar({ estado: null, verificadoEnAlemania: true }).motivo, 'sin_pagar');
    assert.equal(sePuedeLiberar({}).motivo, 'sin_pagar');
  });

  test('y no se libera dos veces', () => {
    // Un segundo clic con el dinero ya enviado es un segundo pago al vendedor.
    const r = sePuedeLiberar({ estado: 'liberado', verificadoEnAlemania: true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'ya_liberado');
  });

  test('ni se libera lo que ya se devolvió', () => {
    const r = sePuedeLiberar({ estado: 'devuelto', verificadoEnAlemania: true });
    assert.equal(r.motivo, 'ya_devuelto');
  });

  test('cada negativa se puede explicar, no solo apagar un botón', () => {
    // Quien lo intenta tiene que saber qué le falta. Un botón gris no dice nada
    // y acaba en una llamada preguntando por qué.
    for (const m of ['sin_pagar', 'sin_verificar', 'ya_liberado', 'ya_devuelto'] as const) {
      assert.ok(PORQUE_NO_SE_LIBERA[m], `falta el motivo ${m}`);
    }
    assert.match(PORQUE_NO_SE_LIBERA.sin_verificar, /Alemania/);
  });
});

describe('los estados del depósito', () => {
  test('son cuatro y no hay más', () => {
    assert.deepEqual([...ESTADOS_DEPOSITO], ['pendiente', 'retenido', 'liberado', 'devuelto']);
  });

  test('se deposita antes de retener', () => {
    assert.equal(transicionValida('pendiente', 'retenido'), true);
    assert.equal(transicionValida('pendiente', 'liberado'), false,
      'se estaría soltando dinero que nadie ha ingresado');
  });

  test('de retenido se sale por los dos lados', () => {
    assert.equal(transicionValida('retenido', 'liberado'), true);
    assert.equal(transicionValida('retenido', 'devuelto'), true);
  });

  test('liberado y devuelto son finales', () => {
    // El dinero ya se movió. Cambiar el estado después no lo trae de vuelta, y
    // dejarlo cambiar esconde lo que pasó de verdad.
    assert.deepEqual([...TRANSICIONES.liberado], []);
    assert.deepEqual([...TRANSICIONES.devuelto], []);
  });

  test('un estado inventado no vale', () => {
    assert.equal(transicionValida('retenido', 'medio_liberado'), false);
    assert.equal(transicionValida('cualquier_cosa', 'liberado'), false);
  });
});

/**
 * Y que la ruta lo use de verdad, no solo que exista.
 */
describe('el portero está puesto en la ruta', () => {
  const RUTA = new URL('../routes/leads.ts', import.meta.url);
  const FUENTE = readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

  test('la liberación pasa por sePuedeLiberar', () => {
    assert.match(FUENTE, /sePuedeLiberar\(\{/);
  });

  test('y se mira lo guardado, no lo que venga en la petición', () => {
    // Quien pulsa el botón no puede traer consigo el permiso para pulsarlo.
    assert.match(FUENTE, /SELECT escrow_estado, verificado_alemania_at, vehicle_id FROM moveadvisor_market_leads/);
  });

  test('si no se puede, se contesta con el motivo', () => {
    assert.match(FUENTE, /PORQUE_NO_SE_LIBERA\[veredicto\.motivo\]/);
  });

  test('y se busca a quién se le va a mandar el dinero', () => {
    // El vendedor sale del anuncio del que nació el expediente, y su ficha de
    // Proveedores es donde están el IBAN, el NIF y el correo.
    // Por el nombre normalizado en JavaScript, no con un lower() de SQL: la
    // clave del proveedor va sin acentos y con los espacios juntos, así que
    // comparando a pelo un vendedor con acento no casaba con su propia ficha.
    // El portero no encontraba a nadie y dejaba pasar el pago.
    assert.match(FUENTE, /nombreComparable\(nombreDelVendedor\)/);
    assert.match(FUENTE, /FROM erp_proveedores WHERE clave = /);
    assert.match(FUENTE, /vendedor,/);
  });

  test('y si le faltan datos, se dice cuáles', () => {
    // «Faltan datos» no sirve: quien lo lee tiene que poder ir a rellenarlo sin
    // adivinar el qué.
    assert.match(FUENTE, /escritoEnLista\(veredicto\.faltan\)/);
    assert.match(FUENTE, /Se rellena en Proveedores/);
  });

  test('y no se escribe nada cuando no se puede', () => {
    // El `return` después del 409: sin él, se contestaría que no y se soltaría
    // el dinero igual.
    const bloque = FUENTE.slice(FUENTE.indexOf('if (libera_deposito)'), FUENTE.indexOf("if (!sets.length)"));
    const noPuede = bloque.slice(bloque.indexOf('if (!veredicto.puede)'));
    assert.match(noPuede.slice(0, 800), /return;/);
    assert.ok(noPuede.indexOf('return;') < noPuede.indexOf('escrow_liberado_at'),
      'se estaría soltando el dinero después de haber contestado que no');
  });
});

/**
 * Y que liberar el pago no se quede a medias.
 *
 * El pedido nace al pasar el expediente a «Verificado y pagado». Esa etapa la
 * pone el propio servidor cuando se libera el dinero, sin que nadie mande un
 * `status` en la petición: si la condición mirara el de la petición, se
 * liberaría el dinero y no nacería ningún pedido.
 */
describe('liberar el pago abre el pedido', () => {
  const RUTA = new URL('../routes/leads.ts', import.meta.url);
  const FUENTE = readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

  test('el pedido se crea mirando lo que quedó escrito', () => {
    assert.match(FUENTE, /finalStatus === 'Verificado y pagado'/);
  });

  test('y no lo que venía en la petición', () => {
    assert.ok(!FUENTE.includes("if (status === 'Verificado y pagado'"),
      'con el status de la petición, liberar el pago no abriría el pedido');
  });

  test('la liberación sí pone esa etapa', () => {
    const bloque = FUENTE.slice(FUENTE.indexOf('if (libera_deposito)'), FUENTE.indexOf('if (!sets.length)'));
    assert.match(bloque, /status = 'Verificado y pagado'/);
  });
});

/**
 * Liquidar el impuesto cuando se sabe lo que costó.
 *
 * El cliente pagó una provisión: hoy no tenemos el CO₂ de ningún coche, así que
 * el impuesto se estima. Al matricular se sabe el real, y la diferencia es suya
 * en los dos sentidos.
 *
 * Lo que se vigila aquí es que el fee de PopCar no entre nunca en esa cuenta. Un
 * coche de más de 160 g/km paga el doble del tramo que estimamos: si el fee
 * entrara, ese coche se comería lo que ganamos por traerlo.
 */
describe('liquidar el impuesto', () => {
  test('si sale más caro, se le cobra la diferencia', () => {
    const l = liquidacionDelImpuesto({ provision: 1420, real: 2100 });
    assert.equal(l.diferencia, 680);
    assert.equal(l.quien, 'cobrar');
  });

  test('si sale más barato, se le devuelve', () => {
    // Lo normal, porque la estimación se equivoca hacia arriba a propósito.
    const l = liquidacionDelImpuesto({ provision: 1420, real: 900 });
    assert.equal(l.diferencia, -520);
    assert.equal(l.quien, 'devolver');
  });

  test('y si cuadra, no se mueve nada', () => {
    assert.equal(liquidacionDelImpuesto({ provision: 1420, real: 1420 }).quien, 'cuadra');
  });

  test('la resta es solo del impuesto: el fee no entra', () => {
    const l = liquidacionDelImpuesto({ provision: 1420, real: 2100 });
    assert.equal(l.diferencia, 2100 - 1420, 'hay algo más metido en la cuenta');
  });

  test('con datos que faltan no inventa una diferencia', () => {
    assert.equal(liquidacionDelImpuesto({}).quien, 'cuadra');
    assert.equal(liquidacionDelImpuesto({ provision: null, real: null }).diferencia, 0);
  });
});

describe('no se entrega con el impuesto sin liquidar', () => {
  const RUTA = new URL('../routes/leads.ts', import.meta.url);
  const FUENTE = readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n');

  test('la puerta está antes de cerrar la entrega', () => {
    // Si se entrega sin cobrar la diferencia, ese dinero no se recupera: el
    // cliente ya tiene su coche.
    assert.match(FUENTE, /falta_liquidar_impuesto/);
  });

  test('y el importe real sale del trámite, no de un campo aparte', () => {
    // Un dato en dos sitios acaba diciendo dos cosas.
    assert.match(FUENTE, /t\.tipo = 'Impuesto de matriculación'/);
  });

  test('solo estorba cuando ya se sabe el importe real', () => {
    // Mientras la gestoría no lo haya escrito, no hay nada que liquidar y esto
    // no puede bloquear una entrega.
    const bloque = FUENTE.slice(FUENTE.indexOf('const liq = await query'), FUENTE.indexOf('falta_liquidar_impuesto'));
    assert.match(bloque, /f\.real != null/);
  });
});

/**
 * Y saber a quién se le manda el dinero.
 *
 * Antes de soltar 16.890 € hacia Alemania hay tres cosas que tienen que estar
 * escritas, y cada una por un motivo distinto: el **IBAN** porque es a dónde va
 * la transferencia, el **NIF** porque es lo que permite comprobar que la
 * sociedad existe, y el **correo** porque es a quien se le pide la factura del
 * coche a nombre del cliente — sin ella esos 16.890 € no son un suplido, son
 * ingreso nuestro con su IVA encima.
 */
describe('los datos del vendedor', () => {
  const COMPLETO = { iban: 'DE89370400440532013000', nif: 'DE123456789', email: 'ventas@autowelt.de', nombre: 'Autowelt Kaufmann GmbH' };

  test('con los tres puestos, se puede soltar', () => {
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true, vendedor: COMPLETO });
    assert.equal(r.puede, true);
    assert.equal(r.motivo, null);
  });

  test('sin IBAN no se suelta, y se dice que es el IBAN', () => {
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true, vendedor: { ...COMPLETO, iban: '' } });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_datos_del_vendedor');
    assert.deepEqual(r.faltan, ['el IBAN']);
  });

  test('y si faltan varios, salen todos', () => {
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true, vendedor: { nombre: 'Alguien' } });
    assert.deepEqual(r.faltan, ['el IBAN', 'el NIF', 'el correo']);
    assert.equal(escritoEnLista(r.faltan ?? []), 'el IBAN, el NIF y el correo');
  });

  test('un espacio en blanco no cuenta como dato', () => {
    // Es la forma más fácil de saltarse un campo obligatorio sin darse cuenta.
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true, vendedor: { ...COMPLETO, iban: '   ' } });
    assert.deepEqual(r.faltan, ['el IBAN']);
  });

  test('sin ficha de proveedor, faltan los tres', () => {
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true, vendedor: null });
    assert.deepEqual(r.faltan, ['el IBAN', 'el NIF', 'el correo']);
  });

  test('y sin saber quién es, no se comprueba nada', () => {
    // Un expediente sin oferta detrás. Bloquear un pago por no haber sabido
    // buscar al vendedor sería peor que no comprobarlo.
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: true });
    assert.equal(r.puede, true);
  });

  test('el dinero sin depositar sigue mandando sobre esto', () => {
    // El orden importa: decirle que faltan datos del vendedor cuando lo que
    // pasa es que el cliente no ha pagado manda a arreglar lo que no es.
    const r = sePuedeLiberar({ estado: 'pendiente', verificadoEnAlemania: true, vendedor: { nombre: 'Alguien' } });
    assert.equal(r.motivo, 'sin_pagar');
  });

  test('y el coche sin ver, también', () => {
    const r = sePuedeLiberar({ estado: 'retenido', verificadoEnAlemania: false, vendedor: { nombre: 'Alguien' } });
    assert.equal(r.motivo, 'sin_verificar');
  });
});

describe('cómo se escribe lo que falta', () => {
  test('uno solo, tal cual', () => {
    assert.equal(escritoEnLista(['el IBAN']), 'el IBAN');
  });

  test('dos, con una «y»', () => {
    assert.equal(escritoEnLista(['el IBAN', 'el correo']), 'el IBAN y el correo');
  });

  test('tres, con comas y una «y» al final', () => {
    assert.equal(escritoEnLista(['el IBAN', 'el NIF', 'el correo']), 'el IBAN, el NIF y el correo');
  });

  test('ninguno, nada', () => {
    assert.equal(escritoEnLista([]), '');
  });
});
