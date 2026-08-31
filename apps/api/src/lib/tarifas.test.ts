/**
 * Las tarifas de transporte.
 *
 * Lo que se comprueba aquí es lo que decide un número que ve el cliente: el
 * coste de traer un coche va sumado al precio del anuncio. Una tarifa aplicada
 * donde no toca no es un fallo de pantalla, es un precio equivocado en público.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  zonaComparable, paisComparable, sirvePara, concrecion, precioPorCoche,
  loQueCuestaTraerlo, laMejor, seSaleDeTarifa, estaVigente, MARGEN_AVISO,
  transportePorDefecto, POR_DEFECTO,
  type Tarifa,
} from './tarifas.js';

function tarifa(x: Partial<Tarifa>): Tarifa {
  return {
    id: 'TRF-1', proveedor_id: 'PRV-1',
    origen_pais: 'DE', origen_zona: '', destino_pais: 'ES', destino_zona: '',
    precio_1: 900, precio_2_3: null, precio_4_8: null, dias_transito: null,
    ...x,
  };
}

const DE_A_ES = { origenPais: 'DE', destinoPais: 'ES' };

describe('el mismo sitio escrito de otra forma', () => {
  test('la tilde y las mayúsculas no hacen dos ciudades', () => {
    assert.equal(zonaComparable('Múnich'), zonaComparable('MUNICH'));
    assert.equal(zonaComparable('  Frankfurt  '), 'frankfurt');
  });

  test('el país son dos letras, escriba quien escriba', () => {
    assert.equal(paisComparable(' de '), 'DE');
    assert.equal(paisComparable('es'), 'ES');
  });

  test('sin zona no es una zona vacía cualquiera: es «todo el país»', () => {
    assert.equal(zonaComparable(''), '');
    assert.equal(zonaComparable(null), '');
  });
});

describe('qué tarifa sirve para qué viaje', () => {
  test('una de país entero vale para cualquier ciudad de ese país', () => {
    const t = tarifa({});
    assert.equal(sirvePara(t, { ...DE_A_ES, origenZona: 'Hamburgo' }), true);
    assert.equal(sirvePara(t, { ...DE_A_ES, origenZona: 'Múnich' }), true);
  });

  test('una de Múnich no vale para un coche que está en Hamburgo', () => {
    const t = tarifa({ origen_zona: 'Múnich' });
    assert.equal(sirvePara(t, { ...DE_A_ES, origenZona: 'Múnich' }), true);
    assert.equal(sirvePara(t, { ...DE_A_ES, origenZona: 'Hamburgo' }), false);
  });

  test('ni aunque el coche no diga de qué ciudad es', () => {
    const t = tarifa({ origen_zona: 'Múnich' });
    assert.equal(sirvePara(t, DE_A_ES), false,
      'sin saber dónde está el coche, una tarifa de una ciudad concreta no se puede afirmar');
  });

  test('otro país es otro viaje', () => {
    const t = tarifa({});
    assert.equal(sirvePara(t, { origenPais: 'FR', destinoPais: 'ES' }), false);
    assert.equal(sirvePara(t, { origenPais: 'DE', destinoPais: 'IT' }), false);
  });

  test('el destino se mira igual que el origen', () => {
    const t = tarifa({ destino_zona: 'Madrid' });
    assert.equal(sirvePara(t, { ...DE_A_ES, destinoZona: 'madrid' }), true);
    assert.equal(sirvePara(t, { ...DE_A_ES, destinoZona: 'Barcelona' }), false);
  });
});

describe('el precio por coche', () => {
  test('cuantos más van, el tramo que toque', () => {
    const t = tarifa({ precio_1: 900, precio_2_3: 750, precio_4_8: 600 });
    assert.equal(precioPorCoche(t, 1), 900);
    assert.equal(precioPorCoche(t, 3), 750);
    assert.equal(precioPorCoche(t, 6), 600);
  });

  test('si no han dado el precio de cuatro, no sale gratis: se usa el de menos', () => {
    const t = tarifa({ precio_1: 900, precio_2_3: null, precio_4_8: null });
    assert.equal(precioPorCoche(t, 6), 900,
      'un proveedor que solo dio el precio de uno no ha dicho que cuatro sean gratis');
  });

  test('una tarifa sin ningún precio no vale para estimar nada', () => {
    const t = tarifa({ precio_1: null, precio_2_3: null, precio_4_8: null });
    assert.equal(precioPorCoche(t, 1), null);
  });

  test('cero no es un precio', () => {
    const t = tarifa({ precio_1: 0, precio_2_3: 750 });
    assert.equal(precioPorCoche(t, 1), null);
    assert.equal(precioPorCoche(t, 2), 750);
  });

  test('medio coche no existe', () => {
    const t = tarifa({ precio_1: 900, precio_2_3: 750 });
    assert.equal(precioPorCoche(t, 0), 900);
    assert.equal(precioPorCoche(t, 2.7), 750);
  });
});

describe('cuál gana cuando valen varias', () => {
  const general = tarifa({ id: 'TRF-general', precio_1: 850 });
  const deMunich = tarifa({ id: 'TRF-munich', origen_zona: 'Múnich', precio_1: 900 });
  const otroBarato = tarifa({ id: 'TRF-barato', proveedor_id: 'PRV-2', precio_1: 800 });

  test('la más concreta, aunque sea más cara', () => {
    const mejor = laMejor([general, deMunich], { ...DE_A_ES, origenZona: 'Múnich' });
    assert.equal(mejor?.tarifa?.id, 'TRF-munich',
      'alguien cerró ese corredor a propósito: eso vale más que un precio general más bajo');
  });

  test('a igual concreción, la más barata', () => {
    const mejor = laMejor([general, otroBarato], DE_A_ES);
    assert.equal(mejor?.tarifa?.id, 'TRF-barato');
  });

  test('salen todas las que valen, para poder comparar', () => {
    const todas = loQueCuestaTraerlo([general, deMunich, otroBarato], { ...DE_A_ES, origenZona: 'Múnich' });
    assert.deepEqual(todas.map((x) => x.tarifa?.id), ['TRF-munich', 'TRF-barato', 'TRF-general']);
  });

  test('el total es por los coches que van', () => {
    const t = tarifa({ precio_1: 900, precio_2_3: 750 });
    const mejor = laMejor([t], { ...DE_A_ES, coches: 3 });
    assert.equal(mejor?.precio, 750);
    assert.equal(mejor?.total, 2250);
  });

  test('sin ninguna tarifa que sirva, se dice lo que suponemos', () => {
    // Devolver nada dejaba el coste a cero, que es la peor respuesta: un coche
    // que parece que se trae gratis.
    const sin = laMejor([], DE_A_ES);
    assert.equal(sin?.precio, 1500);
    assert.equal(sin?.tarifa, null);
    assert.equal(sin?.porDefecto, true, 'un supuesto no se puede prometer: va marcado');
  });

  test('una tarifa de verdad manda sobre el supuesto, aunque sea más cara', () => {
    const cara = tarifa({ precio_1: 1800 });
    const mejor = laMejor([cara], DE_A_ES);
    assert.equal(mejor?.precio, 1800);
    assert.ok(!mejor?.porDefecto);
  });

  test('de un corredor que no suponemos nada, nada', () => {
    assert.equal(laMejor([], { origenPais: 'IT', destinoPais: 'ES' }), null,
      'inventar un número para un viaje que nunca hemos hecho es peor que no dar ninguno');
  });
});

describe('cuando el presupuesto se sale de lo acordado', () => {
  test('un poco por encima no molesta a nadie', () => {
    assert.equal(seSaleDeTarifa(950, 900), null);
  });

  test('un 40 % de más sí, que es lo que se paga sin enterarse', () => {
    const desvio = seSaleDeTarifa(1260, 900);
    assert.ok(desvio != null && desvio > 0.39);
  });

  test('y por debajo también avisa: puede ser que falte algo en el presupuesto', () => {
    const desvio = seSaleDeTarifa(500, 900);
    assert.ok(desvio != null && desvio < 0);
  });

  test('justo en el margen ya avisa', () => {
    assert.ok(seSaleDeTarifa(900 * (1 + MARGEN_AVISO), 900) != null);
  });

  test('sin tarifa con la que comparar no hay aviso', () => {
    assert.equal(seSaleDeTarifa(1200, null), null);
    assert.equal(seSaleDeTarifa('', 900), null);
  });
});

describe('una tarifa caducada', () => {
  const HOY = new Date('2026-09-15T10:00:00Z');

  test('sin fecha de fin, vale siempre', () => {
    assert.equal(estaVigente(tarifa({}), HOY), true);
  });

  test('el último día todavía cuenta', () => {
    assert.equal(estaVigente(tarifa({ vigente_hasta: '2026-09-15' }), HOY), true);
  });

  test('pasado, ya no: es un precio que nadie sostiene', () => {
    assert.equal(estaVigente(tarifa({ vigente_hasta: '2026-09-14' }), HOY), false);
  });

  test('una fecha ilegible no invalida la tarifa por sorpresa', () => {
    assert.equal(estaVigente(tarifa({ vigente_hasta: 'el mes que viene' }), HOY), true);
  });
});

/**
 * Lo que se supone mientras no haya presupuestos.
 *
 * Son decisiones de Ana, no medias de nada. Se comprueban porque un número
 * provisional que se cuela sin querer en el sitio equivocado deja de ser
 * provisional: nadie vuelve a mirarlo.
 */
describe('lo que se supone que cuesta traerlo', () => {
  test('dentro de España, 700; desde Alemania, 1.500', () => {
    assert.equal(transportePorDefecto({ origenPais: 'ES', destinoPais: 'ES' }), 700);
    assert.equal(transportePorDefecto({ origenPais: 'DE', destinoPais: 'ES' }), 1500);
  });

  test('traer de Alemania cuesta más que mover por España', () => {
    const dentro = transportePorDefecto({ origenPais: 'ES', destinoPais: 'ES' }) ?? 0;
    const desde = transportePorDefecto({ origenPais: 'DE', destinoPais: 'ES' }) ?? 0;
    assert.ok(desde > dentro);
  });

  test('de un corredor que no está, no se supone nada', () => {
    assert.equal(transportePorDefecto({ origenPais: 'FR', destinoPais: 'ES' }), null);
    assert.equal(transportePorDefecto({ origenPais: 'ES', destinoPais: 'DE' }), null,
      'llevar un coche a Alemania no es lo mismo que traerlo');
  });

  test('escrito de otra forma sigue valiendo', () => {
    assert.equal(transportePorDefecto({ origenPais: ' de ', destinoPais: 'es' }), 1500);
  });

  test('ninguno es cero: un transporte gratis no existe', () => {
    for (const x of POR_DEFECTO) assert.ok(x.precio > 0, `${x.origen}→${x.destino} sale gratis`);
  });

  test('el supuesto también se multiplica por los coches que van', () => {
    const r = laMejor([], { origenPais: 'DE', destinoPais: 'ES', coches: 3 });
    assert.equal(r?.total, 4500);
  });
});
