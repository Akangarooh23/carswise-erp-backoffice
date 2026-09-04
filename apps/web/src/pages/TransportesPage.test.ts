/**
 * Que un correo salga con lo que hay delante, no con lo de antes.
 *
 * El correo lo escribe el servidor con lo **grabado**, y la pantalla enseña lo
 * que se está escribiendo. Así que se podía elegir «sí, entra un portacoches»,
 * pulsar «Confirmar transportista» —encendido, porque la pantalla mira lo que se
 * teclea— y llevarse un «falta saber si entra un portacoches». El dato está
 * delante, en su casilla, y el aviso dice que no está: quien lo lee busca el
 * fallo en el programa, no en un botón de guardar que no ha pulsado.
 *
 * Decirlo en una línea debajo del botón no bastaba: nadie lee la letra pequeña
 * de un botón que parece listo. Así que se graba y ya está — pulsar «mandarle
 * esto» es querer mandar lo que se ve.
 *
 * Aquí no hay DOM con el que montar la pantalla, así que se comprueba sobre la
 * fuente. Es poco, pero coge la regresión que importa: que alguien vuelva a
 * dejar los botones mandando sin grabar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./TransportesPage.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('los correos del tramo salen con lo que hay en pantalla', () => {
  test('los cuatro botones mandan lo que se está escribiendo', () => {
    for (const boton of ['onPedirPresupuesto', 'onAvisarAlVendedor', 'onMandarOrden']) {
      assert.match(
        FUENTE,
        new RegExp(`onClick=\\{\\(\\) => ${boton}\\(\\{ \\.\\.\\.datos, llegada \\}\\)\\}`),
        `${boton} manda sin los datos de la pantalla`
      );
    }
  });

  test('y antes de preparar el correo se graba', () => {
    assert.match(FUENTE, /if \(guardarAntes\) \{/);
    assert.match(FUENTE, /await api\.patch<Transporte>\(`\/transportes\/\$\{id\}`, guardarAntes\)/);
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

  test('el guardado va antes que la vista previa, no después', () => {
    assert.ok(
      FUENTE.indexOf('if (guardarAntes) {') < FUENTE.indexOf('const r = await api.post<VistaDelCorreo>'),
      'se prepara el correo antes de grabar'
    );
  });

  test('y al cambiar de idioma no se vuelve a grabar', () => {
    // Es el mismo correo otra vez: no hay nada nuevo que escribir, y volver a
    // grabar pisaría lo que se haya tocado mientras se leía.
    assert.match(FUENTE, /if \(revisando\) void abreParaRevisar\(revisando\.ruta, revisando\.id, i\);/);
  });
});
