/**
 * Las facturas que hemos emitido y no le han llegado al cliente.
 *
 * No es lo mismo que `facturas-esperadas.ts`: aquéllas son las que **nos** tienen
 * que llegar a nosotros de un proveedor. Éstas son al revés — las que salen de
 * aquí con nuestro membrete y que alguien tiene que recibir.
 *
 * ## Por qué hacía falta
 *
 * El correo de cierre del encargo le dice al cliente «te llega la factura por
 * separado». Y hoy eso solo pasa si alguien entra a Facturación y descarga el
 * PDF: el envío es un efecto secundario de esa descarga. Si nadie la abre, no
 * le llega nada — y nada lo delataba.
 *
 * Peor: la columna que marca el envío existía desde hacía tiempo, se pintaba en
 * la pantalla y **no la escribía nadie**. Salía vacía siempre, así que ni se
 * mandaba sola ni había forma de saber cuáles faltaban.
 *
 * ## Solo por `cw_sent_at`, y a propósito
 *
 * La tentación era descartar también las que ya tienen PDF generado —bajo el
 * argumento de que generarlo mandaba el correo—. Se midió antes de decidir: en
 * producción no hay ninguna factura emitida todavía, así que no hay avalancha
 * histórica que esconder.
 *
 * Y esa condición abriría un agujero hacia delante: una factura cuyo PDF se
 * generó pero cuyo correo falló tiene PDF y no tiene envío, que es **justo** el
 * caso que este aviso existe para cazar. Descartarla lo silenciaría.
 */

/** Cuántas hay sin enviar. */
export const SQL_SIN_ENVIAR = `
  SELECT COUNT(*)::int AS n
    FROM moveadvisor_provider_invoices
   WHERE direction = 'emitted'
     AND cw_sent_at IS NULL
     AND COALESCE(customer_email, '') <> ''`;

/**
 * Y cuáles son, para la lista.
 *
 * Se piden con el correo delante: la pregunta al abrir esto no es «cuántas
 * hay» sino «a quién no le ha llegado la suya».
 */
export const SQL_LAS_SIN_ENVIAR = `
  SELECT id, invoice_number, type, customer_name, customer_email,
         vehicle_title, invoice_amount, contract_id, issued_at, created_at
    FROM moveadvisor_provider_invoices
   WHERE direction = 'emitted'
     AND cw_sent_at IS NULL
     AND COALESCE(customer_email, '') <> ''
   ORDER BY created_at ASC`;

/**
 * Una sin correo del cliente no se cuenta, y no es lo mismo que estar enviada.
 *
 * Se le emitió a alguien de quien no tenemos dirección: no se puede mandar, así
 * que ponerla en una lista de «pendientes de enviar» sería pedir algo que nadie
 * puede hacer desde ahí — y una lista con filas imposibles se deja de mirar.
 *
 * Lo que falta ahí es la ficha del cliente, y ése es otro problema y otra
 * pantalla.
 */
export function sePuedeEnviar(f: { customer_email?: unknown }): boolean {
  return String(f?.customer_email ?? '').trim() !== '';
}
