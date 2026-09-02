/**
 * Las peritaciones: la única promesa de este negocio, con nombre y fecha.
 *
 * «No se le paga al vendedor hasta que uno de los nuestros ve el coche» era una
 * casilla. Lo que se fija aquí es lo que hace que deje de serlo: que solo un
 * veredicto abre la puerta al pago, y que al perito se le dice exactamente qué
 * mirar — «revísalo» devuelve «está bien».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeEncargoAlPerito, faltaParaEncargarLaRevision,
  abreLaPuertaAlPago, esVeredicto, esEstadoPeritacion,
  ESTADOS_PERITACION, QUE_MIRA_EL_PERITO,
  correoDeLaCitaAlVendedor, faltaParaAvisarDeLaCita,
} from './peritaciones.js';

const CASO = {
  vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
  anuncio: 'https://www.autoscout24.es/anuncios/kia-sorento-cat_ma39mo1828',
  donde: 'Landsberger Str. 120, 80339 München',
  contacto: 'Herr Kaufmann · +49 89 123456',
};

describe('quién puede soltar el dinero', () => {
  test('solo el veredicto bueno abre la puerta', () => {
    assert.equal(abreLaPuertaAlPago('es_el_que_se_anuncio'), true);
    assert.equal(abreLaPuertaAlPago('no_es_el_que_se_anuncio'), false);
  });

  test('y nada que no sea un veredicto', () => {
    // Un campo vacío, un «sí» suelto o lo que mande un navegador no valen: de
    // esto depende que salgan 16.890 € hacia Alemania.
    for (const x of ['', 'sí', 'ok', null, undefined, true, 1, {}]) {
      assert.equal(abreLaPuertaAlPago(x), false, `ha colado: ${JSON.stringify(x)}`);
      assert.equal(esVeredicto(x), false);
    }
  });

  test('los dos veredictos son los que hay', () => {
    assert.equal(esVeredicto('es_el_que_se_anuncio'), true);
    assert.equal(esVeredicto('no_es_el_que_se_anuncio'), true);
  });
});

describe('por dónde pasa una peritación', () => {
  test('tres estados y ninguno más', () => {
    assert.deepEqual([...ESTADOS_PERITACION], ['Por encargar', 'Encargada', 'Hecha']);
  });

  test('y no hay «cancelada»', () => {
    // Si el coche no era el que se anunció, eso es el resultado y se guarda.
    // Borrarla escondería el único momento en que este sistema dijo que no.
    assert.equal(esEstadoPeritacion('Cancelada'), false);
    assert.equal(esEstadoPeritacion('Hecha'), true);
  });
});

describe('el encargo al perito', () => {
  test('dice qué mirar, punto por punto y en los dos idiomas', () => {
    // «Revísalo» devuelve «está bien».
    const { html } = correoDeEncargoAlPerito(CASO);
    for (const punto of QUE_MIRA_EL_PERITO) {
      assert.ok(html.includes(punto.de.slice(0, 30)), `falta en alemán: ${punto.de}`);
      assert.ok(html.includes(punto.en.slice(0, 30)), `falta en inglés: ${punto.en}`);
    }
  });

  test('va en alemán, porque el perito es alemán', () => {
    // Una lista de comprobación en castellano se lee mal o no se lee: es la
    // clase de correo que se contesta con «ok» sin haberlo mirado.
    const { subject, html } = correoDeEncargoAlPerito(CASO);
    assert.match(subject, /Fahrzeugprüfung/);
    assert.match(html, /Guten Tag/);
    assert.match(html, /Fahrgestellnummer/);
  });

  test('y lo que de verdad hay que comprobar va el primero', () => {
    // Que sea el coche del anuncio. Todo lo demás es sobre ese coche.
    assert.match(QUE_MIRA_EL_PERITO[0].de, /das Fahrzeug aus dem Inserat/);
    assert.match(QUE_MIRA_EL_PERITO[0].en, /the car from the listing/);
  });

  test('le dice que un «no» vale igual que un «sí»', () => {
    // Es lo que le quita la presión de complacer a quien le paga, que es el
    // sesgo real de este encargo.
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.match(html, /Ein Nein ist für uns genauso nützlich wie ein Ja/);
    assert.match(html, /A no is as useful to us as a yes/);
  });

  test('y no le cuelga el dinero del dictamen', () => {
    // «El dinero no sale hasta que confirmes» es verdad, pero dicho a quien
    // tiene que dictaminar suena a que su sí desbloquea una compra. Un perito
    // con dieciséis mil euros colgando acaba matizando todo, y un dictamen
    // lleno de matices no sirve para decidir.
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.ok(!/Geld unseres Kunden geht erst raus/.test(html));
    assert.ok(!/money does not go out until you confirm/.test(html));
  });

  test('le pide el día, y la cita la cierra el ERP', () => {
    // Va desde aquí y no de móvil a móvil para que quede apuntado quién dijo
    // qué día y a quién se le avisó.
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.match(html, /wann Sie hinfahren können/);
    assert.match(html, /Den Termin stimmen wir mit dem Verkäufer ab/);
  });

  test('con dónde está y por quién preguntar', () => {
    const { html } = correoDeEncargoAlPerito(CASO);
    assert.match(html, /Landsberger Str\. 120/);
    assert.match(html, /Herr Kaufmann/);
  });

  test('sin dirección todavía, se dice; no se deja el hueco', () => {
    const { html } = correoDeEncargoAlPerito({ vehiculo: 'Un coche' });
    assert.match(html, /noch offen/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeEncargoAlPerito({ vehiculo: '<b>Un coche</b>' });
    assert.ok(!html.includes('<b>Un coche</b>'));
  });

  test('sin saber qué coche es, no se manda', () => {
    assert.deepEqual(faltaParaEncargarLaRevision({ vehiculo: '  ' }), ['qué coche es']);
    assert.deepEqual(faltaParaEncargarLaRevision(CASO), []);
  });
});

/**
 * El aviso al vendedor con el día de la visita.
 *
 * Cierra la cita, y lo que se le pide además de la hora es lo que evita que la
 * visita se quede a medias: que el coche esté accesible, que estén los papeles
 * y que estén las dos llaves. Volver otro día son otros 289 €.
 */
describe('el aviso de la cita al vendedor', () => {
  const CITA = {
    vehiculo: 'Kia Sorento 2.4 GDI AWD Automatik Kamera LED',
    cuando: '11/09/2026',
    perito: 'checkdenwagen.de',
  };

  test('dice el día y quién va', () => {
    const { subject, html } = correoDeLaCitaAlVendedor(CITA);
    assert.match(subject, /Termin zur Fahrzeugprüfung/);
    assert.match(html, /11\/09\/2026/);
    assert.match(html, /checkdenwagen\.de/);
  });

  test('y pide las tres cosas que hacen que no haya que volver', () => {
    const { html } = correoDeLaCitaAlVendedor(CITA);
    assert.match(html, /zugänglich/);
    assert.match(html, /Zulassungsbescheinigung Teil I und II/);
    assert.match(html, /beide Schlüssel/);
  });

  test('y deja cambiar el día en vez de darlo por cerrado', () => {
    assert.match(correoDeLaCitaAlVendedor(CITA).html, /Passt der Termin nicht/);
  });

  test('sin día no se manda: sería un aviso sin aviso', () => {
    assert.deepEqual(faltaParaAvisarDeLaCita({ vehiculo: 'Un coche' }), ['qué día va']);
    assert.deepEqual(faltaParaAvisarDeLaCita(CITA), []);
  });

  test('sin saber quién va, se dice que va alguien y no se calla', () => {
    const { html } = correoDeLaCitaAlVendedor({ ...CITA, perito: null });
    assert.match(html, /Es kommt ein unabhängiger Prüfer/);
  });

  test('lo que venga de fuera no se cuela como HTML', () => {
    const { html } = correoDeLaCitaAlVendedor({ ...CITA, perito: '<b>x</b>' });
    assert.ok(!html.includes('<b>x</b>'));
  });
});

describe('la cita que ya viene del vendedor', () => {
  // Ahora el primer correo le pide al vendedor día y hora concretos, así que
  // lo normal es que el encargo salga con la cita puesta. Al perito le queda
  // confirmar que puede, no proponer: cuadrar una hora entre tres por correo
  // son cuatro correos y dos días.
  const CON_CITA = {
    vehiculo: 'Kia Sorento 2.4 GDI AWD',
    donde: 'Landsberger Str. 180, 80687 München',
    contacto: 'Herr Michael Schneider',
    telefono: '+49 171 458 7293',
    cuando: '07/09/2026',
    hora: '10:00',
  };

  test('el encargo lleva la cita, el nombre y el teléfono', () => {
    const { html } = correoDeEncargoAlPerito(CON_CITA);
    assert.match(html, /07\/09\/2026/);
    assert.match(html, /10:00/);
    assert.match(html, /Termin \/ Appointment/);
    assert.match(html, /Michael Schneider/);
    assert.match(html, /\+49 171 458 7293/);
  });

  test('y le pide confirmarla, no proponer día', () => {
    const { html } = correoDeEncargoAlPerito(CON_CITA);
    assert.match(html, /bereits vereinbart/);
    assert.match(html, /already agreed with the seller/);
    assert.doesNotMatch(html, /wann Sie hinfahren können/);
  });

  test('y le pide el precio en la misma respuesta', () => {
    // Es lo que acaba como gasto de este coche y sale del margen. Preguntarlo
    // cuando ya ha ido es preguntarlo cuando no se puede decir que no: el
    // trabajo está hecho y la factura llega con el número que él ponga.
    const { html } = correoDeEncargoAlPerito(CON_CITA);
    assert.match(html, /was die Prüfung kostet/);
    assert.match(html, /inklusive Anfahrt/);
    assert.match(html, /what the inspection will cost/);
    assert.match(html, /travel included/);
  });

  test('sin cita todavía, le pregunta cuándo puede ir', () => {
    // Si el vendedor no dio día —o se encarga antes de que conteste—, el
    // correo tiene que seguir sirviendo.
    const { html } = correoDeEncargoAlPerito({ vehiculo: 'Un coche' });
    assert.match(html, /wann Sie hinfahren können/);
    assert.doesNotMatch(html, /bereits vereinbart/);
  });

  test('el teléfono es del que abre la nave, no adorno', () => {
    // Es lo que marca el perito cuando llega y no encuentra a nadie. Sin él,
    // vuelve otro día y son otros 289 €.
    const { html } = correoDeEncargoAlPerito({ ...CON_CITA, telefono: '' });
    assert.doesNotMatch(html, /Telefon \/ Phone/);
  });

  test('al vendedor se le confirma su hora, no solo el día', () => {
    const { html } = correoDeLaCitaAlVendedor({ vehiculo: 'Un coche', cuando: '07/09/2026', hora: '10:00' });
    assert.match(html, /07\/09\/2026 · 10:00/);
  });

  test('y con nombre y apellido si la empresa nos lo ha dicho', () => {
    // «Prüfer: Daniel Weber». Quien abre la puerta de una nave no espera a
    // una empresa, espera a alguien.
    const { html } = correoDeLaCitaAlVendedor({
      vehiculo: 'Un coche', cuando: '07/09/2026', hora: '10:00',
      perito: 'checkdenwagen Automobile DE', quienVa: 'Daniel Weber',
    });
    assert.ok(html.includes('Daniel Weber (checkdenwagen Automobile DE)'));
  });

  test('y su teléfono, para que el vendedor pueda llamarle ese día', () => {
    // Una nave que abre a las siete y un perito que llega a las diez se
    // arreglan con una llamada, no con tres correos pasando por nosotros.
    const { html } = correoDeLaCitaAlVendedor({
      vehiculo: 'Un coche', cuando: '07/09/2026', hora: '10:00',
      perito: 'checkdenwagen', quienVa: 'Daniel Weber',
      telefonoDeQuienVa: '+49 176 382 941 65',
    });
    assert.match(html, /Sie erreichen ihn unter/);
    assert.ok(html.includes('+49 176 382 941 65'));
  });

  test('sin teléfono, se dice que él se pondrá en contacto', () => {
    // Lo que no se puede dejar es un hueco: el vendedor tiene que saber cómo
    // se cierra el cabo suelto, con un número o con una espera.
    const { html } = correoDeLaCitaAlVendedor({
      vehiculo: 'Un coche', cuando: '07/09/2026', perito: 'checkdenwagen',
    });
    assert.match(html, /Er meldet sich vorher bei Ihnen/);
    assert.doesNotMatch(html, /Sie erreichen ihn unter/);
  });

  test('sin nombre, con la empresa basta y no se deja el hueco', () => {
    const { html } = correoDeLaCitaAlVendedor({
      vehiculo: 'Un coche', cuando: '07/09/2026', perito: 'checkdenwagen Automobile DE',
    });
    assert.match(html, /checkdenwagen Automobile DE/);
    assert.ok(!html.includes('()'), 'un paréntesis vacío donde no hay nombre');
  });

  test('y se le dice quién va, que es lo que pregunta él', () => {
    // «Bitte lassen Sie uns kurz bestätigen, mit welchem Namen Ihr Prüfer zu
    // uns kommt» es lo que contestan. La respuesta ya va en este correo.
    const { html } = correoDeLaCitaAlVendedor({
      vehiculo: 'Un coche', cuando: '07/09/2026', hora: '10:00', perito: 'checkdenwagen Automobile DE',
    });
    assert.match(html, /checkdenwagen Automobile DE/);
  });
});
