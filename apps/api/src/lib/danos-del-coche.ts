/**
 * Lo que el perito vio roto, partida por partida, con lo que estima que cuesta.
 *
 * Hasta ahora el informe del perito volvía como un PDF y una frase en «Lo que
 * vio». Eso vale para decidir si se compra, pero no para contestar la pregunta
 * que viene después: **¿cuánto cuesta dejarlo bien?** Sin partidas no hay total,
 * y sin total el precio de reacondicionamiento que se le da al cliente sale de
 * la memoria de quien coge el teléfono.
 *
 * Dos cuidados que dan forma a todo lo de aquí abajo:
 *
 * 1. **Un daño se puede ver y no saber lo que cuesta.** El perito lista un golpe
 *    en la aleta y no siempre le pone precio. Si esas partidas desaparecen del
 *    recuento, el total miente por abajo justo en los coches peores. Se apuntan
 *    igual, sin importe, y el resumen dice cuántas van sin valorar.
 * 2. **Esto no es un presupuesto de taller.** Es lo que un perito alemán estima
 *    mirando el coche; se repara aquí, con otras manos y otros precios. Sirve
 *    para saber de qué orden hablamos y para no quedarse corto al presupuestar,
 *    no para cerrar un precio con nadie.
 */

/**
 * Las partidas que aparecen una y otra vez.
 *
 * No es una lista cerrada: se puede escribir cualquier otra. Un perito no
 * rellena nuestros formularios, y una partida que no está en la lista no puede
 * quedarse fuera del total por eso.
 *
 * Está para que «Paragolpes delantero» se escriba siempre igual: dos formas de
 * escribir la misma pieza son dos partidas distintas al sumar por tipo de daño.
 */
export const PARTIDAS_HABITUALES = [
  'Paragolpes delantero',
  'Paragolpes trasero',
  'Capó',
  'Portón trasero',
  'Aleta delantera izquierda',
  'Aleta delantera derecha',
  'Aleta trasera izquierda',
  'Aleta trasera derecha',
  'Puerta delantera izquierda',
  'Puerta delantera derecha',
  'Puerta trasera izquierda',
  'Puerta trasera derecha',
  'Techo',
  'Retrovisor izquierdo',
  'Retrovisor derecho',
  'Faro izquierdo',
  'Faro derecho',
  'Piloto trasero izquierdo',
  'Piloto trasero derecho',
  'Parabrisas',
  'Luna trasera',
  'Llanta',
  'Neumáticos',
  'Frenos',
  'Tapicería',
  'Salpicadero',
  'Pintura general',
  'Otros',
] as const;

/** Una partida dañada, con lo que el perito estima que cuesta. */
export interface Dano {
  pieza: string;
  /** Lo que estima el perito. `null` si lo vio pero no lo valoró. */
  coste?: number | null;
  notas?: string | null;
}

/** Lo que impide apuntar una partida, si algo lo impide. */
export function faltaParaApuntarUnDano(d: Dano): string[] {
  const falta: string[] = [];
  if (!String(d.pieza ?? '').trim()) falta.push('qué pieza es');
  return falta;
}

/**
 * El importe tal y como se puede guardar.
 *
 * Un campo de texto admite «800 €», «800,00» y «ochocientos». Los dos primeros
 * son un número; el tercero no es un importe y se guarda **sin valorar**, que es
 * la verdad, en vez de como un cero — un cero diría que arreglarlo es gratis.
 *
 * Y viene de un Excel español, así que el punto suele ser de los miles y la
 * coma de los decimales: «1.200,00» son mil doscientos euros. Leerlo como lo
 * lee `Number` da `NaN`, y un `NaN` aquí no es un error visible sino una
 * partida que se queda sin valorar y un total que va corto.
 */
export function costeQueSeGuarda(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

  const limpio = String(v).replace(/[€\s]/g, '');
  if (!limpio || !/^[0-9.,]+$/.test(limpio)) return null;

  const punto = limpio.lastIndexOf('.');
  const coma = limpio.lastIndexOf(',');
  let normal: string;
  if (punto >= 0 && coma >= 0) {
    // Manda el último: el otro es el separador de miles.
    const decimal = punto > coma ? punto : coma;
    normal = limpio.slice(0, decimal).replace(/[.,]/g, '') + '.' + limpio.slice(decimal + 1);
  } else if (coma >= 0) {
    normal = limpio.replace(/,/g, '.');
  } else if (punto >= 0) {
    // Solo puntos: «1.200» son mil doscientos; «1200.50», mil doscientos y medio.
    const ultimo = limpio.length - punto - 1;
    normal = ultimo === 3 ? limpio.replace(/\./g, '') : limpio;
  } else {
    normal = limpio;
  }

  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Lo que alguien pega desde una hoja de cálculo.
 *
 * El informe del perito viene en un Excel muchas veces, y teclear veinte
 * partidas a mano es donde se pierden las tres últimas. Copiar y pegar la
 * columna entera es la forma en que esto se hace de verdad.
 *
 * Lo que llega del portapapeles de Excel son líneas con **tabuladores**. De un
 * CSV español llegan con **punto y coma**. Y de un correo, a veces, solo la
 * pieza y el importe separados por espacios. Se admiten los tres, porque el que
 * pega no sabe cuál de los tres tiene.
 *
 * Dos decisiones que importan:
 *
 * - **Nada se guarda a medias.** Se lee todo, se enseña lo que se ha entendido
 *   y lo que no, y se guarda cuando alguien lo mira. Un pegado que escribe
 *   directamente en la base deja veinte partidas mal escritas y ninguna forma
 *   cómoda de deshacerlo.
 * - **Una línea sin importe no es una línea rota.** Entra como vista y sin
 *   valorar, igual que si se apuntara a mano.
 */
export interface LoPegado {
  /** Las que se han entendido, listas para guardar. */
  danos: Dano[];
  /** Las que no, tal cual venían, para poder enseñarlas. */
  malas: string[];
}

/** Cabeceras que no son una partida: vienen del Excel y se saltan. */
const CABECERAS = ['pieza', 'partida', 'partidas', 'concepto', 'daño', 'danos', 'daños', 'descripcion', 'descripción'];

/**
 * Partir una línea en pieza, importe y nota.
 *
 * Con tabulador o con punto y coma no hay duda. Sin separador la hay, y del
 * lado caro: «Llanta 18» es una llanta de 18 pulgadas, no una llanta de 18 €.
 * Por eso ahí solo se corta cuando lo de detrás **parece dinero** —lleva euro,
 * lleva decimales o pasa de tres cifras—. Equivocarse hacia «no lo he
 * entendido» se ve en la vista previa y se arregla; equivocarse hacia «18 €»
 * se cuela en el total y nadie lo mira otra vez.
 */
function troceaLinea(linea: string): string[] {
  if (linea.includes('\t')) return linea.split('\t');
  if (linea.includes(';')) return linea.split(';');
  const m = /^(.*?)\s+([0-9][0-9.,]*)\s*(€)?$/.exec(linea);
  if (!m) return [linea];
  const cifra = m[2];
  const pareceDinero = Boolean(m[3]) || /[.,]/.test(cifra) || cifra.replace(/\D/g, '').length >= 3;
  return pareceDinero ? [m[1], cifra] : [linea];
}

export function leeLoPegado(texto: unknown): LoPegado {
  const danos: Dano[] = [];
  const malas: string[] = [];
  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const trozos = troceaLinea(linea).map((t) => t.trim());
    const pieza = (trozos[0] ?? '').replace(/^["']|["']$/g, '').trim();
    if (!pieza) { malas.push(linea); continue; }
    if (CABECERAS.includes(pieza.toLowerCase())) continue;
    danos.push({
      pieza,
      coste: costeQueSeGuarda(trozos[1]),
      notas: (trozos[2] ?? '').trim() || null,
    });
  }
  return { danos, malas };
}

export interface ResumenDeDanos {
  /** Cuántas partidas hay apuntadas. */
  cuantas: number;
  /** La suma de lo que sí está valorado. */
  total: number;
  /** Cuántas se vieron pero no se valoraron. */
  sinValorar: number;
}

/**
 * El recuento, con lo que falta dicho a la cara.
 *
 * `total` es la suma de lo valorado, no «el coste de los daños». La diferencia
 * importa cuando hay partidas sin precio: el total va corto y quien lo lea tiene
 * que saberlo. Por eso `sinValorar` sale del mismo sitio y no se puede coger uno
 * sin el otro.
 */
export function resumenDeDanos(danos: readonly Dano[]): ResumenDeDanos {
  let total = 0;
  let sinValorar = 0;
  for (const d of danos) {
    const c = costeQueSeGuarda(d.coste);
    if (c === null) sinValorar += 1;
    else total += c;
  }
  return { cuantas: danos.length, total: Math.round(total * 100) / 100, sinValorar };
}

/**
 * Cómo se cuenta eso en una línea, para la pantalla.
 *
 * Se escribe entero aquí y no en el componente porque la frase es el resultado:
 * «1240 € en 3 partidas» y «1240 € en 3 partidas, y 2 sin valorar» dicen cosas
 * muy distintas al que va a dar un precio por teléfono.
 */
export function comoSeCuenta(r: ResumenDeDanos): string {
  if (!r.cuantas) return 'Sin daños apuntados';
  const eur = r.total.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const partidas = `${r.cuantas} ${r.cuantas === 1 ? 'partida' : 'partidas'}`;
  const cola = r.sinValorar
    ? `, y ${r.sinValorar} sin valorar`
    : '';
  if (r.sinValorar === r.cuantas) return `${partidas}, ninguna valorada`;
  return `${eur} € en ${partidas}${cola}`;
}
