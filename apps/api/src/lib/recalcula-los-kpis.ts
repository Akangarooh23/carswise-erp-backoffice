/**
 * Los dos números caros, recalculados.
 *
 * Estaban escritos dentro de las pantallas que los enseñan, así que la única
 * manera de refrescarlos era que alguien entrara. Ahora hay una tarea diaria, y
 * lo que la tarea corre tiene que ser **la misma consulta** que la pantalla: dos
 * copias del mismo cálculo acaban dando dos cifras, y el día que difieran hay
 * que decidir cuál vale.
 *
 * Cada uno devuelve lo que guardó, o null si no había nada que guardar. Ninguno
 * revienta: una tarea nocturna que se cae por un portal sin anuncios deja los
 * dos números viejos en vez de uno.
 */

import { query } from '../db/pool.js';
import { guardaKpi, KPI } from './kpis-guardados.js';

/** Cuántos días sin que el rastreador pase para dar un portal por parado. */
export const DIAS_PARA_PARADO = 7;

export interface PortalesParados {
  n: number;
  de: number;
  cuales: string[];
}

const SQL_PORTALES = `
  SELECT portal, MAX(last_checked_at)::date AS ultima
    FROM moveadvisor_market_offers
   WHERE COALESCE(portal, '') <> ''
   GROUP BY 1`;

/**
 * Cuántas plataformas llevan una semana sin que el rastreador pase.
 *
 * Se mira `last_checked_at` y no `updated_at`: lo que importa no es que la
 * pasada arrancara, sino que comprobara algo. Y además `updated_at` no tiene
 * índice —ocho segundos sobre 2,5 GB— mientras que este baja a uno.
 */
export function losParados(
  filas: readonly { portal: unknown; ultima: unknown }[],
  ahora: Date = new Date(),
): PortalesParados | null {
  if (!filas.length) return null;
  /*
   * Una fecha que no se entiende cuenta como que no han pasado.
   *
   * Restando sin más sale NaN, y `NaN > 7` es falso: el portal se quedaba
   * callado por tener la fecha rota. Lo seguro es al revés — uno que sale
   * parado se mira, y uno que se calla no lo mira nadie.
   */
  const dias = (v: unknown) => {
    if (!v) return Infinity;
    const t = new Date(String(v)).getTime();
    if (!Number.isFinite(t)) return Infinity;
    return (ahora.getTime() - t) / 86400000;
  };
  const parados = filas.filter((x) => dias(x.ultima) > DIAS_PARA_PARADO);
  return {
    n: parados.length,
    de: filas.length,
    cuales: parados.map((x) => String(x.portal)),
  };
}

export async function recalculaPortalesParados(): Promise<PortalesParados | null> {
  const r = await query<{ portal: unknown; ultima: unknown }>(SQL_PORTALES, [])
    .catch(() => ({ rows: [] as { portal: unknown; ultima: unknown }[] }));
  const valor = losParados(r.rows);
  // Sin filas no se guarda nada: un cero aquí diría «ningún portal parado»
  // cuando lo que ha pasado es que la consulta no ha traído nada.
  if (!valor) return null;
  await guardaKpi(KPI.portalesParados, valor);
  return valor;
}

/**
 * Cuánto se separan nuestros precios de los del mercado.
 *
 * Compara cada coche nuestro con la media de los anuncios de la misma marca,
 * modelo, año **y tramo de potencia**, y solo cuando hay al menos tres con los
 * que comparar. Sin el tramo, un Golf de 110 CV se comparaba con uno de 245 y
 * el top de «los más caros» era una lista de acabados altos.
 *
 * Son ocho segundos sobre 798.000 anuncios. Por eso se guarda con su fecha.
 */
export const SQL_PRECIO_CONTRA_EL_MERCADO = `
  WITH mercado AS (
    SELECT LOWER(brand) AS b, LOWER(model) AS m, year AS y,
           (power_cv / 25)::int AS tramo,
           AVG(price)::numeric AS medio, COUNT(*)::int AS cuantos
      FROM moveadvisor_market_offers
     WHERE COALESCE(is_active, TRUE) AND price > 0 AND power_cv > 0
       AND COALESCE(brand, '') <> '' AND COALESCE(model, '') <> '' AND year IS NOT NULL
     GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) >= 3
  ),
  nuestros AS (
    SELECT o.id, o.title, o.brand, o.model, o.year, o.price,
           k.medio, k.cuantos,
           (o.price - k.medio) AS diferencia,
           (100.0 * (o.price - k.medio) / k.medio) AS pct
      FROM moveadvisor_marketplace_vo_offers o
      JOIN mercado k ON k.b = LOWER(o.brand) AND k.m = LOWER(o.model) AND k.y = o.year
                    AND k.tramo = (NULLIF(regexp_replace(o.power, '[^0-9]', '', 'g'), '')::int / 25)
     WHERE o.is_active AND o.price > 0
  )
  SELECT
    (SELECT COUNT(*)::int FROM nuestros)                                        AS comparables,
    (SELECT COUNT(*)::int FROM moveadvisor_marketplace_vo_offers WHERE is_active) AS publicados,
    (SELECT COUNT(*)::int FROM nuestros WHERE diferencia > 0)                   AS por_encima,
    (SELECT ROUND(AVG(diferencia))::int FROM nuestros)                          AS diferencia_media,
    (SELECT ROUND(AVG(pct), 1) FROM nuestros)                                   AS pct_medio,
    (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
       SELECT title, brand, model, year, price::int,
              ROUND(medio)::int AS medio, cuantos,
              ROUND(diferencia)::int AS diferencia, ROUND(pct, 1) AS pct
         FROM nuestros ORDER BY diferencia DESC LIMIT 10
     ) x)                                                                       AS los_mas_caros
`;

export async function recalculaPrecioContraElMercado(): Promise<Record<string, unknown> | null> {
  const r = await query<Record<string, unknown>>(SQL_PRECIO_CONTRA_EL_MERCADO, [])
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const valor = r.rows[0] ?? null;
  // Y aquí igual: sin coches comparables no hay número, y guardar un cero diría
  // que estamos justo en el precio del mercado.
  if (!valor || Number(valor.comparables) === 0) return null;
  await guardaKpi(KPI.precioContraElMercado, valor);
  return valor;
}
