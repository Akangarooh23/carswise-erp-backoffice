/**
 * La cláusula del precio de salida.
 *
 * Lo que se protege: **cuándo** se le puede pedir y **qué gana** firmándola.
 *
 * Lo primero, porque el precio se fija con lo que diga el taller: pedirle que
 * acepte una cifra antes de saberlo es pedirle que acepte una que vamos a tener
 * que cambiar, y entonces lo que firmó no es lo que estamos anunciando.
 *
 * Lo segundo, porque aceptar el precio es lo único que le abre la puerta de
 * irse sin pagar nada. Un papel que no diga eso parece papeleo nuestro, y el
 * papeleo del vendedor se queda sin firmar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIE, PAPEL_FIRMADO, ENSURE_COLUMNAS,
  porQueNoSeLePuedePedir, estaAceptada, loQueDice, laClausula, comoSeLlamaElFichero,
} from './clausula-del-precio.js';
import { DIAS_HASTA_SALIR_GRATIS, FEE_DE_CANCELACION } from './encargo-de-venta.js';

const listo = {
  mandato_firmado: true,
  taller_hecho: true,
  taller_lo_tumbo: false,
  precio: 13500,
};

const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('cuándo se le puede pedir', () => {
  test('con mandato, taller y precio, sí', () => {
    assert.equal(porQueNoSeLePuedePedir(listo), '');
  });

  test('sin mandato firmado, no: sin trato no hay precio que acordar', () => {
    assert.match(porQueNoSeLePuedePedir({ ...listo, mandato_firmado: false }), /mandato/);
  });

  test('antes del taller, no', () => {
    /*
     * Es el orden entero de esto: mandato → papeles → taller → precio → anuncio.
     * Un coche que sale «con reparos» no vale lo mismo que uno limpio.
     */
    assert.match(porQueNoSeLePuedePedir({ ...listo, taller_hecho: false }), /taller/);
  });

  test('y si el taller lo tumbó, tampoco', () => {
    /*
     * Ese coche no se va a publicar. Mandarle un papel para que acepte el precio
     * de salida de un anuncio que no va a existir le dice que seguimos adelante
     * justo cuando hay que llamarle para contarle que no.
     */
    assert.match(porQueNoSeLePuedePedir({ ...listo, taller_lo_tumbo: true }), /no deja vender/);
  });

  test('sin precio acordado, no hay nada que aceptar', () => {
    assert.match(porQueNoSeLePuedePedir({ ...listo, precio: null }), /precio de salida/);
    assert.match(porQueNoSeLePuedePedir({ ...listo, precio: 0 }), /precio de salida/);
  });
});

describe('si ya la ha firmado', () => {
  test('con fecha, sí', () => {
    assert.equal(estaAceptada({ clausula_firmada_at: '2026-09-18T10:00:00Z' }), true);
  });

  test('sin fecha o con una rota, no', () => {
    assert.equal(estaAceptada({ clausula_firmada_at: null }), false);
    assert.equal(estaAceptada({ clausula_firmada_at: 'el jueves' }), false);
    assert.equal(estaAceptada(null), false);
  });
});

describe('lo que dice el papel', () => {
  const doc = () => laClausula({
    clausula_id: 'PC-PRECIO-2026-0001',
    cliente_nombre: 'Juan Pérez',
    cliente_email: 'juan@example.com',
    matricula: '8888LXR',
    marca: 'Volkswagen',
    modelo: 'T-Roc',
    precio: 13500,
    fecha: new Date('2026-09-18T10:00:00Z'),
  });

  test('el precio, con sus puntos de los miles', () => {
    // A mano y no con el ICU: el mismo documento se imprimiría distinto según
    // la máquina que lo genere, y no habría manera de saber cuál firmó.
    assert.match(soloTexto(doc()), /13\.500 €/);
  });

  test('qué coche es', () => {
    const t = soloTexto(doc());
    assert.match(t, /Volkswagen T-Roc/);
    assert.match(t, /8888LXR/);
  });

  test('y qué gana firmándolo, dentro del documento', () => {
    /*
     * Dentro y no solo en el correo: quien firma tiene que poder leer qué está
     * aceptando sin volver a la bandeja de entrada.
     */
    const t = soloTexto(loQueDice({
      clausula_id: 'x', cliente_nombre: '', cliente_email: '',
      matricula: '8888LXR', marca: 'VW', modelo: 'T-Roc',
      precio: 13500, fecha: new Date(),
    }).join(' '));
    assert.match(t, new RegExp(`${DIAS_HASTA_SALIR_GRATIS} días`));
    assert.match(t, /sin coste alguno/);
    assert.match(t, new RegExp(String(FEE_DE_CANCELACION)));
  });

  test('y que no supone ningún pago por adelantado', () => {
    // Es la duda de todo el que firma algo con un importe escrito.
    assert.match(soloTexto(doc()), /no supone pago alguno por adelantado/);
  });

  test('el fichero se llama como para saber cuál es', () => {
    assert.equal(comoSeLlamaElFichero('PC-PRECIO-2026-0001'), 'precio-pc-precio-2026-0001.doc');
  });
});

describe('dónde se guarda', () => {
  test('su serie y su papel', () => {
    assert.equal(SERIE, 'PC-PRECIO');
    assert.equal(PAPEL_FIRMADO, 'clausula_precio_firmada');
  });

  test('y las columnas se añaden con ALTER, que la tabla ya existe', () => {
    assert.match(ENSURE_COLUMNAS, /ALTER TABLE erp_encargos_venta/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS clausula_id/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS clausula_enviada_at/);
    assert.match(ENSURE_COLUMNAS, /ADD COLUMN IF NOT EXISTS clausula_firmada_at/);
  });
});
