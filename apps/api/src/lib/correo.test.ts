/**
 * Lo que sale en un correo al cliente.
 *
 * Es lo único de todo el ERP que ve alguien de fuera, y una vez enviado no se
 * puede corregir. Lo que se fija aquí:
 *
 *   · Que lo que escribe una persona —el nombre de contacto, el título de un
 *     vehículo, la respuesta del equipo— no pueda escribir HTML en el correo.
 *   · Que las direcciones que vienen de portales de fuera acaben en el `href`
 *     sin poder salirse del atributo.
 *   · Que no vuelva la marca anterior, que estuvo saliendo en trece correos.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { esc, urlSegura, plantilla, parrafo, datos, aviso, boton, enlace, MARCA } from './correo.js';

describe('lo que escribe una persona no escribe HTML', () => {
  test('las etiquetas se quedan en texto', () => {
    assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('las comillas no dejan salirse de un atributo', () => {
    assert.equal(esc('" onmouseover="robar()'), '&quot; onmouseover=&quot;robar()');
    assert.ok(!esc("' onclick='x").includes("'"));
  });

  test('el ampersand se escapa antes que nada', () => {
    // Si se escapara al final, `&lt;` volvería a convertirse en `<`.
    assert.equal(esc('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
  });

  test('sin dato no se escribe «undefined»', () => {
    assert.equal(esc(undefined), '');
    assert.equal(esc(null), '');
  });

  test('un nombre normal no se toca', () => {
    assert.equal(esc('Ana Picazo Kangaroo'), 'Ana Picazo Kangaroo');
    assert.equal(esc('Citroën C4 Hybrid 145 E-DC56 Max'), 'Citroën C4 Hybrid 145 E-DC56 Max');
  });
});

describe('las direcciones que van a un href', () => {
  test('una dirección de portal, con sus parámetros, pasa escapada', () => {
    const real = 'https://www.idex-dekra.es/public/ver.htm?id=1592064&codigo=0BqaJ17w9bPu';
    assert.equal(urlSegura(real), 'https://www.idex-dekra.es/public/ver.htm?id=1592064&amp;codigo=0BqaJ17w9bPu');
  });

  test('no se puede salir del atributo', () => {
    const ataque = 'https://x.com/" onmouseover="robar()';
    assert.ok(!urlSegura(ataque).includes('"'), 'una comilla suelta permitiría escribir marcado propio');
  });

  test('javascript: no sale en un correo', () => {
    assert.equal(urlSegura('javascript:alert(1)'), '');
    assert.equal(urlSegura('JavaScript:alert(1)'), '');
  });

  test('ni data:, ni file:, ni nada raro', () => {
    for (const u of ['data:text/html,<script>x</script>', 'file:///etc/passwd', 'vbscript:msgbox', '//evil.com']) {
      assert.equal(urlSegura(u), '', u);
    }
  });

  test('sin dirección, el enlace queda vacío y no roto', () => {
    assert.equal(urlSegura(''), '');
    assert.equal(urlSegura(undefined), '');
  });

  test('el enlace y el botón usan esa limpieza', () => {
    assert.ok(!enlace('Ver', 'javascript:alert(1)').includes('javascript'));
    assert.ok(!boton('Ir', 'https://x.com/" onclick="y').includes('onclick="y'));
  });
});

describe('la maqueta', () => {
  const correo = plantilla({
    titulo: 'Tu cita está lista',
    cuerpo:
      parrafo('Hola <strong>Ana</strong>,') +
      datos([['Fecha', 'martes, 8 de septiembre']]) +
      aviso('Confirma la cita', 'Si no la confirmas, el turno puede asignarse a otro cliente.') +
      boton('Confirmar la cita', MARCA.sitioUrl + '/panel/solicitudes'),
  });

  test('es un documento completo', () => {
    assert.ok(correo.startsWith('<!doctype html>'));
    assert.ok(correo.includes('<meta charset="utf-8">'));
    assert.ok(correo.trim().endsWith('</html>'));
  });

  test('lleva la marca de ahora, no la de antes', () => {
    assert.ok(correo.includes('PopCar'));
    assert.ok(!/carswise/i.test(correo), 'la marca anterior estuvo saliendo en trece correos');
  });

  test('sin colores de la marca anterior', () => {
    // El azul #2563eb y el verde #059669 eran los de la maqueta vieja.
    assert.ok(!/2563eb|059669/i.test(correo));
  });

  test('sin emoji', () => {
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(correo));
  });

  test('el título también se escapa', () => {
    const raro = plantilla({ titulo: '<script>x</script>', cuerpo: '' });
    assert.ok(!raro.includes('<script>'));
  });

  test('va con tablas y estilos a mano, que es lo que aguanta en Gmail', () => {
    // Gmail borra cualquier <style>: si alguien mete uno, el correo se ve roto.
    assert.ok(!correo.includes('<style'));
    assert.ok(correo.includes('role="presentation"'));
  });
});
