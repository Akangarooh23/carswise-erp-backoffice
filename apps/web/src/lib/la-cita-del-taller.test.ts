/**
 * La cita del taller: día y hora sin que se pierda ninguna de las dos.
 *
 * Lo que se protege es el viaje de ida y vuelta. En la base la cita es un
 * instante y en la pantalla son dos casillas, y ese paso es donde se cuelan los
 * fallos de hora: se ven en el correo que le llega al cliente, no en la pantalla
 * de quien la apunta. Ya pasó con las visitas —a una de las 18:00 el correo le
 * ponía las 16:00— y ahí tardó en verse.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { partirLaCita, juntarLaCita, cuando, cuandoConHora } from './la-cita-del-taller.js';

describe('partir y juntar la cita', () => {
  test('lo que se escribe es lo que se vuelve a leer', () => {
    // El viaje entero: dos casillas → instante → dos casillas.
    const guardado = juntarLaCita('2026-09-22', '10:30');
    assert.ok(guardado, 'con día debería haber cita');
    assert.deepEqual(partirLaCita(guardado), { dia: '2026-09-22', hora: '10:30' });
  });

  test('y a primera hora también', () => {
    /*
     * Las 08:00 de Madrid son las 06:00 en UTC, pero una cita de las 00:30
     * cambia **de día** al pasar a UTC. Si la vuelta se hiciera sobre la cadena
     * en crudo, la pantalla enseñaría el día anterior.
     */
    const guardado = juntarLaCita('2026-09-22', '00:30');
    assert.deepEqual(partirLaCita(guardado), { dia: '2026-09-22', hora: '00:30' });
  });

  test('sin día no hay cita', () => {
    // Mientras el taller no conteste, la ficha se queda sin fecha: es la verdad.
    assert.equal(juntarLaCita('', '10:30'), null);
    assert.equal(juntarLaCita('', ''), null);
  });

  test('sin hora sí hay cita, y se queda a las 00:00', () => {
    /*
     * No se inventa una hora de oficina. Con un 09:00 por defecto, el correo le
     * diría al cliente una hora a la que no le espera nadie.
     */
    const guardado = juntarLaCita('2026-09-22', '');
    assert.deepEqual(partirLaCita(guardado), { dia: '2026-09-22', hora: '00:00' });
  });

  test('una cita vacía deja las dos casillas vacías', () => {
    for (const nada of [null, undefined, '']) {
      assert.deepEqual(partirLaCita(nada), { dia: '', hora: '' });
    }
  });

  test('y una fecha rota no rompe la pantalla', () => {
    // Llega de la base: una columna a medias no puede dejar la ficha en blanco.
    assert.deepEqual(partirLaCita('el martes'), { dia: '', hora: '' });
    assert.equal(juntarLaCita('el martes', '10:30'), null);
  });
});

describe('cómo se enseña', () => {
  test('la cita se enseña con su hora', () => {
    /*
     * El día solo era lo que había antes, y es justo lo que le falta a quien
     * tiene que llevar el coche.
     */
    const guardado = juntarLaCita('2026-09-22', '10:30') as string;
    assert.match(cuandoConHora(guardado), /10:30/);
    assert.doesNotMatch(cuando(guardado), /10:30/);
  });

  test('sin cita no se pinta un hueco raro', () => {
    assert.equal(cuando(null), '–');
    assert.equal(cuandoConHora(null), '–');
  });
});
