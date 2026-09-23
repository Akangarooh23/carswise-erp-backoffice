/**
 * La venta en curso: desde que el comprador dice «quiero comprarlo» hasta que el
 * coche cambia de dueño.
 *
 * ## El orden, y por qué
 *
 *   1. **Quiero comprarlo.** Lo dice el comprador desde el correo que le llega al
 *      acabar la visita, con su DNI y su domicilio. El anuncio se reserva.
 *   2. **La financiación, si la pide.** Va primero y bloquea todo lo demás: no
 *      se pide el ingreso ni se hace la gestoría de un coche que quizá no puede
 *      pagar. Si se deniega, o lo paga él o la venta se anula.
 *   3. **El ingreso** de los 17.900 € —del comprador, de la entidad o de los
 *      dos—, la gestoría y la liberación al vendedor: 299 € para nosotros y el
 *      resto para él. Eso es la fase siguiente y aquí solo se deja preparado.
 *
 * Aquí están las reglas, sin base de datos: en qué paso está una venta, qué se
 * puede hacer en cada uno y qué se le escribe a cada cual.
 */
import { plantilla, parrafo, datos, aviso, boton, esc } from './correo.js';

/** Lo que se añade a la tabla de encargos. Lo mismo lo crea PopCar al empezar una venta. */
export const ENSURE_COLUMNAS = `
  ALTER TABLE erp_encargos_venta
    ADD COLUMN IF NOT EXISTS venta_estado TEXT,
    ADD COLUMN IF NOT EXISTS venta_booking_id TEXT,
    ADD COLUMN IF NOT EXISTS venta_iniciada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS venta_anulada_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS venta_motivo_anulacion TEXT,
    ADD COLUMN IF NOT EXISTS comprador_email TEXT,
    ADD COLUMN IF NOT EXISTS comprador_telefono TEXT,
    ADD COLUMN IF NOT EXISTS venta_financia BOOLEAN,
    ADD COLUMN IF NOT EXISTS financiacion_estado TEXT,
    ADD COLUMN IF NOT EXISTS financiacion_entidad TEXT,
    ADD COLUMN IF NOT EXISTS financiacion_importe NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS financiacion_decidida_at TIMESTAMPTZ,
    /*
     * La fase del dinero.
     *
     * El importe entra en una cuenta de terceros del proveedor de pagos —no es
     * nuestro en ningún momento— y de ahí salen dos pagos: los 299 € nuestros y
     * el resto al vendedor. Cada momento se apunta con su fecha, no con un
     * booleano: «cuándo entró» es la pregunta que se hace cuando alguien llama
     * preguntando por su dinero, y un sí/no no la contesta.
     */
    ADD COLUMN IF NOT EXISTS ingreso_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ingreso_importe NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS ingreso_referencia TEXT,
    ADD COLUMN IF NOT EXISTS gestoria_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gestoria_hecha_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gestoria_tramite_id TEXT,
    ADD COLUMN IF NOT EXISTS liberado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS liberado_importe NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMPTZ`;

/**
 * Lo que nos quedamos de la venta.
 *
 * Son los mismos 299 € del encargo: no es una comisión nueva, es el fee de
 * gestión cobrado por otro camino. Vive en `encargo-de-venta.ts` y se importa
 * de allí para que no haya dos cifras que un día digan cosas distintas.
 */
export { FEE_DE_GESTION } from './encargo-de-venta.js';

export const EN_CURSO = 'en_curso';
export const ANULADA = 'anulada';

export type EstadoDeLaFinanciacion = 'en_estudio' | 'aprobada' | 'denegada' | 'sin_financiacion';

export interface LaVenta {
  venta_estado?: string | null;
  venta_financia?: boolean | null;
  financiacion_estado?: string | null;
  /** La fase del dinero. Cada una con su fecha: ver `ENSURE_COLUMNAS`. */
  ingreso_at?: string | Date | null;
  gestoria_at?: string | Date | null;
  gestoria_hecha_at?: string | Date | null;
  liberado_at?: string | Date | null;
  entregado_at?: string | Date | null;
  precio_venta?: number | string | null;
}

export type Paso =
  | 'financiacion_en_estudio'
  | 'financiacion_denegada'
  | 'esperando_ingreso'
  | 'toca_la_gestoria'
  | 'gestoria_en_curso'
  | 'toca_liberar'
  | 'toca_entregar'
  | 'entregado';

/**
 * En qué paso está. `null` si no hay venta en curso.
 *
 * «Esperando el ingreso» es a donde llega todo lo que no está parado por la
 * financiación: sin financiar, con la financiación aprobada, o denegada y el
 * comprador ha dicho que lo paga él.
 */
export function enQuePasoEsta(v: LaVenta | null | undefined): Paso | null {
  if (!v || v.venta_estado !== EN_CURSO) return null;
  if (v.financiacion_estado === 'en_estudio') return 'financiacion_en_estudio';
  if (v.financiacion_estado === 'denegada') return 'financiacion_denegada';

  /*
   * De aquí abajo, el orden lo marcan las fechas, y se leen **de atrás hacia
   * delante**.
   *
   * Preguntar «¿está entregado?» antes que «¿está liberado?» es lo que permite
   * que el paso no retroceda: una vez puesta una fecha, ya no se borra, así que
   * el paso solo puede avanzar. Al revés —mirando primero el ingreso— una venta
   * entregada seguiría diciendo que le toca la gestoría.
   */
  if (hay(v.entregado_at)) return 'entregado';
  if (hay(v.liberado_at)) return 'toca_entregar';
  if (hay(v.gestoria_hecha_at)) return 'toca_liberar';
  if (hay(v.gestoria_at)) return 'gestoria_en_curso';
  if (hay(v.ingreso_at)) return 'toca_la_gestoria';
  return 'esperando_ingreso';
}

/** Si esa fecha está puesta. Una cadena vacía no es una fecha. */
function hay(f: string | Date | null | undefined): boolean {
  return Boolean(f) && String(f).trim() !== '';
}

export const QUE_TOCA: Record<Paso, string> = {
  financiacion_en_estudio: 'Quiere financiar: hasta que la entidad conteste no se pide el ingreso ni se hace la gestoría',
  financiacion_denegada: 'Le han denegado la financiación: o lo paga él entero o se anula la venta',
  esperando_ingreso: 'Falta que entre el importe del coche',
  toca_la_gestoria: 'El dinero ya está retenido: toca mandar la gestoría del cambio de nombre',
  gestoria_en_curso: 'La gestoría está en marcha: falta que salga el cambio de nombre',
  toca_liberar: 'Cambio de nombre hecho: toca liberarle el dinero al vendedor',
  toca_entregar: 'El vendedor ya ha cobrado: falta que el comprador retire el coche',
  entregado: 'Coche entregado. Falta cerrar el encargo y emitir los 299 €',
};

/**
 * Por qué no se puede decidir la financiación.
 *
 * Solo se aprueba o deniega una que está en estudio: aprobar la de una venta
 * anulada, o volver a aprobar una ya aprobada con otra entidad, cambiaría a
 * quién se le factura la comisión sin que nadie lo vea.
 */
export function porQueNoSeDecideLaFinanciacion(
  v: LaVenta | null | undefined,
  resultado: string,
  entidad: string,
): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  if (v.financiacion_estado !== 'en_estudio') return 'La financiación de esta venta no está en estudio';
  if (resultado !== 'aprobada' && resultado !== 'denegada') return 'Di si se ha aprobado o denegado';
  if (resultado === 'aprobada' && !entidad.trim()) return 'Falta con qué entidad: sin ella no se le puede facturar la comisión';
  return '';
}

/** Tras una denegación, el comprador dice que lo paga él. */
export function porQueNoPagaEl(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  if (v.financiacion_estado !== 'denegada') return 'Solo cuando la financiación se ha denegado';
  return '';
}

export function porQueNoSeAnula(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  /*
   * Con el dinero dentro, anular no es pulsar un botón.
   *
   * Hay un importe retenido a nombre de la operación y, si la gestoría ya ha
   * salido, un cambio de nombre en marcha en Tráfico. Deshacer eso es una
   * devolución y una baja de trámite, no una fila que se tacha. Que no se pueda
   * desde aquí es lo correcto: lo contrario es dejar el dinero de un comprador
   * colgado sin que conste por qué.
   */
  if (hay(v.ingreso_at)) {
    return 'Ya hay dinero retenido de esta venta: hay que devolverlo antes de anularla';
  }
  return '';
}

/**
 * Los pasos del dinero, cada uno con lo que exige el anterior.
 *
 * Todos siguen la misma forma —devuelven el motivo por el que **no** se puede, o
 * cadena vacía— y todos miran dos cosas: que la venta siga viva y que el paso de
 * antes esté dado. Saltarse uno no es un atajo: es liberarle el dinero al
 * vendedor de un coche que sigue a nombre suyo, o mandar a Tráfico un cambio de
 * nombre de un dinero que no ha entrado.
 */
export function porQueNoSeApuntaElIngreso(
  v: LaVenta | null | undefined,
  importe: number,
): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  if (v.financiacion_estado === 'en_estudio') return 'La financiación todavía está en estudio: no se le pide el dinero hasta que conteste la entidad';
  if (v.financiacion_estado === 'denegada') return 'La financiación está denegada: o dice que lo paga él o se anula';
  if (hay(v.ingreso_at)) return 'El ingreso de esta venta ya está apuntado';
  if (!(importe > 0)) return 'Falta cuánto ha entrado';
  /*
   * Y que sea lo que vale el coche.
   *
   * Un ingreso de menos no es «va llegando»: significa que falta dinero y que
   * el vendedor cobraría de menos. Si de verdad entra a plazos, eso es otra
   * cosa y se decide antes, no se cuela por esta casilla.
   */
  const precio = Number(v.precio_venta ?? 0);
  if (precio > 0 && Math.abs(importe - precio) > 1) {
    return `Lo que ha entrado no cuadra con el precio del coche (${euros(precio)})`;
  }
  return '';
}

export function porQueNoSeMandaLaGestoria(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  // El orden del trato: primero el dinero retenido, luego el cambio de nombre.
  if (!hay(v.ingreso_at)) return 'Todavía no ha entrado el importe del coche';
  if (hay(v.gestoria_at)) return 'La gestoría de esta venta ya está mandada';
  return '';
}

export function porQueNoSeCierraLaGestoria(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  if (!hay(v.gestoria_at)) return 'La gestoría de esta venta todavía no se ha mandado';
  if (hay(v.gestoria_hecha_at)) return 'El cambio de nombre de esta venta ya está hecho';
  return '';
}

export function porQueNoSeLibera(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  /*
   * Esto es lo que protege al comprador.
   *
   * Mientras el coche siga a nombre del vendedor, el dinero se queda retenido.
   * Liberarlo antes sería quedarnos sin nada que sostenga la promesa que le
   * hicimos: paga tranquilo, que no sale de ahí hasta que el coche es tuyo.
   */
  if (!hay(v.gestoria_hecha_at)) return 'El cambio de nombre todavía no está hecho: el dinero no se suelta antes';
  if (hay(v.liberado_at)) return 'Al vendedor ya se le ha liberado el dinero de esta venta';
  return '';
}

export function porQueNoSeEntrega(v: LaVenta | null | undefined): string {
  if (!v || v.venta_estado !== EN_CURSO) return 'Este coche no tiene una venta en curso';
  if (!hay(v.liberado_at)) return 'El vendedor todavía no ha cobrado';
  if (hay(v.entregado_at)) return 'Este coche ya consta entregado';
  return '';
}

/**
 * Lo que se reparte del ingreso.
 *
 * Los 299 € son nuestros y el resto es del vendedor. Se calcula aquí y no en la
 * pantalla para que el número que se le enseña a quien libera el dinero y el
 * que se apunta sean el mismo.
 */
export function comoSeReparte(precio: number | string | null | undefined, fee: number) {
  const total = Number(precio ?? 0);
  if (!(total > 0)) return { total: 0, nuestro: 0, delVendedor: 0 };
  const nuestro = Math.min(fee, total);
  return { total, nuestro, delVendedor: Math.round((total - nuestro) * 100) / 100 };
}

const euros = (n: number | null | undefined) =>
  Number(n) > 0 ? `${Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €` : '';

export interface DatosDelCorreo {
  comprador_nombre: string;
  coche: string;
  precio: number | null;
  entidad?: string;
  importe?: number | null;
  vendedor_nombre?: string;
  motivo?: string;
  sitio: string;
  oferta_id?: string;
}

/** Al comprador: la financiación está aprobada. */
export function correoFinanciacionAprobada(d: DatosDelCorreo) {
  return {
    subject: `Tu financiación está aprobada — ${d.coche}`,
    html: plantilla({
      titulo: 'Tu financiación está aprobada',
      cuerpo:
        parrafo(`Hola${d.comprador_nombre ? ` ${esc(d.comprador_nombre)}` : ''}, la entidad ha aprobado la financiación de <strong>${esc(d.coche)}</strong>.`) +
        datos([
          ['Precio del coche', esc(euros(d.precio))],
          ['Entidad', esc(d.entidad ?? '')],
          ['Importe financiado', esc(euros(d.importe))],
        ]) +
        parrafo('El siguiente paso es el ingreso del precio. Te escribimos con los datos para hacerlo y, en cuanto esté, nos ponemos con el cambio de nombre.'),
    }),
    movil: { titulo: 'Tu financiación está aprobada', cuerpo: `${d.coche}. Te escribimos con los pasos para el ingreso.` },
  };
}

/** Al comprador: la financiación no se ha aprobado. */
export function correoFinanciacionDenegada(d: DatosDelCorreo) {
  return {
    subject: `Tu financiación no se ha aprobado — ${d.coche}`,
    html: plantilla({
      titulo: 'Tu financiación no se ha aprobado',
      cuerpo:
        parrafo(`Hola${d.comprador_nombre ? ` ${esc(d.comprador_nombre)}` : ''}, la entidad no ha aprobado la financiación de <strong>${esc(d.coche)}</strong>.`) +
        aviso('¿Quieres seguir con la compra?', `Si puedes pagar los ${esc(euros(d.precio))} sin financiar, contéstanos a este correo y seguimos. Si no, anulamos la compra sin ningún coste para ti.`),
    }),
    movil: { titulo: 'Tu financiación no se ha aprobado', cuerpo: 'Contéstanos si quieres seguir pagándolo tú.' },
  };
}

/** Al comprador y al vendedor: la venta no sigue adelante. */
export function correoVentaAnuladaAlComprador(d: DatosDelCorreo) {
  return {
    subject: `Tu compra no sigue adelante — ${d.coche}`,
    html: plantilla({
      titulo: 'Tu compra no sigue adelante',
      cuerpo:
        parrafo(`Hola${d.comprador_nombre ? ` ${esc(d.comprador_nombre)}` : ''}, hemos anulado la compra de <strong>${esc(d.coche)}</strong>. No tienes que pagar nada.`) +
        (d.motivo ? datos([['Motivo', esc(d.motivo)]]) : '') +
        parrafo('Si tienes cualquier duda, contéstanos a este correo.', 14),
    }),
    movil: { titulo: 'Tu compra no sigue adelante', cuerpo: `${d.coche}. No tienes que pagar nada.` },
  };
}

export function correoVentaAnuladaAlVendedor(d: DatosDelCorreo) {
  return {
    subject: `La venta de tu coche no sigue adelante — ${d.coche}`,
    html: plantilla({
      titulo: 'La venta no sigue adelante',
      cuerpo:
        parrafo(`Hola${d.vendedor_nombre ? ` ${esc(d.vendedor_nombre)}` : ''}, el comprador de <strong>${esc(d.coche)}</strong> no sigue adelante. Tu coche vuelve a estar a la venta y puedes volver a enseñarlo.`) +
        (d.motivo ? datos([['Motivo', esc(d.motivo)]]) : '') +
        (d.oferta_id ? boton('Ver tu anuncio', `${d.sitio}/marketplace-vo/${encodeURIComponent(d.oferta_id)}`) : ''),
    }),
    movil: { titulo: 'La venta no sigue adelante', cuerpo: `${d.coche} vuelve a estar a la venta.` },
  };
}

/**
 * Los correos de la fase del dinero.
 *
 * Cada paso le escribe **a quien le afecta**, y nada más. El vendedor no tiene
 * por qué enterarse de cuándo ingresó el comprador, ni el comprador de cuándo
 * cobró el vendedor: son dos conversaciones y mezclarlas es contarle a cada uno
 * lo que hace el otro con su dinero.
 */

/** Al comprador: su dinero ya está retenido y empieza el papeleo. */
export function correoIngresoRecibido(d: DatosDelCorreo) {
  return {
    subject: `Hemos recibido tu ingreso — ${d.coche}`,
    html: plantilla({
      titulo: 'Hemos recibido tu ingreso',
      cuerpo:
        parrafo(`Hola${d.comprador_nombre ? ` ${esc(d.comprador_nombre)}` : ''}, ya está dentro el importe de <strong>${esc(d.coche)}</strong>.`) +
        datos([['Importe', esc(euros(d.importe ?? d.precio))]]) +
        parrafo('Ese dinero se queda retenido y <strong>no sale de ahí hasta que el coche esté a tu nombre</strong>. Nos ponemos ya con el cambio de titularidad; te avisamos en cuanto salga.'),
    }),
    movil: { titulo: 'Hemos recibido tu ingreso', cuerpo: `${d.coche}. Empezamos con el cambio de nombre.` },
  };
}

/** Al vendedor: hay dinero y el coche está comprometido. */
export function correoIngresoRecibidoAlVendedor(d: DatosDelCorreo) {
  return {
    subject: `El comprador de tu coche ya ha pagado — ${d.coche}`,
    html: plantilla({
      titulo: 'El comprador ya ha pagado',
      cuerpo:
        parrafo(`Hola${d.vendedor_nombre ? ` ${esc(d.vendedor_nombre)}` : ''}, el comprador de <strong>${esc(d.coche)}</strong> ya ha hecho el ingreso.`) +
        aviso('Qué pasa ahora', 'Hacemos el cambio de nombre y, en cuanto esté, te transferimos lo que te corresponde. No entregues el coche hasta que te avisemos de que has cobrado.'),
    }),
    movil: { titulo: 'El comprador ya ha pagado', cuerpo: `${d.coche}. Vamos con el cambio de nombre.` },
  };
}

/** Al comprador: el coche ya es suyo en Tráfico. */
export function correoCambioDeNombreHecho(d: DatosDelCorreo) {
  return {
    subject: `El coche ya está a tu nombre — ${d.coche}`,
    html: plantilla({
      titulo: 'El coche ya está a tu nombre',
      cuerpo:
        parrafo(`Hola${d.comprador_nombre ? ` ${esc(d.comprador_nombre)}` : ''}, el cambio de titularidad de <strong>${esc(d.coche)}</strong> está hecho.`) +
        parrafo('Ya le pagamos al vendedor y te escribimos para quedar en la recogida. Llévate el DNI.'),
    }),
    movil: { titulo: 'El coche ya está a tu nombre', cuerpo: `${d.coche}. Te escribimos para la recogida.` },
  };
}

/** Al vendedor: ya tiene su dinero. */
export function correoDineroLiberado(d: DatosDelCorreo) {
  return {
    subject: `Tu dinero está en camino — ${d.coche}`,
    html: plantilla({
      titulo: 'Tu dinero está en camino',
      cuerpo:
        parrafo(`Hola${d.vendedor_nombre ? ` ${esc(d.vendedor_nombre)}` : ''}, el coche ya está a nombre del comprador y te hemos liberado lo que te corresponde por <strong>${esc(d.coche)}</strong>.`) +
        datos([
          ['Precio de venta', esc(euros(d.precio))],
          ['Nuestra gestión', esc(euros(d.importe != null ? d.precio! - d.importe : null))],
          ['Para ti', esc(euros(d.importe))],
        ]) +
        parrafo('Según tu banco, puede tardar uno o dos días en aparecer. Ya puedes entregarle el coche.'),
    }),
    movil: { titulo: 'Tu dinero está en camino', cuerpo: `${d.coche} · ${euros(d.importe)}` },
  };
}

/** A los dos: el coche ya ha cambiado de manos. */
export function correoCocheEntregado(d: DatosDelCorreo) {
  return {
    subject: `Todo cerrado — ${d.coche}`,
    html: plantilla({
      titulo: 'Todo cerrado',
      cuerpo:
        parrafo(`<strong>${esc(d.coche)}</strong> ya ha cambiado de manos: el coche está a nombre del comprador y el vendedor ha cobrado.`) +
        parrafo('Gracias por confiar en nosotros. Si necesitas cualquier papel de la operación, contéstanos a este correo.', 14),
    }),
    movil: { titulo: 'Todo cerrado', cuerpo: `${d.coche}. Operación terminada.` },
  };
}
