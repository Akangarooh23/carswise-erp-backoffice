/**
 * Lo que ganamos cuando el comprador financia el coche con nosotros.
 *
 * ## Dónde se cortaba
 *
 * El comprador que llega del portal marca «me interesaría financiarlo», se le
 * llama antes de la visita (eso ya está, en `financiacion-del-comprador.ts`),
 * va, y se queda el coche. Ahí se acababa: la visita se cierra como vendida, al
 * particular se le factura su gestión, y **del comprador financiado no quedaba
 * nada**. Ni si llegó a financiar, ni con quién, ni lo que nos tenían que
 * pagar por ello.
 *
 * Es la misma forma que tenían el fee del concesionario y la comisión de la
 * garantía antes de arreglarlas: una línea de negocio que existe en la cabeza
 * de todos y en los libros de nadie. Y ésta es la que Juan dice que deja
 * margen —una hora al teléfono por operación—, así que es la peor de las tres
 * para no estar apuntada.
 *
 * ## Dos pasos, no uno
 *
 * Que compre el coche no es que financie. Entre las dos cosas hay una
 * aprobación que puede no llegar, y puede pagarlo de su bolsillo al final. Por
 * eso el resultado se **apunta**, no se deduce: `financiada`, `no_financiada` o
 * sin decidir todavía. Deducirlo de que compró sería facturarle a la entidad
 * operaciones que no existieron.
 *
 * ## El importe es provisional, como el del concesionario
 *
 * No hay nada firmado con ninguna entidad —falta saber incluso cuál—, así que
 * el fee es un número puesto a mano y editable al emitir. Vive aquí solo y con
 * su nombre: el día que haya acuerdo se cambia en un sitio.
 *
 * ## Lo que esto NO resuelve
 *
 * La plataforma de scoring sigue sin existir y cómo nos llega la aprobación
 * sigue dependiendo de Juan. Esto no la sustituye: es la contabilidad de lo que
 * pase, venga la aprobación por donde venga. Cuando llegue la integración, lo
 * que cambia es quién rellena el resultado, no que haya que apuntarlo.
 */
import { IVA_GENERAL } from './dinero.js';

/** Euros por operación financiada, **con el IVA dentro**. Provisional. */
export const FEE_POR_FINANCIACION = 150;

/** El tipo de factura, para no escribirlo suelto en cada consulta. */
export const TIPO_DE_FACTURA = 'financing_commission';

/**
 * Cómo puede acabar la financiación de un comprador que ya compró.
 *
 * `null` no es un estado: es que todavía no se sabe, y por eso sale en
 * Pendientes. Confundir «no lo sé» con «no financió» cerraría la línea sin
 * mirarla.
 */
export const RESULTADOS = ['financiada', 'no_financiada'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export function esUnResultado(v: unknown): v is Resultado {
  return (RESULTADOS as readonly string[]).includes(String(v ?? ''));
}

/** Igual que la del concesionario: el total es lo acordado y la base se divide. */
export interface Comision {
  /** Lo que se factura en total, que es lo acordado. */
  total: number;
  /** Lo que es ingreso nuestro. */
  base: number;
  /** Y lo que es de Hacienda. */
  cuota: number;
  /** El tipo, en tanto por ciento. */
  iva: number;
}

const dosDecimales = (n: number) => Math.round(n * 100) / 100;

export function laComision(total: number = FEE_POR_FINANCIACION): Comision {
  const base = dosDecimales(total / (1 + IVA_GENERAL / 100));
  /*
   * La cuota, restando y no multiplicando.
   *
   * Es el mismo cuidado que en la del concesionario: con dos redondeos
   * independientes la factura se separa un céntimo para ciertos importes, y el
   * guardián de `provider-billing` admite dos céntimos de holgura — así que no
   * saltaría y la factura estaría mal sin que nadie se enterara.
   */
  return { total: dosDecimales(total), base, cuota: dosDecimales(total - base), iva: IVA_GENERAL };
}

/**
 * Lo que se lee en la factura que se le manda a la entidad.
 *
 * Lleva el coche y lo que se financió cuando se sabe: una línea que solo dice
 * «comisión» no se puede comprobar contra nada dentro de seis meses, que es
 * justo cuando alguien la discute.
 */
export function elConcepto(coche: string | null, financiado?: number | null): string {
  const cual = (coche ?? '').trim() || 'un coche';
  const cuanto = financiado && financiado > 0
    ? ` · se financiaron ${financiado.toFixed(2)} €`
    : '';
  return `Comisión por operación de financiación · ${cual}${cuanto}`;
}

/**
 * Las columnas del seguimiento, que son del ERP.
 *
 * PopCar pregunta si le interesaría financiar y guarda el sí; lo que pase
 * después es trabajo de aquí, igual que el resultado de la visita. Nulables a
 * propósito: lo que ya escribe la otra aplicación sigue funcionando sin
 * enterarse de que estas columnas existen.
 */
export const ENSURE_COLUMNAS = `
  ALTER TABLE vehicle_visit_bookings
    ADD COLUMN IF NOT EXISTS financiacion_resultado TEXT,
    ADD COLUMN IF NOT EXISTS financiacion_entidad TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS financiacion_importe NUMERIC,
    ADD COLUMN IF NOT EXISTS financiacion_cerrada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS financiacion_cerrada_por TEXT NOT NULL DEFAULT ''`;

/**
 * Las que compraron, querían financiar y no se ha dicho en qué quedó.
 *
 * Solo las que **compraron**: a quien fue a verlo y no se lo quedó no hay
 * financiación que cerrarle. Y solo las que no tienen resultado — el que ya
 * dijo que no financió no vuelve a salir, que si no la lista no se vacía nunca
 * y se deja de mirar.
 */
export const SQL_SIN_CERRAR = `
  SELECT COUNT(*)::int AS n
    FROM vehicle_visit_bookings
   WHERE quiere_financiar = TRUE
     AND resultado = 'compro'
     AND financiacion_resultado IS NULL
     AND status <> 'cancelled'
     -- La de una venta en curso se decide en el encargo, antes de pagar, y
     -- tiene su propio aviso: aquí saldría dos veces. Con to_jsonb porque esas
     -- columnas las crea el encargo y pueden no existir todavía.
     AND NOT EXISTS (
       SELECT 1 FROM erp_encargos_venta ev
        WHERE to_jsonb(ev)->>'venta_booking_id' = vehicle_visit_bookings.id::text
          AND to_jsonb(ev)->>'venta_estado' = 'en_curso'
     )`;

/** Y cuáles son, para la lista. */
export const SQL_LAS_SIN_CERRAR = `
  SELECT id, offer_id, vehicle_title, buyer_name, buyer_email, buyer_phone,
         starts_at, resultado_at, financiacion_llamada_at
    FROM vehicle_visit_bookings
   WHERE quiere_financiar = TRUE
     AND resultado = 'compro'
     AND financiacion_resultado IS NULL
     AND status <> 'cancelled'
     -- La de una venta en curso se decide en el encargo, antes de pagar, y
     -- tiene su propio aviso: aquí saldría dos veces. Con to_jsonb porque esas
     -- columnas las crea el encargo y pueden no existir todavía.
     AND NOT EXISTS (
       SELECT 1 FROM erp_encargos_venta ev
        WHERE to_jsonb(ev)->>'venta_booking_id' = vehicle_visit_bookings.id::text
          AND to_jsonb(ev)->>'venta_estado' = 'en_curso'
     )
   ORDER BY resultado_at ASC`;

/**
 * Se apunta cómo acabó.
 *
 * Solo si no estaba apuntado: volver a pulsar no reescribe ni la fecha ni el
 * nombre. El rastro tiene que decir cuándo se cerró y quién lo cerró, no la
 * última vez que alguien tocó el botón.
 */
export const SQL_CIERRA = `
  UPDATE vehicle_visit_bookings
     SET financiacion_resultado = $2,
         financiacion_entidad = COALESCE($3, ''),
         financiacion_importe = $4,
         financiacion_cerrada_at = NOW(),
         financiacion_cerrada_por = $5
   WHERE id = $1 AND financiacion_resultado IS NULL
  RETURNING id`;

/**
 * Las financiadas a las que todavía no les hemos emitido la comisión.
 *
 * Se cruza con las facturas por el identificador de la reserva en
 * `contract_id`, que es lo mismo que hace la del concesionario y lo que impide
 * emitir dos veces la misma.
 */
export const SQL_SIN_FACTURAR = `
  SELECT COUNT(*)::int AS n
    FROM vehicle_visit_bookings b
   WHERE b.quiere_financiar = TRUE
     AND b.financiacion_resultado = 'financiada'
     AND NOT EXISTS (
       SELECT 1 FROM moveadvisor_provider_invoices i
        WHERE i.type = 'financing_commission' AND i.contract_id = b.id::text)`;

/**
 * Qué se le pregunta al cerrarla, dicho para quien va a rellenarlo.
 *
 * Sale en la pantalla. Sin guion, «entidad» se rellena unas veces con el banco
 * y otras con el comercial que lo llevó, y entonces no se puede agrupar por
 * entidad — que es la única pregunta que dice si el acuerdo con una vale la
 * pena.
 */
export const QUE_SE_PREGUNTA = [
  'Con qué entidad se firmó, con su nombre y siempre el mismo.',
  'Cuánto se financió, que es sobre lo que se calcula lo nuestro.',
  'Y si al final no financió, se marca igual: así deja de salir en Pendientes.',
];
