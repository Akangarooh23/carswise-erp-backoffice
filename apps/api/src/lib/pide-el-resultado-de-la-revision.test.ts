/**
 * Pedirle el resultado a quien fue a ver el coche.
 *
 * Lo que se protege aquí es lo que se rompe en silencio: a quién se le pide,
 * cuándo, y que no se dé por pedido lo que no ha salido. Un fallo en
 * cualquiera de las tres no se nota —no hay pantalla roja— y acaba en una
 * revisión que nadie cierra, un anuncio que no sale y una factura que no se
 * apunta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aQuienSeLePide, SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO,
} from './pide-el-resultado-de-la-revision.js';
import { elCorreoPidiendoElResultado } from './correos-del-encargo.js';

const soloTexto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('a quién se le pide', () => {
  test('al correo apuntado en la revisión, si lo hay', () => {
    /*
     * Gana al del directorio a propósito: si alguien lo ha escrito aquí es
     * porque sabe que a ése hay que escribirle. El del proveedor puede ser el
     * de la oficina del taller y la visita haberla hecho otro.
     */
    assert.equal(
      aQuienSeLePide({ perito_email: 'pedro@peritos.es', proveedor_email: 'oficina@norauto.es' }),
      'pedro@peritos.es',
    );
  });

  test('y si no, al del proveedor del directorio', () => {
    assert.equal(aQuienSeLePide({ proveedor_email: 'oficina@norauto.es' }), 'oficina@norauto.es');
  });

  test('y si no hay ninguno, a nadie', () => {
    // Que devuelva vacío es lo que hace que no se marque como pedido: esa
    // revisión tiene que seguir saliendo en «visitas sin cerrar».
    assert.equal(aQuienSeLePide({}), '');
    assert.equal(aQuienSeLePide(null), '');
  });
});

describe('a cuáles les toca', () => {
  test('solo las que ya pasaron, y con margen', () => {
    /*
     * Doce horas, no cero. Una visita de las 18:00 no se pide a las 19:00: el
     * perito tiene otras dos y escribe por la tarde. Como el cron corre a las
     * 07:00, doce horas dejan dentro lo de ayer por la mañana y fuera lo de
     * ayer a última hora.
     */
    assert.match(SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO, /cita_at < NOW\(\) - INTERVAL '12 hours'/);
  });

  test('ni las cerradas ni las que ya se pidieron', () => {
    assert.match(SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO, /estado <> 'Hecha'/);
    assert.match(SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO, /resultado_pedido_at IS NULL/);
  });

  test('y se trae el correo del proveedor por si acaso', () => {
    assert.match(SQL_CANDIDATAS_A_PEDIRLES_EL_RESULTADO, /p\.email AS proveedor_email/);
  });
});

describe('el correo que se le manda', () => {
  const c = (extra = {}) => elCorreoPidiendoElResultado({
    quien: 'Pedro Ruiz',
    cliente_nombre: 'Ana Picazo',
    marca: 'Opel', modelo: 'Corsa', matricula: '5228HNS',
    dia: 'lunes, 5 de octubre', hora: '12:00',
    aDomicilio: true, direccion: 'C/ Alcalá 120, Madrid',
    ...extra,
  });

  test('le pide las tres respuestas que sabemos guardar', () => {
    /*
     * Y no «un informe». Un correo que pide algo abierto se contesta con un
     * adjunto de doce páginas o no se contesta, y las dos acaban en llamada.
     */
    const texto = soloTexto(c().html);
    assert.match(texto, /Bien/);
    assert.match(texto, /Se puede vender/i);
    assert.match(texto, /No se puede vender/i);
  });

  test('y dice por qué corre prisa', () => {
    // No es papeleo nuestro: hasta que no está, el coche no sale a la venta.
    assert.match(soloTexto(c().html), /no puede salir a la venta/i);
  });

  test('pero no le manda el nombre del cliente', () => {
    /*
     * A quien revisa el coche le basta la matrícula y la dirección. El nombre
     * de una persona no viaja a un taller de la red para algo que no lo
     * necesita.
     */
    assert.doesNotMatch(soloTexto(c().html), /Ana Picazo/);
  });

  test('y el del taller no habla de ir a ninguna dirección', () => {
    const texto = soloTexto(c({ aDomicilio: false, quien: 'Norauto', direccion: '' }).html);
    assert.match(texto, /pasó por vosotros/i);
  });
});
