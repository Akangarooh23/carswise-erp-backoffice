/**
 * Cómo se acaba un encargo de venta, y qué se cobra.
 *
 * El encargo no caduca: se extiende hasta que pasa una de estas tres cosas. Y
 * hasta ahora no pasaba ninguna, porque no había forma de cerrarlo: las
 * columnas estaban y no las escribía nadie, así que un encargo abierto lo
 * seguía estando para siempre y los avisos del panel se iban llenando de
 * clientes de hace meses.
 *
 * Los tres finales y lo que se le factura en cada uno son lo único que hay aquí.
 * Es la parte que se discute con un cliente por teléfono, así que conviene que
 * esté escrita en un sitio y no repartida por la pantalla.
 */
import { FEE_DE_GESTION, laPenalizacion } from './encargo-de-venta.js';
import { laComision } from './comision-del-concesionario.js';
import { sePuedeCobrar } from './mandato-de-venta.js';

/**
 * Las tres formas de acabar.
 *
 *   · `vendido` — se vendió con nosotros. Es para lo que estábamos.
 *   · `se_fue`  — lo vende por su cuenta, o simplemente lo deja.
 *   · `retirado`— lo cerramos nosotros: el coche ya no existe, el cliente no
 *     contesta, se lo quedó un familiar. No se le cobra nada.
 */
export const MOTIVOS = ['vendido', 'se_fue', 'retirado'] as const;
export type Motivo = (typeof MOTIVOS)[number];

export function esUnMotivo(v: unknown): v is Motivo {
  return (MOTIVOS as readonly string[]).includes(String(v ?? '').trim());
}

/** Cómo se le llama a cada final cuando hay que enseñarlo. */
export const COMO_ACABO: Record<Motivo, string> = {
  vendido: 'Vendido con nosotros',
  se_fue: 'Se fue sin vender con nosotros',
  retirado: 'Lo retiramos nosotros',
};

export interface ElEncargo {
  firmado_at?: string | Date | null;
  acepto_el_precio?: boolean | null;
  /** Cómo nos consta que firmó el mandato. Sin esto no se le factura nada. */
  firma_como?: unknown;
}

/**
 * Qué se le factura al cerrar, con el IVA ya repartido.
 *
 * Devuelve `null` cuando no hay nada que cobrar, que no es lo mismo que cero:
 * quien lea esto tiene que poder distinguir «no se le factura» de «se le
 * factura una factura de 0 €», porque lo segundo no existe.
 *
 * Los importes llevan el **IVA incluido**. Al cliente se le dijo «299 €», y a
 * un particular se le dice el precio final: si luego la factura sumara 361,79 €
 * habríamos cobrado de más que lo prometido.
 */
export function loQueSeLeFactura(
  motivo: Motivo,
  encargo: ElEncargo,
  ahora: Date = new Date(),
): { total: number; base: number; cuota: number; iva: number; concepto: string } | null {
  if (motivo === 'retirado') return null;

  /*
   * Sin mandato firmado no se le factura nada, venda o no.
   *
   * Es la única regla de este flujo que va hacia el otro lado: en las demás,
   * ante la duda se cobra —perdonar sale de la puerta equivocada porque nadie
   * se entera—. Pero en las demás la duda es sobre *cuánto*, y aquí es sobre
   * **si hay trato**. Antes bastaba con que alguien pulsara «Abrir encargo»
   * para que el ERP se escribiera una fecha de firma a sí mismo y esa fecha
   * sostuviera una factura de 299 €.
   */
  if (!sePuedeCobrar(encargo)) return null;

  if (motivo === 'vendido') {
    const c = laComision(FEE_DE_GESTION);
    return { ...c, concepto: 'Gestión integral de la venta del vehículo' };
  }

  /*
   * Se va sin vender. Cuánto se le cobra depende de si firmó la cláusula del
   * precio y de cuándo se va: eso lo decide `laPenalizacion`, que es la misma
   * regla que se le enseña en su ficha, para que no le digamos una cosa en
   * pantalla y otra en la factura.
   */
  const penalizacion = laPenalizacion(encargo, ahora);
  if (penalizacion <= 0) return null;

  const c = laComision(penalizacion);
  return { ...c, concepto: 'Cancelación del encargo de venta' };
}

/**
 * Si ese cierre deja algo que cobrar.
 *
 * Sirve para que la pantalla sepa si enseñar el importe antes de pulsar. Un
 * cierre sin factura tiene que poder hacerse igual: la mayoría de los que se
 * van a los 40 días no deben nada.
 */
export function seLeCobra(motivo: Motivo, encargo: ElEncargo, ahora: Date = new Date()): boolean {
  return loQueSeLeFactura(motivo, encargo, ahora) !== null;
}

/**
 * La factura se ata al encargo, no al coche.
 *
 * Un mismo coche puede tener dos encargos con meses de diferencia —el señor
 * vuelve el año que viene— y cada uno con su factura. Atándola al coche, el
 * segundo no se podría emitir.
 */
export const TIPO_DE_FACTURA = 'gestion_venta';

/**
 * El tipo va como parámetro y no interpolado en la cadena.
 *
 * Interpolarlo funciona —la plantilla se resuelve al cargar el módulo— pero
 * deja una consulta que no se puede ejecutar tal cual: ni el comprobador del
 * panel ni una prueba contra la base pueden leerla, porque lo que hay escrito
 * es `${...}` y no un valor. Con un parámetro, la constante es la consulta.
 */
export const SQL_YA_EMITIDA = `
  SELECT id FROM moveadvisor_provider_invoices
   WHERE type = $1 AND contract_id = $2 LIMIT 1`;

/**
 * Y el encargo queda cerrado.
 *
 * Solo si estaba abierto, para que dos personas mirando la misma pantalla no
 * pisen el motivo ni la fecha de la otra.
 */
export const SQL_CIERRA = `
  UPDATE erp_encargos_venta
     SET cerrado_at = NOW(), motivo_cierre = $2, estado = $2, updated_at = NOW()
   WHERE id = $1 AND cerrado_at IS NULL
  RETURNING id`;
