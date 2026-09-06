import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cuantasHorasHace, estaViejo, HORAS_PARA_VIEJO, KPI } from './kpis-guardados.js';

const AHORA = new Date('2026-09-06T18:00:00Z');
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3600000);

describe('cuánto hace que se calculó', () => {
  test('en horas, con decimal', () => {
    assert.equal(cuantasHorasHace(haceHoras(2.5), AHORA), 2.5);
  });

  test('acepta una fecha o su texto', () => {
    assert.equal(cuantasHorasHace(haceHoras(3).toISOString(), AHORA), 3);
  });

  test('lo que no es una fecha hace infinito, no cero', () => {
    // Cero diría «recién calculado» de un dato que no existe, y entonces la
    // pantalla enseña un número viejo dando a entender que está fresco.
    assert.equal(cuantasHorasHace(null, AHORA), Infinity);
    assert.equal(cuantasHorasHace('lo que sea', AHORA), Infinity);
    assert.equal(cuantasHorasHace('', AHORA), Infinity);
  });

  test('una fecha del futuro no da horas negativas', () => {
    // Un reloj del servidor adelantado no puede hacer que un dato parezca de
    // dentro de dos horas.
    assert.equal(cuantasHorasHace(haceHoras(-2), AHORA), 0);
  });
});

describe('cuándo un número está viejo', () => {
  test('a partir de las veinticuatro horas', () => {
    assert.equal(estaViejo(haceHoras(HORAS_PARA_VIEJO - 0.1), AHORA), false);
    assert.equal(estaViejo(haceHoras(HORAS_PARA_VIEJO), AHORA), true);
    assert.equal(estaViejo(haceHoras(48), AHORA), true);
  });

  test('y lo que no se ha calculado nunca está viejo', () => {
    assert.equal(estaViejo(null, AHORA), true);
  });
});

describe('las claves', () => {
  test('están escritas en un sitio', () => {
    // Escritas a mano en cinco sitios, un día una se escribe distinta y el
    // número guardado deja de encontrarse sin que nada falle.
    assert.equal(KPI.portalesParados, 'portales_parados');
    assert.equal(KPI.precioContraElMercado, 'precio_contra_el_mercado');
  });

  test('y no se repiten', () => {
    const claves = Object.values(KPI);
    assert.equal(new Set(claves).size, claves.length);
  });
});
