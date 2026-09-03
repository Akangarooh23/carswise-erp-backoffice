/**
 * Que ningún correo a un proveedor salga con un adjunto sin anunciar.
 *
 * La regla vale para los ocho, no para el que se acaba de tocar: el noveno
 * correo se escribirá copiando a uno de estos, y lo que se copia mal es
 * justamente lo que no se ve al leerlo. Por eso se comprueba sobre la fuente.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lineaDeAdjuntos } from './lo-que-va-adjunto.js';

const RUTAS = ['leads', 'peritaciones', 'transportes'];
const FUENTE = Object.fromEntries(
  RUTAS.map((r) => [r, readFileSync(new URL(`../routes/${r}.ts`, import.meta.url), 'utf8')])
);

describe('los correos a proveedores dicen lo que llevan', () => {
  test('todos los que se mandan pegan la línea al cuerpo', () => {
    for (const [donde, fuente] of Object.entries(FUENTE)) {
      const envios = fuente.match(/await enviar\(\{ to: aQuien,[^)]*\)/g) ?? [];
      assert.ok(envios.length > 0, `en ${donde} no hay ningún correo a proveedor`);
      for (const e of envios) {
        assert.match(e, /html: html \+ dicho/, `en ${donde}: «${e.slice(0, 80)}…» sale sin decir lo que lleva`);
      }
    }
  });

  test('y todos traen los papeles del mismo sitio, con su idioma', () => {
    for (const [donde, fuente] of Object.entries(FUENTE)) {
      // Nadie se salta el que compone la frase yendo por su cuenta a por los
      // ficheros: con `traeLosAdjuntos` suelto, el correo sale sin anunciarlos.
      assert.ok(
        !/=\s*await traeLosAdjuntos\(/.test(fuente),
        `en ${donde} alguien trae los adjuntos sin pasar por loQueSeAdjunta`
      );
      // El idioma es una constante o la variable que sale de `elIdioma`, que
      // es la que elige quien revisa. Lo que no vale es no pasar ninguno.
      const traidas = fuente.match(
        /loQueSeAdjunta\(cajones, req\.body\?\.adjuntos, (?:'(?:de|es|en)'|idioma)\)/g
      ) ?? [];
      assert.ok(traidas.length > 0, `en ${donde} no se adjunta nada`);
      const sueltas = fuente.match(/loQueSeAdjunta\(cajones, req\.body\?\.adjuntos\)/g) ?? [];
      assert.equal(sueltas.length, 0, `en ${donde} se adjunta sin decir en qué idioma`);
    }
  });

  test('la vista previa dice en qué idioma está', () => {
    for (const [donde, fuente] of Object.entries(FUENTE)) {
      const vistas = fuente.match(/res\.json\(\{ ok: true, vista: true, para: aQuien[^;]*\);/g) ?? [];
      assert.ok(vistas.length > 0, `en ${donde} no hay vista previa de ningún correo`);
      for (const v of vistas) {
        // Sin él, la pantalla anunciaría en español un adjunto de un correo
        // alemán, y lo que se revisa dejaría de ser lo que sale. Puede ser fijo
        // —al vendedor se le escribe en alemán y punto— o el que se ha elegido.
        assert.match(v, /idioma: '(de|es|en)'|idioma,/, `en ${donde} una vista previa no dice su idioma`);
      }
    }
  });

  test('y hay tantos envíos como vistas previas', () => {
    // Un correo que se puede mandar sin haberlo visto antes es un correo que
    // sale sin revisar. Van en pareja o no van.
    for (const [donde, fuente] of Object.entries(FUENTE)) {
      const envios = (fuente.match(/await enviar\(\{ to: aQuien,/g) ?? []).length;
      const vistas = (fuente.match(/res\.json\(\{ ok: true, vista: true, para: aQuien/g) ?? []).length;
      assert.equal(envios, vistas, `en ${donde} los envíos y las vistas previas no cuadran`);
    }
  });
});

describe('al vendedor alemán, en alemán', () => {
  test('la factura de compra se anuncia como Kaufrechnung', () => {
    const linea = lineaDeAdjuntos(
      [{ nombre: 'rechnung.pdf', papel: 'Factura del vendedor alemán' }],
      'de'
    );
    assert.match(linea, /Anhang:.*Kaufrechnung/);
  });
});
