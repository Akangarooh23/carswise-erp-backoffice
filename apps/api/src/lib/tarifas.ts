/**
 * Lo que cuesta traer un coche, según con quién.
 *
 * Hasta ahora el transporte era un número fijo: **700 €** metidos en la fórmula
 * que puntúa las ofertas alemanas, el mismo para un coche en Múnich que para uno
 * en Hamburgo. Ese número es el que se le suma al precio para enseñarle al
 * cliente lo que le costaría puesto aquí, así que no es un detalle interno:
 * decide qué ofertas parecen buenas.
 *
 * Una tarifa es lo que un proveedor cobra por un **corredor** —de dónde a
 * dónde— y por cuántos coches van juntos. Con eso, el coste deja de ser una
 * suposición y pasa a ser lo que alguien nos ha dicho por escrito.
 *
 * Aquí solo están las reglas: qué tarifa gana cuando hay varias que valen, y
 * cuánto sale por coche. Sin base de datos, para poder comprobarlas.
 */

export interface Tarifa {
  id: string;
  proveedor_id: string;
  proveedor?: string;
  /** El país de origen, en dos letras: DE, ES, FR… */
  origen_pais: string;
  /** La ciudad o la región. Vacío quiere decir «cualquier sitio de ese país». */
  origen_zona: string;
  destino_pais: string;
  destino_zona: string;
  /** Por coche, si va uno solo. */
  precio_1: number | null;
  /** Por coche, si van dos o tres. */
  precio_2_3: number | null;
  /** Por coche, a partir de cuatro. */
  precio_4_8: number | null;
  /** Lo que tardan desde que lo recogen. */
  dias_transito: number | null;
  vigente_hasta?: string | null;
  notas?: string;
}

/**
 * Dos sitios son el mismo aunque se escriban distinto.
 *
 * «Múnich», «munich» y «MUNICH» son la misma ciudad. Sin esto, una tarifa
 * escrita con tilde no se encontraría nunca al buscar sin ella, y quien la metió
 * juraría que está.
 */
export function zonaComparable(zona?: string | null): string {
  return (zona ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function paisComparable(pais?: string | null): string {
  return (pais ?? '').trim().toUpperCase().slice(0, 2);
}

/**
 * Si una tarifa sirve para este viaje.
 *
 * Una tarifa sin zona vale para todo el país: «de Alemania a España, 900 €». Una
 * con zona vale solo para esa ciudad. Al revés no: una tarifa de Múnich no vale
 * para un coche que está en Hamburgo, aunque los dos estén en Alemania.
 */
export function sirvePara(t: Tarifa, viaje: Viaje): boolean {
  if (paisComparable(t.origen_pais) !== paisComparable(viaje.origenPais)) return false;
  if (paisComparable(t.destino_pais) !== paisComparable(viaje.destinoPais)) return false;
  const oz = zonaComparable(t.origen_zona);
  const dz = zonaComparable(t.destino_zona);
  if (oz && oz !== zonaComparable(viaje.origenZona)) return false;
  if (dz && dz !== zonaComparable(viaje.destinoZona)) return false;
  return true;
}

export interface Viaje {
  origenPais: string;
  origenZona?: string;
  destinoPais: string;
  destinoZona?: string;
  /** Cuántos coches van en el mismo viaje. Uno, si no se dice. */
  coches?: number;
}

/**
 * Cómo de concreta es una tarifa: 2 si dice las dos ciudades, 1 si dice una.
 *
 * Sirve para desempatar. Entre «de Alemania a España» y «de Múnich a Madrid»,
 * para un coche que está en Múnich gana la segunda: es la que alguien se molestó
 * en cerrar para ese corredor.
 */
export function concrecion(t: Tarifa): number {
  return (zonaComparable(t.origen_zona) ? 1 : 0) + (zonaComparable(t.destino_zona) ? 1 : 0);
}

/**
 * El precio por coche de una tarifa, según cuántos van.
 *
 * Si el tramo que toca no tiene precio, se cae al de menos coches que sí lo
 * tenga: un proveedor que solo ha dado el precio de uno no está diciendo que
 * llevar cuatro sea gratis.
 */
export function precioPorCoche(t: Tarifa, coches = 1): number | null {
  const n = Math.max(1, Math.floor(Number(coches) || 1));
  const escalera = n >= 4
    ? [t.precio_4_8, t.precio_2_3, t.precio_1]
    : n >= 2
      ? [t.precio_2_3, t.precio_1]
      : [t.precio_1];
  for (const p of escalera) {
    if (p != null && Number(p) > 0) return Number(p);
  }
  return null;
}

export interface Estimacion {
  /** Nula cuando el precio no viene de nadie, sino del valor por defecto. */
  tarifa: Tarifa | null;
  /** Por coche. */
  precio: number;
  /** Por los que van, que es lo que se factura. */
  total: number;
  coches: number;
  /** Si el precio es una suposición nuestra y no lo que alguien ha ofrecido. */
  porDefecto?: boolean;
}

/**
 * Lo que se supone que cuesta traer un coche cuando nadie lo ha tarifado.
 *
 * Dentro de España, 700 €. Desde Alemania, 1.500 €. Son números de Ana, no
 * medias de nada: hasta que haya presupuestos de verdad, es lo que ella espera
 * pagar.
 *
 * Están aquí y no dentro de una fórmula porque **son provisionales**. El día que
 * un corredor tenga tarifa, la tarifa manda y este número no se usa para ese
 * viaje. Y lo que salga de aquí va marcado como supuesto, no como precio: lo
 * segundo se puede prometer, lo primero no.
 */
export const POR_DEFECTO: { origen: string; destino: string; precio: number }[] = [
  { origen: 'ES', destino: 'ES', precio: 700 },
  { origen: 'DE', destino: 'ES', precio: 1500 },
];

export function transportePorDefecto(viaje: Viaje): number | null {
  const o = paisComparable(viaje.origenPais);
  const d = paisComparable(viaje.destinoPais);
  return POR_DEFECTO.find((x) => x.origen === o && x.destino === d)?.precio ?? null;
}

/**
 * Lo que costaría este viaje, y con quién.
 *
 * Gana la tarifa más concreta; a igual concreción, la más barata. No se mezcla
 * la de un proveedor con la de otro: lo que sale es una oferta real de alguien,
 * no un promedio que nadie ha ofrecido nunca.
 *
 * Devuelve todas las que sirven, ordenadas, para poder enseñar «Trans-Frío 780,
 * Becker 950» en vez de un número sin dueño.
 */
export function loQueCuestaTraerlo(tarifas: Tarifa[], viaje: Viaje): Estimacion[] {
  const coches = Math.max(1, Math.floor(Number(viaje.coches) || 1));
  const valen: Estimacion[] = [];

  for (const t of tarifas) {
    if (!sirvePara(t, viaje)) continue;
    const precio = precioPorCoche(t, coches);
    if (precio == null) continue;
    valen.push({ tarifa: t, precio, total: precio * coches, coches });
  }

  // Aquí todas llevan tarifa: el supuesto solo aparece en `laMejor`.
  return valen.sort((a, b) =>
    concrecion(b.tarifa as Tarifa) - concrecion(a.tarifa as Tarifa) || a.precio - b.precio
  );
}

/**
 * La mejor, y si no hay ninguna, lo que suponemos.
 *
 * Devolver null cuando no hay tarifa dejaba el coste a cero, que es la peor de
 * las respuestas: un coche que parece que se trae gratis. Con el supuesto al
 * menos hay un número, y va marcado como lo que es.
 */
export function laMejor(tarifas: Tarifa[], viaje: Viaje): Estimacion | null {
  const conTarifa = loQueCuestaTraerlo(tarifas, viaje)[0];
  if (conTarifa) return conTarifa;

  const supuesto = transportePorDefecto(viaje);
  if (supuesto == null) return null;
  const coches = Math.max(1, Math.floor(Number(viaje.coches) || 1));
  return { tarifa: null, precio: supuesto, total: supuesto * coches, coches, porDefecto: true };
}

/**
 * Cuánto se sale un presupuesto de lo que está acordado.
 *
 * No para impedirlo: un transporte puede costar más por mil razones legítimas,
 * y un urgente en agosto no es el precio de tarifa. Pero pagar un 40 % de más
 * sin enterarse es lo que pasa cuando nadie tiene delante lo acordado.
 */
export const MARGEN_AVISO = 0.15;

export function seSaleDeTarifa(coste: unknown, deTarifa: number | null): number | null {
  const c = Number(coste);
  if (!deTarifa || !Number.isFinite(c) || c <= 0) return null;
  const desvio = (c - deTarifa) / deTarifa;
  return Math.abs(desvio) >= MARGEN_AVISO ? desvio : null;
}

/** Una tarifa caducada no se aplica: es un precio que ya nadie sostiene. */
export function estaVigente(t: Tarifa, hoy: Date = new Date()): boolean {
  if (!t.vigente_hasta) return true;
  const d = new Date(t.vigente_hasta);
  if (Number.isNaN(d.getTime())) return true;
  const soloDia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return soloDia(d) >= soloDia(hoy);
}
