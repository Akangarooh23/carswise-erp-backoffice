/**
 * Que una sección se abra sola cuando le llega el turno.
 *
 * El panel de un tramo va en tres partes: se rellena la primera, se pulsa su
 * botón y **la siguiente tiene que estar delante**. Con el estado fijado solo al
 * montar —que es lo que hace `useState(prop)` y no se ve hasta que pasa—, quien
 * acaba de mandar un correo se encuentra la misma sección abierta y las de abajo
 * cerradas, y tiene que adivinar cuál toca ahora.
 *
 * Aquí no hay DOM con el que montar el componente, así que se comprueba sobre
 * la fuente. Es poco, pero coge justo la regresión que importa: alguien vuelve a
 * dejar el estado colgando del montaje y las partes dejan de encadenarse.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./Plegable.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

describe('el plegable sigue al dato, no solo al montaje', () => {
  test('guarda el último valor que le llegó', () => {
    assert.match(FUENTE, /const \[ultimo, setUltimo\] = useState\(abiertaPorDefecto\)/);
  });

  test('y cuando cambia, se abre o se pliega', () => {
    assert.match(FUENTE, /if \(ultimo !== abiertaPorDefecto\) \{/);
    assert.match(FUENTE, /setAbierta\(abiertaPorDefecto\)/);
  });

  test('durante el render y no en un efecto, para que no se vea el paso de en medio', () => {
    // Con useEffect se pinta primero el estado viejo y luego el nuevo: la
    // sección parpadea justo después de mandar el correo, que es el momento en
    // que se está mirando.
    assert.doesNotMatch(FUENTE, /useEffect/);
  });

  test('y se puede seguir abriendo y cerrando a mano', () => {
    // Solo manda el dato cuando el dato cambia. Si alguien la abre por
    // curiosidad, se queda como la dejó hasta que le toque el turno a otra.
    assert.match(FUENTE, /onClick=\{\(\) => setAbierta\(\(v\) => !v\)\}/);
  });
});
