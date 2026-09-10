/**
 * El encargo nace sin firmar, y sin firma no se factura.
 *
 * Lo que se protege es lo que había antes: al pulsar «Abrir encargo» el ERP se
 * escribía a sí mismo una fecha en `firmado_at`, y de esa fecha colgaban los
 * 299 € de la gestión y los 150 € de la cancelación. Detrás no había nada.
 *
 * Se comprueba sobre la fuente y no con una base falsa porque lo que hay que
 * proteger es **que nadie vuelva a poner esa fecha ahí**: una base de mentira
 * diría que todo va bien mientras el INSERT la escribiera otra vez.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENCARGOS = readFileSync(join(import.meta.dirname, 'encargos.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/** El endpoint que abre el encargo, de principio a fin. */
const ABRIR = (() => {
  const desde = ENCARGOS.indexOf("'/encargos',");
  assert.ok(desde > 0, 'no encuentro el endpoint de abrir encargo');
  const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
  return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
})();

describe('abrir un encargo no es firmarlo', () => {
  test('el INSERT no escribe la fecha de firma', () => {
    /*
     * Es el fallo entero en una línea. Mientras `firmado_at` esté en la lista
     * de columnas del INSERT, el ERP se está inventando la fecha de la que
     * cuelga todo lo que le cobramos.
     */
    const columnas = ABRIR.slice(
      ABRIR.indexOf('INSERT INTO erp_encargos_venta'),
      ABRIR.indexOf('VALUES'),
    );
    assert.ok(columnas.length > 0, 'no encuentro el INSERT');
    assert.doesNotMatch(columnas, /firmado_at/, 'el encargo vuelve a nacer firmado');
  });

  test('ni el plazo de los 30 días', () => {
    // `libre_desde` se calcula desde la firma. Sin firma no ha empezado a
    // correr, y ponerlo aquí regalaría un mes de penalización.
    const columnas = ABRIR.slice(
      ABRIR.indexOf('INSERT INTO erp_encargos_venta'),
      ABRIR.indexOf('VALUES'),
    );
    assert.doesNotMatch(columnas, /libre_desde/, 'el plazo empieza sin que haya firmado');
  });

  test('pero sí le da su número de mandato', () => {
    // Sin número no hay forma de referirse al papel que el cliente firmó.
    assert.match(ABRIR, /mandato_id/);
    assert.match(ABRIR, /siguienteDeSerie\(/);
  });
});

describe('apuntar la firma', () => {
  const FIRMADO = (() => {
    const desde = ENCARGOS.indexOf("'/encargos/:id/firmado'");
    assert.ok(desde > 0, 'no encuentro el endpoint de la firma');
    const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('exige decir cómo nos consta', () => {
    /*
     * Una fecha sola es lo que había antes. Si este endpoint la aceptara sin
     * el «cómo», habríamos movido el problema de sitio sin arreglarlo.
     */
    assert.match(FIRMADO, /esUnaFirma\(como\)/);
    assert.match(FIRMADO, /falta_como_firmo/);
  });

  test('y no admite una fecha del futuro', () => {
    /*
     * Un dedo de más en el año adelanta la fecha y con ella los 30 días: se le
     * podría cobrar la penalización durante un año sin que la pantalla
     * enseñara nada raro.
     */
    assert.match(FIRMADO, /fecha_en_el_futuro/);
  });

  test('es ahí donde empieza a correr el plazo', () => {
    // Y desde la fecha que se apunte, no desde hoy: apuntarlo tarde no puede
    // regalar un mes.
    assert.match(FIRMADO, /libreDesde\(cuando,/);
    assert.match(FIRMADO, /SET firmado_at = \$2/);
  });
});

describe('al cerrar se mira la firma de verdad', () => {
  /*
   * El fallo que esto caza, y que ya pasó una vez: el cierre le pasaba a
   * `loQueSeLeFactura` tres campos elegidos a mano. Al añadir el mandato eso
   * dejó de valer —faltaba `firma_como`— y la regla nueva daba «sin firmar»
   * siempre, así que **no se facturaba nunca**, ni a quien había firmado.
   *
   * No rompe nada visible: el cierre funciona, el correo sale, y simplemente no
   * se cobra. De los fallos posibles, el que menos chilla.
   */
  const CERRAR = (() => {
    const desde = ENCARGOS.indexOf("'/encargos/:id/cerrar'");
    assert.ok(desde > 0, 'no encuentro el endpoint de cerrar');
    const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('se le pasa la fila entera, no unos campos elegidos a mano', () => {
    assert.match(CERRAR, /loQueSeLeFactura\(motivo, e\)/);
  });

  test('y no una copia recortada', () => {
    // Reconstruir el objeto a mano es lo que hizo que se perdiera un campo.
    assert.doesNotMatch(
      CERRAR,
      /loQueSeLeFactura\(motivo, \{/,
      'vuelve a construirse un objeto a mano: se perderá el siguiente campo que se añada',
    );
  });
});

describe('el aviso de los que no han firmado', () => {
  test('se cuentan, o la línea de Pendientes no diría nada', () => {
    assert.match(ENCARGOS, /if \(!estaFirmado\(fila\)\) cuenta\.encargos_sin_firmar/);
  });

  test('y la consulta trae el dato que hace falta para saberlo', () => {
    /*
     * El fallo silencioso de esta familia: contar con `estaFirmado` sobre una
     * fila que no trae `firma_como`. Saldrían todos como sin firmar, para
     * siempre y sin que nadie lo notara.
     */
    assert.match(ENCARGOS, /SELECT e\.firmado_at, e\.acepto_el_precio, e\.firma_como/);
  });
});

describe('los correos salen de verdad', () => {
  /*
   * Del encargo en adelante no salía ninguno. Escribir las plantillas y no
   * llamarlas es el mismo silencio de antes con más código: se ve bonito en el
   * fichero de correos y al cliente no le llega nada.
   */
  const IDCARS = readFileSync(join(import.meta.dirname, 'idcars.ts'), 'utf8')
    .replace(/\r\n/g, '\n');

  test('el del mandato, con el documento adjunto', () => {
    // Sin adjunto es un correo pidiendo que firme algo que no va dentro.
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/mandato/enviar'"));
    assert.match(trozo, /elCorreoDelMandato\(/);
    assert.match(trozo, /attachments:/);
    assert.match(trozo, /comoSeLlamaElFichero\(/);
  });

  test('y sus importes salen de la fila, no de las constantes de hoy', () => {
    /*
     * Un mandato firmado por 299 € sigue siendo de 299 € aunque mañana se suba
     * la tarifa. El correo tiene que decir lo que dice su papel.
     */
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/mandato/enviar'"));
    assert.match(trozo, /fee_gestion: Number\(e\.fee_gestion\)/);
    assert.match(trozo, /fee_cancelacion: Number\(e\.fee_cancelacion\)/);
  });

  test('el del cierre lleva el importe que se acaba de facturar', () => {
    // Recalcularlo aquí es como el correo y la factura acaban diciendo cifras
    // distintas.
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/cerrar'"));
    assert.match(trozo, /elCorreoDelCierre\(/);
    assert.match(trozo, /importe: factura\?\.total \?\? 0/);
  });

  test('y sale después de cerrar, no antes', () => {
    /*
     * Antes de cerrar, un fallo del correo dejaría al cliente avisado de un
     * cierre que no ocurrió. Después, lo peor que pasa es que no se entere por
     * correo de algo que ya está hecho.
     */
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/cerrar'"));
    const cierra = trozo.indexOf('SQL_CIERRA');
    const correo = trozo.indexOf('elCorreoDelCierre(');
    assert.ok(cierra > 0 && correo > 0);
    assert.ok(cierra < correo, 'se avisa del cierre antes de cerrarlo');
  });

  test('ninguno de los dos tumba la operación si falla', () => {
    // El cierre ya está hecho y la factura emitida: que el correo reviente no
    // puede hacer que la pantalla diga que no se cerró.
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/cerrar'"));
    assert.match(trozo, /sin avisar del cierre/);
  });

  test('el de publicado solo si el coche lo vendemos nosotros', () => {
    /*
     * Un particular que publica su propio IDCar no nos ha encargado nada, y
     * este correo le prometería que atendemos sus llamadas.
     */
    assert.match(ENCARGOS, /export async function avisaDeQueSePublico/);
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf('export async function avisaDeQueSePublico'));
    assert.match(trozo, /FROM erp_encargos_venta e/);
    assert.match(trozo, /e\.cerrado_at IS NULL/);
  });

  test('y solo la primera vez que se publica', () => {
    // Sin esto, cada retoque del anuncio le manda otro correo.
    assert.match(IDCARS, /if \(!existing\.rows\.length\) \{\s*\n\s*avisaDeQueSePublico\(/);
  });
});

describe('vender abre la transferencia', () => {
  /*
   * En el mandato que el cliente firma pone que hacemos el contrato y la
   * transferencia en la DGT. En la guía también. Y no la abría nadie: el
   * trámite existe, pero salta cuando un **lead** pasa a «Vendido», y este
   * flujo cierra encargos.
   *
   * Se cobraban los 299 € y el papel prometido no existía — y al final del
   * todo, cuando el cliente ya lo da por hecho.
   */
  const TRAMITES = readFileSync(join(import.meta.dirname, 'tramites.ts'), 'utf8')
    .replace(/\r\n/g, '\n');

  const CERRAR = (() => {
    const desde = ENCARGOS.indexOf("'/encargos/:id/cerrar'");
    const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('al cerrar como vendido, se abre', () => {
    assert.match(CERRAR, /if \(motivo === 'vendido'\)/);
    assert.match(CERRAR, /abreLaTransferenciaDelEncargo\(/);
  });

  test('y solo cuando se vendió', () => {
    /*
     * A quien se va o a quien retiramos nosotros no hay nada que
     * transferirle: el coche sigue siendo suyo. Abrirle una transferencia es
     * un papel que alguien tendrá que ir a cerrar a mano.
     */
    const desdeElIf = CERRAR.slice(CERRAR.indexOf("if (motivo === 'vendido')"));
    const abre = desdeElIf.indexOf('abreLaTransferenciaDelEncargo(');
    const cierraElIf = desdeElIf.indexOf('\n      }');
    assert.ok(abre > 0 && cierraElIf > abre, 'la llamada se ha salido del if');
  });

  test('cuelga del encargo, no del lead', () => {
    /*
     * Un encargo abierto desde la ficha del IDCar no tiene lead. Colgándolo
     * del lead, esa transferencia no se abriría **y no fallaría nada**.
     */
    assert.match(CERRAR, /encargoId: String\(e\.id\)/);
    assert.match(TRAMITES, /encargoId: datos\.encargoId/);
  });

  test('y el encargo es el sitio preferido sobre el lead', () => {
    // El lead es la petición; el encargo es el mandato, que es lo que tiene el
    // coche, el cliente y la venta.
    assert.match(
      TRAMITES,
      /datos\.pedidoId \? 'pedido_id' : datos\.encargoId \? 'encargo_id' : 'lead_id'/,
    );
  });

  test('sin nada de lo que colgar, se dice en vez de callarse', () => {
    /*
     * Esto se saltaba en silencio dentro del bucle: quien llamaba recibía una
     * lista vacía igual que si ya estuvieran todos abiertos. «Ya estaban» y
     * «no se ha abierto ninguno» son cosas muy distintas.
     */
    assert.match(TRAMITES, /no se abre nada: no hay pedido, encargo ni lead/);
  });

  test('no se abre dos veces la misma', () => {
    // Cerrar dos veces, o un encargo que se reabre, no puede dejar dos
    // transferencias del mismo coche.
    assert.match(TRAMITES, /idx_tramites_encargo_tipo/);
    assert.match(TRAMITES, /ON erp_tramites \(encargo_id, tipo\) WHERE encargo_id IS NOT NULL/);
  });

  test('y la columna existe y se lee', () => {
    // Escribirla y no devolverla dejaría el trámite abierto y sin forma de
    // saber de qué encargo es.
    assert.match(TRAMITES, /ADD COLUMN IF NOT EXISTS encargo_id TEXT/);
    assert.match(TRAMITES, /pedido_id, lead_id, encargo_id,/);
  });

  test('no tumba el cierre si falla', () => {
    // El cierre y la factura ya están hechos: que esto falle no puede hacer que
    // la pantalla diga que el encargo no se cerró.
    assert.match(CERRAR, /sin transferencia/);
  });
});

describe('cerrar quita el anuncio', () => {
  /*
   * No lo hacía nadie, y de ahí colgaba el aviso de retirar de los portales:
   * dispara cuando el coche deja de estar activo en nuestro escaparate, así que
   * **no saltaba nunca**. La alarma estaba puesta y el sensor sin conectar.
   */
  const CERRAR = (() => {
    const desde = ENCARGOS.indexOf("'/encargos/:id/cerrar'");
    const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('se quita, acabe como acabe', () => {
    // Fuera de cualquier `if (motivo === ...)`: en ese anuncio sale nuestro
    // teléfono, y los tres finales significan que ya no gestionamos ese coche.
    assert.match(CERRAR, /comoSeQuitaElAnuncio\(motivo\)/);
  });

  test('y su garaje deja de decir que está publicado', () => {
    assert.match(CERRAR, /SQL_YA_NO_ESTA_LISTADO/);
  });

  test('con el identificador que usa el marketplace para un IDCar', () => {
    // `idcar-<id>` es como lo escribe PopCar al publicar. Con otro, la consulta
    // corre, no encuentra nada y no falla.
    assert.match(CERRAR, /const offerId = `idcar-\$\{String\(e\.vehicle_id\)\}`/);
  });

  test('va antes que el correo y que la transferencia', () => {
    /*
     * Si algo de lo de después falla, lo que no puede quedarse es el anuncio
     * vivo: es lo único que sigue trayendo gente a un coche que ya no está.
     */
    const quita = CERRAR.indexOf('comoSeQuitaElAnuncio(');
    const correo = CERRAR.indexOf('elCorreoDelCierre(');
    const transfer = CERRAR.indexOf('abreLaTransferenciaDelEncargo(');
    assert.ok(quita > 0 && correo > 0 && transfer > 0);
    assert.ok(quita < transfer, 'la transferencia va antes de quitar el anuncio');
    assert.ok(quita < correo, 'el correo va antes de quitar el anuncio');
  });

  test('y si falla, no tumba el cierre', () => {
    // El encargo ya está cerrado y la factura emitida.
    assert.match(CERRAR, /sin quitar el anuncio/);
  });
});

describe('el taller nos factura, y las cuentas se enteran', () => {
  /*
   * El coste se guardaba en la ficha de la revisión y de ahí no salía. Las
   * cuentas se hacen con facturas, así que esos 60 € por coche captado no
   * aparecían en ningún sitio: el margen por coche salía de más, la factura del
   * taller nunca entraba en «facturas de proveedor sin llegar», y el gasto que
   * **justifica** los 150 € de cancelación era el que los libros no veían.
   *
   * El perito, la gestoría y el transportista ya lo hacían. El taller era el
   * único de los cuatro que no.
   */
  const REVISIONES = readFileSync(join(import.meta.dirname, 'revisiones-taller.ts'), 'utf8')
    .replace(/\r\n/g, '\n');

  test('se apunta la factura esperada', () => {
    assert.match(REVISIONES, /apuntaFacturaEsperada\(\{/);
    assert.match(REVISIONES, /proveedor: String\(rev\.taller/);
  });

  test('al quedar hecha, no al dar la cita', () => {
    // Hasta que no está hecho, el taller no tiene nada que cobrar.
    assert.match(REVISIONES, /if \(estado === 'Hecha'\) \{[\s\S]{0,1400}apuntaFacturaEsperada\(/);
  });

  test('con el importe de la ficha, no con la constante a secas', () => {
    /*
     * La constante es lo que cuesta hoy en Norauto. Si a esta revisión se le
     * puso otro importe —otro taller, otro precio—, la factura esperada tiene
     * que ser esa y no la de la lista.
     */
    assert.match(REVISIONES, /importe: \(rev\.coste as string \| null\) \?\? LO_QUE_CUESTA/);
  });

  test('y con el coche, para poder imputarla', () => {
    // Un gasto sin coche no se puede meter en el margen de ningún coche, que
    // es justo la pregunta que esto viene a poder contestar.
    assert.match(REVISIONES, /vehiculo: titulo\.trim\(\)/);
  });

  test('el concepto lleva el día', () => {
    /*
     * `apuntaFacturaEsperada` reconoce el servicio por proveedor + concepto +
     * coche. Sin fecha, el mismo coche llevado al mismo taller el año que viene
     * se plegaria sobre el del año pasado y nos comeríamos 60 € en silencio —
     * el mismo fallo que esto arregla.
     */
    assert.match(REVISIONES, /Revisión mecánica del vehículo · \$\{dia\}/);
    assert.match(REVISIONES, /rev\.hecha_at/);
  });

  test('y si falla, no tumba el guardar el resultado', () => {
    // Lo que dijo el taller ya está apuntado, y es lo que decide si se publica.
    assert.match(REVISIONES, /sin factura esperada/);
  });
});

describe('el contrato de compraventa', () => {
  /*
   * En el mandato que el cliente firma pone que hacemos el contrato y la
   * transferencia. La transferencia ya sale sola; el contrato no existía — se
   * prometía por escrito y no lo generaba nadie.
   */
  const CERRAR = (() => {
    const desde = ENCARGOS.indexOf("'/encargos/:id/cerrar'");
    const siguiente = ENCARGOS.indexOf('encargosRouter.', desde + 20);
    return ENCARGOS.slice(desde, siguiente > 0 ? siguiente : undefined);
  })();

  test('el número se da al vender, no antes', () => {
    /*
     * Un contrato de una venta que no ha pasado no es nada, y gastaría un
     * número de la serie.
     */
    assert.match(CERRAR, /motivo === 'vendido' && !e\.contrato_id/);
    assert.match(CERRAR, /SERIE_DEL_CONTRATO/);
  });

  test('y si la serie falla, el cierre sigue', () => {
    // Cerrar emite una factura. No puede quedarse esperando a un numero.
    assert.match(CERRAR, /siguienteDeSerie\([\s\S]{0,200}\)\.catch\(\(\) => ''\)/);
  });

  test('los datos que faltan se guardan aparte del cierre', () => {
    /*
     * Cerrar no puede quedarse esperando a que alguien encuentre un carné. Se
     * rellenan cuando se tengan, antes o después.
     */
    assert.match(ENCARGOS, /'\/encargos\/:id\/contrato'/);
    assert.match(ENCARGOS, /vendedor_dni\s+= COALESCE\(\$2, vendedor_dni\)/);
  });

  test('el comprador sale de la visita que acabó en venta', () => {
    /*
     * Es un dato que ya tenemos. Volver a pedirlo seria pedirle a quien imprime
     * que copie un nombre que esta dos pantallas mas alla.
     */
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/contrato'"));
    assert.match(trozo, /resultado = 'compro'/);
    assert.match(trozo, /e\.comprador_nombre \?\? compra\.rows\[0\]\?\.buyer_name/);
  });

  test('pero el escrito a mano manda sobre el de la visita', () => {
    /*
     * Quien vino a verlo y quien firma no siempre son la misma persona. El
     * orden del `??` es la regla entera.
     */
    const trozo = ENCARGOS.slice(ENCARGOS.indexOf("'/encargos/:id/contrato'"));
    assert.doesNotMatch(trozo, /buyer_name \?\? [\s\S]{0,40}comprador_nombre/);
  });

  test('y se dice qué falta, sin bloquear nada', () => {
    // El documento sale igual con los huecos: se dice para que quien imprime
    // sepa qué va a escribir a mano.
    assert.match(ENCARGOS, /falta_del_contrato:/);
    assert.match(ENCARGOS, /loQueFaltaDelContrato\(\{/);
  });

  test('solo se calcula para los vendidos', () => {
    // A quien se fue o a quien retiramos no hay contrato que hacerle.
    assert.match(ENCARGOS, /cerrado\.rows\[0\]\?\.motivo_cierre === 'vendido'\s*\n?\s*\?\s*loQueFaltaDelContrato/);
  });
});
