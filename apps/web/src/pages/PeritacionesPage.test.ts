/**
 * Que un correo del perito salga con lo que hay delante, no con lo de antes.
 *
 * Es el mismo fallo que mordió en Transportes: el correo lo escribe el servidor
 * con lo **grabado**, y la pantalla enseña lo que se está escribiendo. Así que
 * se podía elegir el perito, pulsar «encargarle la revisión» y llevarse un «no
 * consta quién lo revisa» — con el nombre delante, en su casilla.
 *
 * Decirlo en una línea debajo del botón ya se intentaba, y no basta: nadie lee
 * la letra pequeña de un botón que parece listo.
 *
 * Aquí no hay DOM con el que montar la pantalla, así que se comprueba sobre la
 * fuente. Es poco, pero coge la regresión que importa.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./PeritacionesPage.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('los correos del perito salen con lo que hay en pantalla', () => {
  test('el encargo y el aviso de la cita llevan los datos', () => {
    // Son los dos que dependen de lo que se acaba de escribir: quién lo revisa,
    // y el día y el sitio de la cita.
    assert.match(FUENTE, /onClick=\{\(\) => onEncargar\(datos\)\}/);
    assert.match(FUENTE, /onClick=\{\(\) => onAvisarCita\(datos\)\}/);
  });

  test('y antes de preparar el correo se graba', () => {
    assert.match(FUENTE, /if \(guardarAntes\) \{/);
    assert.match(FUENTE, /await api\.patch\(`\/peritaciones\/\$\{id\}`, guardarAntes\)/);
  });

  test('si al grabar falla algo, no se prepara nada', () => {
    // Enseñar para revisar algo que no es lo que se acaba de escribir deja la
    // revisión sin sentido: se aprueba una cosa y sale otra.
    const bloque = FUENTE.slice(
      FUENTE.indexOf('if (guardarAntes) {'),
      FUENTE.indexOf('const r = await api.post<VistaDelCorreo>')
    );
    assert.match(bloque, /if \(!g\.ok\) \{[\s\S]*?return;/);
  });

  test('el guardado va antes que la vista previa', () => {
    assert.ok(
      FUENTE.indexOf('if (guardarAntes) {') < FUENTE.indexOf('const r = await api.post<VistaDelCorreo>'),
      'se prepara el correo antes de grabar'
    );
  });

  test('y ya no se le pide a nadie que guarde antes', () => {
    // Esa frase dejó de ser verdad, y una instrucción que ya no hace falta se
    // lee como que el botón no es de fiar.
    assert.doesNotMatch(FUENTE, /Guarda antes los cambios/);
  });

  test('la factura no lleva datos: se pide con la revisión ya hecha', () => {
    // Nada de la pantalla cambia lo que dice ese correo.
    assert.match(FUENTE, /onPedirFactura=\{\(\) => void preparaElCorreo\(abierta\.id, 'pedir-factura'\)\}/);
  });
});
