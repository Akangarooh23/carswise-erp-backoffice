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
    ADD COLUMN IF NOT EXISTS financiacion_decidida_at TIMESTAMPTZ`;

export const EN_CURSO = 'en_curso';
export const ANULADA = 'anulada';

export type EstadoDeLaFinanciacion = 'en_estudio' | 'aprobada' | 'denegada' | 'sin_financiacion';

export interface LaVenta {
  venta_estado?: string | null;
  venta_financia?: boolean | null;
  financiacion_estado?: string | null;
}

export type Paso = 'financiacion_en_estudio' | 'financiacion_denegada' | 'esperando_ingreso';

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
  return 'esperando_ingreso';
}

export const QUE_TOCA: Record<Paso, string> = {
  financiacion_en_estudio: 'Quiere financiar: hasta que la entidad conteste no se pide el ingreso ni se hace la gestoría',
  financiacion_denegada: 'Le han denegado la financiación: o lo paga él entero o se anula la venta',
  esperando_ingreso: 'Falta que entre el importe del coche',
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
  return '';
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
