/**
 * Qué falta para poder mandarle el precio, dicho con el formulario delante.
 *
 * El servidor dice lo que falta mirando **lo guardado**: «falta acordar el
 * precio de salida». Quien está en la pantalla ve otra cosa — el número escrito
 * en la casilla, ahí mismo—, y entonces esa frase se lee como un error del
 * programa y no como «te falta pulsar un botón».
 *
 * Pasó en la primera prueba: 17.900 escritos en el campo, «Guardar» sin pulsar,
 * y el bloque de abajo diciendo que faltaba acordar el precio con el precio a
 * dos centímetros. Lo siguiente fue venir a preguntar por qué no dejaba
 * mandarlo, que es exactamente lo que un mensaje tiene que evitar.
 *
 * Vive en el navegador porque el servidor no puede saberlo: lo escrito y sin
 * guardar solo existe en la pantalla.
 */

/** Los miles con punto, a mano: así se lee igual en cualquier máquina. */
function miles(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * La frase del servidor, o la de «te falta guardar» cuando eso es lo que pasa.
 *
 * Cadena vacía cuando no falta nada, igual que la del servidor: quien la use
 * puede tratarlas igual.
 */
export function loQueFaltaEnPantalla(
  falta: string,
  /** Lo que hay escrito en la casilla del precio. */
  escrito: unknown,
  /** Y lo que hay guardado en la base. */
  guardado: unknown,
): string {
  if (!falta) return '';

  const enLaCasilla = Number(String(escrito ?? '').trim());
  const enLaBase = Number(guardado ?? 0);
  const hayNumero = Number.isFinite(enLaCasilla) && enLaCasilla > 0;

  if (hayNumero && enLaCasilla !== enLaBase) {
    return `Has escrito ${miles(enLaCasilla)} € y todavía no está guardado. Dale a Guardar.`;
  }
  return falta;
}
