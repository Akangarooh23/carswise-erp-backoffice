/**
 * El buscador no pide una vez por tecla.
 *
 * ## Lo que pasaba
 *
 * `SearchInput` llamaba a `onChange` en cada pulsación, y las **seis** pantallas que lo
 * usan mandan ese texto al servidor como dependencia de un efecto. Escribir «garcia»
 * eran seis consultas paginadas contra Neon, ninguna cancelable —`api.get` no tiene
 * `AbortController`— y **ganaba la última que llegaba**, que no tiene por qué ser la de
 * «garcia».
 *
 * En `ConsentimientosPage` eso es enseñar la fila de otra persona al preguntar si
 * alguien aceptó el tratamiento de sus datos.
 *
 * ## Por qué se comprueba sobre la fuente
 *
 * Aquí no hay DOM con el que montar el componente —este repositorio no tiene
 * `testing-library` ni `jsdom`, y sus pruebas de componente son todas así; ver
 * `Plegable.test.ts`—. Es poco, y coge justo las regresiones que importan: que alguien
 * quite el retardo «porque va lento», o que lo deje sin limpiar, o que meta el manejador
 * en las dependencias y el temporizador no termine nunca.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./SearchInput.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MARKETPLACE = readFileSync(new URL('../../pages/MarketplacePage.tsx', import.meta.url), 'utf8');

describe('el buscador espera antes de buscar', () => {
  test('el texto que se ve y el que se manda son dos cosas', () => {
    // Si el campo esperara al servidor para pintarse, se escribiría a trompicones.
    assert.match(FUENTE, /const \[texto, setTexto\] = useState\(value\)/);
    assert.match(FUENTE, /value=\{texto\}/, 'el campo pinta el texto local');
    assert.match(FUENTE, /onChange=\{\(e\) => setTexto\(e\.target\.value\)\}/, 'y escribir solo toca lo local');
  });

  test('y sube con un temporizador que se limpia', () => {
    /*
     * Sin el `clearTimeout`, cada tecla dejaría su propio temporizador vivo y se
     * mandarían todas las búsquedas con 350 ms de retraso: el mismo problema, más tarde.
     */
    assert.match(FUENTE, /setTimeout\(\(\) => alCambiar\.current\(texto\), RETARDO_MS\)/);
    assert.match(FUENTE, /return \(\) => clearTimeout\(t\)/);
  });

  test('el manejador va en un `ref`, no en las dependencias', () => {
    /*
     * Los padres lo pasan como función anónima, así que cambia de identidad en cada
     * repintado. En las dependencias, el temporizador se reiniciaría en cada repintado y
     * la búsqueda podría no salir nunca — y eso se nota como «el buscador no va», que es
     * peor que lo que se venía a arreglar.
     */
    assert.match(FUENTE, /const alCambiar = useRef\(onChange\)/);
    const efecto = /\}, \[texto, value\]\);/.exec(FUENTE);
    assert.ok(efecto, 'el efecto del retardo depende solo del texto y del valor');
    assert.ok(!/\}, \[texto, value, onChange\]\)/.test(FUENTE), 'onChange no puede estar en las dependencias');
  });

  test('si el padre cambia el valor, manda él', () => {
    // «Limpiar filtros» pone `q` a vacío desde fuera; el campo tiene que obedecer.
    assert.match(FUENTE, /useEffect\(\(\) => \{ setTexto\(value\); \}, \[value\]\)/);
  });

  test('e Intro busca ya, sin esperar', () => {
    // Quien lo pide explícitamente no debe esperar 350 ms más.
    assert.match(FUENTE, /e\.key === 'Enter'/);
    assert.match(FUENTE, /alCambiar\.current\(e\.currentTarget\.value\)/);
  });
});

describe('y el retardo es el que ya usaba el proyecto', () => {
  test('350 ms, los mismos que los filtros de columna de MarketplacePage', () => {
    /*
     * El número no se eligió a ojo. `MarketplacePage` ya retardaba sus filtros de
     * columna 350 ms —cuatro veces, en el mismo fichero donde no retardaba el buscador—.
     *
     * Esta prueba ata los dos: si alguien cambia uno, que se entere de que había otro.
     */
    assert.match(FUENTE, /export const RETARDO_MS = 350;/);
    assert.ok(
      /setTimeout\(\(\) => setColF\w*Deb\([^)]*\), 350\)/.test(MARKETPLACE),
      'MarketplacePage sigue usando 350 ms en sus filtros de columna'
    );
  });
});
