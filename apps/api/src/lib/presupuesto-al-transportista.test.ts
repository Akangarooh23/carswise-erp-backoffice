/**
 * Pedirle precio al transportista.
 *
 * Lo que importa de este correo es que lo que vuelva sea **un precio y no una
 * estimación**: para eso lleva la dirección exacta, el día, las horas, por
 * quién se pregunta y si entra un portacoches. Con «un coche en Múnich» vuelve
 * un número que luego se discute con el camión ya cargado.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDePresupuestoAlTransportista, faltaParaPedirPresupuesto,
} from './presupuesto-al-transportista.js';

const KIA = {
  referencia: 'TRP-2026-001',
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  matricula: '',
  desde: 'Musterstraße 18, 80331 München',
  hasta: 'Zaragoza',
  contacto: 'Daniel Weber',
  telefono: '+49 89 00000000',
  disponibleDesde: '2026-09-04',
  horario: 'De lunes a viernes, de 9:00 a 17:00, avisando antes',
  entraPortacoches: true,
};

describe('lo que lleva la petición de precio', () => {
  test('las tres preguntas: si pueden, qué día y cuánto', () => {
    // Sin las tres, vuelve media respuesta y hay que escribir otra vez.
    const { html } = correoDePresupuestoAlTransportista(KIA);
    assert.match(html, /¿Podéis con este viaje\?/);
    assert.match(html, /¿Qué día lo recogerían|¿Qué día lo recogeríais\?/);
    assert.match(html, /¿Cuánto costaría/);
  });

  test('y todo lo que contestó el vendedor', () => {
    const { html } = correoDePresupuestoAlTransportista(KIA);
    assert.match(html, /Musterstraße 18, 80331 München/);
    assert.match(html, /Daniel Weber · \+49 89 00000000/);
    assert.match(html, /4 de septiembre de 2026/);
    assert.match(html, /de 9:00 a 17:00/);
    assert.match(html, /Zaragoza/);
  });

  test('el portacoches se dice, porque es lo que mueve el precio', () => {
    // Uno lleva ocho coches y sale a un tercio por coche. Callarlo es pedir un
    // precio de grúa individual sin motivo.
    assert.match(correoDePresupuestoAlTransportista(KIA).html, /portacoches llega hasta el coche/);
  });

  test('y también cuando NO entra', () => {
    // Este es el que de verdad hace daño callado: el precio se cae con el
    // conductor en la puerta, y para entonces se paga igual.
    const { html } = correoDePresupuestoAlTransportista({ ...KIA, entraPortacoches: false });
    assert.match(html, /NO entra un portacoches/);
  });

  test('si no se sabe, no se inventa', () => {
    // «Sí entra» por defecto es exactamente el precio que luego no vale.
    const { html } = correoDePresupuestoAlTransportista({ ...KIA, entraPortacoches: null });
    assert.ok(!html.includes('portacoches'));
  });

  test('el asunto lleva la referencia, para poder contestar citándola', () => {
    const { subject } = correoDePresupuestoAlTransportista(KIA);
    assert.match(subject, /TRP-2026-001/);
    assert.match(subject, /Kia Sorento/);
  });

  test('sin matrícula lo dice, en vez de dejar el hueco', () => {
    // Un coche alemán todavía no tiene matrícula española, y un hueco vacío en
    // esa fila parece un dato que se nos ha olvidado poner.
    assert.match(correoDePresupuestoAlTransportista(KIA).html, /sin matricular todavía/);
  });
});

describe('lo que impide pedirlo', () => {
  test('sin dirección de salida no es un precio, es una estimación', () => {
    assert.deepEqual(
      faltaParaPedirPresupuesto({ ...KIA, desde: '' }),
      ['apuntar de dónde sale']
    );
  });

  test('ni sin saber adónde va', () => {
    assert.deepEqual(faltaParaPedirPresupuesto({ ...KIA, hasta: '  ' }), ['apuntar adónde va']);
  });

  test('con lo del Kia, no falta nada', () => {
    assert.deepEqual(faltaParaPedirPresupuesto(KIA), []);
  });

  test('pero el horario y el contacto no lo impiden', () => {
    // Ayudan a que el precio sea firme; no tenerlos no es motivo para no
    // preguntar. Una regla que bloquea de más se salta por otro lado.
    assert.deepEqual(
      faltaParaPedirPresupuesto({ ...KIA, horario: null, contacto: null, telefono: null }),
      []
    );
  });
});

describe('el texto que lee un transportista', () => {
  test('va en castellano: los de la lista son de aquí', () => {
    const { html } = correoDePresupuestoAlTransportista(KIA);
    assert.match(html, /Hola,/);
    assert.ok(!html.includes('Guten Tag'));
  });

  test('y lo que se añade a mano entra tal cual', () => {
    const { html } = correoDePresupuestoAlTransportista({
      ...KIA, nota: '<p>Si podéis antes del viernes, mejor.</p>',
    });
    assert.match(html, /Si podéis antes del viernes/);
  });
});

describe('y el idioma lo elige quien lo manda', () => {
  test('en alemán, para el que sale de Múnich', () => {
    const { subject, html } = correoDePresupuestoAlTransportista(KIA, 'de');
    assert.match(subject, /Transportangebot/);
    assert.match(html, /Guten Tag,/);
    assert.match(html, /Können Sie diesen Transport übernehmen\?/);
    assert.match(html, /Was würde der Transport kosten\?/);
    assert.match(html, /Ein Autotransporter kommt bis zum Fahrzeug/);
  });

  test('en inglés, que es en lo que trabajan los del este', () => {
    // Media de los que hacen esta ruta son polacos o checos: ahí el alemán no
    // ayuda y el español menos.
    const { subject, html } = correoDePresupuestoAlTransportista(KIA, 'en');
    assert.match(subject, /Transport quote/);
    assert.match(html, /Hello,/);
    assert.match(html, /Can you take this job\?/);
    assert.match(html, /How much would it cost\?/);
  });

  test('y la fecha, en el formato de quien la lee', () => {
    // Un alemán lee «09/04» como el 9 de abril, y esa confusión mueve un camión
    // un mes entero.
    assert.match(correoDePresupuestoAlTransportista(KIA, 'de').html, /04\.09\.2026/);
    assert.match(correoDePresupuestoAlTransportista(KIA, 'en').html, /4 September 2026/);
    assert.match(correoDePresupuestoAlTransportista(KIA, 'es').html, /4 de septiembre de 2026/);
  });

  test('el «no entra un portacoches» también se traduce', () => {
    // Es el que hace daño callado, y en un idioma que no se lee está callado.
    const sin = { ...KIA, entraPortacoches: false };
    assert.match(correoDePresupuestoAlTransportista(sin, 'de').html, /KEIN Autotransporter/);
    assert.match(correoDePresupuestoAlTransportista(sin, 'en').html, /can NOT reach it/);
  });

  test('sin decir cuál, sale en castellano', () => {
    // Los de la lista de Proveedores son de aquí. El resto es una elección.
    assert.equal(
      correoDePresupuestoAlTransportista(KIA).html,
      correoDePresupuestoAlTransportista(KIA, 'es').html
    );
  });

  test('y los datos del coche no se traducen: son los que son', () => {
    // La calle alemana y el nombre del contacto salen igual en los tres. Una
    // dirección traducida es una dirección equivocada.
    for (const i of ['es', 'de', 'en'] as const) {
      const { html } = correoDePresupuestoAlTransportista(KIA, i);
      assert.match(html, /Musterstraße 18, 80331 München/);
      assert.match(html, /Daniel Weber/);
      assert.match(html, /TRP-2026-001/);
    }
  });
});
