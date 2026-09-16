/**
 * La revisión del taller.
 *
 * Lo que se protege: que no salga un anuncio diciendo que el coche está
 * comprobado sin que nadie lo haya comprobado. Es la promesa que separa nuestro
 * anuncio de uno de Milanuncios, y es la única puerta que no depende del
 * cliente.
 */
/*
 * El servidor de producción va en UTC, y esta prueba también.
 *
 * Sin esto, las de la hora pasaban por accidente en un portátil español: la
 * zona del sistema ya era la de Madrid, así que daba igual pedirla o no. Se
 * comprobó quitándole la zona al código —la prueba siguió en verde— y eso es
 * justo el fallo que se escapó con las visitas: en Vercel, a una cita de las
 * 10:00 el correo le ponía las 08:00.
 */
process.env.TZ = 'UTC';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS, RESULTADOS, QUE_TOCA, ETIQUETA, LO_QUE_CUESTA,
  esUnEstado, esUnResultado, elCocheEstaComprobado, porQueNoEstaComprobado,
  sigueEsperandoAlTaller, elTallerLoTumbo,
  ENSURE_UNA_VIVA, ENSURE_COLUMNAS, SQL_LA_DEL_COCHE,
  elDiaDeLaCita, laHoraDeLaCita, porQueNoSeLePuedeAvisar,
  LO_QUE_PUEDE_PEDIR, LO_QUE_PIDIO, esLoQuePuedePedir, elClienteEsperaRespuesta,
  elRecordatorioToca, SQL_CANDIDATAS_A_RECORDATORIO, CUANTO_ANTES_SE_RECUERDA_MS,
} from './revision-del-taller.js';

describe('por dónde va', () => {
  test('tres estados, y ninguno más', () => {
    // Entre «encargada» y «hecha» no hay nada que el ERP pueda saber: cuando el
    // coche está en el taller, lo que hay es una llamada.
    assert.deepEqual([...ESTADOS], ['Por llevar', 'En el taller', 'Hecha']);
    for (const e of ESTADOS) assert.ok(QUE_TOCA[e], `falta qué toca en ${e}`);
  });

  test('y lo que no es un estado no cuela', () => {
    assert.equal(esUnEstado('Hecha'), true);
    assert.equal(esUnEstado('  En el taller  '), true);
    for (const raro of ['hecha', 'Encargada', '', null, undefined]) {
      assert.equal(esUnEstado(raro), false, String(raro));
    }
  });

  test('tres resultados, con su nombre', () => {
    assert.deepEqual([...RESULTADOS], ['bien', 'con_reparos', 'no_se_puede_vender']);
    for (const r of RESULTADOS) assert.ok(ETIQUETA[r], `falta la etiqueta de ${r}`);
  });
});

describe('cuándo el coche está comprobado', () => {
  test('cuando está hecha y salió bien', () => {
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'bien' }), true);
  });

  test('«con reparos» también deja vender', () => {
    /*
     * No es un no: es un coche que se vende contando lo que tiene. La mayoría
     * de los de diez años caen ahí, y tratarlo como un fallo dejaría fuera medio
     * catálogo.
     */
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'con_reparos' }), true);
  });

  test('pero «no se puede vender» cierra la puerta', () => {
    // Es la única de las seis que no depende del cliente: lo haya traído todo o
    // no, si el taller dice que no, no se publica.
    const r = { estado: 'Hecha', resultado: 'no_se_puede_vender' };
    assert.equal(elCocheEstaComprobado(r), false);
    assert.match(porQueNoEstaComprobado(r), /así no se puede vender/);
  });

  test('encargada y sin resultado NO vale', () => {
    /*
     * Lo que se promete en el anuncio no es que lo hayamos llevado: es que lo
     * han mirado. Una revisión sin resultado es un coche sin revisar con papeleo
     * encima.
     */
    assert.equal(elCocheEstaComprobado({ estado: 'En el taller' }), false);
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: null }), false);
    assert.match(porQueNoEstaComprobado({ estado: 'Hecha' }), /nadie ha apuntado cómo salió/);
  });

  test('y sin revisión, tampoco', () => {
    assert.equal(elCocheEstaComprobado(null), false);
    assert.equal(elCocheEstaComprobado(undefined), false);
    assert.match(porQueNoEstaComprobado(null), /No se ha llevado al taller/);
  });

  test('un resultado inventado no abre la puerta', () => {
    // El fallo fácil: comprobar solo que `resultado` no sea el malo. Con eso,
    // cualquier texto raro pasaría por bueno.
    assert.equal(elCocheEstaComprobado({ estado: 'Hecha', resultado: 'regular' }), false);
    assert.equal(esUnResultado('regular'), false);
  });

  test('el porqué se puede leer por teléfono', () => {
    // Al otro lado hay alguien explicándoselo al cliente, y «false» no se
    // explica.
    assert.equal(porQueNoEstaComprobado({ estado: 'Hecha', resultado: 'bien' }), '');
    assert.match(porQueNoEstaComprobado({ estado: 'Por llevar' }), /Falta darle cita/);
  });
});

describe('a quién le toca esperar', () => {
  test('sin revisión y con el coche en el taller, se espera', () => {
    assert.equal(sigueEsperandoAlTaller(null), true);
    assert.equal(sigueEsperandoAlTaller({ estado: 'Por llevar' }), true);
    assert.equal(sigueEsperandoAlTaller({ estado: 'En el taller' }), true);
  });

  test('en cuanto está hecha, ya no', () => {
    /*
     * Si no, el coche seguiría saliendo en «listos para el taller» el resto de
     * su vida, ya publicado y ya revisado.
     */
    assert.equal(sigueEsperandoAlTaller({ estado: 'Hecha', resultado: 'bien' }), false);
  });

  test('y el tumbado tampoco espera, aunque no esté comprobado', () => {
    /*
     * Esta es la que no se puede escribir como «lo contrario de comprobado».
     * Un coche rechazado tampoco está comprobado, pero no espera a nadie: lo
     * que necesita es una llamada, y en la lista de los que esperan al taller
     * se quedaría para siempre.
     */
    const tumbado = { estado: 'Hecha', resultado: 'no_se_puede_vender' };
    assert.equal(elCocheEstaComprobado(tumbado), false);
    assert.equal(sigueEsperandoAlTaller(tumbado), false);
  });
});

describe('el que el taller tumba', () => {
  test('se distingue de todos los demás', () => {
    // Su dueño tiene un encargo firmado y está esperando a ver su anuncio, y
    // ese anuncio no va a salir.
    assert.equal(elTallerLoTumbo({ estado: 'Hecha', resultado: 'no_se_puede_vender' }), true);
    for (const otro of [
      null,
      { estado: 'Por llevar' },
      { estado: 'En el taller' },
      { estado: 'Hecha', resultado: 'bien' },
      { estado: 'Hecha', resultado: 'con_reparos' },
    ]) {
      assert.equal(elTallerLoTumbo(otro), false, JSON.stringify(otro));
    }
  });

  test('uno todavía en el taller no cuenta, aunque acabe mal', () => {
    // Mientras no esté hecha no hay nada que contarle al cliente.
    assert.equal(elTallerLoTumbo({ estado: 'En el taller', resultado: 'no_se_puede_vender' }), false);
  });
});

describe('lo que cuesta', () => {
  test('sesenta euros, que es lo que da Norauto', () => {
    // Se le hace a todos los captados, vendan o no. Ese gasto es lo que cubre
    // el fee de cancelación.
    assert.equal(LO_QUE_CUESTA, 60);
  });
});

describe('una revisión viva por coche', () => {
  test('no se puede dar cita dos veces', () => {
    // Con dos fichas, la que decide si se publica es la que salga primero.
    assert.match(ENSURE_UNA_VIVA, /ON erp_revisiones_taller \(vehicle_id\)/);
  });

  test('pero las hechas no estorban a una nueva', () => {
    // Un coche que vuelve el año que viene se revisa otra vez.
    assert.match(ENSURE_UNA_VIVA, /WHERE estado <> 'Hecha'/);
  });

  test('y se lee la más reciente', () => {
    assert.match(SQL_LA_DEL_COCHE, /ORDER BY created_at DESC LIMIT 1/);
  });
});

describe('la cita que se le cuenta al cliente', () => {
  test('la tabla guarda dónde está el taller y si ya se le dijo', () => {
    /*
     * La ficha tenía taller y día, que es lo que nos hace falta a nosotros. Al
     * que tiene que llevar el coche le falta la dirección, y a quien atiende el
     * encargo le falta saber si alguien se lo ha dicho ya.
     */
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS direccion/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS avisado_at/);
  });

  test('y se añaden con ALTER, que la tabla ya existe', () => {
    // Un CREATE TABLE IF NOT EXISTS no toca una tabla que está: en producción
    // las columnas nuevas no habrían aparecido nunca.
    assert.match(ENSURE_COLUMNAS, /ALTER TABLE erp_revisiones_taller/);
  });

  test('el día y la hora salen en la de España, no en la del servidor', () => {
    /*
     * En Vercel el servidor va en UTC. A una cita de las 10:00 el correo le
     * pondría las 08:00, y la pantalla la enseñaría bien —eso lo pinta el
     * navegador—, así que las dos dirían cosas distintas y solo se vería
     * mirando el correo que le llega al cliente. Ya pasó con las visitas.
     *
     * Las 08:00 de Madrid en septiembre son las 06:00 en UTC.
     */
    const cita = '2026-09-22T06:00:00.000Z';
    assert.equal(laHoraDeLaCita(cita), '08:00');
    assert.match(elDiaDeLaCita(cita), /22 de septiembre/);
  });

  test('y el día no se va al anterior con una cita de madrugada', () => {
    // 00:30 de Madrid es el día anterior en UTC.
    const cita = '2026-09-21T22:30:00.000Z';
    assert.match(elDiaDeLaCita(cita), /22 de septiembre/);
    assert.equal(laHoraDeLaCita(cita), '00:30');
  });
});

describe('cuándo se le puede mandar la cita', () => {
  test('con taller y día, sí', () => {
    assert.equal(porQueNoSeLePuedeAvisar({ taller: 'Norauto', cita_at: '2026-09-22T08:00:00Z' }), '');
  });

  test('sin día no: le diría que tiene cita sin decirle cuándo', () => {
    // Y entonces tiene que llamar para preguntar, con lo que el correo no ha
    // ahorrado nada.
    assert.equal(
      porQueNoSeLePuedeAvisar({ taller: 'Norauto', cita_at: null }),
      'Falta el día de la cita',
    );
  });

  test('sin taller tampoco', () => {
    assert.equal(
      porQueNoSeLePuedeAvisar({ taller: '  ', cita_at: '2026-09-22T08:00:00Z' }),
      'Falta a qué taller se lleva',
    );
  });

  test('y sin revisión, menos', () => {
    assert.match(porQueNoSeLePuedeAvisar(null), /No hay ninguna cita/);
  });

  test('la dirección no se exige', () => {
    // Hay talleres que todo el mundo ubica. Se manda si está, y si no, esa
    // línea no sale: lo que no se hace es inventarla.
    assert.equal(
      porQueNoSeLePuedeAvisar({ taller: 'Norauto Alcobendas', cita_at: '2026-09-22T08:00:00Z', direccion: '' }),
      '',
    );
  });
});

describe('cuando el cliente no puede ir', () => {
  test('la tabla guarda qué pidió, cuándo y por qué', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS cliente_pidio\b/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS cliente_pidio_at/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS cliente_motivo/);
  });

  test('solo puede pedir dos cosas', () => {
    /*
     * Cambiarla o quitarla. No hay «elige otra hora»: las horas las da el taller
     * por teléfono y no las tenemos, así que un calendario prometería algo que
     * no se puede cumplir.
     */
    assert.deepEqual([...LO_QUE_PUEDE_PEDIR], ['cambio', 'cancelar']);
    for (const p of LO_QUE_PUEDE_PEDIR) assert.ok(LO_QUE_PIDIO[p], `falta cómo se dice ${p}`);
  });

  test('y lo que no es una de las dos no cuela', () => {
    assert.equal(esLoQuePuedePedir('cambio'), true);
    assert.equal(esLoQuePuedePedir(' cancelar '), true);
    for (const raro of ['borrar', 'Cambio', '', null, undefined, 42]) {
      assert.equal(esLoQuePuedePedir(raro), false, String(raro));
    }
  });

  test('con una petición viva, alguien tiene que contestar', () => {
    assert.equal(
      elClienteEsperaRespuesta({ estado: 'En el taller', cliente_pidio: 'cambio' }),
      true,
    );
  });

  test('pero una revisión ya hecha no espera a nadie', () => {
    /*
     * Pidió el cambio y el coche acabó pasando por el taller igual. Sin esto, el
     * aviso se quedaría encendido para siempre sobre algo que ya ocurrió — y un
     * aviso que no se apaga es un aviso que se deja de mirar.
     */
    assert.equal(
      elClienteEsperaRespuesta({ estado: 'Hecha', cliente_pidio: 'cancelar' }),
      false,
    );
  });

  test('y sin petición, nada', () => {
    assert.equal(elClienteEsperaRespuesta({ estado: 'En el taller', cliente_pidio: null }), false);
    assert.equal(elClienteEsperaRespuesta(null), false);
  });
});

describe('el recordatorio de la cita', () => {
  /*
   * La cita se le cuenta cuando se cierra, y entre medias pasan días. El que la
   * apuntó en su calendario no necesita nada; el que no, no vuelve a abrir aquel
   * correo — y el día señalado el coche no aparece.
   */
  const AHORA = new Date('2026-09-17T06:00:00.000Z');
  const viva = (extra: Record<string, unknown> = {}) => ({
    estado: 'En el taller',
    // Mañana a las 18:00 de Madrid: treinta y seis horas justas de margen.
    cita_at: '2026-09-18T16:00:00.000Z',
    avisado_at: '2026-09-10T09:00:00.000Z',
    recordado_at: null,
    cliente_pidio: null,
    ...extra,
  });

  test('el día de antes, sí', () => {
    assert.equal(elRecordatorioToca(viva(), AHORA), true);
  });

  test('y el mismo día también, que es el que más falta hace', () => {
    // Una cita cerrada con poca antelación no tiene día de antes.
    assert.equal(elRecordatorioToca(viva({ cita_at: '2026-09-17T14:00:00.000Z' }), AHORA), true);
  });

  test('pero no cuatro días antes', () => {
    // Un recordatorio que llega demasiado pronto es el que hay que recordar.
    assert.equal(elRecordatorioToca(viva({ cita_at: '2026-09-21T10:00:00.000Z' }), AHORA), false);
  });

  test('ni dos veces', () => {
    // El segundo correo de lo mismo enseña a no leer el primero.
    assert.equal(elRecordatorioToca(viva({ recordado_at: '2026-09-17T05:00:00.000Z' }), AHORA), false);
  });

  test('ni de una cita que ya pasó', () => {
    assert.equal(elRecordatorioToca(viva({ cita_at: '2026-09-16T10:00:00.000Z' }), AHORA), false);
  });

  test('ni de una que no se le ha contado', () => {
    // No se recuerda algo que nunca se dijo: sería la primera noticia.
    assert.equal(elRecordatorioToca(viva({ avisado_at: null }), AHORA), false);
  });

  test('ni justo después de habérsela contado', () => {
    /*
     * Dar la cita a las 9:00 para el día siguiente dispararía el recordatorio en
     * la pasada siguiente: dos correos casi seguidos diciendo lo mismo.
     */
    assert.equal(elRecordatorioToca(viva({ avisado_at: '2026-09-17T05:00:00.000Z' }), AHORA), false);
  });

  test('ni si ya nos ha pedido cambiarla', () => {
    /*
     * «No olvides llevarlo mañana» después de haberle dicho «te llamamos» es
     * contradecirnos, y el que lo lee ya no sabe a qué atenerse.
     */
    assert.equal(elRecordatorioToca(viva({ cliente_pidio: 'cambio' }), AHORA), false);
    assert.equal(elRecordatorioToca(viva({ cliente_pidio: 'cancelar' }), AHORA), false);
  });

  test('ni de una revisión ya hecha', () => {
    assert.equal(elRecordatorioToca(viva({ estado: 'Hecha' }), AHORA), false);
  });

  test('y una fecha rota no manda nada', () => {
    assert.equal(elRecordatorioToca(viva({ cita_at: 'el jueves' }), AHORA), false);
    assert.equal(elRecordatorioToca(null, AHORA), false);
  });
});

describe('a quién se le pregunta', () => {
  test('la consulta ya descarta lo que no puede tocar', () => {
    // Traerse la tabla entera para descartarlas en JavaScript sería pedirle a la
    // base todas las revisiones de la historia una vez al día.
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /r\.estado <> 'Hecha'/);
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /r\.avisado_at IS NOT NULL/);
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /r\.recordado_at IS NULL/);
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /r\.cita_at > NOW\(\)/);
  });

  test('y trae a quién escribirle', () => {
    // Sin el correo del encargo no hay a quién mandárselo, y la consulta sería
    // un paseo por la tabla para no hacer nada.
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /e\.cliente_email/);
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /e\.cerrado_at IS NULL/);
  });

  test('la ventana de la consulta y la de la regla dicen lo mismo', () => {
    /*
     * Si la consulta mirase 24 horas y la regla 36, las citas de entre medias no
     * las vería nadie: la regla diría que sí y la consulta no las traería.
     */
    assert.equal(CUANTO_ANTES_SE_RECUERDA_MS / (60 * 60 * 1000), 36);
    assert.match(SQL_CANDIDATAS_A_RECORDATORIO, /INTERVAL '36 hours'/);
  });

  test('y la tabla guarda que ya se recordó', () => {
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS recordado_at/);
  });
});
