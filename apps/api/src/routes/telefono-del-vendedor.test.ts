/**
 * El teléfono es del vendedor, no de cada coche — y vive en su ficha.
 *
 * `seller_phone` es una columna de la oferta, así que un concesionario con
 * cuarenta coches necesitaba el teléfono cuarenta veces. En la base hay hoy
 * 4.316 ofertas de concesionario, tres vendedores y **ningún** teléfono puesto:
 * el sitio donde se pedía el dato era el equivocado.
 *
 * Estuvo tres días en una tabla propia, `erp_vendedores_marketplace`, hasta que
 * quedó claro que ese sitio ya existe: la ficha de Proveedores guarda lo mismo
 * y además el NIF, la dirección, el IBAN y las sedes, que es lo que hace falta
 * para facturarle. Estas pruebas fijan que solo haya una.
 *
 * Se comprueba leyendo el SQL de la ruta y no contra una base: lo que hay que
 * fijar es a qué tabla se escribe y qué se conserva al volver a guardar, y eso
 * está escrito ahí. Un doble de la base contestaría lo que se le haya enseñado
 * a contestar, que es justo lo que aquí no vale.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FUENTE = readFileSync(new URL('./visits.ts', import.meta.url), 'utf8');

/** El trozo que da de alta o actualiza la ficha al apuntar el teléfono. */
const APUNTAR = FUENTE.slice(
  FUENTE.indexOf('await preparaProveedores()'),
  FUENTE.indexOf("await apunta(bookingId, 'telefono_del_vendedor'"),
);

describe('dónde vive el teléfono', () => {
  test('en la ficha del proveedor, y en ningún otro sitio', () => {
    // La tabla vieja se queda en la base, vacía, pero nadie la escribe ni la
    // lee: dos sitios con el mismo dato acaban diciendo cosas distintas.
    assert.ok(!/INSERT INTO erp_vendedores_marketplace/.test(FUENTE));
    assert.ok(!/FROM erp_vendedores_marketplace/.test(FUENTE));
    assert.ok(!/JOIN erp_vendedores_marketplace/.test(FUENTE));
    assert.ok(!/CREATE TABLE IF NOT EXISTS erp_vendedores_marketplace/.test(FUENTE));
  });

  test('y se escribe en erp_proveedores', () => {
    assert.match(APUNTAR, /UPDATE erp_proveedores/);
    assert.match(APUNTAR, /INSERT INTO erp_proveedores/);
  });
});

describe('al apuntarlo', () => {
  test('si el vendedor no está dado de alta, se da', () => {
    /*
     * Es el único momento en que alguien tiene el dato delante. Obligar a ir a
     * otra pantalla a darlo de alta antes es garantizar que el teléfono no se
     * apunte — y hoy Modrive, Gamboa y VIAN no están en Proveedores.
     */
    assert.match(APUNTAR, /INSERT INTO erp_proveedores \(id, nombre, clave, tipos/);
    assert.match(APUNTAR, /'\{vendedor\}'/, 'no queda marcado como vendedor');
  });

  test('y si ya estaba, se le suma el tipo en vez de perder los que tuviera', () => {
    // Un transportista que además vende coches no puede dejar de ser
    // transportista por apuntarle un teléfono desde la Agenda.
    assert.match(APUNTAR, /array_append\(tipos, 'vendedor'\)/);
    assert.match(APUNTAR, /WHEN 'vendedor' = ANY\(tipos\) THEN tipos/);
  });

  test('el contacto y el horario no se pisan con vacíos', () => {
    /*
     * Quien viene a corregir el número deja los otros dos campos en blanco, y
     * eso no puede llevarse por delante el nombre que alguien apuntó de una
     * llamada anterior. Lo que se apunta de una gestión no se pierde por
     * guardar otra cosa.
     */
    assert.match(APUNTAR, /contacto = COALESCE\(NULLIF\(\$3, ''\), contacto\)/);
    assert.match(APUNTAR, /horario\s+= COALESCE\(NULLIF\(\$4, ''\), horario\)/);
    assert.ok(!/contacto = \$3\b/.test(APUNTAR), 'el contacto se sobrescribe con lo que venga');
  });

  test('se busca por nombre comparable, no por el nombre tal cual', () => {
    // «VIAN», «Vian Motor» y «vian  motor» son el mismo, y con un igual exacto
    // saldrían tres fichas del mismo concesionario.
    assert.match(APUNTAR, /nombreComparable\(vendedor\)/);
    assert.match(APUNTAR, /WHERE clave = \$1/);
  });
});

describe('y en la Agenda', () => {
  const AGENDA = FUENTE.slice(
    FUENTE.indexOf('async function conLaFichaDeQuienVende'),
    FUENTE.indexOf('// GET /all-bookings'),
  );

  test('el teléfono de la oferta manda sobre el de la ficha', () => {
    // Para el coche que esté en otra sede con otro número.
    assert.match(AGENDA, /seller_phone: suyo \|\| puesto\(ficha\?\.telefono\)/);
  });

  test('y se dice cuándo el número no es de este coche', () => {
    // Un número que no está en la ficha del coche aparecía sin explicación.
    assert.match(AGENDA, /del_vendedor: !suyo && Boolean\(puesto\(ficha\?\.telefono\)\)/);
  });

  test('se junta con elProveedorDe y no con un igual escrito aquí', () => {
    // Las reglas de emparejar nombres ya están escritas y probadas. Repetirlas
    // serían dos versiones de la misma regla.
    assert.match(AGENDA, /elProveedorDe\(puesto\(b\.seller\), fichas\.rows\)/);
  });

  test('las fichas se traen de una vez, no una por visita', () => {
    // Hay doce proveedores y hasta doscientas visitas: una consulta por visita
    // serían doscientas para leer doce filas.
    assert.equal((AGENDA.match(/await query/g) ?? []).length, 1);
  });
});
