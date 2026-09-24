/**
 * El informe de estado se puede abrir desde la ficha del IDCar.
 *
 * El ERP sabía **que** el informe existe —lo usa de puerta para publicar y sale
 * en los papeles que faltan de un encargo— pero no había forma de verlo. Si un
 * cliente llamaba preguntando por su informe, quien cogía el teléfono veía
 * «hecho» y no podía enseñárselo ni comprobarlo.
 *
 * Lo que se fija aquí son las dos decisiones que no pueden torcerse:
 *
 *  · **la clave de PopCar Check vive en un solo sitio**. El PDF lo tiene Check,
 *    pero se le pide a PopCar, que es quien guarda esa credencial. Si algún día
 *    alguien la copia aquí, habrá dos sitios desde los que se habla con Check y
 *    dos donde rotarla el día que toque;
 *  · **el PDF va por una ruta con sesión**, como las facturas y los papeles del
 *    coche: lleva las fotos del coche de un cliente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RUTA = readFileSync(new URL('./idcars.ts', import.meta.url), 'utf8');
const FICHA = readFileSync(
  new URL('../../../web/src/pages/IdCarDetailPage.tsx', import.meta.url),
  'utf8',
);

/** El trozo de la ruta del informe, sin comentarios. */
function laRuta(): string {
  const i = RUTA.indexOf("'/idcars/:id/informe-de-estado'");
  assert.ok(i > 0, 'ya no existe la ruta del informe');
  return RUTA.slice(i, i + 2200)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('la ruta que sirve el informe', () => {
  test('pide sesión, como cualquier documento de un cliente', () => {
    assert.match(RUTA, /'\/idcars\/:id\/informe-de-estado',\s*\n?\s*requireRole\(/);
  });

  test('se lo pide a PopCar, no a PopCar Check', () => {
    const codigo = laRuta();
    assert.match(codigo, /PUBLIC_SITE_URL/, 'el destino es PopCar');
    assert.match(codigo, /route=informe-de-estado-interno/);
    assert.ok(
      !/check\.popcar|CARSWISE_CHECK/i.test(codigo),
      'la clave de Check no puede acabar viviendo también aquí',
    );
  });

  test('y va firmada con el secreto entre los dos servicios', () => {
    const codigo = laRuta();
    assert.match(codigo, /INTERNAL_API_SECRET/);
    assert.match(codigo, /Bearer \$\{secreto\}/);
    // Sin secreto no se inventa nada: se dice que falta configuración.
    assert.match(codigo, /sin_configurar/);
  });

  test('el «todavía no está» se pasa tal cual, sin disfrazarlo de avería', () => {
    // Un informe en curso no es un error 500: la ficha lo dice y ya está.
    assert.match(laRuta(), /res\.status\(r\.status\)/);
  });
});

describe('la ficha del IDCar', () => {
  test('trae el estado del informe con el coche, sin otra llamada', () => {
    assert.match(RUTA, /AS informe_estado/);
    assert.match(RUTA, /AS informe_fecha/);
    // El último, que es el vigente: un coche puede repetir el informe.
    assert.match(RUTA, /ORDER BY r\.created_at DESC LIMIT 1/);
  });

  test('y enseña el botón solo cuando hay documento', () => {
    assert.match(FICHA, /const INFORME_LISTO = new Set\(\['informe_listo', 'verificada', 'publicada'\]\)/);
    assert.match(FICHA, /INFORME_LISTO\.has\(String\(vehicle\.informe_estado/);
    assert.match(FICHA, /descargaConSesion\(`\/idcars\/\$\{id\}\/informe-de-estado`/);
  });

  test('y cuando no lo hay, dice en qué va en vez de callarse', () => {
    assert.match(FICHA, /En curso:/);
    assert.match(FICHA, /todavía no tiene informe de estado/);
  });
});
