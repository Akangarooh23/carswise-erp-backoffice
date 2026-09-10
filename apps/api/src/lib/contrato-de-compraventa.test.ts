/**
 * El contrato de compraventa.
 *
 * Lo que se protege: que diga quién vende y quién compra —y que **no somos
 * nosotros**—, y que un dato que falte salga como una raya para rellenar en vez
 * de bloquear el cierre o, peor, salir en blanco sin que se note.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIE, HUECO, elContrato, lasClausulas, loQueFaltaDelContrato,
  estaCompleto, comoSeLlamaElFichero, miles,
} from './contrato-de-compraventa.js';

const BASE = {
  contrato_id: 'PC-CV-2026-001',
  vendedor_nombre: 'Ana Picazo',
  vendedor_dni: '00000000T',
  vendedor_domicilio: 'Calle de prueba 1, Madrid',
  comprador_nombre: 'Juan Comprador',
  comprador_dni: '11111111H',
  comprador_domicilio: 'Calle de prueba 2, Madrid',
  matricula: '8888LXR',
  bastidor: 'VF7XXXXXXXXXXXXXX',
  marca: 'Citroën',
  modelo: 'C3',
  ano: 2018,
  kilometros: 92000,
  precio: 8500,
  fecha: new Date('2026-09-10T10:00:00'),
};

const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('quién vende y quién compra', () => {
  test('salen los dos, con su DNI', () => {
    const t = soloTexto(elContrato(BASE));
    assert.match(t, /Ana Picazo/);
    assert.match(t, /00000000T/);
    assert.match(t, /Juan Comprador/);
    assert.match(t, /11111111H/);
  });

  test('y decimos que NO somos parte', () => {
    /*
     * El coche va del particular al comprador; nosotros lo redactamos. Es la
     * frase que más fácil seria dar por supuesta, y va **dentro del contrato**:
     * si solo estuviera en el mandato, el comprador —que no ha firmado ningún
     * mandato— no tendría forma de saber a quién le ha comprado el coche.
     */
    const t = soloTexto(lasClausulas(BASE).join(' '));
    assert.match(t, /No es parte de esta compraventa/);
    assert.match(t, /ni adquiere el vehículo en ningún momento/);
  });

  test('el coche va identificado por matrícula y bastidor', () => {
    const t = soloTexto(lasClausulas(BASE).join(' '));
    assert.match(t, /8888LXR/);
    assert.match(t, /VF7XXXXXXXXXXXXXX/);
  });

  test('y el precio, con el punto de los miles puesto a mano', () => {
    // `toLocaleString` depende del ICU de la maquina: el mismo contrato se
    // imprimiria distinto segun donde se generara.
    assert.equal(miles(8500), '8.500');
    assert.match(soloTexto(lasClausulas(BASE).join(' ')), /8\.500 €/);
  });
});

describe('lo que falta sale como una raya, no en blanco', () => {
  /**
   * Cuántas rayas hay, contadas de verdad.
   *
   * Buscar `HUECO` a secas no vale: las dos líneas de firma son rayas más
   * largas y lo contienen, así que la prueba se daba por buena sin que ningún
   * campo saliera con hueco. Se cuenta y se compara con el contrato completo,
   * que es la única forma de saber si apareció **uno más**.
   */
  const rayas = (html: string) => (html.match(new RegExp(HUECO, 'g')) || []).length;

  test('un DNI que no tenemos sale como una raya más', () => {
    /*
     * Un campo vacío se pasa por alto al imprimir y el papel se firma sin él.
     * Una raya se ve y se rellena.
     */
    const completo = rayas(elContrato(BASE));
    assert.equal(rayas(elContrato({ ...BASE, comprador_dni: '' })), completo + 1);
  });

  test('y cada dato que falta añade la suya', () => {
    // Dos huecos son dos rayas: si se solaparan, quien imprime rellenaria uno
    // y se dejaria el otro sin verlo.
    const completo = rayas(elContrato(BASE));
    assert.equal(
      rayas(elContrato({ ...BASE, comprador_dni: '', vendedor_domicilio: '' })),
      completo + 2,
    );
  });

  test('y el precio también', () => {
    const t = soloTexto(lasClausulas({ ...BASE, precio: null }).join(' '));
    assert.match(t, new RegExp(`${HUECO.slice(0, 10)}[^€]*€`));
    assert.doesNotMatch(t, /\b0 €/, 'un precio que no sabemos no puede salir como cero');
  });

  test('se dice qué falta, para saberlo antes de imprimir', () => {
    const falta = loQueFaltaDelContrato({ ...BASE, comprador_dni: '', precio: null });
    assert.ok(falta.some((x) => /DNI del comprador/.test(x)));
    assert.ok(falta.some((x) => /precio/.test(x)));
    assert.equal(estaCompleto({ ...BASE, comprador_dni: '' }), false);
  });

  test('con todo puesto no falta nada', () => {
    assert.deepEqual(loQueFaltaDelContrato(BASE), []);
    assert.equal(estaCompleto(BASE), true);
  });

  test('el bastidor se dice dónde está', () => {
    /*
     * El IDCar no lo guarda, asi que falta siempre. Sin decir de dónde se saca,
     * la lista pareceria un error del ERP en vez de un dato que hay que copiar.
     */
    const falta = loQueFaltaDelContrato({ ...BASE, bastidor: '' });
    assert.ok(falta.some((x) => /ficha técnica/.test(x)));
  });
});

describe('el documento', () => {
  test('lleva su número y su fecha', () => {
    const t = soloTexto(elContrato(BASE));
    assert.match(t, /PC-CV-2026-001/);
    assert.match(t, /10 de septiembre de 2026/);
    assert.equal(SERIE, 'PC-CV');
  });

  test('y sitio para las dos firmas', () => {
    const t = soloTexto(elContrato(BASE));
    assert.match(t, /El vendedor/);
    assert.match(t, /El comprador/);
  });

  test('Word lo abre como suyo', () => {
    assert.match(elContrato(BASE), /schemas-microsoft-com:office:word/);
    assert.match(elContrato(BASE), /<meta charset="utf-8">/);
  });

  test('un nombre con signos no rompe el documento', () => {
    const raro = elContrato({ ...BASE, comprador_nombre: 'Ana & <script>Ruiz' });
    assert.match(raro, /Ana &amp; &lt;script&gt;Ruiz/);
    assert.doesNotMatch(raro, /<script>/);
  });

  test('y un coche a medias no deja «undefined» por ahí', () => {
    const flaco = elContrato({
      ...BASE, marca: '', modelo: '', ano: null, kilometros: null,
      matricula: '', bastidor: '', precio: null,
    });
    assert.doesNotMatch(soloTexto(flaco), /undefined|null|NaN/);
  });
});

describe('el fichero', () => {
  test('se llama por su número', () => {
    assert.equal(comoSeLlamaElFichero('PC-CV-2026-007'), 'contrato-pc-cv-2026-007.doc');
  });

  test('y sin número no se llama «undefined»', () => {
    assert.equal(comoSeLlamaElFichero(''), 'contrato-sin-numero.doc');
  });
});
