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
  DIAS_DE_EXCLUSIVA, FEE_DE_GESTION, FEE_DE_CANCELACION,
  FRANJAS_MINIMAS, FOTOS_MINIMAS, LAS_CUATRO,
  venceEl, diasQueQuedan, estaVencido, laFechaEstaRota,
  franjasQueValen, lasPuertas, sePuedePublicar, loQueLeFalta,
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

describe('lo que se firma', () => {
  test('treinta días, 299 € al cierre y 150 € si se sale', () => {
    assert.equal(DIAS_DE_EXCLUSIVA, 30);
    assert.equal(FEE_DE_GESTION, 299);
    assert.equal(FEE_DE_CANCELACION, 150);
  });

  test('la exclusiva vence treinta días después de firmar', () => {
    const vence = venceEl('2026-09-09T10:00:00Z');
    assert.equal(vence?.toISOString().slice(0, 10), '2026-10-09');
  });

  test('y una fecha de firma ilegible no inventa un vencimiento', () => {
    assert.equal(venceEl('el martes'), null);
  });
});

describe('cuánto queda', () => {
  test('se cuenta por días naturales', () => {
    assert.equal(diasQueQuedan(enDias(5), AHORA), 5);
    assert.equal(diasQueQuedan(enDias(0), AHORA), 0);
  });

  test('el mismo día todavía no ha vencido', () => {
    // Al cliente se le dijo «treinta días». El día treinta es suyo entero.
    assert.equal(estaVencido(enDias(0), AHORA), false);
    assert.equal(estaVencido(enDias(-1), AHORA), true);
  });

  test('una fecha rota NO despublica el coche', () => {
    /*
     * Vencer retira el anuncio de alguien que está pagando por tenerlo puesto.
     * Eso no puede pasar porque una fila esté mal escrita: se marca para que lo
     * mire una persona, y mientras tanto el coche sigue publicado.
     */
    assert.equal(estaVencido('cuando sea', AHORA), false);
    assert.equal(estaVencido(null, AHORA), false);
    assert.equal(laFechaEstaRota('cuando sea'), true);
    assert.equal(laFechaEstaRota(enDias(3)), false);
  });
});

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
