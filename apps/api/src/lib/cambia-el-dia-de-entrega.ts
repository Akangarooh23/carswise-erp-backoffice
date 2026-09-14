/**
 * Decirle que el día de la entrega se ha movido.
 *
 * ## La promesa que no cumplía nadie
 *
 * En «tu coche sale hacia tu casa» se le da un día y se le dice, con estas
 * palabras: *«El día es el que nos ha dado el transportista y puede moverse por
 * tráfico o por una carga anterior. **Si cambia, te avisamos**»*.
 *
 * Y no le avisaba nadie. La fecha se edita en la ficha del transporte como
 * cualquier otro campo, y ahí se acababa: el cliente se quedaba con el día que
 * le dijimos la primera vez.
 *
 * ## Por qué importa más que otros avisos
 *
 * Porque en este viaje sí tiene que hacer algo. La entrega se firma, y —como
 * dice el correo del que viene— *un camión que llega a una casa vacía se vuelve
 * con el coche dentro y el viaje se paga igual*. Que no se entere del cambio
 * cuesta el porte y le deja sin coche otra semana.
 *
 * ## Solo cuando ya sabía un día
 *
 * Si antes no había fecha, esto no es un cambio: es la primera noticia, y lo
 * que se le prometió para ese caso fue **una llamada** —«en cuanto el
 * transportista nos confirme el día, te llamamos para cerrarlo»—, no un correo.
 * Mandarle aquí un «ha cambiado» sería contarle que se ha movido algo que nunca
 * supo.
 */
import { plantilla, parrafo, datos, esc } from './correo.js';

export interface DatosDelCambio {
  nombre?: string | null;
  vehiculo?: string | null;
  /** El día que se le dijo. Sin esto no hay cambio que contar. */
  antes?: string | null;
  /** Y el que hay ahora. */
  ahora?: string | null;
  destino?: string | null;
  panel: string;
}

/**
 * «21 de septiembre de 2026», o vacío.
 *
 * Igual que en `coche-hacia-tu-casa.ts`, y a propósito: los dos correos hablan
 * de la misma entrega, y dos formatos distintos para la misma fecha se leen
 * como dos fechas.
 */
function enFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Si hay que avisarle.
 *
 * Las dos fechas se comparan **por el día**, no por la cadena: la misma fecha
 * escrita `2026-09-21` y `2026-09-21T00:00:00.000Z` no es un cambio, y mandar un
 * correo diciendo que algo se ha movido cuando no se ha movido es la forma más
 * rápida de que deje de leerlos.
 */
export function hayQueAvisar(antes: unknown, ahora: unknown): boolean {
  const dia = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };
  const a = dia(antes);
  const b = dia(ahora);
  // Sin fecha antigua no es un cambio, es la primera noticia — y ésa se da por
  // teléfono. Sin fecha nueva tampoco: no se le puede decir «ahora es ninguna».
  if (!a || !b) return false;
  return a !== b;
}

export function correoDeCambioDeEntrega(d: DatosDelCambio): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const antes = enFecha(d.antes);
  const ahora = enFecha(d.ahora);
  const destino = String(d.destino ?? '').trim();
  const nombre = String(d.nombre ?? '').trim();

  /*
   * En el asunto va el día nuevo.
   *
   * Es lo único que necesita saber, y muchos correos se leen solo por el
   * asunto. «Cambio en la entrega» a secas le obliga a abrirlo para saber si le
   * afecta hoy.
   */
  const subject = `Tu entrega se mueve al ${ahora}${coche ? ` — ${coche}` : ''}`;

  return {
    subject,
    html: plantilla({
      titulo: 'El día de la entrega ha cambiado',
      cuerpo:
        parrafo(`Hola${nombre ? ` <strong>${esc(nombre)}</strong>` : ''},`) +
        parrafo(
          `El transportista nos ha dado una fecha nueva para tu `
          + `<strong>${esc(coche || 'coche')}</strong>. Te lo decimos en cuanto lo sabemos, que `
          + `es lo que te prometimos.`
        ) +
        datos([
          ['Te habíamos dicho', esc(antes)],
          ['Ahora llega el', esc(ahora)],
          ...(destino ? [['A', esc(destino)] as [string, string]] : []),
        ]) +
        parrafo(
          '<strong>Hace falta que haya alguien.</strong> La entrega se firma, y un camión que '
          + 'llega a una casa vacía se vuelve con el coche dentro.', 14
        ) +
        parrafo(
          `Si ese día no te va bien, dínoslo cuanto antes y lo movemos. `
          + `<a href="${esc(d.panel)}" style="color:#111111;font-weight:600">Ver el estado</a>`, 14
        ),
    }),
  };
}
