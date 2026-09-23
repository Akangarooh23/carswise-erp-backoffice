/**
 * Qué versiones puede tener ese coche, según su motor.
 *
 * ## El problema
 *
 * La versión la elige el cliente de una lista, de memoria y con prisa, y es lo
 * que decide **con qué coches se compara el suyo** al tasarlo. Una gama tiene
 * tres «1.5» que no valen lo mismo: si elige la que no es, el número que sale
 * no está mal por poco — está comparado con otros coches.
 *
 * Y la versión no viene en ningún papel del coche. La ficha técnica trae
 * códigos de homologación (D.2), que la identifican de verdad pero hay que
 * traducirlos con una base de pago. El día que estemos conectados a Eurotax
 * por VIN o matrícula, esto sobra: dará la versión exacta y no candidatas.
 *
 * ## Lo que se puede hacer mientras
 *
 * De la ficha técnica salen los datos duros —cilindrada y kilovatios— y de
 * nuestros propios anuncios rastreados salen las versiones que **existen de
 * verdad** con ese motor. Millón y medio de anuncios, y la versión escrita en
 * casi todos.
 *
 * Así, en vez de elegir a ciegas, se eligen entre las que su motor puede
 * tener. Y son exactamente los anuncios contra los que luego se le compara,
 * que es lo que hace que el número signifique algo.
 *
 * ## Lo que esto no es
 *
 * **No da una versión, da candidatas.** Cilindrada y potencia no distinguen
 * acabados: el Life y el Advance son el mismo motor. Presentarlo como «es
 * ésta» sería cambiar un error del cliente por un error nuestro, que es peor
 * porque viene con pinta de comprobado.
 *
 * Y si de un modelo no hemos rastreado nada, no hay candidatas y se escribe a
 * mano como hasta ahora. Una lista vacía es una respuesta legítima.
 */

/**
 * El margen de la cilindrada.
 *
 * Un mismo motor se anuncia como 1.498, 1.500 y 1.5, y los portales lo
 * redondean cada uno a su manera. Sesenta centímetros cúbicos separan
 * redondeos sin llegar a juntar dos motores distintos: entre un 1.0 y un 1.5
 * hay quinientos.
 */
export const MARGEN_CC = 60;

/**
 * Y el de la potencia.
 *
 * De kilovatios a caballos y vuelta se pierde un entero por el camino, y hay
 * fichas que declaran 110 donde el portal pone 111. Tres es el redondeo; más
 * ya empieza a juntar versiones que el cliente nota.
 */
export const MARGEN_KW = 3;

/** Cuántas se le enseñan. Más de seis es otra vez elegir a ciegas. */
export const CUANTAS = 6;

/**
 * El modelo, como se compara.
 *
 * En los anuncios el mismo coche está escrito de cinco maneras —«T-ROC»,
 * «T-Roc», «TRoc», «t-roc»— porque cada portal lo escribe a su aire. Sin
 * normalizar, buscar «T-Roc» deja fuera cuatro quintas partes de los anuncios.
 *
 * «T-Roc Cabrio» no se normaliza a lo mismo, y eso está bien: es otro coche.
 */
export function comoSeCompara(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Las versiones anunciadas de ese modelo con ese motor.
 *
 * Solo anuncios vivos: una versión que solo aparece en coches retirados hace
 * año y medio no es una opción que ofrecerle hoy, y además es contra los vivos
 * contra los que se tasa.
 *
 * `year` filtra la generación cuando se sabe, con tres años de holgura: el
 * nombre de la versión cambia de una generación a otra, y mezclarlas ofrece
 * nombres que ese coche no pudo tener nunca.
 */
export const SQL_CANDIDATAS = `
  SELECT btrim(version) AS version,
         COUNT(*)::int   AS anuncios,
         MAX(power_cv)   AS cv,
         MIN(year)::int  AS desde,
         MAX(year)::int  AS hasta
    FROM moveadvisor_market_offers
   WHERE COALESCE(is_active, TRUE)
     AND COALESCE(btrim(version), '') <> ''
     AND lower(regexp_replace(COALESCE(brand, ''), '[^a-zA-Z0-9]', '', 'g')) = $1
     AND lower(regexp_replace(COALESCE(model, ''), '[^a-zA-Z0-9]', '', 'g')) = $2
     AND ABS(COALESCE(NULLIF(regexp_replace(COALESCE(displacement, ''), '[^0-9]', '', 'g'), '')::int, -9999) - $3) <= $5
     AND ABS(COALESCE(power_kw, -9999) - $4) <= $6
     AND ($7::int IS NULL OR year IS NULL OR ABS(year - $7::int) <= 3)
   GROUP BY 1
   ORDER BY anuncios DESC
   LIMIT $8`;

export interface Candidata {
  version: string;
  anuncios: number;
  cv: number | null;
  desde: number | null;
  hasta: number | null;
}

/** Los parámetros de la consulta, en su orden. */
export function losDatosDeLaBusqueda(
  { marca, modelo, cc, kw, ano }: { marca: unknown; modelo: unknown; cc: number; kw: number; ano?: number | null },
): [string, string, number, number, number, number, number | null, number] {
  return [
    comoSeCompara(marca),
    comoSeCompara(modelo),
    Math.round(cc),
    Math.round(kw),
    MARGEN_CC,
    MARGEN_KW,
    ano && ano > 1950 ? Math.round(ano) : null,
    CUANTAS,
  ];
}

/**
 * Si hay con qué buscar.
 *
 * Sin marca, sin modelo o sin los dos números del motor no se busca nada: una
 * búsqueda a medias devuelve las versiones de otro coche, y eso es peor que no
 * ofrecer ninguna.
 */
export function sePuedeBuscar(
  { marca, modelo, cc, kw }: { marca: unknown; modelo: unknown; cc: number | null; kw: number | null },
): boolean {
  return Boolean(comoSeCompara(marca))
    && Boolean(comoSeCompara(modelo))
    && typeof cc === 'number' && cc > 0
    && typeof kw === 'number' && kw > 0;
}

/**
 * Si alguna de las candidatas es la que ya tiene puesta.
 *
 * Se compara normalizado porque «1.5 TSI Advance DSG7» y «1.5 TSI Advance
 * DSG-7» son la misma, y enseñarle como novedad lo que ya tiene escrito hace
 * dudar de todo lo demás.
 */
export function yaEsLaSuya(candidatas: readonly Candidata[], version: unknown): boolean {
  const suya = comoSeCompara(version);
  return Boolean(suya) && candidatas.some((c) => comoSeCompara(c.version) === suya);
}
