/**
 * El comprador que dice que le interesaría financiarlo.
 *
 * Lo contesta al pedir la visita, en una casilla. Hasta hace poco ese dato se
 * guardaba y se tiraba; ahora llega a la Agenda y se ve. Pero verlo no es
 * atenderlo: **nadie llamaba**, porque nada lo pedía.
 *
 * ## Por qué esto existe antes que la integración
 *
 * Lo que falta para hacerlo de verdad no depende de nosotros: qué entidades, y
 * sobre todo **cómo nos llega el resultado de la aprobación**. Mientras eso no
 * esté, el botón que llevará al scoring no lleva a ningún sitio.
 *
 * Un botón que no lleva a ningún sitio se quita y ya está. Lo que no se puede
 * es que el hueco quede vacío: ese comprador ha levantado la mano, es la
 * operación que deja margen —una hora al teléfono, dijo Juan— y sin nada que lo
 * recuerde se pierde entre las visitas. Así que donde irá la integración hay,
 * de momento, **una llamada**.
 *
 * Cuando llegue la plataforma, esto no se tira: el aviso sigue valiendo —seguirá
 * habiendo que llamar— y lo que cambia es que el botón, además, abra el scoring.
 *
 * ## Antes de la visita, no después
 *
 * Se llama antes de que vaya a ver el coche. Quien llega sabiendo lo que puede
 * pagar negocia distinto, y descubrirlo en el parking es descubrirlo tarde: el
 * vendedor es un particular y no tiene nada que ofrecerle.
 */

/**
 * Cuáles hay que llamar.
 *
 * Las canceladas no: esa visita ya no va a pasar y llamarle para ofrecerle
 * financiación de un coche que no va a ver es la clase de llamada que hace que
 * te cuelguen.
 *
 * Y las que ya se llamaron tampoco, evidentemente — pero eso se apunta, no se
 * deduce: sin una marca, la única forma de saber si alguien llamó es preguntar
 * en la oficina.
 */
export const SQL_SIN_LLAMAR = `
  SELECT COUNT(*)::int AS n
    FROM vehicle_visit_bookings
   WHERE quiere_financiar = TRUE
     AND financiacion_llamada_at IS NULL
     AND status <> 'cancelled'`;

/** Y quiénes son, para la lista. */
export const SQL_LOS_SIN_LLAMAR = `
  SELECT id, offer_id, vehicle_title, buyer_name, buyer_email, buyer_phone,
         starts_at, status, created_at
    FROM vehicle_visit_bookings
   WHERE quiere_financiar = TRUE
     AND financiacion_llamada_at IS NULL
     AND status <> 'cancelled'
   ORDER BY starts_at ASC`;

/**
 * Se apunta que se le ha llamado.
 *
 * Solo si no estaba apuntado ya: volver a pulsar no reescribe la fecha ni el
 * nombre. Si no, el rastro diría la última vez que alguien tocó el botón y no
 * la vez que se le llamó, que es lo que hace falta saber cuando el comprador
 * dice que nadie le ha contado nada.
 */
export const SQL_MARCA_LLAMADA = `
  UPDATE vehicle_visit_bookings
     SET financiacion_llamada_at = NOW(), financiacion_llamada_por = $2
   WHERE id = $1 AND financiacion_llamada_at IS NULL
  RETURNING id`;

/**
 * Las columnas, que son del ERP y no de PopCar.
 *
 * PopCar pregunta y guarda la respuesta; atenderla es trabajo de aquí, igual
 * que el resultado de la visita. Por eso se añaden desde el ERP y son nulables:
 * lo que ya escribe la otra aplicación sigue funcionando sin enterarse.
 */
export const ENSURE_COLUMNAS = `
  ALTER TABLE vehicle_visit_bookings
    ADD COLUMN IF NOT EXISTS financiacion_llamada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS financiacion_llamada_por TEXT NOT NULL DEFAULT ''`;

/**
 * Qué hacer con él, dicho para quien va a marcar.
 *
 * Sale en la pantalla, al lado del botón. Es lo que hoy sustituye a la
 * integración: sin guion, cada uno cuenta una cosa y la mitad no menciona que
 * el coche lo vende un particular — que es justo lo que cambia la conversación.
 */
export const QUE_SE_LE_DICE = [
  'Que el coche lo vende un particular y la financiación la damos nosotros.',
  'Cuánto quiere financiar y en cuántos meses, para saber si sale.',
  'Que le llamamos con la respuesta antes de la visita, no después.',
];

/**
 * Y lo que todavía no se puede hacer.
 *
 * Se dice en la pantalla, en vez de dejar un botón apagado o —peor— uno que
 * abre una página en blanco. Quien lo lee sabe por qué no está y qué falta.
 */
export const LO_QUE_FALTA =
  'El scoring todavía no está: falta la plataforma y cómo nos llega la '
  + 'respuesta. Hasta entonces, la aprobación se pide por los canales de siempre '
  + 'y se apunta aquí que ya se le ha llamado.';
