/**
 * El teléfono de quien vende es para llamar nosotros, no para dárselo al cliente.
 *
 * Quien llama al concesionario es una persona de la empresa, desde el ERP. El
 * cliente no tiene que llamar a nadie: para eso se le confirma la visita con
 * **dónde es** y **por quién preguntar**, que son datos distintos y los teclea
 * un trabajador sabiendo que los va a leer él.
 *
 * Es fácil de romper sin querer. Los dos datos viven en la misma consulta y a
 * medio metro uno de otro, y el día que alguien quiera «que el cliente pueda
 * avisar si llega tarde» lo natural es meter el teléfono que ya está ahí. Estas
 * pruebas son la puerta: si se cuela, fallan.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  correoDeConfirmacion, correoDeCambioDeHora, correoDeLugar,
  correoDeOtrasHoras, correoDeCancelacion, mensajeDeOtrasHoras,
} from './visits.js';

const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FUENTE = readFileSync(join(DIR, 'visits.ts'), 'utf8');

/** Lo del vendedor, tal y como se llama en cada sitio donde se lee. */
const LO_DEL_VENDEDOR = /seller_phone|seller_horario|v\.telefono|v\.horario/;

const RESERVA = {
  id: '11111111-1111-1111-1111-111111111111',
  offer_id: 'erp-9',
  vehicle_title: 'Toyota C-HR',
  starts_at: '2026-09-15T08:00:00.000Z',
  ends_at: '2026-09-15T09:00:00.000Z',
  buyer_email: 'cliente@ejemplo.es',
  buyer_name: 'Juan',
};

describe('lo que se le manda al cliente', () => {
  /*
   * Los datos del vendedor no se le pasan a estas funciones, y esa es
   * justamente la propiedad que se fija: no es que se filtren bien, es que no
   * las tocan. Si algún día una de ellas creciera para recibirlos, esta lista
   * dejaría de compilar o el texto empezaría a llevarlos.
   */
  const salidas = [
    ['la confirmación', correoDeConfirmacion(RESERVA, 'Calle Coso 12', 'Marta')],
    ['el cambio de hora', correoDeCambioDeHora(RESERVA, '2026-09-14T08:00:00.000Z', 'https://popcar.tech/x')],
    ['dónde es', correoDeLugar(RESERVA, 'Calle Coso 12', 'Marta')],
    ['las otras horas', correoDeOtrasHoras(RESERVA, ['2026-09-16T08:00:00.000Z'], (h) => `https://popcar.tech/x?h=${h}`)],
    ['la cancelación', correoDeCancelacion(RESERVA, 'El coche ya no está')],
  ] as const;

  for (const [nombre, correo] of salidas) {
    test(`${nombre} no lleva teléfono de vendedor`, () => {
      const todo = correo.subject + correo.html;
      assert.doesNotMatch(todo, /976 000 111|910000000/, 'ha salido un teléfono de vendedor');
      // Y tampoco la palabra, que sería la señal de que alguien lo ha metido
      // con otro número.
      assert.doesNotMatch(todo, /tel[ée]fono del (concesionario|vendedor)/i);
    });
  }

  test('y el WhatsApp de las horas, tampoco', () => {
    const texto = mensajeDeOtrasHoras('Toyota C-HR', 'Juan', ['2026-09-16T08:00:00.000Z']);
    assert.doesNotMatch(texto, /976 000 111|910000000/);
  });

  test('lo que sí lleva es dónde es y por quién preguntar', () => {
    // Que son otros datos: los teclea un trabajador sabiendo que los lee el
    // cliente. Sin esto, la prueba de arriba pasaría con los correos vacíos.
    const c = correoDeConfirmacion(RESERVA, 'Calle Coso 12', 'Marta');
    assert.match(c.html, /Calle Coso 12/);
    assert.match(c.html, /Marta/);
  });
});

describe('y quién puede leerlo', () => {
  /**
   * Cada `visitsRouter.<verbo>('...')` con lo que va detrás, hasta el
   * siguiente. Basta para ver qué pide cada ruta y qué contesta.
   */
  function lasRutas(fuente: string): { camino: string; cuerpo: string }[] {
    const trozos = fuente.split(/visitsRouter\.(?:get|post|patch|put|delete)\(/).slice(1);
    return trozos.map((t) => ({
      camino: (/^\s*'([^']+)'/.exec(t) ?? [, '?'])[1] as string,
      cuerpo: t,
    }));
  }

  test('toda ruta que devuelve lo del vendedor pide un papel', () => {
    // Sin `requireRole` la contestaría cualquiera que sepa la dirección, y lo
    // que hay dentro son los teléfonos de los concesionarios.
    const sueltas = lasRutas(FUENTE)
      .filter((r) => LO_DEL_VENDEDOR.test(r.cuerpo))
      .filter((r) => !/requireRole\(ROLES\)/.test(r.cuerpo.slice(0, 200)))
      .map((r) => r.camino);
    assert.deepEqual(sueltas, [], `rutas sin papel que devuelven lo del vendedor: ${sueltas.join(', ')}`);
  });

  test('y la Agenda lo devuelve, que si no la de arriba pasa sola', () => {
    // Anclado a la ruta concreta y no a «alguna»: con «alguna» bastaba con que
    // cualquier trozo del fichero nombrara el teléfono para dar la comprobación
    // por buena, y quitarlo de la Agenda no habría hecho fallar nada.
    const agenda = lasRutas(FUENTE).find((r) => r.camino === '/all-bookings');
    assert.ok(agenda, 'no encuentro la ruta de la Agenda');
    // Sale del SELECT y se completa despues con la ficha del proveedor, asi
    // que lo que se ancla es que la ruta siga trayendo lo de quien vende.
    assert.match(agenda.cuerpo, /o\.seller_phone/, 'la Agenda ya no trae el teléfono');
    assert.match(agenda.cuerpo, /conLaFichaDeQuienVende/, 'la Agenda ya no completa con la ficha');
  });

  test('ninguna otra parte de la API lo lee', () => {
    // Fuera de las visitas y del marketplace —que es donde se edita la ficha de
    // la oferta— nadie tiene por qué tocarlo.
    const permitidos = new Set(['visits.ts', 'marketplace.ts']);
    const fuera: string[] = [];
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith('.ts') || f.includes('.test.') || permitidos.has(f)) continue;
      if (/seller_phone|seller_horario/.test(readFileSync(join(DIR, f), 'utf8'))) fuera.push(f);
    }
    assert.deepEqual(fuera, [], `también lo leen: ${fuera.join(', ')}`);
  });
});
