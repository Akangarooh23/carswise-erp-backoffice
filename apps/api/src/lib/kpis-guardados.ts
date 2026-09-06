/**
 * Números que cuestan demasiado para calcularlos en cada carga.
 *
 * Comparar nuestros 4.472 coches contra los 798.000 anuncios rastreados tarda
 * **ocho segundos**. Eso no puede colgar de una pantalla, y tampoco se arregla
 * con un cron: aquí no hay ninguno, y montar uno para tres números es
 * infraestructura que luego hay que acordarse de mantener.
 *
 * Así que se guardan con su fecha y se enseñan con ella. «Estamos 468 € por
 * encima del mercado, calculado ayer a las 19:40» es una respuesta honesta;
 * «estamos 468 € por encima» a secas, sin saber de cuándo es, no lo es.
 *
 * ## Y se recalculan a mano
 *
 * Quien mira la pantalla decide si el número está lo bastante fresco y pulsa el
 * botón. Es una decisión suya y le cuesta ocho segundos de espera que sabe que
 * está pagando —al revés que un recálculo automático escondido, que se los
 * cobra a quien pasaba por ahí—.
 */

import { query } from '../db/pool.js';

export interface KpiGuardado<T> {
  valor: T;
  /** Cuándo se calculó. Es la mitad del dato. */
  cuando: string;
  /** Cuántas horas hace, para poder decir si está viejo. */
  horas: number;
}

/** A partir de cuántas horas un número guardado se considera viejo. */
export const HORAS_PARA_VIEJO = 24;

export function cuantasHorasHace(cuando: unknown, ahora: Date = new Date()): number {
  const d = cuando instanceof Date ? cuando : new Date(String(cuando ?? ''));
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.max(0, (ahora.getTime() - d.getTime()) / 3600000);
}

export function estaViejo(cuando: unknown, ahora: Date = new Date()): boolean {
  return cuantasHorasHace(cuando, ahora) >= HORAS_PARA_VIEJO;
}

/**
 * Lo guardado, o null si no se ha calculado nunca.
 *
 * Null y «cero» son cosas distintas: la pantalla dice «sin calcular todavía» en
 * el primer caso y una cifra en el segundo. Devolver cero cuando no hay dato es
 * lo que hace que alguien se crea que no hay diferencia de precio.
 */
export async function leeKpi<T>(clave: string): Promise<KpiGuardado<T> | null> {
  const r = await query<{ valor: T; updated_at: unknown }>(
    `SELECT valor, updated_at FROM erp_calculos_guardados WHERE clave = $1`,
    [clave]
  ).catch(() => ({ rows: [] as { valor: T; updated_at: unknown }[] }));

  const fila = r.rows[0];
  if (!fila || fila.valor === null || fila.valor === undefined) return null;
  return {
    valor: fila.valor,
    cuando: new Date(String(fila.updated_at)).toISOString(),
    horas: Math.round(cuantasHorasHace(fila.updated_at) * 10) / 10,
  };
}

/** Y lo guarda, pisando lo que hubiera. */
export async function guardaKpi(clave: string, valor: unknown): Promise<void> {
  await query(
    `INSERT INTO erp_calculos_guardados (clave, valor, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
    [clave, JSON.stringify(valor ?? null)]
  ).catch((e) => {
    // Que no se pueda guardar no puede tirar la pantalla que lo calculó: el
    // número ya está bien, lo que falla es lo guardado.
    console.error('[calculos] no se ha podido guardar', clave, (e as Error).message);
  });
}

/** Las claves que existen, para no escribirlas a mano en cinco sitios. */
export const KPI = {
  /** Cuántas plataformas llevan más de una semana sin que el rastreador pase. */
  portalesParados: 'portales_parados',
  /** Cuánto se separan nuestros precios de los del mercado. */
  precioContraElMercado: 'precio_contra_el_mercado',
} as const;
