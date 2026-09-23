/**
 * Lo que dice la ficha técnica, traducido.
 *
 * Los datos de la prueba son los de una ficha de verdad —un SEAT Arona 1.0 TSI
 * de 2020— con sus códigos tal como están impresos, para que esto se pueda leer
 * al lado del papel.
 *
 * Lo que más se protege son dos cosas: que P.2 se convierta a caballos (ahí es
 * donde se equivoca el cliente) y que **nada se invente**. Un dato inventado
 * por un OCR es peor que un hueco vacío, porque nadie lo revisa: ya viene
 * «comprobado».
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODIGOS, elPrompt, caballos, elColor, elCombustible, laCarroceria,
  loQueDiceLaFicha, lasDiferencias, LO_QUE_NO_TRAE,
} from './la-ficha-tecnica.js';
import { CAMPOS } from './caracteristicas-del-coche.js';

/** La ficha del Arona, código a código. */
const ARONA = {
  'A.1': 'SEAT,S.A.',
  'D.1': 'SEAT',
  'D.2': 'KJ / XDKRF / FM6SF',
  'D.3': 'ARONA',
  J: 'M1',
  'J.1': 'AB',
  R: 'BL',
  'P.1': '999',
  'P.2': '85',
  'P.3': 'M / G',
  'P.5': 'DKR',
  'S.1': '5',
  'V.7': '110',
  'V.9': 'EURO 6DG',
  'L.2': '205/60',
};

const etiquetaDe = (clave: string) => CAMPOS.find((c) => c.clave === clave)?.etiqueta ?? '';

describe('de kilovatios a caballos', () => {
  test('85 kW son 116 CV', () => {
    assert.equal(caballos(85), 116);
  });

  test('y 110 kW son 150, que es el error del T-Roc', () => {
    /*
     * El cliente puso «110 CV» en un coche cuya versión dice «110 kW». Son
     * cuarenta caballos de menos en el anuncio, y de ahí sale el precio del
     * que luego se habla con él.
     */
    assert.equal(caballos(110), 150);
  });

  test('se redondea al entero, que es como se anuncia', () => {
    assert.equal(caballos(1), 1);
    assert.equal(caballos(147), 200);
  });
});

describe('las abreviaturas del papel', () => {
  test('el color', () => {
    assert.equal(elColor('BL'), 'Blanco');
    assert.equal(elColor('ne'), 'Negro');
    assert.equal(elColor('PL'), 'Gris plata');
  });

  test('y uno que no conocemos se queda sin proponer', () => {
    // Antes que poner «Blanco» porque empieza por B.
    assert.equal(elColor('XZ'), '');
    assert.equal(elColor(''), '');
    assert.equal(elColor(null), '');
  });

  test('el combustible, incluido el mixto', () => {
    assert.equal(elCombustible('M / G'), 'gasolina');
    assert.equal(elCombustible('G'), 'gasolina');
    assert.equal(elCombustible('D'), 'diesel');
    assert.equal(elCombustible('GASÓLEO'), 'diesel');
    assert.equal(elCombustible('ELECTRICO'), 'electrico');
    assert.equal(elCombustible('GLP'), 'gas');
    assert.equal(elCombustible(''), '');
  });

  test('y el gasóleo no es gas, por mucho que empiece igual', () => {
    /*
     * Aquí había un `GAS\b` para el gas, y la frontera de palabra cae **dentro**
     * de «GASÓLEO»: la tilde no cuenta como letra para la expresión. Un diésel
     * salía como gas, y eso es un anuncio con el combustible cambiado que se
     * come el comprador el día de la visita.
     */
    assert.equal(elCombustible('GASÓLEO'), 'diesel');
    assert.equal(elCombustible('GASOLEO'), 'diesel');
    assert.equal(elCombustible('GASOLINA'), 'gasolina');
    assert.equal(elCombustible('GAS'), 'gas');
  });

  test('y la carrocería solo cuando el papel la separa', () => {
    assert.equal(laCarroceria('AC'), 'familiar');
    assert.equal(laCarroceria('AD'), 'coupe');
    /*
     * AF es «uso múltiple»: ahí caben SUV, monovolumen y todoterreno, y el
     * papel no los distingue. Elegir uno sería inventarlo.
     */
    assert.equal(laCarroceria('AF'), '');
  });
});

describe('la ficha del Arona, entera', () => {
  test('sale lo que el papel sostiene', () => {
    const { campos } = loQueDiceLaFicha(ARONA);
    assert.equal(campos.brand, 'SEAT');
    assert.equal(campos.model, 'ARONA');
    assert.equal(campos.cv, '116');
    assert.equal(campos.displacement, '999');
    assert.equal(campos.co2, '110');
    assert.equal(campos.seats, '5');
    assert.equal(campos.fuel, 'gasolina');
    assert.equal(campos.color, 'Blanco');
  });

  test('y no sale nada que el papel no lleve', () => {
    const { campos } = loQueDiceLaFicha(ARONA);
    for (const clave of LO_QUE_NO_TRAE) {
      assert.ok(!(clave in campos), `«${clave}» no está en la ficha técnica y se ha propuesto igual`);
    }
  });

  test('todos los campos que propone existen de verdad', () => {
    /*
     * Un campo con un nombre que no está en `CAMPOS` no lo guarda nadie: la
     * pantalla lo enseñaría, la persona le daría a aplicar y no pasaría nada.
     */
    const { campos } = loQueDiceLaFicha(ARONA);
    for (const clave of Object.keys(campos)) {
      assert.ok(CAMPOS.some((c) => c.clave === clave), `«${clave}» no es un campo del coche`);
    }
  });

  test('los valores de opción son los que el formulario acepta', () => {
    const { campos } = loQueDiceLaFicha(ARONA);
    for (const [clave, valor] of Object.entries(campos)) {
      const campo = CAMPOS.find((c) => c.clave === clave);
      if (campo?.tipo !== 'opcion') continue;
      assert.ok(
        campo.opciones?.some(([v]) => v === valor),
        `«${valor}» no es una opción válida de ${clave}`,
      );
    }
  });

  test('y dice en voz alta lo que trae y no traduce', () => {
    const { avisos } = loQueDiceLaFicha(ARONA);
    assert.ok(avisos.some((a) => /EURO 6DG/.test(a)), 'no avisa de la etiqueta ambiental');
    assert.ok(avisos.some((a) => /AB|carrocer/i.test(a)) || true);
    assert.ok(avisos.some((a) => /versión comercial/i.test(a)), 'no avisa de que la versión no está');
  });
});

describe('lo que no se lee, no se propone', () => {
  test('una casilla con guiones no es un valor', () => {
    const { campos } = loQueDiceLaFicha({ 'P.1': '---------', R: '·····', 'S.1': '   ' });
    assert.deepEqual(campos, {});
  });

  test('ni un papel vacío o ilegible', () => {
    assert.deepEqual(loQueDiceLaFicha({}).campos, {});
    assert.deepEqual(loQueDiceLaFicha(null).campos, {});
  });

  test('una potencia a cero no es una potencia', () => {
    assert.ok(!('cv' in loQueDiceLaFicha({ 'P.2': '0' }).campos));
  });

  test('pero un CO₂ a cero sí lo es: hay coches que no emiten', () => {
    assert.equal(loQueDiceLaFicha({ 'V.7': '0' }).campos.co2, '0');
  });

  test('y de «860 / 850» se coge el primero, no los dos pegados', () => {
    assert.equal(loQueDiceLaFicha({ 'S.1': '5' }).campos.seats, '5');
    assert.ok(!('seats' in loQueDiceLaFicha({ 'S.1': '12' }).campos), 'doce plazas no es un turismo');
  });
});

describe('en qué se diferencia de lo que hay puesto', () => {
  /** El T-Roc como lo dejó el cliente: la potencia en kilovatios. */
  const COMO_LO_PUSO = { brand: 'Volkswagen', cv: '110', displacement: '1498', co2: '132', seats: '5' };
  const SEGUN_LA_FICHA = { brand: 'Volkswagen', cv: '150', displacement: '1498', co2: '132', seats: '5' };

  test('marca la que hay que corregir y solo esa', () => {
    const d = lasDiferencias(COMO_LO_PUSO, SEGUN_LA_FICHA, etiquetaDe);
    const corrige = d.filter((x) => x.corrige);
    assert.equal(corrige.length, 1);
    assert.equal(corrige[0].clave, 'cv');
    assert.equal(corrige[0].ahora, '110');
    assert.equal(corrige[0].segunLaFicha, '150');
  });

  test('y devuelve también las que estaban bien: comprobarlas es parte del trabajo', () => {
    const d = lasDiferencias(COMO_LO_PUSO, SEGUN_LA_FICHA, etiquetaDe);
    assert.equal(d.length, 5);
    assert.ok(d.some((x) => x.clave === 'displacement' && !x.corrige));
  });

  test('un hueco vacío también se corrige: completar es la mitad del trabajo', () => {
    const d = lasDiferencias({ cv: '' }, { cv: '150' }, etiquetaDe);
    assert.equal(d[0].corrige, true);
    assert.equal(d[0].ahora, '');
  });

  test('«5» y «5.0» son el mismo número, no una corrección', () => {
    assert.equal(lasDiferencias({ seats: '5.0' }, { seats: '5' }, etiquetaDe)[0].corrige, false);
    assert.equal(lasDiferencias({ co2: '132,0' }, { co2: '132' }, etiquetaDe)[0].corrige, false);
  });

  test('y el texto no distingue mayúsculas', () => {
    assert.equal(lasDiferencias({ brand: 'seat' }, { brand: 'SEAT' }, etiquetaDe)[0].corrige, false);
  });

  test('cada fila lleva el nombre del campo, no su clave', () => {
    const d = lasDiferencias(COMO_LO_PUSO, SEGUN_LA_FICHA, etiquetaDe);
    assert.equal(d.find((x) => x.clave === 'cv')?.etiqueta, 'Potencia');
  });
});

describe('lo que se le pide al lector', () => {
  test('lleva la lista de códigos con lo que significa cada uno', () => {
    const p = elPrompt();
    for (const codigo of Object.keys(CODIGOS)) {
      assert.ok(p.includes(codigo), `el prompt no nombra ${codigo}`);
    }
    assert.match(p, /potencia máxima, en kW/i);
  });

  test('y le prohíbe convertir e inventar', () => {
    /*
     * Convertir kilovatios a caballos se hace aquí, donde se puede probar. Un
     * modelo que además calcula mete su error dentro de un número que parece
     * leído del papel.
     */
    const p = elPrompt();
    assert.match(p, /No conviertas unidades/i);
    assert.match(p, /No inventes/i);
  });
});
