/**
 * A nombre de quién se pone el coche.
 *
 * Es distinto de quién lo vende. PopCar vende siempre —emite su factura y da su
 * garantía, y eso solo se sostiene siendo el vendedor— pero **no tiene por qué
 * ser el titular**. Y ahí está la diferencia entre pagar un cambio de nombre o
 * dos.
 *
 * | | A nombre del cliente | A nombre de PopCar |
 * |---|---|---|
 * | Coche de aquí | Una transferencia, al venderlo | Dos: al comprarlo y al venderlo |
 * | Importación | Se matricula ya a su nombre: ninguna | Se matricula a nuestro nombre, y una al vender |
 *
 * Un coche que se compra para stock no tiene cliente todavía, así que va a
 * nombre de PopCar por fuerza. Uno que se compra para alguien concreto no
 * necesita pasar por el medio.
 */

export const TITULARIDADES = ['cliente', 'popcar'] as const;
export type Titularidad = (typeof TITULARIDADES)[number];

export function esTitularidad(v: string): v is Titularidad {
  return (TITULARIDADES as readonly string[]).includes(v);
}

/**
 * La que le toca a un pedido si nadie dice otra cosa: **PopCar**.
 *
 * Aunque haya un cliente esperando. Lo normal del negocio es comprar el coche y
 * luego vendérselo: PopCar lo recibe, lo matricula si viene de fuera, lo deja a
 * punto y lo entrega con su factura y su garantía. Todo eso se hace sobre un
 * coche que es nuestro.
 *
 * A nombre del cliente es el caso raro —el coche va del vendedor directo a él y
 * nos ahorramos un cambio de nombre—, y por eso se elige a mano. Ponerlo por
 * defecto hacía lo contrario: daba por hecho lo excepcional.
 *
 * El precio de esto es el plazo de reventa, que empieza a correr al recibirlo.
 * No es un efecto secundario que se nos escape: el pedido lo enseña y avisa dos
 * meses antes.
 */
export function titularidadPorDefecto(_origen?: string, _clienteEmail?: string | null): Titularidad {
  return 'popcar';
}

/**
 * El plazo para revender sin que el impuesto de la compra se quede.
 *
 * Una empresa de compraventa que compra para revender no paga el impuesto de
 * transmisiones **si revende dentro de plazo**. Pasado el plazo, sí — y ese
 * dinero aparece de golpe, meses después, sobre un coche que ya no interesa a
 * nadie.
 *
 * Doce meses es lo habitual, pero el plazo lo confirma la gestoría: por eso se
 * guarda en cada pedido y no está escrito en el código.
 */
export const PLAZO_REVENTA_MESES = 12;

/** Solo hace falta vigilarlo si el coche está a nuestro nombre. */
export function vigilaElPlazo(titularidad: string): boolean {
  return titularidad === 'popcar';
}

export function revenderAntesDe(desde: Date, meses = PLAZO_REVENTA_MESES): string {
  const dia = desde.getUTCDate();
  const hasta = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0)).getUTCDate();
  hasta.setUTCDate(Math.min(dia, ultimo));
  return hasta.toISOString().slice(0, 10);
}

/** Cuántos días quedan. Negativo si ya se pasó. */
export function diasParaRevender(limite?: string | null, ahora: Date = new Date()): number | null {
  if (!limite) return null;
  const d = new Date(limite);
  if (Number.isNaN(d.getTime())) return null;
  // Por días enteros, no por horas.
  //
  // Un plazo se cuenta en días: el 30 de agosto a las nueve de la mañana quedan
  // cero días, no menos de uno. Restando horas, el mismo día salía negativo por
  // unas horas y el límite se daba por pasado antes de tiempo.
  const soloDia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.round((soloDia(d) - soloDia(ahora)) / 86_400_000);
}

/**
 * Si todavía se está dentro.
 *
 * **El último día cuenta.** Vender el mismo día del límite está en plazo: no se
 * pierde la exención por apurarlo. Solo se ha pasado cuando la fecha ya quedó
 * atrás.
 */
export function dentroDePlazo(limite?: string | null, ahora: Date = new Date()): boolean {
  const d = diasParaRevender(limite, ahora);
  return d == null || d >= 0;
}

/**
 * Cuándo hay que empezar a preocuparse.
 *
 * Dos meses antes: es lo que tarda en venderse un coche que no se está
 * moviendo, y da margen para bajarlo de precio en vez de descubrirlo tarde.
 */
export function apremia(limite?: string | null, ahora: Date = new Date()): boolean {
  const d = diasParaRevender(limite, ahora);
  return d != null && d <= 60;
}
