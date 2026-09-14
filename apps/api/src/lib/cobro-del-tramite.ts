/**
 * Lo que le cobramos al comprador por el papeleo, y si lo ha pagado.
 *
 * ## Dónde se cortaba
 *
 * El contrato que firman las dos partes dice, con estas palabras, que *«los
 * gastos e impuestos derivados del cambio de titularidad son por cuenta del
 * comprador»*. Nosotros abrimos la transferencia y la llevamos. Y el ERP
 * guardaba de todo eso **una sola cifra: `coste`**, que es lo que nos cobra a
 * nosotros la gestoría.
 *
 * Ni lo que le cobramos a él, ni si lo ha pagado. Así que la operación tenía un
 * gasto apuntado y el ingreso que lo compensa no existía en ningún sitio: en el
 * margen de ese coche la transferencia solo resta.
 *
 * Es el mismo patrón que el fee del concesionario, la comisión de la garantía y
 * la de financiación — una línea de negocio que existe en la cabeza de todos y
 * en los libros de nadie.
 *
 * ## El precio parte del coste, no de un número inventado
 *
 * Ya hay tarifas de gestoría en el ERP, con sus honorarios, sus tasas de la DGT
 * y la del colegio, y `costeDelTramite` sabe sumarlas —con el IVA solo sobre
 * los honorarios, que el dinero de la DGT no lo lleva—. Ese coste es el suelo:
 * lo que se propone cobrar. Por encima va lo que se decida, y se escribe al
 * cobrar.
 *
 * Lo que **no** se hace es poner una tarifa fija aquí: no hay ninguna acordada,
 * y un número puesto para rellenar el hueco acaba siendo el que se factura.
 *
 * ## No bloquea nada
 *
 * Que no conste pagado sale en Pendientes y ahí se queda. Bloquear el cierre
 * del encargo o la transferencia por un cobro sin apuntar dejaría el papeleo
 * parado por un descuido administrativo — y el papeleo tiene plazos con la DGT
 * que no esperan a nadie.
 */

/** Los trámites que se le cobran al comprador, no al vendedor. */
export const DEL_COMPRADOR = ['Transferencia de titularidad'] as const;

export function loPagaElComprador(tipo: unknown): boolean {
  return (DEL_COMPRADOR as readonly string[]).includes(String(tipo ?? '').trim());
}

/**
 * Las columnas del cobro.
 *
 * `precio` es lo que se le cobra a él; `coste` —que ya existía— lo que nos
 * cobra la gestoría. Son dos números distintos y por eso son dos columnas: con
 * una sola, el margen de la operación no se puede calcular sin preguntar.
 */
export const ENSURE_COLUMNAS = `
  ALTER TABLE erp_tramites
    ADD COLUMN IF NOT EXISTS precio NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS comprador_nombre TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS comprador_email TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cobrado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cobrado_por TEXT NOT NULL DEFAULT ''`;

/**
 * Los que se le cobran al comprador y no constan cobrados.
 *
 * Solo los que siguen vivos: un trámite anulado no se le cobra a nadie, y
 * dejarlo en la lista es pedir un cobro que no toca.
 */
export const SQL_SIN_COBRAR = `
  SELECT COUNT(*)::int AS n
    FROM erp_tramites
   WHERE tipo = 'Transferencia de titularidad'
     AND cobrado_at IS NULL
     AND estado <> 'Anulado'`;

/** Y cuáles son, para la lista. */
export const SQL_LOS_SIN_COBRAR = `
  SELECT id, tipo, estado, gestoria, vehiculo_titulo, matricula,
         comprador_nombre, comprador_email, precio, coste, created_at
    FROM erp_tramites
   WHERE tipo = 'Transferencia de titularidad'
     AND cobrado_at IS NULL
     AND estado <> 'Anulado'
   ORDER BY created_at ASC`;

/**
 * Se apunta lo que se le cobró y cuándo.
 *
 * Solo la primera vez, como en todo lo demás: el rastro tiene que decir cuándo
 * pagó, no la última vez que alguien pulsó el botón. Y el precio se guarda en la
 * misma operación — cobrar sin dejar escrito cuánto deja media respuesta.
 */
export const SQL_COBRA = `
  UPDATE erp_tramites
     SET precio = $2, cobrado_at = NOW(), cobrado_por = $3
   WHERE id = $1 AND cobrado_at IS NULL
  RETURNING id, precio`;

/**
 * Lo que se propone cobrarle: el coste del papeleo.
 *
 * Es un suelo, no una tarifa. Cobrar por debajo del coste es pagar por hacer el
 * trabajo, y ese es el error que un valor por defecto puede evitar; cuánto por
 * encima es una decisión de negocio que no está tomada.
 *
 * Sin tarifa de esa gestoría devuelve `null`, y entonces la pantalla pide el
 * importe en vez de proponer uno: proponer cero sería proponer regalarlo.
 */
export function loQueSeProponeCobrar(coste: unknown): number | null {
  const n = Number(coste);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Lo que deja la operación, para el margen del coche.
 *
 * Se calcula con los dos números y no se guarda: guardarlo sería un tercer
 * número que puede contradecir a los otros dos.
 */
export function loQueDeja(precio: unknown, coste: unknown): number | null {
  /*
   * `null` y `''` no son cero.
   *
   * `Number(null)` da 0, que es un número perfectamente finito: con la
   * comprobación ingenua, un coste que no conocemos se tomaba por «no costó
   * nada» y el margen salía siendo el precio entero. Un número bonito y falso
   * es peor que un hueco, porque el hueco se pregunta.
   */
  const cifra = (v: unknown): number | null => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const p = cifra(precio);
  const c = cifra(coste);
  if (p === null || c === null) return null;
  return Math.round((p - c) * 100) / 100;
}

/**
 * Qué se le dice a quien va a cobrar, en la pantalla.
 *
 * Sin esto, «precio» se rellena unas veces con lo que nos cuesta y otras con lo
 * que le cobramos, y entonces el margen de la operación no significa nada.
 */
export const QUE_SE_COBRA = [
  'Lo que le cobras a él, no lo que nos cuesta la gestoría: eso ya está en «coste».',
  'Con el IVA dentro, como todo lo que se le dice a un cliente.',
  'Y solo cuando el dinero está: esto no cobra nada, apunta que se cobró.',
];
