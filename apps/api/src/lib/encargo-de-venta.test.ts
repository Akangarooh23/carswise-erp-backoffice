/**
 * Las reglas del encargo de venta.
 *
 * Lo que se protege aquí es que **no se publique el coche de alguien a medias**
 * y que **no se le despublique a alguien que está en plazo**. Las dos son
 * promesas al cliente: la primera es la que hace que el anuncio valga algo, y
 * la segunda es por lo que está pagando.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_HASTA_SALIR_GRATIS, FEE_DE_GESTION, FEE_DE_CANCELACION,
  FRANJAS_MINIMAS, FOTOS_MINIMAS, LAS_CUATRO,
  libreDesde, laPenalizacion, yaSePuedeIrGratis,
  franjasQueValen, lasPuertas, sePuedePublicar, loQueLeFalta,
  AVISAR_CON, tocaLlamarle, soloLeFaltanFranjas,
  type LoQueHay,
} from './encargo-de-venta.js';

const AHORA = new Date('2026-09-09T10:00:00Z');
const enDias = (n: number) => new Date(AHORA.getTime() + n * 86400000).toISOString();

/** Un coche al que no le falta nada. */
const COMPLETO: LoQueHay = {
  matricula: '8888LXR', marca: 'Seat', modelo: 'Ibiza', ano: 2019, kilometros: 74000,
  fotos: FOTOS_MINIMAS,
  papeles: ['circulation_permit', 'technical_sheet', 'itv'],
  informe: 'informe_listo',
  franjas: Array.from({ length: FRANJAS_MINIMAS }, (_, i) => enDias(i + 1)),
};

describe('las franjas', () => {
  test('cuentan las libres de los próximos catorce días', () => {
    assert.equal(franjasQueValen([enDias(1), enDias(13)], AHORA), 2);
  });

  test('las de dentro de un mes no valen', () => {
    // Publicar un coche que solo se puede ver dentro de cinco semanas gasta el
    // interés del comprador y no lo convierte en nada.
    assert.equal(franjasQueValen([enDias(30), enDias(40)], AHORA), 0);
  });

  test('las que ya pasaron, tampoco', () => {
    assert.equal(franjasQueValen([enDias(-1), enDias(-10)], AHORA), 0);
  });

  test('y una hora ilegible no cuenta como hueco', () => {
    // No se puede citar a nadie a una hora que no se sabe cuál es.
    assert.equal(franjasQueValen(['el sábado por la tarde', enDias(2)], AHORA), 1);
  });

  test('la puerta se vuelve a cerrar cuando se gastan', () => {
    /*
     * `franjas` son las **libres**. Según se van reservando, la lista mengua y
     * esta puerta pasa de verde a rojo sola. Es lo que alimenta el aviso de
     * «coches gestionados sin franjas»: un anuncio vivo que nadie puede visitar.
     */
    const gastadas = { ...COMPLETO, franjas: [enDias(1)] };
    const puertas = lasPuertas(gastadas, AHORA);
    assert.equal(puertas.find((p) => p.clave === 'franjas')?.abierta, false);
    assert.equal(sePuedePublicar(puertas), false);
  });
});

describe('las cuatro puertas', () => {
  test('con todo puesto, se puede publicar', () => {
    const puertas = lasPuertas(COMPLETO, AHORA);
    assert.equal(puertas.length, 4);
    assert.deepEqual(puertas.map((p) => p.clave), LAS_CUATRO);
    assert.ok(puertas.every((p) => p.abierta), JSON.stringify(loQueLeFalta(puertas)));
    assert.equal(sePuedePublicar(puertas), true);
  });

  test('sin los papeles del coche, no', () => {
    const puertas = lasPuertas({ ...COMPLETO, papeles: ['itv'] }, AHORA);
    assert.equal(sePuedePublicar(puertas), false);
    assert.match(
      puertas.find((p) => p.clave === 'papeles')!.falta,
      /permiso de circulación y la ficha técnica/,
    );
  });

  test('un informe a medias no es un informe', () => {
    // «capturando» es alguien que abrió la cámara y lo dejó. Publicar con eso
    // sería publicar sin informe, que es lo que nos diferencia de Milanuncios.
    const puertas = lasPuertas({ ...COMPLETO, informe: 'capturando' }, AHORA);
    assert.equal(puertas.find((p) => p.clave === 'informe')?.abierta, false);
    assert.equal(sePuedePublicar(puertas), false);
  });

  test('y uno verificado por el taller, sí', () => {
    for (const estado of ['informe_listo', 'verificada', 'publicada']) {
      const puertas = lasPuertas({ ...COMPLETO, informe: estado }, AHORA);
      assert.equal(puertas.find((p) => p.clave === 'informe')?.abierta, true, estado);
    }
  });

  test('faltan fotos y lo dice contándolas', () => {
    const puertas = lasPuertas({ ...COMPLETO, fotos: FOTOS_MINIMAS - 2 }, AHORA);
    assert.match(puertas.find((p) => p.clave === 'idcar')!.falta, /2 fotos/);
  });

  test('con un coche vacío se le puede decir todo lo que falta de una vez', () => {
    const puertas = lasPuertas({}, AHORA);
    assert.equal(sePuedePublicar(puertas), false);
    assert.equal(loQueLeFalta(puertas).length, 4);
    assert.match(loQueLeFalta(puertas)[0], /la matrícula, la marca, el modelo, el año/);
  });
});

describe('sePuedePublicar mira las cuatro por su nombre', () => {
  test('una lista vacía no autoriza nada', () => {
    /*
     * El error fácil: `puertas.every(p => p.abierta)` sobre una lista ya
     * filtrada —o vacía— dice que sí. Y lo que hay al otro lado de ese sí es
     * publicar el coche de alguien que no ha traído nada.
     */
    assert.equal(sePuedePublicar([]), false);
  });

  test('ni una lista a la que le falte una puerta', () => {
    const puertas = lasPuertas(COMPLETO, AHORA).filter((p) => p.clave !== 'informe');
    assert.equal(puertas.every((p) => p.abierta), true, 'las que quedan sí están abiertas');
    assert.equal(sePuedePublicar(puertas), false, 'pero falta el informe');
  });
});

describe('lo que se firma', () => {
  test('299 € si vendemos, 150 € si se va, 30 días para poder irse gratis', () => {
    assert.equal(FEE_DE_GESTION, 299);
    assert.equal(FEE_DE_CANCELACION, 150);
    assert.equal(DIAS_HASTA_SALIR_GRATIS, 30);
  });

  test('el mandato NO caduca: pasar los 30 días no cierra ni despublica nada', () => {
    /*
     * Se extiende hasta que el cliente lo cancela o hasta que vendemos. Esto
     * estuvo escrito al revés unos días —una fecha de vencimiento a los 30 que
     * despublicaba el coche y le escribía diciéndoselo— y era un invento.
     *
     * Lo único que cambia el día 30 es cuánto se le puede cobrar. Un encargo de
     * hace un año sigue vivo, sigue con sus cuatro puertas y sigue publicable.
     */
    const deHaceUnAño = { firmado_at: new Date(AHORA.getTime() - 365 * 86400000).toISOString(), acepto_el_precio: true };
    assert.equal(laPenalizacion(deHaceUnAño, AHORA), 0, 'ya no se le puede cobrar');
    assert.equal(sePuedePublicar(lasPuertas(COMPLETO, AHORA)), true, 'y su coche se sigue pudiendo publicar');
  });
});

describe('la penalización, que es lo que los 30 días deciden de verdad', () => {
  const firmadoHoy = AHORA.toISOString();
  const firmadoHace = (n: number) => new Date(AHORA.getTime() - n * 86400000).toISOString();

  test('el que NO firmó la cláusula del precio paga desde el día 1', () => {
    // Y no deja de deberla nunca mientras no venda con nosotros.
    assert.equal(laPenalizacion({ firmado_at: firmadoHoy, acepto_el_precio: false }, AHORA), 150);
    assert.equal(laPenalizacion({ firmado_at: firmadoHace(400), acepto_el_precio: false }, AHORA), 150);
  });

  test('nunca llega a poder irse gratis, así que no tiene fecha', () => {
    // `null` aquí quiere decir «nunca», no «no lo sé».
    assert.equal(libreDesde(firmadoHoy, false), null);
  });

  test('el que sí la firmó paga durante los primeros 30 días', () => {
    assert.equal(laPenalizacion({ firmado_at: firmadoHace(29), acepto_el_precio: true }, AHORA), 150);
  });

  test('y a partir del día 30 se va gratis', () => {
    assert.equal(laPenalizacion({ firmado_at: firmadoHace(30), acepto_el_precio: true }, AHORA), 0);
    assert.equal(laPenalizacion({ firmado_at: firmadoHace(90), acepto_el_precio: true }, AHORA), 0);
    assert.equal(yaSePuedeIrGratis({ firmado_at: firmadoHace(30), acepto_el_precio: true }, AHORA), true);
  });

  test('la fecha de firma se cuenta desde el día que firmó', () => {
    const libre = libreDesde('2026-09-09T10:00:00Z', true);
    assert.equal(libre?.toISOString().slice(0, 10), '2026-10-09');
  });

  test('una fecha de firma ilegible NO le perdona la penalización', () => {
    /*
     * Perdonar sale de la puerta equivocada: se dejaría de cobrar por una fila
     * mal escrita y nadie se enteraría. Cobrar de más lo ve el cliente y lo dice.
     */
    assert.equal(laPenalizacion({ firmado_at: 'el martes', acepto_el_precio: true }, AHORA), 150);
    assert.equal(laPenalizacion({ firmado_at: null, acepto_el_precio: true }, AHORA), 150);
  });
});

describe('a quién hay que llamar', () => {
  const firmadoHace = (n: number) => new Date(AHORA.getTime() - n * 86400000).toISOString();

  test('al que le quedan cinco días o menos para poder irse gratis', () => {
    /*
     * El aviso no es una despedida: es lo contrario. Faltan días para que ese
     * cliente pueda vender por su cuenta sin pagarnos nada, así que es el
     * momento de llamarle con un ajuste de precio.
     */
    assert.equal(AVISAR_CON, 5);
    assert.equal(tocaLlamarle({ firmado_at: firmadoHace(24), acepto_el_precio: true }, AHORA), false);
    assert.equal(tocaLlamarle({ firmado_at: firmadoHace(25), acepto_el_precio: true }, AHORA), true);
  });

  test('y al que ya puede, que sigue siendo cliente', () => {
    assert.equal(tocaLlamarle({ firmado_at: firmadoHace(45), acepto_el_precio: true }, AHORA), true);
  });

  test('pero NO al que nunca va a poder irse gratis', () => {
    // No hay ninguna fecha que corra en su contra: llamarle por esto llenaría
    // la lista de gente sin motivo.
    assert.equal(tocaLlamarle({ firmado_at: firmadoHace(200), acepto_el_precio: false }, AHORA), false);
  });

  test('ni a uno sin fecha de firma', () => {
    assert.equal(tocaLlamarle({ firmado_at: null, acepto_el_precio: true }, AHORA), false);
  });
});
