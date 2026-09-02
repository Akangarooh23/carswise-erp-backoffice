/**
 * Lo que se puede tocar de un correo antes de mandarlo.
 *
 * Se enseña entero y se dejan cambiar tres cosas: a quién va, el asunto y una
 * línea que añadir. El cuerpo no, y no es por no complicarse — cada uno de esos
 * correos existe por una frase concreta, y un cuadro con todo el HTML dentro es
 * la forma más fácil de borrar una sin darse cuenta.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { pareceUnCorreo, asuntoLimpio, notaEnParrafos } from './revision-de-correo.js';

describe('a quién se manda', () => {
  test('un correo con pinta de correo vale', () => {
    assert.equal(pareceUnCorreo('ventas@autowelt.de'), true);
    assert.equal(pareceUnCorreo('  ana@popcar.tech  '), true);
  });

  test('y lo que no lo es, no', () => {
    // Sin esto, corregir el destinatario a mano y equivocarse manda el correo a
    // ninguna parte y el envío se cae después de haber dicho que sí.
    assert.equal(pareceUnCorreo('autowelt'), false);
    assert.equal(pareceUnCorreo('a@b'), false);
    assert.equal(pareceUnCorreo('con espacio@ejemplo.com'), false);
    assert.equal(pareceUnCorreo(''), false);
    assert.equal(pareceUnCorreo(null), false);
  });
});

describe('el asunto', () => {
  test('el que se escriba manda', () => {
    assert.equal(asuntoLimpio('Otro asunto', 'El de siempre'), 'Otro asunto');
  });

  test('y en blanco, el de siempre', () => {
    assert.equal(asuntoLimpio('', 'El de siempre'), 'El de siempre');
    assert.equal(asuntoLimpio('   ', 'El de siempre'), 'El de siempre');
    assert.equal(asuntoLimpio(null, 'El de siempre'), 'El de siempre');
  });

  test('sin saltos de línea dentro', () => {
    // Pegado desde otro sitio, un asunto con un salto lo rechaza el servidor de
    // correo y el envío se cae sin que nadie entienda por qué.
    assert.equal(asuntoLimpio('Dos\nrenglones', 'X'), 'Dos renglones');
    assert.equal(asuntoLimpio('Con\r\nretorno', 'X'), 'Con retorno');
  });

  test('y sin pasarse de largo', () => {
    assert.equal(asuntoLimpio('a'.repeat(300), 'X').length, 200);
  });
});

describe('la línea que se añade', () => {
  test('sale como un párrafo', () => {
    const html = notaEnParrafos('El jueves está cerrado.');
    assert.match(html, /<p style=/);
    assert.match(html, /El jueves está cerrado\./);
  });

  test('sin nada que añadir, no se añade nada', () => {
    assert.equal(notaEnParrafos(''), '');
    assert.equal(notaEnParrafos('   '), '');
    assert.equal(notaEnParrafos(null), '');
  });

  test('lo que se teclea no se convierte en HTML', () => {
    // Es un cuadro del ERP: lo que se escriba ahí no puede acabar siendo
    // etiquetas dentro de un correo que sale con nuestro nombre.
    const html = notaEnParrafos('<b>ojo</b> con <script>esto</script>');
    assert.ok(!html.includes('<b>'));
    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;b&gt;ojo&lt;\/b&gt;/);
  });

  test('dos párrafos siguen siendo dos', () => {
    const html = notaEnParrafos('Primero.\n\nSegundo.');
    assert.equal(html.split('<p style=').length - 1, 2);
  });

  test('y un salto suelto no junta los renglones', () => {
    // Quien escribe tres renglones espera tres renglones.
    const html = notaEnParrafos('Uno\nDos');
    assert.equal(html.split('<p style=').length - 1, 1);
    assert.match(html, /Uno<br>Dos/);
  });
});
