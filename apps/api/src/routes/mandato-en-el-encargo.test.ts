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
