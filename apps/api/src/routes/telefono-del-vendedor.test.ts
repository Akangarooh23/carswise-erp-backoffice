/**
 * El teléfono es del vendedor, no de cada coche.
 *
 * `seller_phone` es una columna de la oferta, así que un concesionario con
 * cuarenta coches necesitaba el teléfono cuarenta veces. En la base hay hoy
 * 4.316 ofertas de concesionario, tres vendedores y **ningún** teléfono puesto:
 * el sitio donde se pedía el dato era el equivocado, y la Agenda no tenía a
 * quién llamar para ninguna de ellas.
 *
 * Esto se comprueba leyendo el SQL de la ruta y no contra una base. Lo que hay
 * que fijar es de dónde sale el teléfono y qué pasa al volver a guardarlo, y
 * eso está escrito ahí: un doble de la base contestaría lo que se le haya
 * enseñado a contestar, que es exactamente lo que aquí no vale.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./visits.ts', import.meta.url), 'utf8');

const ELUPSERT = FUENTE.slice(
  FUENTE.indexOf('INSERT INTO erp_vendedores_marketplace'),
  FUENTE.indexOf('telefono_del_vendedor'),
);

describe('de dónde sale el teléfono en la Agenda', () => {
  test('de la oferta si lo trae, y si no del vendedor', () => {
    assert.match(FUENTE, /COALESCE\(NULLIF\(TRIM\(o\.seller_phone\), ''\), v\.telefono\)\s+AS seller_phone/);
  });

  test('y un teléfono que es solo espacios cuenta como que no hay', () => {
    // Sin el NULLIF, una oferta con la casilla tocada y vacía tapa el del
    // vendedor y la Agenda enseña un teléfono en blanco.
    assert.match(FUENTE, /NULLIF\(TRIM\(o\.seller_phone\), ''\)/);
    assert.match(FUENTE, /NULLIF\(TRIM\(o\.seller_contact\), ''\)/);
  });

  test('la Agenda dice cuándo el número no es de este coche', () => {
    // Un número que no está en la ficha del coche aparecía sin explicación.
    assert.match(FUENTE, /AS del_vendedor/);
  });

  test('y se junta por nombre de vendedor, con LEFT', () => {
    // Con JOIN normal, una visita cuyo vendedor no tenga fila desaparecería de
    // la Agenda entera.
    assert.match(FUENTE, /LEFT JOIN erp_vendedores_marketplace v ON v\.nombre = o\.seller/);
  });
});

describe('al guardarlo', () => {
  test('se guarda por vendedor, no por oferta', () => {
    assert.match(ELUPSERT, /INSERT INTO erp_vendedores_marketplace \(nombre, telefono, contacto\)/);
  });

  test('volver a ponerlo actualiza en vez de reventar', () => {
    assert.match(ELUPSERT, /ON CONFLICT \(nombre\) DO UPDATE/);
    assert.match(ELUPSERT, /SET telefono = EXCLUDED\.telefono/);
  });

  test('y no borra el contacto al no mandarlo', () => {
    /*
     * Es la trampa del upsert: quien solo viene a corregir el número deja el
     * campo del contacto vacío, y con `contacto = EXCLUDED.contacto` se lleva
     * por delante el nombre que alguien apuntó de una llamada anterior. Lo que
     * se apunta de una gestión no se pierde por guardar otra cosa.
     */
    assert.match(ELUPSERT, /contacto = COALESCE\(EXCLUDED\.contacto, erp_vendedores_marketplace\.contacto\)/);
    assert.ok(
      !/contacto = EXCLUDED\.contacto\b/.test(ELUPSERT),
      'el contacto se sobrescribe con lo que venga, aunque venga vacío',
    );
  });

  test('y un contacto vacío llega como nulo, no como cadena vacía', () => {
    // Si llegara vacío, el COALESCE de arriba lo daría por bueno y machacaría
    // el que había: la protección está en los dos sitios o no está.
    assert.match(ELUPSERT, /VALUES \(\$1, \$2, NULLIF\(\$3, ''\)\)/);
  });

  test('la tabla se crea sola, como el resto del esquema', () => {
    // Nadie corre migraciones a mano en este proyecto.
    assert.match(FUENTE, /CREATE TABLE IF NOT EXISTS erp_vendedores_marketplace/);
    assert.match(FUENTE, /nombre\s+TEXT PRIMARY KEY/);
  });
});
