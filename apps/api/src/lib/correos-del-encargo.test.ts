/**
 * Los correos al dueño del coche que vendemos.
 *
 * Lo que se protege: que digan lo mismo que el ERP va a hacer. Un correo que
 * promete un importe distinto del que va en la factura, o que da por vendido un
 * coche que se retiró, es peor que no mandar nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  elCorreoDelMandato, elCorreoDePublicado, elCorreoDelCierre,
} from './correos-del-encargo.js';
import { DIAS_HASTA_SALIR_GRATIS, FEE_DE_GESTION, FEE_DE_CANCELACION } from './encargo-de-venta.js';

const COCHE = {
  cliente_nombre: 'Juan Pérez',
  marca: 'Citroën',
  modelo: 'C3',
  matricula: '8888LXR',
};

/** El texto sin etiquetas, que es lo que acaba leyendo el cliente. */
const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('el correo del mandato', () => {
  const c = () => elCorreoDelMandato({
    ...COCHE, mandato_id: 'PC-MAND-2026-001', precio: 8500,
    fee_gestion: FEE_DE_GESTION, fee_cancelacion: FEE_DE_CANCELACION,
  });

  test('dice a qué está diciendo que sí, sin abrir el adjunto', () => {
    /*
     * Un correo que solo dijera «firma esto» obliga a abrir el documento para
     * saber el trato, y la mitad no lo abre. Las tres cosas que decide tienen
     * que estar en el cuerpo.
     */
    const t = soloTexto(c().html);
    assert.match(t, /no lo compramos/);
    assert.match(t, new RegExp(`${FEE_DE_GESTION} €`));
    assert.match(t, new RegExp(`${FEE_DE_CANCELACION} €`));
    assert.match(t, new RegExp(`${DIAS_HASTA_SALIR_GRATIS} días`));
  });

  test('los importes salen de las constantes, no escritos a mano', () => {
    // Si se escribieran aquí, el día que cambie la tarifa el correo diría un
    // numero y la factura otro.
    const otro = elCorreoDelMandato({
      ...COCHE, mandato_id: 'X', precio: null, fee_gestion: 350, fee_cancelacion: 99,
    });
    const t = soloTexto(otro.html);
    assert.match(t, /350 €/);
    assert.match(t, /99 €/);
  });

  test('lleva su número, para poder referirlo', () => {
    assert.match(soloTexto(c().html), /PC-MAND-2026-001/);
  });

  test('y dice que no caduca', () => {
    // Es lo que más se malinterpreta del trato, y lo que Juan tuvo que
    // corregir cuando se construyó al revés.
    assert.match(soloTexto(c().html), /No hay fecha de vencimiento/);
  });

  test('sin precio acordado no se inventa un cero', () => {
    const sin = elCorreoDelMandato({
      ...COCHE, mandato_id: 'X', precio: null,
      fee_gestion: FEE_DE_GESTION, fee_cancelacion: FEE_DE_CANCELACION,
    });
    assert.doesNotMatch(soloTexto(sin.html), /Precio de salida/);
  });

  test('el asunto dice de qué coche es', () => {
    // En una bandeja llena, «Tu mandato» a secas no se distingue de nada.
    assert.match(c().subject, /Citroën C3/);
  });
});

describe('el correo de publicado', () => {
  const c = (url: string | null = 'https://popcar.com.es/coche/8888LXR') =>
    elCorreoDePublicado({ ...COCHE, url, precio: 8500 });

  test('lleva el enlace, que es lo primero que va a hacer', () => {
    assert.match(c().html, /popcar\.com\.es\/coche\/8888LXR/);
  });

  test('y sin enlace no deja un botón roto', () => {
    // Un boton a ninguna parte es peor que no tenerlo: se pulsa igual.
    assert.doesNotMatch(c(null).html, /href="[^"]*undefined/);
    assert.doesNotMatch(soloTexto(c(null).html), /Ver tu anuncio/);
  });

  test('le avisa de que las franjas se gastan', () => {
    /*
     * Es lo único que él puede hacer que rompa el anuncio sin enterarse: se
     * reservan las seis horas y el coche queda publicado sin poder visitarse.
     */
    assert.match(soloTexto(c().html), /si se acaban/i);
  });

  test('no le da un teléfono escrito a mano', () => {
    /*
     * El número vive en PopCar, con una prueba que compara sus dos copias.
     * Una tercera aquí, en otro repo y sin nada que la vigile, es como la
     * página de Contacto acabó enseñando un número de relleno.
     */
    assert.doesNotMatch(soloTexto(c().html), /\+?34[\s\d]{9,}/);
  });
});

describe('el correo del cierre', () => {
  test('si se vendió, lo dice y dice cuánto', () => {
    const c = elCorreoDelCierre({
      ...COCHE, motivo: 'vendido', importe: 299, concepto: 'Gestión integral de la venta',
    });
    assert.match(c.subject, /Vendido/);
    assert.match(soloTexto(c.html), /299 €/);
    assert.match(soloTexto(c.html), /IVA incluido/);
  });

  test('el importe viene dado, no se recalcula aquí', () => {
    /*
     * Este es el invariante de los tres correos. Si este fichero calculara el
     * importe, un día el correo diría una cifra y la factura otra — y el que
     * lo descubre es el cliente.
     */
    const c = elCorreoDelCierre({
      ...COCHE, motivo: 'se_fue', importe: 150, concepto: 'Cancelación del encargo',
    });
    assert.match(soloTexto(c.html), /150 €/);
    assert.doesNotMatch(soloTexto(c.html), /299/);
  });

  test('y si no se le cobra nada, se dice claro', () => {
    /*
     * Este correo también hay que mandarlo. Cerrar en silencio es lo que hace
     * que llame tres semanas después preguntando si le vamos a cobrar.
     */
    const c = elCorreoDelCierre({ ...COCHE, motivo: 'se_fue', importe: 0, concepto: '' });
    assert.match(soloTexto(c.html), /No hay nada que pagar/);
    assert.doesNotMatch(soloTexto(c.html), /0 €/);
    assert.doesNotMatch(soloTexto(c.html), /factura por separado/);
  });

  test('un retirado no se anuncia como vendido', () => {
    // Decirle «tu coche está vendido» a alguien cuyo coche retiramos nosotros
    // es la clase de correo que acaba en una llamada muy mala.
    const c = elCorreoDelCierre({ ...COCHE, motivo: 'retirado', importe: 0, concepto: '' });
    assert.doesNotMatch(c.subject, /Vendido/);
    assert.doesNotMatch(soloTexto(c.html), /está vendido/);
    assert.match(soloTexto(c.html), /Lo retiramos nosotros/i);
  });
});

describe('lo que valen para cualquier coche', () => {
  test('un nombre con signos no rompe el correo', () => {
    const c = elCorreoDelMandato({
      ...COCHE, cliente_nombre: 'Ana & <b>Ruiz', mandato_id: 'X', precio: null,
      fee_gestion: 299, fee_cancelacion: 150,
    });
    assert.match(c.html, /Ana &amp; &lt;b&gt;Ruiz/);
  });

  test('y un coche a medias no deja huecos raros', () => {
    // Un IDCar recien creado puede no tener marca ni modelo todavia.
    const c = elCorreoDePublicado({
      cliente_nombre: '', marca: '', modelo: '', matricula: '', url: null, precio: null,
    });
    assert.doesNotMatch(soloTexto(c.html), /undefined|null|NaN/);
    assert.match(c.subject, /tu coche/);
  });
});
