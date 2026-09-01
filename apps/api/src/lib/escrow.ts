/**
 * Cuándo se suelta el dinero de un cliente.
 *
 * El cliente deposita el coche entero y nuestro fee en una cuenta de depósito.
 * Ese dinero **no se mueve** hasta que alguien nuestro está físicamente delante
 * del coche en Alemania y confirma que es el que se anunció.
 *
 * Esa es la promesa entera del producto. Un particular que compra un coche en
 * Alemania por su cuenta transfiere veinte mil euros a un desconocido de otro
 * país y espera. Aquí no: el dinero está retenido, y lo suelta alguien que ha
 * visto el coche.
 *
 * **Esta regla vive solo aquí.** Liberar es una acción del ERP: PopCar nunca
 * mueve dinero, solo enseña cuánto y a dónde va cada parte. Tener la misma
 * regla en los dos sitios sería tener dos verdades, y esta semana ya nos ha
 * pasado dos veces —el precio del catálogo y el de la ficha— que la que mandaba
 * era la que nadie miraba.
 */

/**
 * Los estados por los que pasa el dinero. No hay más, y no se saltan.
 *
 * - `pendiente` — se le ha dicho cuánto, no ha transferido.
 * - `retenido`  — está en la cuenta de depósito. Nadie puede tocarlo.
 * - `liberado`  — se confirmó el coche y el vendedor ha cobrado.
 * - `devuelto`  — el coche no era lo que decía, o se echó atrás a tiempo.
 */
export const ESTADOS_DEPOSITO = ['pendiente', 'retenido', 'liberado', 'devuelto'] as const;
export type EstadoDeposito = (typeof ESTADOS_DEPOSITO)[number];

/**
 * Desde cada estado, a dónde se puede ir.
 *
 * `liberado` y `devuelto` son finales: el dinero ya se movió. Dejar cambiar el
 * estado después no lo trae de vuelta y esconde lo que pasó de verdad.
 */
export const TRANSICIONES: Record<EstadoDeposito, readonly EstadoDeposito[]> = {
  pendiente: ['retenido'],
  retenido: ['liberado', 'devuelto'],
  liberado: [],
  devuelto: [],
};

export type MotivoNoLiberar = 'sin_pagar' | 'sin_verificar' | 'ya_liberado' | 'ya_devuelto';

/** Lo que se le dice a quien intenta liberar y no puede. */
export const PORQUE_NO_SE_LIBERA: Record<MotivoNoLiberar, string> = {
  sin_pagar: 'El cliente todavía no ha depositado el dinero.',
  sin_verificar: 'Nadie ha confirmado el coche en Alemania. El dinero no se suelta antes de eso.',
  ya_liberado: 'Ya se liberó.',
  ya_devuelto: 'Este depósito se devolvió.',
};

/**
 * Si se puede soltar el dinero.
 *
 * Una sola condición además de que esté depositado: **que alguien nuestro haya
 * visto el coche**. No que el vendedor diga que está bien, no que hayan pasado
 * tres días, no que el cliente tenga prisa.
 *
 * Se devuelve el motivo cuando no se puede, porque hay que poder decirle a quien
 * lo intenta por qué no, en vez de dejarle un botón apagado sin explicación.
 */
export function sePuedeLiberar(datos: {
  estado?: string | null;
  verificadoEnAlemania?: boolean | null;
}): { puede: boolean; motivo: MotivoNoLiberar | null } {
  const estado = String(datos.estado ?? 'pendiente');
  if (estado !== 'retenido') {
    const motivo: MotivoNoLiberar =
      estado === 'liberado' ? 'ya_liberado'
      : estado === 'devuelto' ? 'ya_devuelto'
      : 'sin_pagar';
    return { puede: false, motivo };
  }
  if (!datos.verificadoEnAlemania) return { puede: false, motivo: 'sin_verificar' };
  return { puede: true, motivo: null };
}

/** Si una transición de estado del depósito es de las que existen. */
export function transicionValida(desde: string, hasta: string): boolean {
  const d = desde as EstadoDeposito;
  if (!(ESTADOS_DEPOSITO as readonly string[]).includes(d)) return false;
  if (!(ESTADOS_DEPOSITO as readonly string[]).includes(hasta)) return false;
  return (TRANSICIONES[d] as readonly string[]).includes(hasta);
}
