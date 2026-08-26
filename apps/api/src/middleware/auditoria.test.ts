/**
 * Lo que cambia datos deja rastro, y lo que no, no.
 *
 * Un middleware que se engancha al final de la respuesta depende de dos cosas
 * que no se ven leyendo el código: que `req.route` y `req.params` sigan ahí
 * cuando salta, y que el nombre del recurso salga como lo va a ver la pantalla.
 * En lo segundo ya se falló una vez: montando las rutas sueltas en lugar de en
 * un router bajo /api, la prueba pasaba con «api.marketplace.vo» mientras el
 * registro guardaba «marketplace.vo» y la pantalla no sabía traducirlo.
 *
 * Por eso se levanta un servidor de verdad, montado como la aplicación, y se le
 * hacen peticiones de verdad. Lo único que se sustituye es la escritura en la
 * base: eso no es lo que hay que probar aquí, y una prueba no debe dejar
 * apuntes falsos en el registro de nadie.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { apuntaCambios } from './auditoria.js';
import { marcaAnotado } from '../lib/auditoria.js';

interface Apunte { accion: string; recurso: string; recursoId: string | null; datos?: unknown }

const apuntes: Apunte[] = [];
let servidor: Server;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apuntaCambios((_req, a) => { apuntes.push(a as Apunte); }));

  // Las rutas van en un router montado bajo /api, como en la aplicación: el
  // patrón que ve el middleware es relativo al router, y de ahí sale el nombre
  // del recurso. Montarlas sueltas hacía pasar la prueba con un nombre que la
  // pantalla nunca ve.
  const r = express.Router();

  // Rutas con la misma forma que las de verdad.
  r.patch('/marketplace/vo/:id', (_req, res) => { res.json({ ok: true }); });
  r.delete('/marketplace/vo/:id', (_req, res) => { res.json({ ok: true }); });
  r.post('/marketplace/vo/:id/units', (_req, res) => { res.status(201).json({ ok: true }); });
  r.post('/leads/:leadId/notify', (_req, res) => { res.json({ ok: true }); });
  r.post('/marketplace/vo/bulk', (_req, res) => { res.json({ ok: true }); });
  r.get('/marketplace/vo', (_req, res) => { res.json({ ok: true }); });
  r.post('/auth/login', (_req, res) => { res.json({ token: 'x' }); });
  r.patch('/falla/:id', (_req, res) => { res.status(422).json({ ok: false }); });
  // Una que se anota a sí misma, con más contexto del que se deduce de fuera.
  r.patch('/personal/:id/rol', (req, res) => {
    // En la de verdad esto sería `registrar(...)`, que escribe. Aquí basta con
    // la marca: lo que se prueba es que el middleware no duplique.
    marcaAnotado(req);
    res.json({ ok: true });
  });

  app.use('/api', r);

  await new Promise<void>((listo) => {
    servidor = app.listen(0, () => {
      const dir = servidor.address();
      base = 'http://127.0.0.1:' + (typeof dir === 'object' && dir ? dir.port : 0);
      listo();
    });
  });
});

after(() => { servidor?.close(); });

/** Hace la petición y devuelve lo que se apuntó por ella. */
async function pide(metodo: string, camino: string, cuerpo?: unknown): Promise<Apunte | undefined> {
  apuntes.length = 0;
  await fetch(base + camino, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  // El apunte se hace al cerrar la respuesta, un tick después de recibirla.
  await new Promise((s) => setTimeout(s, 30));
  return apuntes[0];
}

describe('se apunta lo que cambia datos', () => {
  test('editar un vehículo dice cuál', async () => {
    const a = await pide('PATCH', '/api/marketplace/vo/erp-123', { price: 14500 });
    assert.equal(a?.accion, 'editar');
    assert.equal(a?.recurso, 'marketplace.vo');
    assert.equal(a?.recursoId, 'erp-123', 'sin el identificador, el registro no sirve de nada');
    assert.deepEqual(a?.datos, { price: 14500 });
  });

  test('borrar se llama borrar', async () => {
    const a = await pide('DELETE', '/api/marketplace/vo/erp-999');
    assert.equal(a?.accion, 'borrar');
    assert.equal(a?.recursoId, 'erp-999');
  });

  test('crear algo dentro de otra cosa guarda las dos', async () => {
    const a = await pide('POST', '/api/marketplace/vo/erp-7/units', { color: 'Blanco' });
    assert.equal(a?.recurso, 'marketplace.vo.units');
    assert.equal(a?.recursoId, 'erp-7');
  });

  test('la acción sale de la dirección cuando la dice', async () => {
    const a = await pide('POST', '/api/leads/lead-4/notify', {});
    assert.equal(a?.accion, 'notify');
    assert.equal(a?.recursoId, 'lead-4', 'aquí el identificador no se llama id');
  });

  test('una acción en bloque también se apunta', async () => {
    const a = await pide('POST', '/api/marketplace/vo/bulk', { action: 'deactivate', ids: ['a', 'b'] });
    assert.equal(a?.accion, 'bulk');
    assert.deepEqual(a?.datos, { action: 'deactivate', ids: ['a', 'b'] });
  });
});

describe('no se apunta lo que no toca', () => {
  test('mirar no deja rastro', async () => {
    assert.equal(await pide('GET', '/api/marketplace/vo'), undefined);
  });

  test('entrar tampoco', async () => {
    assert.equal(await pide('POST', '/api/auth/login', { email: 'a@b.c', password: 'x' }), undefined);
  });

  test('un intento que falla no ensucia el registro', async () => {
    // No cambió nada: apuntarlo solo haría más difícil leer lo que sí cambió.
    assert.equal(await pide('PATCH', '/api/falla/erp-1', { price: 1 }), undefined);
  });

  test('lo que ya se apuntó a mano no se apunta dos veces', async () => {
    // El apunte de la ruta sabe de qué rol a qué rol; el genérico no.
    const a = await pide('PATCH', '/api/personal/p-1/rol', { rol: 'admin' });
    assert.equal(a, undefined, 'el middleware no debe duplicar');
  });
});
