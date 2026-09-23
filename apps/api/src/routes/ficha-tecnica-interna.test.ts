/**
 * La puerta por la que PopCar avisa de una ficha técnica.
 *
 * No lleva `requireRole` porque quien llama es PopCar, que no tiene sesión de
 * trabajador: la puerta es el secreto compartido. Y eso hay que vigilarlo desde
 * fuera, porque una ruta sin rol es exactamente la que un día se queda abierta
 * sin que nadie lo note.
 *
 * Se lee el fuente. Montar Express para esto haría falta una base y un lector,
 * y lo que se protege —que la ruta exija el secreto, y que sin secreto
 * configurado no pase nadie— se ve leyendo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const IDCARS = fs.readFileSync(
  path.join(import.meta.dirname, 'idcars.ts'), 'utf8',
);

/** El cuerpo de la ruta, hasta que se cierra. */
function laRuta(): string {
  const desde = IDCARS.indexOf("idcarsRouter.post('/interno/ficha-tecnica'");
  assert.ok(desde > 0, 'no encuentro la ruta interna de la ficha técnica');
  const hasta = IDCARS.indexOf('\n});', desde);
  assert.ok(hasta > desde, 'no encuentro dónde acaba la ruta');
  return IDCARS.slice(desde, hasta);
}

describe('quién puede entrar', () => {
  test('hace falta el secreto compartido', () => {
    const r = laRuta();
    assert.match(r, /INTERNAL_API_SECRET/);
    assert.match(r, /Bearer \$\{secreto\}/);
    assert.match(r, /401/);
  });

  test('y sin secreto configurado no pasa nadie', () => {
    /*
     * Al revés —sin variable, puerta abierta— un fallo de configuración
     * *abriría* la puerta, y eso no se nota hasta que alguien entra. Un fallo
     * de configuración puede cerrar; abrir, no.
     */
    const r = laRuta();
    const sinSecreto = r.indexOf('if (!secreto)');
    const comprueba = r.indexOf('req.headers.authorization');
    assert.ok(sinSecreto > 0, 'no se comprueba que el secreto esté configurado');
    assert.ok(sinSecreto < comprueba, 'se mira la cabecera antes de saber si hay secreto');
    assert.match(r.slice(sinSecreto, comprueba), /503/);
  });

  test('esta ruta no lleva requireRole, y es a propósito', () => {
    // Quien llama es PopCar, que no tiene sesión de trabajador.
    assert.ok(!/requireRole/.test(laRuta()));
  });

  test('pero es la única del fichero que no lo lleva', () => {
    /*
     * Lo que esto protege es que no se cuele **otra**. Una ruta del ERP sin rol
     * y sin secreto queda abierta a cualquiera con la dirección, y el ERP tiene
     * dentro todos los coches y todos los clientes.
     */
    const rutas = [...IDCARS.matchAll(/idcarsRouter\.(get|post|patch|delete|put)\('([^']+)'([^\n]*)/g)];
    const sinPuerta = rutas
      .filter((m) => !m[3].includes('requireRole'))
      .map((m) => m[2]);
    assert.deepEqual(sinPuerta, ['/interno/ficha-tecnica']);
  });
});

describe('qué contesta', () => {
  test('lo que ha pasado, no lo leído', () => {
    /*
     * Quien llama no va a mirarlo —el coche del cliente ya está guardado— y
     * devolver los datos del coche por una puerta que solo tiene un secreto
     * delante es dar más de lo que hace falta.
     */
    const r = laRuta();
    assert.match(r, /ok: true, leida:/);
    assert.ok(!/codigos/.test(r), 'devuelve lo leído de la ficha');
    assert.ok(!/diferencias/.test(r), 'devuelve las diferencias del coche');
  });

  test('y relee siempre: es que acaban de subir una', () => {
    // Sin `otraVez`, una ficha nueva subida sobre otra ya leída se saltaría.
    assert.match(laRuta(), /otraVez: true/);
  });

  test('sin coche no se busca nada', () => {
    assert.match(laRuta(), /falta_el_coche/);
  });
});
