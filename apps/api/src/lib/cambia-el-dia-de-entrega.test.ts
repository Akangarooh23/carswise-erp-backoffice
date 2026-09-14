/**
 * El aviso de que la entrega se ha movido.
 *
 * Lo que se protege es una promesa escrita en otro correo: «el día puede
 * moverse… **si cambia, te avisamos**». No avisaba nadie — la fecha se editaba
 * en la ficha del transporte y el cliente se quedaba con el día de la primera
 * vez.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hayQueAvisar, correoDeCambioDeEntrega } from './cambia-el-dia-de-entrega.js';

const BASE = {
  nombre: 'Ana',
  vehiculo: 'Volkswagen T-Roc',
  antes: '2026-09-21',
  ahora: '2026-09-24',
  destino: 'Calle de prueba 1, Madrid',
  panel: 'https://popcar.com.es/panel/solicitudes',
};

const soloTexto = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('cuándo se avisa', () => {
  test('cuando el día cambia', () => {
    assert.equal(hayQueAvisar('2026-09-21', '2026-09-24'), true);
  });

  test('pero no si no había fecha antes', () => {
    /*
     * Eso no es un cambio, es la primera noticia — y para ese caso lo que se le
     * prometió fue una llamada: «en cuanto el transportista nos confirme el día,
     * te llamamos para cerrarlo».
     */
    assert.equal(hayQueAvisar(null, '2026-09-24'), false);
    assert.equal(hayQueAvisar('', '2026-09-24'), false);
  });

  test('ni si se queda sin fecha', () => {
    // No se le puede decir «ahora es ninguna».
    assert.equal(hayQueAvisar('2026-09-21', null), false);
  });

  test('ni cuando es la misma fecha escrita de otra forma', () => {
    /*
     * `2026-09-21` y `2026-09-21T00:00:00.000Z` son el mismo día. Mandar un
     * correo diciendo que algo se ha movido cuando no se ha movido es la forma
     * más rápida de que deje de leerlos.
     */
    assert.equal(hayQueAvisar('2026-09-21', '2026-09-21T00:00:00.000Z'), false);
    assert.equal(hayQueAvisar('2026-09-21', '2026-09-21'), false);
  });

  test('ni con fechas ilegibles', () => {
    assert.equal(hayQueAvisar('esto no es una fecha', '2026-09-24'), false);
    assert.equal(hayQueAvisar('2026-09-21', 'tampoco'), false);
  });
});

describe('lo que dice el correo', () => {
  test('el día nuevo va en el asunto', () => {
    // Muchos correos se leen solo por el asunto, y es lo único que necesita
    // saber.
    const { subject } = correoDeCambioDeEntrega(BASE);
    assert.match(subject, /24 de septiembre de 2026/);
  });

  test('y dentro salen los dos días, el viejo y el nuevo', () => {
    /*
     * Sin el viejo no puede comprobar si el que tenía apuntado es el que
     * cambiamos: con dos coches o dos correos traspapelados, «llega el 24» a
     * secas no le dice si eso es nuevo.
     */
    const t = soloTexto(correoDeCambioDeEntrega(BASE).html);
    assert.match(t, /21 de septiembre de 2026/);
    assert.match(t, /24 de septiembre de 2026/);
  });

  test('se le pide que haya alguien, que es lo único que tiene que hacer', () => {
    // La entrega se firma, y un camión que llega a una casa vacía se vuelve con
    // el coche dentro y el viaje se paga igual.
    const t = soloTexto(correoDeCambioDeEntrega(BASE).html);
    assert.match(t, /haya alguien/);
  });

  test('y que si no le va bien, lo movemos', () => {
    assert.match(soloTexto(correoDeCambioDeEntrega(BASE).html), /dínoslo cuanto antes/);
  });

  test('un nombre con signos no rompe el correo', () => {
    const raro = correoDeCambioDeEntrega({ ...BASE, nombre: 'Ana & <script>Ruiz' });
    assert.match(raro.html, /Ana &amp; &lt;script&gt;Ruiz/);
    assert.doesNotMatch(raro.html, /<script>/);
  });

  test('y sin destino no deja un hueco raro', () => {
    const t = soloTexto(correoDeCambioDeEntrega({ ...BASE, destino: null }).html);
    assert.doesNotMatch(t, /undefined|null|NaN/);
  });
});
