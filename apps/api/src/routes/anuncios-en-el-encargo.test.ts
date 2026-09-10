/**
 * El registro de anuncios de portal, enchufado.
 *
 * Las reglas estaban escritas y probadas desde hacía semanas, y no las usaba
 * nadie: ni tabla, ni ruta, ni pantalla, ni línea en Pendientes. Un fichero de
 * reglas que no ejecuta nadie es documentación con forma de código.
 *
 * Lo que se protege aquí es el cableado, que es justo lo que faltaba.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const leer = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\r\n/g, '\n');

const RUTA = leer('anuncios-portal.ts');
const APP = leer('../app.ts');
const DASHBOARD = leer('dashboard.ts');

describe('la tabla existe de verdad', () => {
  test('alguien la crea al arrancar', () => {
    // La constante estaba escrita y no la ejecutaba nadie: la primera consulta
    // fallaba y el aviso se quedaba a cero para siempre.
    assert.match(RUTA, /await query\(ENSURE_TABLE\)/);
    assert.match(RUTA, /await query\(ENSURE_UNO_VIVO\)/);
  });

  test('y el router está enganchado', () => {
    /*
     * Escribir la ruta y no montarla da un 404 que parece un fallo de permisos.
     * Es el mismo fallo que tuvo `health.ts` durante meses.
     */
    assert.match(APP, /import \{ anunciosPortalRouter \}/);
    assert.match(APP, /app\.use\('\/api', anunciosPortalRouter\)/);
  });
});

describe('el aviso de Pendientes tiene quien lo cuente', () => {
  test('el panel lo pide', () => {
    assert.match(DASHBOARD, /losAnunciosPorRetirar\(\)/);
  });

  test('y lo mete en las cuentas', () => {
    // Contarlo y no pasarlo es el fallo silencioso de esta familia: la entrada
    // existe, la pantalla la sabría pintar, y se queda a cero.
    assert.match(DASHBOARD, /\.\.\.anuncios,/);
  });

  test('si falla, el panel entero no se cae', () => {
    assert.match(DASHBOARD, /losAnunciosPorRetirar\(\)\.catch\(/);
  });
});

describe('el enlace se da hecho, no se escribe', () => {
  test('la ruta lo monta con la matrícula del coche', () => {
    /*
     * Escrito a mano, la fuente sale unas veces «coches.net» y otras
     * «Coches.net», y en el informe son dos filas distintas que nadie suma.
     */
    assert.match(RUTA, /elEnlaceParaElPortal\(config\.PUBLIC_SITE_URL, matricula, p\)/);
  });

  test('y no se ofrece uno roto cuando no hay matrícula', () => {
    // `/v/` a secas devuelve un 400. Se filtran los vacíos en vez de pintar un
    // botón que no lleva a ningún sitio.
    assert.match(RUTA, /\.filter\(\(e\) => e\.url\)/);
  });

  test('el enlace no se guarda en la tabla', () => {
    /*
     * Sale de la matrícula y del portal. Guardarlo sería una copia que se queda
     * vieja el día que cambie el dominio, y nadie iría a repasar los anuncios
     * ya puestos.
     */
    const columnas = RUTA.slice(
      RUTA.indexOf('INSERT INTO erp_anuncios_de_portal'),
      RUTA.indexOf('VALUES', RUTA.indexOf('INSERT INTO erp_anuncios_de_portal')),
    );
    assert.ok(columnas.length > 0, 'no encuentro el INSERT');
    assert.doesNotMatch(columnas, /utm/i);
  });
});

describe('retirar deja rastro', () => {
  test('se apunta quién lo quitó', () => {
    // «Alguien lo retiró» no sirve: cuando un anuncio sigue puesto, lo que hace
    // falta es saber a quién preguntar.
    assert.match(RUTA, /SQL_RETIRA, \[\s*\n?\s*req\.params\.id,\s*\n?\s*req\.actor/);
  });

  test('y volver a pulsar no reescribe la fecha', () => {
    /*
     * El SQL solo actualiza si no estaba retirado. Si no, el rastro diría la
     * última vez que alguien tocó el botón y no la vez que se retiró.
     */
    assert.match(RUTA, /ya_estaba_retirado/);
  });
});
