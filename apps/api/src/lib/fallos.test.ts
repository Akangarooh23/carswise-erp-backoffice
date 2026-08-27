/**
 * Qué sale por la respuesta cuando algo falla.
 *
 * Las rutas devolvían el mensaje de Postgres tal cual —«column t.assigned_to
 * does not exist», nombres de restricciones, de tablas—. Ochenta y seis sitios.
 * A quien está delante no le sirve, y a quien tiene que arreglarlo le sirve en
 * el registro del servidor, no en una captura.
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { falloInterno } from './fallos.js';
import { config } from '../config.js';

/** Un `res` de mentira que se queda con lo que se le manda. */
function respuestaFalsa() {
  const capturado: { estado?: number; cuerpo?: Record<string, unknown> } = {};
  const res = {
    status(n: number) { capturado.estado = n; return res; },
    json(b: Record<string, unknown>) { capturado.cuerpo = b; return res; },
  };
  return { res, capturado };
}

describe('un fallo del servidor', () => {
  test('responde 500 con el código que la pantalla espera', () => {
    const { res, capturado } = respuestaFalsa();
    const silencio = mock.method(console, 'error', () => {});
    falloInterno(res as never, 'tickets_list_failed', new Error('column t.assigned_to does not exist'));
    silencio.mock.restore();

    assert.equal(capturado.estado, 500);
    assert.equal(capturado.cuerpo?.ok, false);
    assert.equal(capturado.cuerpo?.error, 'tickets_list_failed');
  });

  test('el mensaje de verdad va al registro del servidor', () => {
    const { res } = respuestaFalsa();
    const registrado: unknown[][] = [];
    const silencio = mock.method(console, 'error', (...a: unknown[]) => { registrado.push(a); });
    falloInterno(res as never, 'x_failed', new Error('duplicate key on fk_ticket_user'));
    silencio.mock.restore();

    assert.equal(registrado.length, 1, 'sin esto, el fallo se pierde del todo');
    assert.ok(String(registrado[0].join(' ')).includes('duplicate key on fk_ticket_user'));
    assert.ok(String(registrado[0].join(' ')).includes('x_failed'), 'y con el código, para poder buscarlo');
  });

  test('lo que no es un Error también se registra', () => {
    const { res, capturado } = respuestaFalsa();
    const registrado: unknown[][] = [];
    const silencio = mock.method(console, 'error', (...a: unknown[]) => { registrado.push(a); });
    falloInterno(res as never, 'raro', 'algo lanzó una cadena');
    silencio.mock.restore();

    assert.ok(String(registrado[0].join(' ')).includes('algo lanzó una cadena'));
    assert.equal(capturado.cuerpo?.error, 'raro');
  });
});

describe('el detalle según dónde se esté', () => {
  test('en desarrollo se devuelve: quien mira es quien arregla', () => {
    const antes = config.NODE_ENV;
    (config as { NODE_ENV: string }).NODE_ENV = 'development';
    const { res, capturado } = respuestaFalsa();
    const silencio = mock.method(console, 'error', () => {});
    falloInterno(res as never, 'x', new Error('detalle técnico'));
    silencio.mock.restore();
    (config as { NODE_ENV: string }).NODE_ENV = antes;

    assert.equal(capturado.cuerpo?.detail, 'detalle técnico');
  });

  test('en producción no sale: son nombres de tablas y columnas', () => {
    const antes = config.NODE_ENV;
    (config as { NODE_ENV: string }).NODE_ENV = 'production';
    const { res, capturado } = respuestaFalsa();
    const silencio = mock.method(console, 'error', () => {});
    falloInterno(res as never, 'x', new Error('column t.assigned_to does not exist'));
    silencio.mock.restore();
    (config as { NODE_ENV: string }).NODE_ENV = antes;

    assert.equal(capturado.cuerpo?.detail, undefined, 'el mapa de la base no sale por la respuesta');
    assert.equal(capturado.cuerpo?.error, 'x', 'pero la pantalla sigue sabiendo qué pasó');
  });
});
