/**
 * Las reglas de un expediente de importación.
 *
 * Están aquí y no dentro de la pantalla porque son reglas, no pintura: qué
 * etapa va después de cuál, qué no se puede hacer todavía, y cuánto dinero de
 * clientes tenemos cobrado sin haber entregado el coche. Eso último es lo que
 * hay que poder mirar sin equivocarse.
 *
 * Las etapas son las mismas que el cliente ve marcarse en su panel y las mismas
 * que acepta la API. Si alguna vez dejan de serlo, se rompe por los dos lados a
 * la vez, que es lo que se quiere.
 */

export const ETAPAS = [
  'Pendiente',
  'Contactado',
  'Depósito retenido',
  'Verificado y pagado',
  'En transporte',
  'En trámites',
  'Entregado',
] as const;

export type Etapa = (typeof ETAPAS)[number];

/**
 * Qué hay que hacer con un expediente que está en esta etapa.
 *
 * El paso que sostiene todo lo demás es el tercero: con el dinero ya en la
 * cuenta de depósito, alguien nuestro tiene que ir a ver el coche. Hasta que no
 * lo ha visto, no se suelta un euro.
 */
export const QUE_TOCA: Record<Etapa, string> = {
  'Pendiente':           'Llamar y explicarle el proceso',
  'Contactado':          'Esperando su transferencia a la cuenta de depósito',
  'Depósito retenido':   'Ir a ver el coche en Alemania',
  'Verificado y pagado': 'Confirmar fecha y organizar el transporte',
  'En transporte':       'El coche viene de camino',
  'En trámites':         'Impuesto, ITV de homologación y matrícula',
  'Entregado':           'Cerrado',
};

export interface MetaImportacion {
  name?: string;
  phone?: string;
  when?: string;
  vehicle_url?: string;
  erp_notes?: string;
  appointment_date?: string | null;
  appointment_time?: string | null;
  appointment_address?: string | null;
  appointment_contact?: string | null;
  deposit_quoted?: string | number | null;
  deposit_paid_at?: string | null;
  // El depósito, partido por destino: el coche es del vendedor alemán, el fee
  // nuestro y la garantía de su proveedor.
  escrow_coche?: number | string | null;
  escrow_fee?: number | string | null;
  escrow_garantia?: number | string | null;
  // El impuesto va a cuenta: se cobró estimado y se liquida al matricular.
  escrow_impuesto?: number | string | null;
  // Lo que costó de verdad, del trámite de la gestoría.
  impuesto_real?: number | string | null;
  liquidacion_at?: string | null;
  escrow_estado?: string | null;
  escrow_liberado_at?: string | null;
  // Cuándo se le pidió al vendedor la factura del coche, y a qué correo.
  factura_vendedor_pedida_at?: string | null;
  factura_vendedor_pedida_a?: string | null;
  // Cuándo alguien nuestro vio el coche. Sin esto no se libera nada.
  verificado_alemania_at?: string | null;
  delivery_estimate?: string | null;
  deposit_refunded_at?: string | null;
}

export interface Expediente {
  id: string;
  user_email: string;
  title: string;
  status: string;
  created_at: string;
  meta?: MetaImportacion | null;
}

export function esEtapa(status: string): status is Etapa {
  return (ETAPAS as readonly string[]).includes(status);
}

/** La etapa que viene después. Null si ya está entregado o fuera del camino. */
export function siguienteEtapa(status: string): Etapa | null {
  const i = (ETAPAS as readonly string[]).indexOf(status);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

/**
 * Si su dinero está en la cuenta de depósito.
 *
 * Se sigue llamando así porque el nombre está por toda la pantalla y por la
 * API, pero ya no es una fianza: es el coche entero y nuestro fee, retenidos.
 */
export function fianzaPagada(x: Expediente): boolean {
  return Boolean(x.meta?.deposit_paid_at);
}

/** Si alguien nuestro ya ha visto el coche en Alemania. */
export function verificadoEnAlemania(x: Expediente): boolean {
  return Boolean(x.meta?.verificado_alemania_at);
}

/** Si el dinero ya salió hacia el vendedor. */
export function depositoLiberado(x: Expediente): boolean {
  return Boolean(x.meta?.escrow_liberado_at);
}

/**
 * Si ya se le ha pedido al vendedor la factura del coche.
 *
 * Sin ese papel, los 16.890 € del coche no son un suplido sino ingreso
 * nuestro, con su IVA encima. Se enseña pedida o sin pedir para que no se
 * quede en el aire, que es donde se quedan las cosas que no tienen casilla.
 */
export function facturaDelVendedorPedida(x: Expediente): boolean {
  return Boolean(x.meta?.factura_vendedor_pedida_at);
}

/**
 * Si se puede soltar el dinero.
 *
 * Esto es solo para pintar el botón. **La decisión la toma el servidor**, que
 * mira lo que hay guardado: aquí se mira lo que se ha cargado en la pantalla, y
 * entre una cosa y la otra caben unos minutos y otra persona.
 */
export function puedeLiberar(x: Expediente): boolean {
  return fianzaPagada(x) && verificadoEnAlemania(x) && !depositoLiberado(x);
}

/**
 * Sin el depósito no se va a ver el coche.
 *
 * Es la regla que sostiene todo lo demás. Antes decía que sin fianza no se
 * pedía el coche, porque lo comprábamos nosotros; ahora el coche lo compra el
 * cliente y lo que hay que hacer con el dinero dentro es ir a verlo.
 */
export function puedePedirlo(x: Expediente): boolean {
  return fianzaPagada(x);
}

/** Lo que hay depositado, partido por a quién le toca cada parte. */
export function repartoDelDeposito(x: Expediente): { concepto: string; importe: number; a: string }[] {
  const n = (v: unknown) => Number(v) || 0;
  return [
    { concepto: 'Coche', importe: n(x.meta?.escrow_coche), a: 'vendedor alemán' },
    { concepto: 'Servicio PopCar', importe: n(x.meta?.escrow_fee), a: 'nosotros' },
    { concepto: 'Impuesto (a cuenta)', importe: n(x.meta?.escrow_impuesto), a: 'Hacienda' },
    { concepto: 'Garantía', importe: n(x.meta?.escrow_garantia), a: 'proveedor' },
  ].filter((l) => l.importe > 0);
}

/**
 * La liquidación del impuesto, cuando ya se sabe cuánto ha salido.
 *
 * El cliente pagó una provisión, porque el impuesto se estima: hoy no tenemos
 * el CO₂ de ningún coche. Al matricular, la gestoría escribe el coste real en
 * su trámite, y la diferencia es del cliente en los dos sentidos.
 *
 * **Devuelve null mientras no haya coste en el trámite.** Un bloque que dice
 * «pendiente» durante seis semanas es ruido, y el importe real no depende de
 * nosotros: llega cuando llega.
 */
export function liquidacionDelImpuesto(x: Expediente): {
  provision: number; real: number; diferencia: number;
  quien: 'cobrar' | 'devolver' | 'cuadra'; hecha: boolean;
} | null {
  const real = x.meta?.impuesto_real;
  if (real == null || real === "") return null;
  const provision = Math.round(Number(x.meta?.escrow_impuesto) || 0);
  const cierto = Math.round(Number(real) || 0);
  const diferencia = cierto - provision;
  return {
    provision,
    real: cierto,
    diferencia,
    quien: diferencia > 0 ? 'cobrar' : diferencia < 0 ? 'devolver' : 'cuadra',
    hecha: Boolean(x.meta?.liquidacion_at),
  };
}

/**
 * Si se puede dar el coche por entregado.
 *
 * No con una liquidación pendiente. Si el impuesto salió más caro y el coche
 * se entrega sin cobrar la diferencia, ese dinero no se recupera: el cliente ya
 * tiene su coche y la conversación es mucho más difícil.
 *
 * Cuando cuadra o hay que devolverle, tampoco: devolverle lo suyo antes de
 * entregar es lo mínimo, y si se deja para después no se hace.
 */
export function faltaLiquidarElImpuesto(x: Expediente): boolean {
  const l = liquidacionDelImpuesto(x);
  return l != null && !l.hecha;
}

/**
 * La fecha de entrega no existe hasta que hay pedido.
 *
 * La da el vendedor al aceptarlo. Antes de eso cualquier fecha es inventada, y
 * una fecha inventada que el cliente ve en su panel es una promesa.
 */
export function puedeDarFecha(status: string): boolean {
  const i = (ETAPAS as readonly string[]).indexOf(status);
  return i >= (ETAPAS as readonly string[]).indexOf('Verificado y pagado');
}

/** Cuántos días lleva abierto. Un expediente quieto es el problema. */
export function diasDesde(v?: string | null, ahora: Date = new Date()): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
}

export function agrupaPorEtapa(expedientes: Expediente[]): Map<Etapa, Expediente[]> {
  const mapa = new Map<Etapa, Expediente[]>(ETAPAS.map((e) => [e, [] as Expediente[]]));
  for (const x of expedientes) if (esEtapa(x.status)) mapa.get(x.status)!.push(x);
  return mapa;
}

/** Lo que está fuera del camino: descartado, cancelado, lo que sea. */
export function fueraDelCamino(expedientes: Expediente[]): Expediente[] {
  return expedientes.filter((x) => !esEtapa(x.status));
}

export interface Resumen {
  enMarcha: number;
  sinFianza: number;
  /** Dinero de clientes cobrado y todavía sin entregar el coche. */
  comprometido: number;
  entregados: number;
}

export function resumen(expedientes: Expediente[]): Resumen {
  const enMarcha = expedientes.filter((x) => esEtapa(x.status) && x.status !== 'Entregado');
  return {
    enMarcha: enMarcha.length,
    sinFianza: enMarcha.filter((x) => !fianzaPagada(x)).length,
    // Una fianza devuelta ya no la tenemos: contarla sería decir que debemos
    // más de lo que debemos.
    comprometido: enMarcha
      .filter((x) => fianzaPagada(x) && !x.meta?.deposit_refunded_at)
      .reduce((suma, x) => suma + Number(x.meta?.deposit_quoted || 0), 0),
    entregados: expedientes.filter((x) => x.status === 'Entregado').length,
  };
}

/**
 * La nota que deja un cambio de etapa.
 *
 * Cambiar de etapa sin decir por qué deja un expediente que avanza solo: el
 * historial guarda que alguien lo movió, pero no lo que pasó. Y lo que pasó es
 * justo lo que necesita el siguiente que coja el teléfono —«le he llamado, se
 * lo piensa», «no contesta desde el martes»—, porque el estado a secas no lo
 * dice.
 *
 * Se escribe encabezada con el salto y la fecha, y se **añade** a lo que ya
 * hubiera: las notas de un expediente son un cuaderno, no un campo que se pisa.
 */
export function notaDelCambio(
  notasActuales: string,
  desde: string,
  hasta: string,
  texto: string,
  cuando: Date = new Date()
): string {
  const limpio = texto.trim();
  if (!limpio) return notasActuales;
  const dia = cuando.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const entrada = `[${dia} · ${desde} → ${hasta}] ${limpio}`;
  const previas = (notasActuales || '').trim();
  return previas ? `${previas}\n${entrada}` : entrada;
}

/**
 * Lo que se escribió esta vez en las notas.
 *
 * El rastro guarda el antes y el después enteros, y las notas se van sumando:
 * enseñar el después en cada apunte sería repetir el cuaderno entero una vez
 * por línea, y cuanto más largo, peor. Lo que interesa de un apunte es lo que
 * se añadió ese día.
 *
 * Si el texto no crece sino que cambia —alguien corrigió lo que había—, eso ya
 * no es «lo añadido»: entonces se enseña como quedó, que es lo único cierto.
 */
export function loQueSeEscribio(antes: string | null, despues: string | null): string {
  const viejo = (antes ?? '').trim();
  const nuevo = (despues ?? '').trim();
  if (!nuevo) return '';
  if (viejo && nuevo.startsWith(viejo)) return nuevo.slice(viejo.length).trim();
  return nuevo;
}
