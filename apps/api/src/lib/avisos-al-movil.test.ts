/**
 * Todo lo que le llega al cliente por correo, también al móvil.
 *
 * Se pidió así, y la manera de que se cumpla también con el correo que se
 * escriba mañana es que no dependa de acordarse: el aviso sale de `enviar()`,
 * para todo correo marcado como del cliente. Lo que se protege aquí:
 *
 *   · Que el aviso cuelga del correo al cliente y no de los del equipo.
 *   · Que sale después de que Resend acepte, no antes ni en su lugar.
 *   · Que sin texto escrito se usa el asunto, y que lo largo se corta.
 *   · Que sin Firebase configurado no hace nada ni rompe nada.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { elAvisoDelCorreo, avisaAlMovil, estaConfigurado } from './avisos-al-movil.js';

const CORREO = readFileSync(join(import.meta.dirname, 'correo.ts'), 'utf8').replace(/\r\n/g, '\n');
const ENVIAR = CORREO.slice(CORREO.indexOf('export async function enviar('));

describe('el aviso cuelga del correo al cliente', () => {
  test('solo si es para el cliente', () => {
    assert.match(ENVIAR, /if \(alClienteSiempre\) \{\s*await avisaAlMovil\(to, elAvisoDelCorreo\(subject, movil\)\);/);
  });

  test('y después de que el correo haya salido', () => {
    // Si Resend falla, `enviar` lanza antes de llegar aquí: no hay aviso de un
    // correo que no existe.
    const lanza = ENVIAR.indexOf('throw new Error(err.message');
    const avisa = ENVIAR.indexOf('await avisaAlMovil(');
    assert.ok(lanza > 0 && avisa > 0, 'falta alguno de los dos');
    assert.ok(lanza < avisa, 'el aviso sale antes de saber si el correo salió');
  });
});

describe('lo que dice', () => {
  test('con el texto escrito, ése', () => {
    const a = elAvisoDelCorreo('Asunto largo', { titulo: 'Tienes cita en el taller', cuerpo: 'martes · a las 10:00' });
    assert.equal(a.titulo, 'Tienes cita en el taller');
    assert.equal(a.cuerpo, 'martes · a las 10:00');
    assert.equal(a.pantalla, 'resumen');
  });

  test('sin texto, el asunto: ningún correo al cliente se queda sin aviso', () => {
    const a = elAvisoDelCorreo('Tu factura de PopCar', undefined);
    assert.equal(a.titulo, 'Tu factura de PopCar');
    assert.match(a.cuerpo, /por correo/);
  });

  test('lo que no cabe en la pantalla bloqueada se corta, con puntos', () => {
    const a = elAvisoDelCorreo('x'.repeat(200));
    assert.ok(a.titulo.length <= 65);
    assert.ok(a.titulo.endsWith('…'));
  });
});

describe('sin Firebase', () => {
  test('no hace nada, y no lanza', async () => {
    const antes = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    try {
      assert.equal(estaConfigurado(), false);
      assert.equal(await avisaAlMovil('alguien@example.com', { titulo: 'x', cuerpo: 'y' }), 0);
    } finally {
      if (antes !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = antes;
    }
  });
});

describe('los correos del encargo llevan su texto', () => {
  /*
   * Con el asunto también llegaría, pero «Mandato de venta PC-2026-0012 —
   * Volkswagen T-Roc 8888LXR» no se lee en una pantalla bloqueada. Los del
   * camino del particular llevan uno escrito para el móvil.
   */
  const leer = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');
  for (const [fichero, texto] of [
    ['../routes/encargos.ts', 'Tienes el mandato de venta para firmar'],
    ['../routes/encargos.ts', 'Tienes el precio de salida para firmar'],
    ['../routes/encargos.ts', 'ya está anunciado'],
    ['../routes/encargos.ts', 'Tu encargo de venta se ha cerrado'],
    ['../routes/revisiones-taller.ts', 'Tienes cita en el taller'],
    ['./recuerda-las-citas-del-taller.ts', 'Recuerda tu cita en el taller'],
    ['../routes/visits.ts', 'Tu visita está confirmada'],
    ['../routes/visits.ts', 'Alguien va a ver tu coche'],
  ] as const) {
    test(`«${texto}»`, () => {
      assert.ok(leer(fichero).includes(texto), `${fichero} no lleva el aviso «${texto}»`);
    });
  }
});
