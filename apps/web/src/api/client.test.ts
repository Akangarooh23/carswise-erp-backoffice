/**
 * Que la respuesta de la API llegue siempre con la misma forma.
 *
 * La API contesta de dos maneras: la mayoría de las rutas devuelven
 * `{ ok, data }` y unas cuantas —las de visitas— devuelven lo suyo al nivel de
 * arriba, `{ ok, slots }`. Cada pantalla tenía que saber cuál era cuál, y
 * cuando se acertó mal no falló nada: el cuadro salió vacío y el botón de copiar
 * copió «undefined».
 *
 * Por eso esto se comprueba aquí y no a ojo: el fallo de leerlo del sitio
 * equivocado no da error, solo deja la pantalla en blanco.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { conFormaUnica } from './client.js';

describe('la respuesta, con una forma sola', () => {
  test('lo que viene suelto se puede leer en data', () => {
    const r = conFormaUnica<{ slots: number[] }>({ ok: true, slots: [1, 2] });
    assert.deepEqual(r.data.slots, [1, 2]);
  });

  test('y sigue estando donde estaba, para lo que aún lo lea de arriba', () => {
    const r = conFormaUnica({ ok: true, pasos: ['uno'] }) as unknown as { pasos: string[] };
    assert.deepEqual(r.pasos, ['uno']);
  });

  test('lo que ya venía en data no se toca', () => {
    const r = conFormaUnica<{ avisado: boolean }>({ ok: true, data: { avisado: true } });
    assert.equal(r.data.avisado, true);
    assert.equal(r.ok, true);
  });

  test('varias claves sueltas caben todas', () => {
    const r = conFormaUnica<{ texto: string; telefono: string }>({
      ok: true, texto: 'hola', telefono: '600',
    });
    assert.equal(r.data.texto, 'hola');
    assert.equal(r.data.telefono, '600');
  });

  test('un error sigue siendo un error, y se lee igual', () => {
    const r = conFormaUnica({ ok: false, error: 'no_encontrada' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_encontrada');
  });

  test('el ok de fuera manda sobre cualquier ok de dentro', () => {
    const r = conFormaUnica({ ok: false, error: 'mal', cosa: { ok: true } });
    assert.equal(r.ok, false, 'si no, un dato llamado ok haría pasar por buena una respuesta mala');
  });

  test('lo que no es una respuesta no revienta', () => {
    assert.equal(conFormaUnica(null).ok, false);
    assert.equal(conFormaUnica('vaya').ok, false);
    assert.equal(conFormaUnica(undefined).error, 'invalid_json');
  });
});

describe('el camino entero, como lo usa una pantalla', () => {
  const fetchOriginal = globalThis.fetch;
  const guardado = (globalThis as { localStorage?: unknown }).localStorage;

  before(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => '',
      setItem: () => {},
      removeItem: () => {},
    };
    globalThis.fetch = (async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, pasos: [{ evento: 'solicitada' }] }),
    })) as unknown as typeof fetch;
  });

  after(() => {
    globalThis.fetch = fetchOriginal;
    (globalThis as { localStorage?: unknown }).localStorage = guardado;
  });

  test('una ruta que devuelve lo suyo suelto se lee con data', async () => {
    const { api } = await import('./client.js');
    const r = await api.get<{ pasos: { evento: string }[] }>('/visit-bookings/b-1/pasos');
    assert.equal(r.ok, true);
    assert.equal(r.data.pasos[0].evento, 'solicitada', 'esto es lo que pinta el rastro de una cita');
  });
});
