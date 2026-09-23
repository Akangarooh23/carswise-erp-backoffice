/**
 * Lo que dice la ficha técnica, traducido a las características del coche.
 *
 * ## Por qué
 *
 * Las características las escribe el cliente a mano, y se equivoca de una
 * manera concreta y repetida: copia el número que ve sin saber qué unidad es.
 * En el T-Roc de la prueba puso **110 CV** en un coche cuya propia versión dice
 * «110 kW» — que son 150 CV. Cuarenta caballos de menos en el anuncio, y el
 * precio del que luego se habla sale de ahí.
 *
 * La ficha técnica es el papel que lo dice sin opinión: cada dato tiene un
 * código europeo fijo y el mismo sitio en todas. P.2 es la potencia en kW, P.1
 * la cilindrada, V.7 el CO₂. Se lee una vez y se corrige lo que esté mal.
 *
 * ## Lo que esto NO hace
 *
 * **No guarda nada solo.** Devuelve lo que dice el papel y en qué se diferencia
 * de lo que hay puesto; quien decide es la persona que lo mira. Un OCR que
 * pisa datos porque cree haber leído bien es peor que no tenerlo: el error que
 * mete nadie lo revisa, porque ya viene «comprobado».
 *
 * **Y no inventa lo que el papel no lleva.** La ficha técnica no dice los
 * kilómetros, ni la versión comercial, ni si el cambio es manual o automático,
 * ni dónde está el coche, ni las fechas de ITV. Rellenar esos campos con algo
 * plausible sería exactamente el fallo que esto viene a arreglar. Lo que no
 * está, no se propone.
 *
 * ## De dónde salen los códigos
 *
 * Son los del anexo I de la Directiva 1999/37/CE, que es lo que usan la tarjeta
 * ITV española y el permiso de circulación de toda la UE. No cambian entre
 * marcas ni entre años, y por eso esto se puede leer con reglas y no a ojo.
 */

/**
 * Los códigos que se le piden al lector, con lo que significan.
 *
 * Se le pasan al modelo **en el prompt**: leer un papel sabiendo que «P.2 es la
 * potencia en kW» y leerlo sin saberlo son dos trabajos distintos, y el segundo
 * es el que se equivoca de columna.
 */
export const CODIGOS: Readonly<Record<string, string>> = {
  'A.1': 'Nombre del fabricante',
  'D.1': 'Marca',
  'D.2': 'Tipo / variante / versión (códigos de homologación)',
  'D.3': 'Denominación comercial (el modelo)',
  E: 'Número de bastidor (VIN)',
  J: 'Categoría del vehículo (M1, N1…)',
  'J.1': 'Código de carrocería (AA, AB, AC, AD, AE, AF…)',
  R: 'Color',
  'F.1': 'Masa máxima técnicamente admisible, en kg',
  'F.6': 'Longitud, en mm',
  'P.1': 'Cilindrada, en cm³',
  'P.2': 'Potencia máxima, en kW',
  'P.3': 'Tipo de combustible',
  'P.5': 'Código del motor',
  'S.1': 'Número de plazas de asiento, conductor incluido',
  'V.7': 'Emisiones de CO₂, en g/km',
  'V.9': 'Nivel de emisiones (EURO 4, 5, 6…)',
  'L.2': 'Medida de los neumáticos',
  Matricula: 'La matrícula, si el papel la lleva',
};

/**
 * Lo que se le pide al lector.
 *
 * Pide los códigos **tal cual están escritos**, sin interpretarlos: convertir
 * kilovatios a caballos o adivinar el color a partir de dos letras es trabajo
 * de aquí abajo, donde se puede leer, probar y corregir. Un modelo que además
 * calcula mete su error dentro de un número que parece leído.
 */
export function elPrompt(): string {
  const lista = Object.entries(CODIGOS).map(([c, q]) => `${c}: ${q}`).join('\n');
  return `Eres un lector de fichas técnicas de vehículos españolas (tarjeta ITV).

Devuelve SOLO un objeto JSON con los códigos que encuentres, copiando el valor
EXACTAMENTE como está impreso. No conviertas unidades, no traduzcas, no
completes lo que no veas.

Códigos que interesan:
${lista}

Reglas:
- Si un código no aparece o está ilegible, NO lo incluyas en el JSON.
- Si un código aparece como guiones, puntos suspensivos o casilla vacía, NO lo incluyas.
- No inventes ningún valor. Es preferible devolver menos campos.
- Devuelve además "confianza": "alta" si el documento es una ficha técnica
  legible, "baja" si está borroso, cortado o no parece una ficha técnica.

Ejemplo de respuesta:
{"D.1":"SEAT","D.3":"ARONA","P.1":"999","P.2":"85","P.3":"G","S.1":"5","R":"BL","V.7":"110","confianza":"alta"}`;
}

const texto = (v: unknown) => String(v ?? '').trim();

/** Un valor que el papel no dice: guiones, puntos o casilla vacía. */
function estaVacio(v: unknown): boolean {
  const s = texto(v);
  return s === '' || /^[-.\s·]+$/.test(s);
}

/** El primer número de un texto: «860 / 850» es 860, «7.82» es 7.82. */
function elNumero(v: unknown): number | null {
  const m = texto(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * De kilovatios a caballos.
 *
 * 1 CV son 735,49875 W, así que el factor es 1,35962. Se redondea al entero
 * porque es como se dice y como se anuncia: «150 CV», no «149,6».
 *
 * Este es el cálculo que el cliente no hace: ve «110 kW» en su ficha y escribe
 * 110 en la casilla de CV.
 */
export function caballos(kw: number): number {
  return Math.round(kw * 1.35962);
}

/** Los colores como los abrevia la tarjeta ITV. */
const COLORES: Readonly<Record<string, string>> = {
  BL: 'Blanco', BLANCO: 'Blanco',
  NE: 'Negro', NEGRO: 'Negro',
  GR: 'Gris', GRIS: 'Gris',
  PL: 'Gris plata', PLATA: 'Gris plata',
  AZ: 'Azul', AZUL: 'Azul',
  RJ: 'Rojo', ROJO: 'Rojo',
  VE: 'Verde', VERDE: 'Verde',
  AM: 'Amarillo', AMARILLO: 'Amarillo',
  MR: 'Marrón', MARRON: 'Marrón',
  NA: 'Naranja', NARANJA: 'Naranja',
  BE: 'Beige', BEIGE: 'Beige',
  VI: 'Violeta', VIOLETA: 'Violeta',
};

export function elColor(r: unknown): string {
  const s = texto(r).toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  return COLORES[s] ?? '';
}

/**
 * El combustible, como lo codifica P.3.
 *
 * «M/G» es mixto con gasolina: para el anuncio eso es gasolina. Un híbrido de
 * verdad la ficha lo marca como eléctrico + térmico, y esos casos salen sin
 * proponer nada: es mejor que lo mire una persona a que el anuncio diga
 * «gasolina» en un enchufable.
 */
export function elCombustible(p3: unknown): string {
  const s = texto(p3).toUpperCase();
  if (!s) return '';
  if (/ELEC|\bELE\b|\bEV\b/.test(s)) return 'electrico';
  if (/HIBRID|HÍBRID|PHEV|\bHEV\b/.test(s)) return 'hibrido';
  /*
   * El gasóleo antes que el gas, y el gas con la lista cerrada.
   *
   * Aquí ponía `GAS\b` para el gas, y la frontera de palabra cae **dentro** de
   * «GASÓLEO»: la tilde no es carácter de palabra para la expresión, así que
   * un diésel salía como gas. Un anuncio con el combustible cambiado se lo
   * come el comprador en la visita.
   */
  if (/DIESEL|DIÉSEL|GASOLEO|GASÓLEO|\bD\b/.test(s)) return 'diesel';
  if (/GASOLINA|\bG\b/.test(s)) return 'gasolina';
  if (/\bGLP\b|\bGNC\b|\bGNL\b|\bLPG\b|\bCNG\b|^GAS$/.test(s)) return 'gas';
  return '';
}

/**
 * La carrocería, por el código europeo de J.1.
 *
 * AF es «vehículo de uso múltiple», que es donde entran los SUV y los
 * monovolúmenes: el papel no los distingue, así que no se propone nada. Lo que
 * el papel no separa, no lo separa esto.
 */
export function laCarroceria(j1: unknown): string {
  const s = texto(j1).toUpperCase().replace(/[^A-Z]/g, '');
  if (s === 'AA') return 'berlina';
  if (s === 'AB') return 'berlina';
  if (s === 'AC') return 'familiar';
  if (s === 'AD') return 'coupe';
  if (s === 'AE') return 'cabrio';
  if (s === 'BB') return 'furgoneta';
  return '';
}

export interface LoQueDice {
  /** Lo que se propone poner, con las claves de `CAMPOS`. */
  campos: Record<string, string>;
  /** Lo que el papel dice pero aquí no se traduce a ningún campo. */
  avisos: string[];
}

/**
 * Los códigos del papel, traducidos a los campos del coche.
 *
 * Solo lo que el papel sostiene. Cada conversión está arriba, con su nombre y
 * su prueba: el día que un color raro salga mal, se arregla en un sitio.
 */
export function loQueDiceLaFicha(codigos: Record<string, unknown> | null | undefined): LoQueDice {
  const c = codigos ?? {};
  const campos: Record<string, string> = {};
  const avisos: string[] = [];
  const pon = (clave: string, valor: string) => { if (valor) campos[clave] = valor; };

  if (!estaVacio(c['D.1'])) pon('brand', texto(c['D.1']));
  if (!estaVacio(c['D.3'])) pon('model', texto(c['D.3']));
  if (!estaVacio(c.Matricula)) pon('plate', texto(c.Matricula).toUpperCase().replace(/[^A-Z0-9]/g, ''));

  const kw = estaVacio(c['P.2']) ? null : elNumero(c['P.2']);
  if (kw !== null && kw > 0) pon('cv', String(caballos(kw)));

  const cc = estaVacio(c['P.1']) ? null : elNumero(c['P.1']);
  if (cc !== null && cc > 0) pon('displacement', String(Math.round(cc)));

  const co2 = estaVacio(c['V.7']) ? null : elNumero(c['V.7']);
  if (co2 !== null && co2 >= 0) pon('co2', String(co2));

  const plazas = estaVacio(c['S.1']) ? null : elNumero(c['S.1']);
  if (plazas !== null && plazas >= 1 && plazas <= 9) pon('seats', String(Math.round(plazas)));

  pon('fuel', elCombustible(c['P.3']));
  pon('body_type', laCarroceria(c['J.1']));
  pon('color', elColor(c.R));

  /*
   * Lo que el papel dice y aquí no se traduce, dicho en voz alta.
   *
   * Callarlo sería peor: quien mira la pantalla cree que la ficha no lo traía,
   * y la etiqueta ambiental o el SUV se quedan sin poner para siempre.
   */
  if (!estaVacio(c['V.9'])) {
    avisos.push(`El papel dice ${texto(c['V.9'])}, pero la etiqueta de la DGT depende también de la fecha de matriculación y de si es híbrido: ponla a mano.`);
  }
  if (!estaVacio(c['J.1']) && !laCarroceria(c['J.1'])) {
    avisos.push(`La carrocería viene como «${texto(c['J.1'])}», que el papel no separa entre SUV, monovolumen y todoterreno: elígela a mano.`);
  }
  if (!estaVacio(c['D.2'])) {
    avisos.push(`La versión comercial no está en la ficha. Lo que trae es el código de homologación (${texto(c['D.2'])}), que no es un nombre de versión.`);
  }

  return { campos, avisos };
}

/**
 * Lo que la versión que escribió el cliente dice del motor.
 *
 * «R-Line 1st Edition 1.5 eTSI 110kW DSG» lleva dentro la cilindrada y la
 * potencia. No es un nombre libre: es lo que el fabricante pone en la gama, y
 * por eso se puede contrastar con el papel.
 *
 * Los litros se guardan en centímetros cúbicos para poder compararlos con P.1,
 * y se admite medio margen porque «1.5» se anuncia igual para 1.498 y 1.512.
 */
export function queDiceLaVersion(version: unknown): { cc: number | null; kw: number | null; cv: number | null } {
  const s = texto(version);
  // Los litros: «1.5», «2,0 TDI». No vale un «1.5» que sea parte de otra cosa.
  const litros = s.match(/(?<![\d.,])([0-9])[.,]([0-9])(?![\d.,])/);
  const kw = s.match(/([0-9]{2,3})\s*kw/i);
  const cv = s.match(/([0-9]{2,4})\s*(cv|hp)\b/i);
  return {
    cc: litros ? Math.round(Number(`${litros[1]}.${litros[2]}`) * 1000) : null,
    kw: kw ? Number(kw[1]) : null,
    cv: cv ? Number(cv[1]) : null,
  };
}

/**
 * Si la versión que eligió el cliente cuadra con su ficha técnica.
 *
 * Es lo que hace fiable la tasación. Un coche se compara con los que son como
 * él, y la versión es lo que dice cuáles son: si el cliente elige de una lista
 * una que no es la suya —y las gamas tienen tres «1.5» que no valen lo mismo—
 * el precio sale de comparar su coche con otros coches.
 *
 * Solo se avisa cuando el papel **contradice** lo que pone la versión, no
 * cuando la versión no dice nada. La mayoría no lleva la potencia escrita, y un
 * aviso que salta siempre deja de leerse.
 */
export function laVersionNoCuadra(
  version: unknown,
  codigos: Record<string, unknown> | null | undefined,
): string {
  const dice = queDiceLaVersion(version);
  const c = codigos ?? {};
  const ccFicha = estaVacio(c['P.1']) ? null : elNumero(c['P.1']);
  const kwFicha = estaVacio(c['P.2']) ? null : elNumero(c['P.2']);
  const problemas: string[] = [];

  // Medio litro de margen: «1.5» se anuncia igual para 1.498 y para 1.512.
  if (dice.cc !== null && ccFicha !== null && Math.abs(dice.cc - ccFicha) > 150) {
    problemas.push(`la versión dice ${(dice.cc / 1000).toFixed(1)} y la ficha ${ccFicha} cc`);
  }
  if (dice.kw !== null && kwFicha !== null && Math.abs(dice.kw - kwFicha) > 3) {
    problemas.push(`la versión dice ${dice.kw} kW y la ficha ${kwFicha}`);
  }
  if (dice.cv !== null && kwFicha !== null && Math.abs(dice.cv - caballos(kwFicha)) > 5) {
    problemas.push(`la versión dice ${dice.cv} CV y la ficha ${caballos(kwFicha)}`);
  }
  if (!problemas.length) return '';

  return `La versión no cuadra con la ficha técnica: ${problemas.join('; ')}. `
    + 'Comprueba cuál es su versión antes de tasarlo: el precio sale de compararlo con coches de esa versión.';
}

/** Los campos que la ficha técnica no lleva nunca, para poder decirlo. */
export const LO_QUE_NO_TRAE = [
  'mileage', 'version', 'transmission_type', 'vehicle_location',
  'last_itv', 'next_itv', 'service_book', 'official_service',
  'last_service_date', 'last_service_km', 'price', 'year',
] as const;

export interface Diferencia {
  clave: string;
  etiqueta: string;
  /** Lo que hay puesto ahora, como texto legible. */
  ahora: string;
  /** Lo que dice el papel. */
  segunLaFicha: string;
  /** Si hay que cambiar algo: había un valor distinto. */
  corrige: boolean;
}

/** Dos valores son el mismo si se leen igual: «5» y «5.0», «BL» y «bl». */
function sonIguales(a: unknown, b: unknown): boolean {
  const n1 = elNumero(a);
  const n2 = elNumero(b);
  const soloNumero = (v: unknown) => /^\s*-?\d+([.,]\d+)?\s*$/.test(texto(v));
  if (n1 !== null && n2 !== null && soloNumero(a) && soloNumero(b)) return n1 === n2;
  return texto(a).toLowerCase() === texto(b).toLowerCase();
}

/**
 * En qué se diferencia el papel de lo que hay puesto.
 *
 * Se devuelven también las que coinciden, marcadas con `corrige: false`: saber
 * que la cilindrada estaba bien es parte de haber leído la ficha, y sin eso la
 * pantalla solo enseña errores y no dice qué se ha comprobado.
 */
export function lasDiferencias(
  loQueHay: Record<string, unknown> | null | undefined,
  segunLaFicha: Record<string, string>,
  etiquetaDe: (clave: string) => string,
): Diferencia[] {
  const hay = loQueHay ?? {};
  return Object.entries(segunLaFicha).map(([clave, valor]) => {
    const ahora = texto(hay[clave]);
    return {
      clave,
      etiqueta: etiquetaDe(clave) || clave,
      ahora,
      segunLaFicha: valor,
      // Vacío también se corrige: completar es la mitad del trabajo.
      corrige: !sonIguales(ahora, valor),
    };
  });
}
