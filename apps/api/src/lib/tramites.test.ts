/**
 * Las reglas de un trámite.
 *
 * Lo que se comprueba: que no se pueda mandar fuera sin decir a quién, que se
 * sepa distinguir lo que depende de la gestoría de lo que depende de nosotros, y
 * que el tipo sea texto libre — porque lo que hace falta depende del caso y una
 * lista cerrada obligaría a tocar el código cada vez que aparezca un papeleo
 * nuevo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_TRAMITE, QUE_TOCA_TRAMITE, TRAMITES_HABITUALES, RECHAZADO,
  esEstadoTramiteValido, siguienteEstadoTramite, puedeEnviarse, estaFuera, diasFuera,
  notaDelCambio,
} from './tramites.js';

describe('el camino de un trámite', () => {
  test('cada estado lleva al siguiente', () => {
    assert.equal(siguienteEstadoTramite('Pendiente'), 'Documentación incompleta');
    assert.equal(siguienteEstadoTramite('Enviado a gestoría'), 'En trámite');
    assert.equal(siguienteEstadoTramite('En trámite'), 'Resuelto');
  });

  test('resuelto es el final', () => {
    assert.equal(siguienteEstadoTramite('Resuelto'), null);
  });

  test('rechazado existe pero no avanza', () => {
    assert.ok(esEstadoTramiteValido(RECHAZADO));
    assert.equal(siguienteEstadoTramite(RECHAZADO), null);
  });

  test('un estado inventado no vale', () => {
    assert.equal(esEstadoTramiteValido('En proceso'), false);
  });

  test('cada estado dice qué toca', () => {
    for (const e of ESTADOS_TRAMITE) {
      assert.ok(QUE_TOCA_TRAMITE[e]?.length > 3, `«${e}» sin decir qué toca`);
    }
  });
});

describe('qué depende de quién', () => {
  test('enviado y en trámite están fuera', () => {
    assert.equal(estaFuera('Enviado a gestoría'), true);
    assert.equal(estaFuera('En trámite'), true);
  });

  test('lo demás depende de nosotros', () => {
    assert.equal(estaFuera('Pendiente'), false);
    assert.equal(estaFuera('Documentación incompleta'), false,
      'falta algo nuestro o del cliente: eso se resuelve trabajando');
    assert.equal(estaFuera('Resuelto'), false);
  });

  test('se sabe cuántos días lleva fuera, para reclamar con una fecha delante', () => {
    assert.equal(diasFuera('2026-08-01T10:00:00Z', new Date('2026-08-21T10:00:00Z')), 20);
  });

  test('sin fecha de envío no se inventa un número', () => {
    assert.equal(diasFuera(null), null);
    assert.equal(diasFuera('lo que sea'), null);
  });
});

describe('mandarlo fuera', () => {
  test('exige saber a qué gestoría', () => {
    assert.equal(puedeEnviarse({ gestoria: '' }), false,
      'un papel que no está en ningún sitio: ni lo tenemos ni se sabe a quién preguntar');
    assert.equal(puedeEnviarse({ gestoria: '   ' }), false);
  });

  test('con gestoría, sí', () => {
    assert.equal(puedeEnviarse({ gestoria: 'Gestoría Ruiz' }), true);
  });
});

describe('qué trámites se pueden hacer', () => {
  test('las sugerencias cubren lo de importación y lo de segunda mano', () => {
    const texto = TRAMITES_HABITUALES.join(' | ').toLowerCase();
    assert.match(texto, /matriculaci/, 'un coche de fuera hay que matricularlo');
    assert.match(texto, /transferencia/, 'una venta de segunda mano cambia de nombre');
    assert.match(texto, /itv/);
  });

  test('son sugerencias, no una lista de lo permitido', () => {
    // Si algún día esto se convierte en un enum cerrado, aparece un papeleo
    // nuevo y hay que tocar el código para poder anotarlo.
    assert.ok(Array.isArray(TRAMITES_HABITUALES));
    assert.ok(TRAMITES_HABITUALES.length >= 5);
  });
});

describe('la nota de un cambio', () => {
  test('se suma a lo que había', () => {
    const previas = '[29 ago 2026 · Pendiente → Enviado a gestoría] Mandado con la ficha técnica';
    const r = notaDelCambio(previas, 'Enviado a gestoría', 'Rechazado', 'Falta el permiso alemán', new Date('2026-08-30T10:00:00Z'));
    assert.ok(r.startsWith(previas));
    assert.match(r, /Falta el permiso alemán/);
  });
});
