/**
 * Cuánto deja cada coche, uno a uno.
 *
 * El agregado dice si este mes fue bueno. Lo que dice si el negocio **funciona**
 * es otra cosa: cuánto deja de media una importación. Con un coche se puede
 * hacer a mano; con quince, la pregunta «¿cuál nos ha costado dinero?» no se
 * puede contestar, y un coche que pierde 400 € desaparece dentro de un total
 * que sale en verde.
 *
 * ## Lo que no se atribuye se dice
 *
 * Un gasto se ata a su coche por el título del vehículo y un ingreso por el
 * expediente, porque es lo que hay guardado. Los dos fallan: un título escrito
 * distinto deja la factura fuera, y el margen sale mejor de lo que es sin que
 * nada avise.
 *
 * Así que lo que no se ha podido atar **se cuenta y se enseña**. Un margen con
 * 890 € huérfanos al lado es una cifra que se puede usar; el mismo margen sin
 * decirlo es una cifra falsa.
 */

import { desglosa } from './dinero.js';
import type { ApunteConLinea } from './cuenta-de-resultados.js';

const redondo = (n: number) => Math.round(n * 100) / 100;

/** Un coche al que atribuir dinero. */
export interface Coche {
  id: string;
  vehiculo: string | null;
  estado: string | null;
  /** Cuándo entró, para poder ordenar por lo más reciente. */
  desde?: string | null;
}

export interface MargenDeUnCoche {
  id: string;
  vehiculo: string | null;
  estado: string | null;
  /** Sin IVA y sin suplidos. */
  ingreso: number;
  gasto: number;
  margen: number;
  /** Sobre el ingreso. Null cuando no hay ingreso: no es 0 %, es que no hay. */
  porcentaje: number | null;
  /** Cuántas facturas hay detrás de cada lado. */
  facturas: number;
  /** Gasto que sabemos que llegará y todavía no ha llegado. */
  comprometido: number;
}

export interface Margenes {
  coches: MargenDeUnCoche[];
  /** La media de los que ya se han entregado, que es la que dice si escala. */
  medioEntregados: number | null;
  cuantosEntregados: number;
  /** Lo que no se ha podido atar a ningún coche. */
  sinAtribuir: { n: number; base: number };
}

/**
 * Si un apunte es de este coche.
 *
 * Por expediente primero, que es exacto. Por título después, que es lo único
 * que llevan las facturas de proveedor —no guardan a qué expediente van— y por
 * eso se compara sin distinguir mayúsculas ni espacios de sobra.
 */
function esDeEsteCoche(a: ApunteConLinea, coche: Coche): boolean {
  const contrato = String(a.contrato ?? '').trim();
  if (contrato && contrato === coche.id) return true;

  const suyo = String(a.vehiculo ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const del = String(coche.vehiculo ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(suyo) && suyo === del;
}

/** Si cuenta para el resultado: ni suplido, ni factura que no ha llegado. */
function cuenta(a: ApunteConLinea): boolean {
  return !a.pendiente && (a.que ?? 'nuestro') !== 'suplido';
}

/**
 * El margen de cada coche, y lo que se ha quedado fuera.
 *
 * Los coches salen todos, también los que no tienen ni un euro atribuido: que
 * un expediente en marcha no tenga todavía ninguna factura es información, y
 * escondiéndolo se pierde de vista.
 */
export function margenPorCoche(
  coches: readonly Coche[] | null | undefined,
  apuntes: readonly ApunteConLinea[] | null | undefined,
  entregado = 'Entregado'
): Margenes {
  const lista = coches ?? [];
  const todos = apuntes ?? [];
  const atados = new Set<ApunteConLinea>();

  const salida: MargenDeUnCoche[] = lista.map((c) => {
    let ingreso = 0, gasto = 0, facturas = 0, comprometido = 0;

    for (const a of todos) {
      if (!esDeEsteCoche(a, c)) continue;
      atados.add(a);

      const d = desglosa({ base: a.base, iva: a.iva, cuota: a.cuota, total: a.total, regimen: a.regimen });
      if (a.pendiente) {
        // Solo el gasto comprometido: un ingreso sin facturar no existe.
        if (a.sentido === 'recibida') comprometido += d.total;
        continue;
      }
      if (!cuenta(a)) continue;

      facturas += 1;
      if (a.sentido === 'emitida') ingreso += d.base;
      else gasto += d.base;
    }

    ingreso = redondo(ingreso);
    gasto = redondo(gasto);
    const margen = redondo(ingreso - gasto);
    return {
      id: c.id,
      vehiculo: c.vehiculo,
      estado: c.estado,
      ingreso,
      gasto,
      margen,
      porcentaje: ingreso > 0 ? redondo((margen / ingreso) * 100) : null,
      facturas,
      comprometido: redondo(comprometido),
    };
  });

  /*
   * La media, solo de los entregados.
   *
   * Un coche a medio camino tiene el fee cobrado y la mitad de las facturas sin
   * llegar: su margen parece enorme y arrastra la media hacia arriba. La
   * pregunta «cuánto deja una importación» solo la contestan las terminadas.
   */
  const terminados = salida.filter((c) => c.estado === entregado && c.ingreso > 0);
  const medio = terminados.length
    ? redondo(terminados.reduce((s, c) => s + c.margen, 0) / terminados.length)
    : null;

  const huerfanos = todos.filter((a) => !atados.has(a) && cuenta(a) && a.sentido === 'recibida');

  return {
    coches: salida,
    medioEntregados: medio,
    cuantosEntregados: terminados.length,
    sinAtribuir: {
      n: huerfanos.length,
      base: redondo(huerfanos.reduce(
        (s, a) => s + desglosa({ base: a.base, iva: a.iva, cuota: a.cuota, total: a.total, regimen: a.regimen }).base,
        0
      )),
    },
  };
}
