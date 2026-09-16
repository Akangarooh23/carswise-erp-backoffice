/**
 * Que se sepa **cuál** de los coches es el que espera algo.
 *
 * El panel decía «1 encargo listo para el taller» y llevaba a la lista entera de
 * IDCars, donde todos se ven iguales: la única forma de encontrarlo era abrirlos
 * uno a uno. Y en el menú, IDCars era la única pantalla con trabajo dentro y sin
 * número fuera.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOMBRE_CORTO, esUrgente, algunoEsUrgente, cuantosCochesEsperan, porCoche,
  type IdCarConAvisos,
} from './avisos-de-los-idcars.js';

const coche = (vehicle_id: string, avisos: string[]): IdCarConAvisos =>
  ({ vehicle_id, matricula: '8888LXR', coche: 'Volkswagen T-Roc', avisos });

describe('cuántos coches esperan algo', () => {
  test('uno con dos cosas pendientes es un coche, no dos', () => {
    /*
     * El número del menú dice a cuántas fichas hay que entrar. El del panel dice
     * cuántas cosas hay que hacer. Son dos preguntas distintas, y contar avisos
     * aquí pondría un 2 en el menú con un solo coche que mirar.
     */
    assert.equal(cuantosCochesEsperan([coche('v1', ['encargos_sin_firmar', 'encargos_sin_franjas'])]), 1);
  });

  test('y los que no esperan nada no cuentan', () => {
    assert.equal(cuantosCochesEsperan([coche('v1', []), coche('v2', ['encargos_listos'])]), 1);
  });

  test('sin encargos vivos, cero', () => {
    // Y con cero el menú no pinta nada: una insignia en cero enseña a no mirarla.
    assert.equal(cuantosCochesEsperan([]), 0);
  });
});

describe('lo que espera cada coche', () => {
  test('se puede buscar por el id del coche', () => {
    const mapa = porCoche([coche('v1', ['encargos_listos']), coche('v2', [])]);
    assert.deepEqual(mapa.v1, ['encargos_listos']);
    assert.equal(mapa.v2, undefined, 'un coche sin nada no debería salir marcado');
  });
});

describe('qué se pinta en rojo', () => {
  test('lo que cuesta dinero o tiene a alguien esperando', () => {
    assert.equal(esUrgente('encargos_vendidos'), true, 'los 299 € sin facturar');
    assert.equal(esUrgente('encargos_sin_firmar'), true, 'se trabaja sin poder cobrar');
    assert.equal(esUrgente('encargos_por_llamar'), true, 'se le acaba el plazo');
    assert.equal(esUrgente('encargos_rechazados'), true, 'su coche no va a salir y no lo sabe');
    assert.equal(esUrgente('encargos_sin_franjas'), true, 'nadie puede ir a ver el coche');
  });

  test('pero no el trabajo nuestro que está en marcha', () => {
    /*
     * «Falta la revisión» es que le toca al taller. Pintarlo de rojo junto a lo
     * anterior haría que el rojo dejara de significar nada, que es lo que pasa
     * cuando todo es urgente.
     */
    assert.equal(esUrgente('encargos_listos'), false);
  });

  test('con uno urgente, la fila ya lo es', () => {
    assert.equal(algunoEsUrgente(['encargos_listos', 'encargos_sin_firmar']), true);
    assert.equal(algunoEsUrgente(['encargos_listos']), false);
    assert.equal(algunoEsUrgente([]), false);
  });
});

describe('cómo se llama cada uno en la tabla', () => {
  test('los seis tienen nombre corto', () => {
    /*
     * Uno sin nombre saldría con su clave —«encargos_sin_franjas»— al lado del
     * coche. Se entiende, pero se lee como un error del programa.
     */
    for (const clave of ['encargos_vendidos', 'encargos_por_llamar', 'encargos_sin_franjas',
                         'encargos_listos', 'encargos_rechazados', 'encargos_sin_firmar']) {
      assert.ok(NOMBRE_CORTO[clave], `falta el nombre corto de ${clave}`);
    }
  });

  test('y caben en una celda', () => {
    // La frase del panel («el cliente ya lo ha traído todo y falta la revisión
    // para poder publicar») está pensada para leerse suelta, no dentro de una
    // tabla de siete columnas.
    for (const [clave, nombre] of Object.entries(NOMBRE_CORTO)) {
      assert.ok(nombre.length <= 24, `${clave} es demasiado largo: «${nombre}»`);
    }
  });
});

describe('y está enchufado donde se mira', () => {
  /*
   * Lo de siempre: el cálculo puede estar perfecto y no llegar a la pantalla.
   * Aquí no hay DOM con el que montar nada, así que se comprueba el cable sobre
   * la fuente — que es justo lo que se rompe al mover una línea.
   */
  const leer = (ruta: string) =>
    readFileSync(new URL(ruta, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8')
      .replace(/\r\n/g, '\n');

  const LAYOUT = leer('../components/layout/AppLayout.tsx');
  const LISTA = leer('../pages/IdCarsPage.tsx');
  const MENU = leer('../components/layout/Sidebar.tsx');

  test('el menú pide los avisos y los cuenta', () => {
    assert.match(LAYOUT, /\/encargos\/avisos-por-coche/);
    assert.match(LAYOUT, /cuantosCochesEsperan\(/);
  });

  test('y el número acaba en la entrada de IDCars', () => {
    // Sin esta línea se pide el dato, se cuenta, y no se pinta: el mismo
    // silencio de antes con una llamada de más.
    assert.match(LAYOUT, /'\/idcars': idcarsQueEsperan/);
  });

  test('el menú sabe pintar la insignia de esa entrada', () => {
    assert.match(MENU, /pendientes\[item\.to\]/);
  });

  test('la lista pide lo mismo y lo reparte por coche', () => {
    assert.match(LISTA, /\/encargos\/avisos-por-coche/);
    assert.match(LISTA, /porCoche\(/);
  });

  test('y lo pinta en la fila del coche', () => {
    assert.match(LISTA, /avisos\[v\.id\]/);
    assert.match(LISTA, /NOMBRE_CORTO\[a\]/);
  });
});
