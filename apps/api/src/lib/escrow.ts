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

export type MotivoNoLiberar = 'sin_pagar' | 'sin_verificar' | 'ya_liberado' | 'ya_devuelto'
  | 'sin_datos_del_vendedor';

/** Lo que se le dice a quien intenta liberar y no puede. */
export const PORQUE_NO_SE_LIBERA: Record<MotivoNoLiberar, string> = {
  sin_pagar: 'El cliente todavía no ha depositado el dinero.',
  sin_verificar: 'Nadie ha confirmado el coche en Alemania. El dinero no se suelta antes de eso.',
  ya_liberado: 'Ya se liberó.',
  ya_devuelto: 'Este depósito se devolvió.',
  sin_datos_del_vendedor: 'Faltan datos del vendedor en Proveedores.',
};

/**
 * Lo que hace falta saber del vendedor antes de mandarle el dinero.
 *
 * Tres cosas, y cada una por un motivo distinto:
 *
 * - **IBAN.** Es a dónde va la transferencia. Sin esto no hay pago posible, y
 *   es el dato que más caro sale equivocado.
 * - **NIF.** Va en la factura del coche y es lo que permite comprobar que la
 *   sociedad existe antes de mandarle diecisiete mil euros.
 * - **Correo.** Es a quien se le pide esa factura, **a nombre del cliente**.
 *   Sin ella los 16.890 € no son un suplido: son ingreso nuestro con su IVA
 *   encima, unos 3.500 € sobre dinero que no es nuestro.
 *
 * El teléfono y la dirección se quedan fuera a propósito: se agradecen, pero
 * bloquear un pago por no tener un teléfono sería bloquearlo por nada.
 */
export const DATOS_DEL_VENDEDOR = [
  { campo: 'iban', nombre: 'el IBAN' },
  { campo: 'nif', nombre: 'el NIF' },
  { campo: 'email', nombre: 'el correo' },
] as const;

/** Cuáles de esos faltan, con su nombre, para poder decirlo. */
export function faltanDatosDelVendedor(
  vendedor: Record<string, unknown> | null | undefined
): string[] {
  if (!vendedor) return DATOS_DEL_VENDEDOR.map((d) => d.nombre);
  return DATOS_DEL_VENDEDOR
    .filter((d) => String(vendedor[d.campo] ?? '').trim() === '')
    .map((d) => d.nombre);
}

/** «el IBAN y el correo», «el IBAN, el NIF y el correo». */
export function escritoEnLista(trozos: string[]): string {
  if (!trozos.length) return '';
  if (trozos.length === 1) return trozos[0];
  return trozos.slice(0, -1).join(', ') + ' y ' + trozos[trozos.length - 1];
}

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
  vendedor?: Record<string, unknown> | null;
}): { puede: boolean; motivo: MotivoNoLiberar | null; faltan?: string[] } {
  const estado = String(datos.estado ?? 'pendiente');
  if (estado !== 'retenido') {
    const motivo: MotivoNoLiberar =
      estado === 'liberado' ? 'ya_liberado'
      : estado === 'devuelto' ? 'ya_devuelto'
      : 'sin_pagar';
    return { puede: false, motivo };
  }
  if (!datos.verificadoEnAlemania) return { puede: false, motivo: 'sin_verificar' };
  /**
   * Y saber a quién se le manda.
   *
   * Va aquí y no al confirmar el pedido porque **este es el momento en que sale
   * el dinero**. Confirmar es decir que el vendedor acepta; soltar es
   * transferirle diecisiete mil euros de un cliente.
   *
   * Solo se comprueba cuando se sabe de quién estamos hablando: un pedido a
   * mano puede no tener proveedor todavía, y esa comprobación la hace su
   * propia pantalla.
   */
  if (datos.vendedor !== undefined) {
    const faltan = faltanDatosDelVendedor(datos.vendedor);
    if (faltan.length) return { puede: false, motivo: 'sin_datos_del_vendedor', faltan };

  }
  return { puede: true, motivo: null };
}

/** Si una transición de estado del depósito es de las que existen. */
export function transicionValida(desde: string, hasta: string): boolean {
  const d = desde as EstadoDeposito;
  if (!(ESTADOS_DEPOSITO as readonly string[]).includes(d)) return false;
  if (!(ESTADOS_DEPOSITO as readonly string[]).includes(hasta)) return false;
  return (TRANSICIONES[d] as readonly string[]).includes(hasta);
}

/**
 * Lo que hay que liquidar cuando se sabe el impuesto de verdad.
 *
 * El cliente pagó una **provisión**: una estimación, porque hoy no tenemos el
 * CO₂ de ningún coche. Al matricular se sabe el importe real, y la diferencia
 * es suya en los dos sentidos.
 *
 * **El fee de PopCar no entra en esta cuenta y no puede entrar.** Si entrara,
 * un coche de más de 160 g/km —que paga el doble del tramo que estimamos— se
 * comería lo que ganamos por traerlo.
 *
 * El importe real no se teclea aquí: sale del trámite «Impuesto de
 * matriculación», donde la gestoría ya escribe lo que costó. Un dato en dos
 * sitios acaba diciendo dos cosas.
 */
export function liquidacionDelImpuesto(datos: {
  provision?: number | string | null;
  real?: number | string | null;
}): { provision: number; real: number; diferencia: number; quien: "cobrar" | "devolver" | "cuadra" } {
  const puesto = Math.round(Number(datos.provision) || 0);
  const cierto = Math.round(Number(datos.real) || 0);
  const diferencia = cierto - puesto;
  return {
    provision: puesto,
    real: cierto,
    diferencia,
    quien: diferencia > 0 ? 'cobrar' : diferencia < 0 ? 'devolver' : 'cuadra',
  };
}
