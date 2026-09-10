/**
 * Las facturas que hemos emitido y no le han llegado a quien se le cobran.
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
 *
 * ## Y solo las que se pueden mandar
 *
 * Quién recibe cada una lo decide `a-quien-se-le-manda.ts`, y no siempre es el
 * cliente: la comisión del concesionario va al concesionario, y `customer_email`
 * ahí guarda al comprador como dato.
 *
 * Esa misma regla está aquí repetida en SQL y con los tipos escritos a mano,
 * tres veces. No es un descuido: el comprobador del panel **lee estas consultas
 * del fichero y las ejecuta tal cual**, así que una armada con `${...}` saldría
 * rota siempre y dejaría de comprobarse. Que las tres copias digan lo mismo que
 * `AL_CLIENTE` lo vigila una prueba, que es lo que sustituye a la constante.
 *
 * Una a la que no se le sabe la dirección no se cuenta: no se puede mandar, así
 * que ponerla en una lista de «pendientes de enviar» sería pedir algo que nadie
 * puede hacer desde ahí, y una lista con filas imposibles se deja de mirar. Lo
 * que falta —el correo del proveedor en su ficha, o el del cliente— es otro
 * problema y otra pantalla.
 */

/** Cuántas hay sin enviar. */
export const SQL_SIN_ENVIAR = `
  SELECT COUNT(*)::int AS n
    FROM moveadvisor_provider_invoices i
    LEFT JOIN erp_proveedores p ON p.id = i.proveedor_id
   WHERE i.direction = 'emitted'
     AND i.cw_sent_at IS NULL
     AND COALESCE(
           CASE WHEN COALESCE(i.provider_name, '') = ''
                  OR i.type IN ('gestion_venta', 'vehicle_sale')
                THEN i.customer_email
                ELSE p.email
           END, '') <> ''`;

/**
 * Y cuáles son, para la lista.
 *
 * Se piden con la dirección delante: la pregunta al abrir esto no es «cuántas
 * hay» sino «a quién no le ha llegado la suya».
 */
export const SQL_LAS_SIN_ENVIAR = `
  SELECT i.id, i.invoice_number, i.type, i.provider_name,
         i.customer_name, i.customer_email, p.email AS proveedor_email,
         CASE WHEN COALESCE(i.provider_name, '') = ''
                OR i.type IN ('gestion_venta', 'vehicle_sale')
              THEN i.customer_email
              ELSE p.email
         END AS a_quien,
         i.vehicle_title, i.invoice_amount, i.contract_id, i.issued_at, i.created_at
    FROM moveadvisor_provider_invoices i
    LEFT JOIN erp_proveedores p ON p.id = i.proveedor_id
   WHERE i.direction = 'emitted'
     AND i.cw_sent_at IS NULL
     AND COALESCE(
           CASE WHEN COALESCE(i.provider_name, '') = ''
                  OR i.type IN ('gestion_venta', 'vehicle_sale')
                THEN i.customer_email
                ELSE p.email
           END, '') <> ''
   ORDER BY i.created_at ASC`;

export { sePuedeEnviar } from './a-quien-se-le-manda.js';
