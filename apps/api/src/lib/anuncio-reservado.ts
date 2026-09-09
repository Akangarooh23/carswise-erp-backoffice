/**
 * Un coche de importación que ya es de un cliente deja de ofrecerse.
 *
 * El escaparate de importación son anuncios de AutoScout24 que no son nuestros:
 * los rastreamos y enseñamos los que salen a cuenta. Cuando un cliente encarga
 * uno y se lo pagamos al vendedor alemán, ese anuncio **sigue publicado** y otro
 * cliente puede encargar exactamente el mismo coche.
 *
 * Pasó con el Kia Sorento: entregado el 1 de septiembre y seguía en el
 * escaparate una semana después.
 *
 * ## Por qué `import_locked` y no los otros dos
 *
 * La tabla tiene tres banderas y solo una sirve:
 *
 *   · `is_active` dice si el anuncio **sigue vivo en AutoScout24**. Lo escribe
 *     el verificador, y lo vuelve a poner en `TRUE` si el anuncio sigue ahí —
 *     que lo estará, porque el alemán tarda en quitarlo—. Apagarlo aquí dura
 *     hasta la siguiente pasada.
 *   · `import_published` dice si **el ahorro es bueno**. Lo recalcula un script
 *     con los precios, y lo mismo: vuelve.
 *   · `import_locked` no lo escribe nadie. Es el único que puede querer decir
 *     «este ya es de un cliente nuestro», que es un hecho sobre nosotros y no
 *     sobre el anuncio ni sobre el mercado.
 *
 * Por eso la reserva va ahí: es la única de las tres que ninguna automatización
 * va a deshacer por su cuenta.
 */

/**
 * Desde qué etapa el coche ya no es de nadie más.
 *
 * En «Depósito retenido» todavía puede caerse: si el perito dice que no es el
 * coche que se anunció, se devuelve el depósito entero y ese anuncio vuelve a
 * estar libre. Reservarlo ahí obligaría a soltarlo después, y una reserva que
 * hay que acordarse de soltar acaba dejando coches escondidos para siempre.
 *
 * En «Verificado y pagado» ya se le ha transferido el dinero al vendedor
 * alemán. De ahí no se vuelve.
 */
export const DESDE_QUE_ES_SUYO = 'Verificado y pagado';

const DESPUES = ['Verificado y pagado', 'En transporte', 'En trámites', 'Entregado'];

export function yaEsDeUnCliente(estado: unknown): boolean {
  return DESPUES.includes(String(estado ?? '').trim());
}

/**
 * La consulta que lo retira.
 *
 * Solo toca la fila si no estaba ya reservada, para que volver a guardar un
 * expediente entregado no cuente como un cambio.
 */
export const SQL_RESERVA = `
  UPDATE moveadvisor_market_offers
     SET import_locked = TRUE, updated_at = NOW()
   WHERE id = $1 AND COALESCE(import_locked, FALSE) = FALSE`;
