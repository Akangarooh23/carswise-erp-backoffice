/**
 * Que el número de negocio salga en pantalla, y en todas.
 *
 * Los números —CLI-0007, IDC-0003, ENC-2026-0001— están en la base desde la
 * migración 0003, pero un número que no se ve no sirve de nada: la gracia es
 * poder decirlo por teléfono y buscarlo. Y como aparece en cinco pantallas
 * distintas, es de las cosas que se caen de una sin que nadie lo note.
 *
 * Se comprueba sobre el fuente porque estas pantallas piden datos a la API y no
 * se pueden dibujar en una prueba; lo que importa aquí es que la columna se
 * pide y que se pinta, y eso se ve leyendo.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(AQUI, '..');
const API = path.join(AQUI, '..', '..', '..', 'api', 'src');

const lee = (p: string) => readFileSync(p, 'utf8');

describe('el número se pide a la base', () => {
  const casos: Array<[string, string, RegExp]> = [
    ['clientes', path.join(API, 'routes', 'users.ts'), /SELECT mu\.id, mu\.numero/],
    ['leads', path.join(API, 'routes', 'leads.ts'), /SELECT id, numero, user_email/],
    ['ventas', path.join(API, 'routes', 'ventas.ts'), /e\.id, e\.numero/],
    ['visitas', path.join(API, 'routes', 'visits.ts'), /SELECT b\.id, b\.numero/],
  ];

  for (const [que, fichero, patron] of casos) {
    test(`${que}`, () => {
      assert.match(lee(fichero), patron, `la consulta de ${que} ya no trae el número`);
    });
  }

  test('los IDCars lo traen por el SELECT v.*', () => {
    // No se pide columna a columna: si un día se pasa a lista de columnas, hay
    // que acordarse del número. Esto lo dice.
    assert.match(lee(path.join(API, 'routes', 'idcars.ts')), /SELECT v\.\*/);
  });
});

describe('y se pinta', () => {
  const pantallas: Array<[string, string]> = [
    ['la lista de IDCars', path.join(WEB, 'pages', 'IdCarsPage.tsx')],
    ['la lista de clientes', path.join(WEB, 'pages', 'UsersPage.tsx')],
    ['la lista de leads', path.join(WEB, 'pages', 'LeadsPage.tsx')],
    ['las ventas en curso', path.join(WEB, 'pages', 'VentasPage.tsx')],
  ];

  for (const [que, fichero] of pantallas) {
    test(que, () => {
      const fuente = lee(fichero);
      assert.match(fuente, /import \{ Numero \}/, `${que} no importa el componente`);
      assert.match(fuente, /<Numero /, `${que} no lo pinta`);
    });
  }

  test('las fichas lo llevan en la cabecera', () => {
    assert.match(lee(path.join(WEB, 'pages', 'IdCarDetailPage.tsx')), /vehicle\.numero/);
    assert.match(lee(path.join(WEB, 'pages', 'UserDetailPage.tsx')), /user\.numero/);
  });
});

describe('se puede buscar por él', () => {
  test('clientes', () => {
    assert.match(lee(path.join(API, 'routes', 'users.ts')), /lower\(mu\.numero\) LIKE/);
  });
  test('IDCars', () => {
    assert.match(lee(path.join(API, 'routes', 'idcars.ts')), /lower\(COALESCE\(v\.numero,''\)\) LIKE/);
  });
});
