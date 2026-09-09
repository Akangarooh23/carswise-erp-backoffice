/**
 * Lo que pasa cuando se acaban los treinta días.
 *
 * Es la rama que cuesta dinero: uno de cada cinco encargos llega aquí sin
 * vender y sin cancelar, y en ese nos hemos gastado el anuncio y la revisión
 * mecánica sin cobrar nada.
 *
 * Pasan dos cosas, y las dos son a favor del cliente:
 *
 *  - **Se le escribe.** No para despedirse: para que sepa que su coche va a
 *    dejar de estar publicado y pueda decir que quiere seguir.
 *  - **Se retira de nuestro marketplace.** Publicar el coche de alguien con
 *    quien ya no tenemos mandato no es un descuido: es anunciar algo que no
 *    podemos vender.
 *
 * Lo que **no** hace: retirarlo de los portales de fuera. Eso lo pone una
 * persona a mano, y por eso el encargo vencido sigue saliendo en Pendientes
 * hasta que alguien lo cierra.
 *
 * Si se le cobra algo al que agota el plazo está sin decidir. Hoy no se cobra.
 */

/**
 * A quién le toca vencer hoy.
 *
 * Se piden los que **ya se pasaron y no se han avisado**, no los que vencen
 * hoy: si el cron no corrió un día —o el despliegue se cayó— los de ayer tienen
 * que salir mañana igual. Una tarea diaria que solo mira el día de hoy pierde
 * silenciosamente todo lo que pase mientras no corre.
 *
 * `avisado_at` es lo que impide escribirle dos veces al mismo. No la fecha:
 * comparar fechas obliga a acertar con la zona horaria, y aquí un fallo es un
 * correo repetido al cliente.
 */
export const SQL_LOS_QUE_VENCEN = `
  SELECT e.id, e.vehicle_id, e.cliente_email, e.cliente_nombre, e.vence_at,
         v.brand, v.model, v.plate
    FROM erp_encargos_venta e
    LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
   WHERE e.cerrado_at IS NULL
     AND e.avisado_at IS NULL
     AND e.vence_at IS NOT NULL
     AND e.vence_at < NOW()`;

/** Se marca antes de escribir, no después. Ver `porQueSeMarcaAntes`. */
export const SQL_MARCA_AVISADO = `
  UPDATE erp_encargos_venta
     SET avisado_at = NOW(), estado = 'vencido', updated_at = NOW()
   WHERE id = $1 AND avisado_at IS NULL
  RETURNING id`;

/**
 * Por qué se marca antes de mandar el correo.
 *
 * Si se marcara después, un fallo del proveedor de correo dejaría la fila sin
 * marcar y mañana lo intentaría otra vez, y pasado, y al otro. Al cliente le
 * llegarían cinco correos el día que el servicio se recuperase.
 *
 * Marcando antes, lo peor que pasa es que un cliente no reciba su aviso —y eso
 * se ve, porque su encargo sigue saliendo en Pendientes—. De los dos fallos
 * posibles se elige el que no molesta a nadie de fuera.
 */
export const porQueSeMarcaAntes =
  'un fallo del correo no puede convertirse en cinco correos al cliente';

/**
 * Y el coche fuera de nuestro escaparate.
 *
 * Solo el suyo: `idcar-<id>` es el anuncio que publicamos nosotros desde su
 * IDCar. Si el mismo coche estuviera en otra tabla por otro motivo, no es este
 * el sitio para tocarlo.
 */
export const SQL_RETIRA_EL_ANUNCIO = `
  UPDATE moveadvisor_marketplace_vo_offers
     SET is_active = FALSE, updated_at = NOW()
   WHERE id = $1 AND COALESCE(is_active, FALSE) = TRUE`;

export interface ElQueVence {
  cliente_email?: string | null;
  cliente_nombre?: string | null;
  brand?: string | null;
  model?: string | null;
  plate?: string | null;
}

/** Cómo se llama su coche, con lo que haya. */
export function elCoche(e: ElQueVence): string {
  const nombre = [e.brand, e.model].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
  const matricula = String(e.plate ?? '').trim();
  if (nombre && matricula) return `${nombre} (${matricula})`;
  return nombre || matricula || 'tu coche';
}

/**
 * El correo del día 30.
 *
 * No pide perdón ni se despide: dice qué ha pasado, qué va a pasar con su
 * anuncio y cómo seguir. Quien lo lee acaba de tener el coche un mes sin
 * venderlo, así que lo último que necesita es un texto animado.
 */
export function elCorreoDeVencimiento(e: ElQueVence): { subject: string; html: string } {
  const coche = elCoche(e);
  const nombre = String(e.cliente_nombre ?? '').trim();
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  return {
    subject: `Tu anuncio de ${coche} deja de estar publicado`,
    html: [
      `<p>${saludo}</p>`,
      `<p>Se han cumplido los treinta días del encargo de venta de <strong>${coche}</strong>,`,
      ` así que retiramos el anuncio de nuestro marketplace. No tienes que hacer nada`,
      ` y no hay ningún cargo.</p>`,
      `<p>Si quieres que sigamos con la venta, contéstanos a este correo y lo renovamos`,
      ` con lo que ya tienes hecho: el informe de estado, los papeles y las fotos siguen`,
      ` ahí y no hay que repetirlos.</p>`,
      `<p>Y si has vendido el coche por tu cuenta, dínoslo también y cerramos el expediente.</p>`,
    ].join(''),
  };
}
