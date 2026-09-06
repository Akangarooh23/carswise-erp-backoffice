/**
 * Cuánta gente llega, cuánta avanza y dónde se cae.
 *
 * El panel enseñaba «11 leads» sin decir de cuántos vienen, y esa es la mitad
 * que sirve: once leads de doce visitas es un negocio, y once de cuatro mil es
 * otro. La diferencia entre las dos no está en ningún sitio y decide dónde hay
 * que trabajar —traer más gente, o dejar de perderla por el camino—.
 *
 * ## Se cuentan personas, no eventos
 *
 * Y no es un detalle: por eventos el embudo sale 1.511 → 437 → 139 → 22, y por
 * personas 400 → 8 → 3 → 3. Son dos historias distintas. Alguien que recarga la
 * portada catorce veces son catorce eventos y una persona, y quien decide dónde
 * invertir necesita la segunda.
 *
 * ## Y no puede subir un escalón
 *
 * Contando cada paso por su cuenta, uno puede salir con más gente que el
 * anterior —quien entra directo a una ficha por un enlace no pasó por la
 * portada— y entonces el dibujo enseña un embudo que se ensancha, que no es un
 * embudo. Aquí cada persona cuenta en **el paso más hondo al que llegó**, y el
 * escalón es «cuántas llegaron al menos hasta aquí». Así siempre baja.
 */

export type PasoDelEmbudo = 'landing' | 'marketplace' | 'ficha' | 'solicitud';

export interface DefinicionDePaso {
  clave: PasoDelEmbudo;
  nombre: string;
  /** Qué significa, dicho para quien no ha visto nunca el evento. */
  queEs: string;
  /** El `event_type` que lo marca. */
  evento: string;
}

export const PASOS: readonly DefinicionDePaso[] = [
  { clave: 'landing',     nombre: 'Llegan a la web',   queEs: 'abren cualquier página de PopCar', evento: 'landing' },
  { clave: 'marketplace', nombre: 'Entran al marketplace', queEs: 'van a ver coches', evento: 'marketplace_view' },
  { clave: 'ficha',       nombre: 'Abren un coche',    queEs: 'entran en la ficha de uno concreto', evento: 'offer_view' },
  { clave: 'solicitud',   nombre: 'Piden información', queEs: 'dejan sus datos', evento: 'lead_request' },
];

/**
 * El `CASE` que puntúa cada evento, para quedarse con el más hondo.
 *
 * En una línea y sin plantilla: quien comprueba las consultas del panel las lee
 * del fichero y resuelve las interpolaciones buscando la constante.
 */
export const SQL_HONDURA = "CASE WHEN event_type = 'lead_request' THEN 4 WHEN event_type = 'offer_view' THEN 3 WHEN event_type = 'marketplace_view' THEN 2 WHEN event_type = 'landing' THEN 1 ELSE 0 END";

/** Cómo se reconoce a una persona: por su correo si lo dejó, y si no, por el navegador. */
export const SQL_QUIEN = "COALESCE(NULLIF(user_email, ''), anon_id)";

export interface Escalon {
  clave: PasoDelEmbudo;
  nombre: string;
  queEs: string;
  personas: number;
  /** Qué parte del escalón anterior sigue aquí. Null en el primero. */
  desdeElAnterior: number | null;
  /** Y qué parte de los que llegaron a la web. Null si no llegó nadie. */
  desdeElPrincipio: number | null;
  /** Cuántas se cayeron entre el anterior y este. */
  seCaen: number;
}

const porciento = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

/**
 * El embudo a partir de «cuánta gente llegó como mucho hasta cada paso».
 *
 * Se recorre de abajo arriba sumando: quien llegó a pedir información también
 * pasó por la ficha, aunque su fila solo diga «solicitud».
 */
export function elEmbudo(
  hondura: readonly { hondura?: unknown; personas?: unknown }[] | null | undefined
): Escalon[] {
  const porNivel = new Map<number, number>();
  for (const f of hondura ?? []) {
    const n = Number(f.hondura);
    if (!Number.isInteger(n) || n < 1 || n > PASOS.length) continue;
    porNivel.set(n, (porNivel.get(n) ?? 0) + (Number(f.personas) || 0));
  }

  // Acumulado desde el fondo: el escalón 2 son los que se quedaron en el 2 más
  // todos los que pasaron de ahí.
  const acumulado: number[] = [];
  let suma = 0;
  for (let n = PASOS.length; n >= 1; n -= 1) {
    suma += porNivel.get(n) ?? 0;
    acumulado[n] = suma;
  }

  const primero = acumulado[1] ?? 0;
  return PASOS.map((p, i) => {
    const personas = acumulado[i + 1] ?? 0;
    const anterior = i === 0 ? null : acumulado[i] ?? 0;
    return {
      clave: p.clave,
      nombre: p.nombre,
      queEs: p.queEs,
      personas,
      desdeElAnterior: anterior === null ? null : porciento(personas, anterior),
      desdeElPrincipio: porciento(personas, primero),
      seCaen: anterior === null ? 0 : Math.max(0, anterior - personas),
    };
  });
}

/**
 * Dónde se cae más gente, para poder decirlo en una frase.
 *
 * Un embudo con cuatro porcentajes obliga a comparar cuatro números para sacar
 * la única conclusión que importa. Es más útil que lo diga la pantalla.
 */
export function dondeSePierde(escalones: readonly Escalon[]): Escalon | null {
  const conCaida = escalones.filter((e) => e.desdeElAnterior !== null && e.seCaen > 0);
  if (!conCaida.length) return null;
  return conCaida.reduce((peor, e) => (e.seCaen > peor.seCaen ? e : peor));
}
