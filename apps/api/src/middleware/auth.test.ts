/**
 * Quién puede entrar y quién puede hacer qué.
 *
 * Es la pieza de la que cuelga todo lo demás: si `requireRole` deja pasar a
 * quien no debe, da igual lo bien cerrada que esté una ruta. No tenía ninguna
 * prueba, y es el tipo de código que parece obviamente correcto leyéndolo.
 *
 * Se levanta un servidor de verdad y se llama con cabeceras de verdad, porque
 * lo que hay que comprobar es el comportamiento completo —incluido qué código
 * se devuelve—, no que una función devuelva `true`.
 *
 * La diferencia entre 401 y 403 importa: 401 es «no sé quién eres», y la
 * pantalla manda a iniciar sesión; 403 es «sé quién eres y no puedes», y
 * mandar a iniciar sesión ahí sería un bucle.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import { requireAuth, requireRole, type Role } from './auth.js';
import { config } from '../config.js';

let servidor: Server;
let base: string;

/** Un pase válido para el rol que se pida. */
const pase = (role: Role, extra: Record<string, unknown> = {}) =>
  jwt.sign({ sub: 'quien@popcar.tech', role, name: 'Quien', ...extra }, config.JWT_SECRET, { expiresIn: '1h' });

before(async () => {
  const app = express();
  app.get('/con-sesion', requireAuth, (req, res) => res.json({ quien: req.actor?.sub }));
  app.get('/solo-admin', requireRole(['admin']), (_req, res) => res.json({ ok: true }));
  app.get('/admin-o-ventas', requireRole(['admin', 'sales']), (_req, res) => res.json({ ok: true }));

  await new Promise<void>((listo) => {
    servidor = app.listen(0, () => {
      const dir = servidor.address();
      base = 'http://127.0.0.1:' + (typeof dir === 'object' && dir ? dir.port : 0);
      listo();
    });
  });
});

after(() => { servidor?.close(); });

const pide = (camino: string, cabecera?: string) =>
  fetch(base + camino, { headers: cabecera ? { Authorization: cabecera } : {} });

describe('sin un pase válido no se pasa', () => {
  test('sin cabecera, 401', async () => {
    assert.equal((await pide('/con-sesion')).status, 401);
  });

  test('con una cabecera que no es Bearer, 401', async () => {
    assert.equal((await pide('/con-sesion', 'Basic dXNlcjpwYXNz')).status, 401);
  });

  test('con un pase inventado, 401', async () => {
    assert.equal((await pide('/con-sesion', 'Bearer esto-no-es-un-token')).status, 401);
  });

  test('con un pase firmado con otra clave, 401', async () => {
    // El caso que importa: alguien que sabe la forma del token pero no la clave.
    const falso = jwt.sign({ sub: 'intruso@ejemplo.com', role: 'admin' }, 'otra-clave-distinta');
    assert.equal((await pide('/con-sesion', 'Bearer ' + falso)).status, 401);
  });

  test('con un pase caducado, 401', async () => {
    const viejo = jwt.sign({ sub: 'x@y.z', role: 'admin' }, config.JWT_SECRET, { expiresIn: '-1s' });
    assert.equal((await pide('/con-sesion', 'Bearer ' + viejo)).status, 401);
  });

  test('con un pase bueno, se pasa y se sabe quién es', async () => {
    const r = await pide('/con-sesion', 'Bearer ' + pase('support'));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { quien: 'quien@popcar.tech' });
  });
});

describe('cada rol llega hasta donde le toca', () => {
  test('un admin entra en lo de admin', async () => {
    assert.equal((await pide('/solo-admin', 'Bearer ' + pase('admin'))).status, 200);
  });

  for (const rol of ['support', 'operations', 'sales'] as Role[]) {
    test(`un ${rol} no entra en lo de admin`, async () => {
      const r = await pide('/solo-admin', 'Bearer ' + pase(rol));
      assert.equal(r.status, 403, 'tiene que ser 403, no 401: sabemos quién es');
      assert.deepEqual(await r.json(), { ok: false, error: 'forbidden' });
    });
  }

  test('una ruta con dos roles deja entrar a los dos', async () => {
    assert.equal((await pide('/admin-o-ventas', 'Bearer ' + pase('admin'))).status, 200);
    assert.equal((await pide('/admin-o-ventas', 'Bearer ' + pase('sales'))).status, 200);
  });

  test('y no a los demás', async () => {
    assert.equal((await pide('/admin-o-ventas', 'Bearer ' + pase('operations'))).status, 403);
  });

  test('un rol inventado no vale para nada', async () => {
    // Un pase firmado con nuestra clave pero con un rol que no existe: pasa el
    // control de identidad y tiene que quedarse en el de permisos.
    const raro = jwt.sign({ sub: 'x@y.z', role: 'superadmin' }, config.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await pide('/solo-admin', 'Bearer ' + raro)).status, 403);
  });

  test('un pase sin rol tampoco', async () => {
    const sinRol = jwt.sign({ sub: 'x@y.z' }, config.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await pide('/solo-admin', 'Bearer ' + sinRol)).status, 403);
  });
});

describe('la sesión no se puede estirar desde fuera', () => {
  test('cambiar el rol dentro del pase lo invalida', async () => {
    // Se firma como sales y se manipula la carga: la firma deja de cuadrar.
    const bueno = pase('sales');
    const [cab, , firma] = bueno.split('.');
    const cargaFalsa = Buffer.from(JSON.stringify({ sub: 'x@y.z', role: 'admin', exp: 9999999999 }))
      .toString('base64url');
    const manipulado = [cab, cargaFalsa, firma].join('.');
    assert.equal((await pide('/solo-admin', 'Bearer ' + manipulado)).status, 401);
  });

  test('un pase sin firma no cuela', async () => {
    // El ataque clásico: alg «none».
    const cab = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const carga = Buffer.from(JSON.stringify({ sub: 'x@y.z', role: 'admin', exp: 9999999999 })).toString('base64url');
    assert.equal((await pide('/solo-admin', `Bearer ${cab}.${carga}.`)).status, 401);
  });
});
