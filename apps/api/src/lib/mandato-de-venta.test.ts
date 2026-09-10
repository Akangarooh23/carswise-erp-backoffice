/**
 * El mandato de gestión de venta.
 *
 * Lo que se protege: que no se le facture a nadie sin que haya firmado, y que
 * el documento que firma diga exactamente lo mismo que el ERP va a cobrarle.
 * Esas dos son la razón de que esto exista; el resto son detalles.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMO_SE_FIRMA, COMO_LO_DECIMOS, SERIE,
  esUnaFirma, estaFirmado, porQueNoEstaFirmado, sePuedeCobrar,
  lasCondiciones, elMandato, comoSeLlamaElFichero,
} from './mandato-de-venta.js';
import { FEE_DE_GESTION, FEE_DE_CANCELACION, DIAS_HASTA_SALIR_GRATIS } from './encargo-de-venta.js';
import { LO_QUE_CUESTA } from './revision-del-taller.js';

const BASE = {
  mandato_id: 'PC-MAND-2026-001',
  cliente_nombre: 'Juan Pérez',
  cliente_email: 'juan@ejemplo.com',
  matricula: '8888LXR',
  marca: 'Citroën',
  modelo: 'C3',
  ano: 2018,
  kilometros: 92000,
  precio: 8500,
  acepto_el_precio: true,
  fecha: new Date('2026-09-10T10:00:00'),
};

/** El texto sin las etiquetas, que es lo que acaba leyendo el cliente. */
const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('cuándo está firmado', () => {
  test('con fecha y con cómo nos consta', () => {
    assert.equal(estaFirmado({ firmado_at: '2026-09-01', firma_como: 'en_persona' }), true);
    assert.equal(porQueNoEstaFirmado({ firmado_at: '2026-09-01', firma_como: 'en_persona' }), '');
  });

  test('una fecha sola NO vale', () => {
    /*
     * Es exactamente lo que había antes: una fecha que el ERP se escribia a si
     * mismo al pulsar «Abrir encargo». Si eso contara como firma, esto no
     * habria arreglado nada.
     */
    assert.equal(estaFirmado({ firmado_at: '2026-09-01' }), false);
    assert.match(porQueNoEstaFirmado({ firmado_at: '2026-09-01' }), /cómo nos consta/);
  });

  test('y un «cómo» solo, tampoco', () => {
    assert.equal(estaFirmado({ firma_como: 'en_persona' }), false);
    assert.match(porQueNoEstaFirmado({ firma_como: 'en_persona' }), /Falta la fecha/);
  });

  test('sin nada, se dice lo que hay que hacer', () => {
    assert.equal(estaFirmado(null), false);
    assert.equal(estaFirmado({}), false);
    assert.match(porQueNoEstaFirmado({}), /Todavía no ha firmado/);
  });

  test('una fecha ilegible no cuela', () => {
    assert.equal(estaFirmado({ firmado_at: 'el martes', firma_como: 'en_persona' }), false);
  });

  test('ni una manera inventada de firmar', () => {
    // El fallo fácil: dar por buena cualquier cadena no vacía. Con eso, un
    // campo con basura contaría como constancia.
    assert.equal(estaFirmado({ firmado_at: '2026-09-01', firma_como: 'me dijo que si' }), false);
    assert.equal(esUnaFirma('me dijo que si'), false);
  });

  test('las tres maneras tienen nombre', () => {
    assert.deepEqual([...COMO_SE_FIRMA], ['en_persona', 'papel_firmado', 'por_correo']);
    for (const c of COMO_SE_FIRMA) assert.ok(COMO_LO_DECIMOS[c], `falta cómo se dice ${c}`);
  });
});

describe('sin mandato firmado no se le cobra nada', () => {
  test('es la misma pregunta que si está firmado', () => {
    /*
     * En las demás reglas de este flujo, ante la duda se cobra: perdonar sale
     * de la puerta equivocada porque nadie se entera. Aquí es al revés, y a
     * propósito: en las demás la duda es sobre *cuánto*, y en esta es sobre si
     * hay trato. Cobrar sin trato no se corrige luego.
     */
    assert.equal(sePuedeCobrar({ firmado_at: '2026-09-01', firma_como: 'papel_firmado' }), true);
    assert.equal(sePuedeCobrar({ firmado_at: '2026-09-01' }), false);
    assert.equal(sePuedeCobrar(null), false);
  });
});

describe('las condiciones dicen lo mismo que cobra el ERP', () => {
  const texto = () => soloTexto(lasCondiciones(BASE).join(' '));

  test('los 299 de la gestión salen del mismo sitio que la factura', () => {
    // Escritos a mano en el documento, el dia que cambie la tarifa el cliente
    // firmaria un numero y le llegaria otro.
    assert.match(texto(), new RegExp(`${FEE_DE_GESTION} €`));
  });

  test('y los 150 de la cancelación, igual', () => {
    assert.match(texto(), new RegExp(`${FEE_DE_CANCELACION} €`));
  });

  test('y los 30 días', () => {
    assert.match(texto(), new RegExp(`${DIAS_HASTA_SALIR_GRATIS} días`));
  });

  test('la revisión del taller se dice, y que la pagamos nosotros', () => {
    // Es lo que justifica los 150: nos lo hemos gastado en el aunque no venda.
    const t = texto();
    assert.match(t, new RegExp(`${LO_QUE_CUESTA} €`));
    assert.match(t, /asume PopCar/);
  });

  test('el precio acordado va en el documento, no en blanco', () => {
    assert.match(texto(), /8\.500 €/);
  });

  test('y si no hay precio todavía, se dice, no se inventa un cero', () => {
    const sinPrecio = soloTexto(lasCondiciones({ ...BASE, precio: null }).join(' '));
    assert.match(sinPrecio, /se acordará con el titular/);
    // «\b0 €» y no «0 €» a secas: los 150 de la cancelación acaban en cero.
    assert.doesNotMatch(sinPrecio, /\b0 €/);
  });
});

describe('lo que el mandato no dice nunca', () => {
  test('que compramos el coche', () => {
    /*
     * Es la frase que separa este negocio del de comprar y revender, y la que
     * mas facil seria dar por supuesta al escribir el documento. Si un dia el
     * texto dijera que compramos, estariamos firmando otra cosa.
     */
    assert.match(soloTexto(lasCondiciones(BASE).join(' ')), /PopCar no compra el vehículo/);
  });

  test('que caduca', () => {
    // El mandato se extiende hasta que el cancela o vendemos. Lo dijo Juan
    // despues de que esto se hubiera construido al reves durante unos dias.
    assert.match(soloTexto(lasCondiciones(BASE).join(' ')), /no tiene fecha de vencimiento/);
  });
});

describe('la cláusula del precio cambia el texto', () => {
  test('quien la firma puede irse gratis a los 30 días', () => {
    const con = soloTexto(lasCondiciones({ ...BASE, acepto_el_precio: true }).join(' '));
    assert.match(con, /sin coste alguno/);
  });

  test('y quien no, paga siempre hasta que la firme', () => {
    /*
     * Las dos mitades de la misma regla. Con un solo texto para los dos casos,
     * a la mitad de los clientes el papel les diria algo distinto de lo que la
     * pantalla y la factura van a hacer.
     */
    const sin = soloTexto(lasCondiciones({ ...BASE, acepto_el_precio: false }).join(' '));
    assert.match(sin, /deja de ser exigible/);
    assert.doesNotMatch(sin, /sin coste alguno/);
  });
});

describe('el documento', () => {
  const doc = () => elMandato(BASE);

  test('lleva su número, para poder referirlo', () => {
    assert.match(doc(), /PC-MAND-2026-001/);
    assert.equal(SERIE, 'PC-MAND');
  });

  test('dice de quién y de qué coche es', () => {
    const t = soloTexto(doc());
    assert.match(t, /Juan Pérez/);
    assert.match(t, /8888LXR/);
    assert.match(t, /Citroën C3/);
  });

  test('y tiene dónde firmar', () => {
    // Un documento sin sitio para la firma se lee como un folleto.
    assert.match(soloTexto(doc()), /Firma del titular/);
  });

  test('Word lo abre como suyo', () => {
    assert.match(doc(), /schemas-microsoft-com:office:word/);
    assert.match(doc(), /<meta charset="utf-8">/);
  });

  test('un nombre con signos no rompe el documento', () => {
    // El apellido con «&» o el modelo con «<» convertirian el resto del
    // documento en etiquetas.
    const raro = elMandato({ ...BASE, cliente_nombre: 'Ana & <script>Ruiz' });
    assert.match(raro, /Ana &amp; &lt;script&gt;Ruiz/);
    assert.doesNotMatch(raro, /<script>/);
  });

  test('un coche a medias no deja huecos raros', () => {
    // Un IDCar recien creado puede no tener modelo ni ano todavia.
    const flaco = elMandato({
      ...BASE, marca: '', modelo: '', ano: null, kilometros: null, matricula: '',
    });
    assert.doesNotMatch(soloTexto(flaco), /undefined|null|NaN/);
  });
});

describe('el fichero', () => {
  test('se llama por su número', () => {
    assert.equal(comoSeLlamaElFichero('PC-MAND-2026-007'), 'mandato-pc-mand-2026-007.doc');
  });

  test('y sin número, tampoco se llama «undefined»', () => {
    assert.equal(comoSeLlamaElFichero(''), 'mandato-sin-numero.doc');
  });
});
