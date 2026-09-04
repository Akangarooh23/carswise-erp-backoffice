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

  test('con fecha, confirma; sin fecha, pide cerrarla', () => {
    // Este correo es el contrato: sale cuando ellos ya han dicho que pueden, qué
    // día y por cuánto. Terminaba con «decidnos qué día podéis», que es lo que se
    // les escribió la primera vez, y deja la orden pareciendo otra pregunta:
    // nadie prepara un camión para un correo que sigue negociando.
    assert.match(correoDeOrdenDeRecogida(TRAMO).html, /Queda confirmado para ese día/);
    assert.doesNotMatch(correoDeOrdenDeRecogida(TRAMO).html, /Decidnos qué día podéis/);
    // Y el día es el día, no un suelo: «a partir del» es cómo se pregunta, y
    // deja al conductor eligiendo cuándo va.
    assert.match(correoDeOrdenDeRecogida(TRAMO).html, /Día de recogida/);
    assert.doesNotMatch(correoDeOrdenDeRecogida(TRAMO).html, /A partir del/);
    assert.match(correoDeOrdenDeRecogida(TRAMO, 'de').html, /Abholtermin/);
    assert.match(correoDeOrdenDeRecogida(TRAMO, 'en').html, /Pick-up date/);

    // Y sin fecha sí pregunta, que es lo único que se puede hacer. No debería
    // salir así —la pantalla lo exige y la ruta también—, pero callar la fecha
    // es peor: un correo que no la menciona se contesta preguntando por ella.
    const { html } = correoDeOrdenDeRecogida({ ...TRAMO, recogidaPrevista: null });
    assert.match(html, /Nos falta cerrar el día/);
    assert.ok(!html.includes('Día de recogida'));
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeOrdenDeRecogida({
      ...TRAMO, origen: { donde: '<b>München</b>' },
    });
    assert.ok(!html.includes('<b>München</b>'));
    assert.match(html, /&lt;b&gt;/);
  });
});

describe('y la orden también sale en tres idiomas', () => {
  test('en alemán', () => {
    const { subject, html } = correoDeOrdenDeRecogida(TRAMO, 'de');
    assert.match(subject, /Abholung/);
    assert.match(html, /Guten Tag,/);
    assert.match(html, /Abholort/);
    assert.match(html, /11\.09\.2026/);
  });

  test('en inglés', () => {
    const { subject, html } = correoDeOrdenDeRecogida(TRAMO, 'en');
    assert.match(subject, /Pick-up/);
    assert.match(html, /Collect at/);
    assert.match(html, /11 September 2026/);
  });

  test('y el «preguntar por» se traduce con el punto', () => {
    // Es la frase que lee el conductor en la puerta: en castellano dentro de
    // una orden alemana es la que se salta.
    assert.match(correoDeOrdenDeRecogida(TRAMO, 'de').html, /fragen nach Autowelt/);
    assert.match(correoDeOrdenDeRecogida(TRAMO, 'en').html, /ask for Autowelt/);
  });

  test('sin decir cuál, en castellano', () => {
    assert.equal(correoDeOrdenDeRecogida(TRAMO).html, correoDeOrdenDeRecogida(TRAMO, 'es').html);
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

/**
 * Lo que la orden tenía que decir y no decía.
 *
 * Lo leyó Ana en la del segundo viaje. Tres cosas:
 *
 * 1. Saludaba a la empresa **por el nombre del conductor**. El campo estuvo
 *    hecho para el de tráfico, el que contesta los presupuestos; desde que
 *    significa quien conduce, el saludo le escribe a quien no lo va a leer.
 * 2. En el segundo viaje no decía **por quién preguntar** al recoger, porque
 *    se escribió cuando el segundo salía de «Zaragoza» a secas y allí no había
 *    ficha de nadie. Ahora sale de nuestro depósito y hay alguien que abre.
 * 3. No decía **si entra un portacoches**, que es lo que decide si mandan el
 *    camión grande o una grúa, y por tanto el precio que ya está acordado.
 */
describe('lo que hay que decirle al recoger', () => {
  const CON_TODO = {
    ...TRAMO,
    origen: { donde: 'Avenida Cataluña 103, 50014, Zaragoza', quien: 'Juan Hernández', telefono: '682791928' },
    horarioOrigen: 'De lunes a viernes, de 9:00 a 17:00',
    portacoches: true,
    contactoSuyo: 'Javier Campo',
  };

  test('el saludo no lleva nombre', () => {
    // Va al buzón de la empresa, y el nombre que tenemos es el del conductor.
    const { html } = correoDeOrdenDeRecogida(CON_TODO);
    assert.match(html, /Hola,/);
    assert.doesNotMatch(html, /Hola Javier Campo/);
  });

  test('pero el conductor sigue estando, en la tabla', () => {
    // Les devuelve el nombre que nos dieron: así se ve si hablamos del mismo.
    const { html } = correoDeOrdenDeRecogida(CON_TODO);
    assert.match(html, /Conductor/);
    assert.match(html, /Javier Campo/);
  });

  test('y sin nombre de conductor no se inventa la fila', () => {
    const { html } = correoDeOrdenDeRecogida({ ...CON_TODO, contactoSuyo: null });
    assert.doesNotMatch(html, /Conductor/);
  });

  test('dice si entra un portacoches', () => {
    assert.match(correoDeOrdenDeRecogida(CON_TODO).html, /Entra un portacoches/);
    assert.match(correoDeOrdenDeRecogida(CON_TODO).html, /llega hasta el coche/);
  });

  test('y dice también que no entra, que es lo que cambia el camión', () => {
    assert.match(
      correoDeOrdenDeRecogida({ ...CON_TODO, portacoches: false }).html,
      /hay que sacarlo a la calle/
    );
  });

  test('mientras no se sabe, se calla', () => {
    // Callarlo es mejor que afirmar un «sí» inventado: así es como se manda un
    // portacoches a un sótano.
    assert.doesNotMatch(
      correoDeOrdenDeRecogida({ ...CON_TODO, portacoches: null }).html,
      /portacoches/i
    );
  });

  test('en los tres idiomas', () => {
    assert.match(correoDeOrdenDeRecogida(CON_TODO, 'de').html, /Autotransporter/);
    assert.match(correoDeOrdenDeRecogida(CON_TODO, 'en').html, /car carrier/);
    assert.match(correoDeOrdenDeRecogida(CON_TODO, 'de').html, /Fahrer/);
    assert.match(correoDeOrdenDeRecogida(CON_TODO, 'en').html, /Driver/);
  });
});
