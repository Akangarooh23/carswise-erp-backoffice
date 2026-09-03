/**
 * La orden de recogida que se le manda al transportista.
 *
 * Lo que importa de este correo es que un conductor pueda ir a por el coche sin
 * llamar: qué recoge, dónde, por quién pregunta al llegar, adónde lo lleva y
 * desde cuándo. Si falta una de esas, el correo no ahorra la llamada, que es
 * para lo único que existe.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeOrdenDeRecogida, faltaParaLaOrden, puntoEscrito, enFecha,
} from './orden-de-recogida.js';

const TRAMO = {
  referencia: 'TRA-2026-001',
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  matricula: '',
  origen: { donde: 'München', quien: 'Autowelt Kaufmann GmbH' },
  destino: { donde: 'Zaragoza' },
  recogidaPrevista: '2026-09-11',
  coste: 620,
};

describe('lo que lleva la orden', () => {
  test('el coche, de dónde a dónde y desde cuándo', () => {
    const { html } = correoDeOrdenDeRecogida(TRAMO);
    assert.match(html, /Kia Sorento/);
    assert.match(html, /München/);
    assert.match(html, /Zaragoza/);
    assert.match(html, /11 de septiembre de 2026/);
  });

  test('y por quién preguntar al llegar', () => {
    // Sin un nombre en la punta, el conductor llega y llama aquí.
    const { html } = correoDeOrdenDeRecogida(TRAMO);
    assert.match(html, /preguntar por Autowelt Kaufmann GmbH/);
  });

  test('con su teléfono, si el vendedor lo dio', () => {
    // Un nombre sin teléfono sirve si sale a abrir. Si no sale, no sirve.
    const { html } = correoDeOrdenDeRecogida({
      ...TRAMO,
      origen: { donde: 'Musterstraße 18, 80331 München', quien: 'Daniel Weber', telefono: '+49 89 00000000' },
    });
    assert.match(html, /preguntar por Daniel Weber · \+49 89 00000000/);
  });

  test('y en qué horas se puede ir', () => {
    // «A partir del 4» sin horas manda al conductor a una puerta cerrada: el
    // vendedor abre de nueve a cinco y avisando antes, no cuando se llegue.
    const { html } = correoDeOrdenDeRecogida({
      ...TRAMO, horarioOrigen: 'De lunes a viernes, de 9:00 a 17:00, avisando antes',
    });
    assert.match(html, /Horario de recogida/);
    assert.match(html, /de 9:00 a 17:00/);
  });

  test('y sin horario no se inventa uno', () => {
    // Poner «horario: —» hace pensar que se preguntó y no lo dijeron.
    assert.ok(!correoDeOrdenDeRecogida(TRAMO).html.includes('Horario de recogida'));
  });

  test('un coche sin matricular se dice, no se deja en blanco', () => {
    // Un hueco vacío en la matrícula se lee como un dato que falta por copiar.
    const { html } = correoDeOrdenDeRecogida(TRAMO);
    assert.match(html, /sin matricular todavía/);
  });

  test('con matrícula, va en el asunto: es como lo van a buscar', () => {
    const { subject } = correoDeOrdenDeRecogida({ ...TRAMO, matricula: '1234ABC' });
    assert.match(subject, /1234ABC/);
    assert.match(subject, /TRA-2026-001/);
  });

  test('el precio solo si está cerrado', () => {
    assert.match(correoDeOrdenDeRecogida(TRAMO).html, /620,00 €/);
    assert.ok(!correoDeOrdenDeRecogida({ ...TRAMO, coste: null }).html.includes('Precio acordado'));
  });

  test('sin fecha, se dice que no la hay en vez de callarlo', () => {
    // Un correo que no menciona la fecha se contesta preguntando por la fecha.
    const { html } = correoDeOrdenDeRecogida({ ...TRAMO, recogidaPrevista: null });
    assert.match(html, /Todavía no tenemos fecha de salida/);
    assert.ok(!html.includes('A partir del'));
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeOrdenDeRecogida({
      ...TRAMO, origen: { donde: '<b>München</b>' },
    });
    assert.ok(!html.includes('<b>München</b>'));
    assert.match(html, /&lt;b&gt;/);
  });
});

describe('lo que hace falta para mandarla', () => {
  test('con coche, origen y destino, se puede', () => {
    assert.deepEqual(faltaParaLaOrden(TRAMO), []);
  });

  test('sin destino no se manda: sería un camión sin adónde ir', () => {
    assert.deepEqual(
      faltaParaLaOrden({ ...TRAMO, destino: { donde: '' } }),
      ['adónde va']
    );
  });

  test('y si falta todo, se dicen los tres', () => {
    assert.deepEqual(
      faltaParaLaOrden({ referencia: 'X', vehiculo: '', origen: { donde: '' }, destino: { donde: '' } }),
      ['qué coche es', 'de dónde se recoge', 'adónde va']
    );
  });
});

describe('cómo se escribe cada punta', () => {
  test('la dirección y por quién preguntar', () => {
    assert.equal(
      puntoEscrito({ donde: 'Calle X 1, Madrid', quien: 'Ana', telefono: '600100200' }),
      'Calle X 1, Madrid — preguntar por Ana · 600100200'
    );
  });

  test('sin contacto, solo la dirección y sin guion suelto', () => {
    assert.equal(puntoEscrito({ donde: 'Zaragoza' }), 'Zaragoza');
  });

  test('con teléfono pero sin nombre, vale igual', () => {
    assert.equal(
      puntoEscrito({ donde: 'Zaragoza', telefono: '600100200' }),
      'Zaragoza — preguntar por 600100200'
    );
  });
});

describe('las fechas', () => {
  test('se escriben como se leen aquí', () => {
    assert.equal(enFecha('2026-09-11'), '11 de septiembre de 2026');
  });

  test('y lo que no es una fecha no se pinta', () => {
    // Un «Invalid Date» en una orden de recogida es peor que no poner nada.
    assert.equal(enFecha('lo que sea'), '');
    assert.equal(enFecha(null), '');
    assert.equal(enFecha(''), '');
  });
});
