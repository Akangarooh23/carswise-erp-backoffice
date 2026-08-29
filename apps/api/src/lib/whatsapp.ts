/**
 * Mandar un WhatsApp. La única costura con Meta.
 *
 * Todo lo que quiera escribir a un cliente por WhatsApp pasa por aquí, y aquí
 * solo hay dos cosas: si está configurado, y cómo se manda. Enchufarlo de verdad
 * es poner dos variables de entorno; no hay que tocar ninguna pantalla ni
 * ninguna ruta.
 *
 *   WHATSAPP_TOKEN     el token permanente de la app de Meta
 *   WHATSAPP_PHONE_ID  el identificador del número desde el que se escribe
 *
 * Mientras falte alguna, `estaConfigurado()` dice que no y quien llama enseña el
 * texto para copiarlo a mano. Eso no es un apaño temporal: aunque el número esté
 * conectado, WhatsApp solo deja escribir libremente dentro de las 24 horas
 * siguientes al último mensaje del cliente. Fuera de esa ventana hay que usar
 * una plantilla aprobada, así que el camino de copiar y pegar hace falta igual.
 */

const url = (phoneId: string) => `https://graph.facebook.com/v20.0/${phoneId}/messages`;

export function estaConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim());
}

/**
 * Un teléfono como lo quiere Meta: solo dígitos, con prefijo de país.
 *
 * Lo que teclea la gente viene con espacios, guiones y a veces sin prefijo. Un
 * número español sin prefijo se manda a ninguna parte, así que se le pone el 34.
 */
export function comoLoQuiereMeta(telefono: string): string {
  const solo = String(telefono || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!solo) return '';
  // Nueve dígitos que empiezan por 6, 7, 8 o 9: es español y le falta el prefijo.
  if (/^[6789]\d{8}$/.test(solo)) return `34${solo}`;
  return solo;
}

export interface Envio {
  enviado: boolean;
  /** Por qué no salió, para poder contárselo a quien lo intentó. */
  motivo?: string;
}

/**
 * Manda el mensaje. No lanza: quien llama necesita seguir aunque esto falle.
 *
 * Un WhatsApp que no sale no puede tumbar la gestión de la cita; lo que no puede
 * pasar es que nadie se entere de que no salió, y por eso se devuelve el motivo.
 */
export async function manda(telefono: string, texto: string): Promise<Envio> {
  if (!estaConfigurado()) return { enviado: false, motivo: 'WhatsApp no está configurado' };

  const numero = comoLoQuiereMeta(telefono);
  if (!numero) return { enviado: false, motivo: 'no hay teléfono del cliente' };

  try {
    const r = await fetch(url(process.env.WHATSAPP_PHONE_ID!.trim()), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto },
      }),
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      return { enviado: false, motivo: `Meta contestó ${r.status}: ${cuerpo.slice(0, 200)}` };
    }
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

/** Una opción pulsable: lo que se ve y lo que vuelve cuando la pulsan. */
export interface Opcion {
  /** Lo que vuelve en la respuesta. Hasta 256 caracteres. */
  id: string;
  /** Lo que lee el cliente en el botón. WhatsApp corta a los 20 caracteres. */
  texto: string;
}

/** Meta no admite más de tres botones en un mensaje. */
export const MAXIMO_BOTONES = 3;

/**
 * El mensaje con botones, tal y como lo quiere Meta.
 *
 * Aparte para poder leerlo sin mandarlo. Los títulos se cortan a 20 caracteres
 * porque es el límite de WhatsApp y un botón que se pasa hace que Meta rechace
 * el mensaje entero: mejor una hora abreviada que un mensaje que no sale.
 */
export function comoBotones(telefono: string, texto: string, opciones: Opcion[]) {
  return {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: {
        buttons: opciones.slice(0, MAXIMO_BOTONES).map((o) => ({
          type: 'reply',
          reply: { id: o.id.slice(0, 256), title: o.texto.slice(0, 20) },
        })),
      },
    },
  };
}

/**
 * Manda el mensaje con las opciones como botones.
 *
 * El cliente pulsa y contesta sin escribir; la respuesta llega al webhook y la
 * hora se aplica sola. Es la diferencia entre una cita que se cierra en un toque
 * y otra que espera a que alguien lea un WhatsApp y lo teclee en la Agenda.
 *
 * Con más de tres opciones no hay botones que valgan —Meta no admite más—, así
 * que se manda el texto numerado de siempre y lo aplica un trabajador. No se
 * recortan a tres: quitarle al cliente horas que el concesionario sí ofrece es
 * peor que pedirle que conteste escribiendo.
 */
export async function mandaOpciones(telefono: string, texto: string, opciones: Opcion[]): Promise<Envio> {
  if (!opciones.length || opciones.length > MAXIMO_BOTONES) return manda(telefono, texto);
  if (!estaConfigurado()) return { enviado: false, motivo: 'WhatsApp no está configurado' };

  const numero = comoLoQuiereMeta(telefono);
  if (!numero) return { enviado: false, motivo: 'no hay teléfono del cliente' };

  try {
    const r = await fetch(url(process.env.WHATSAPP_PHONE_ID!.trim()), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(comoBotones(numero, texto, opciones)),
    });
    if (!r.ok) {
      const cuerpo = await r.text().catch(() => '');
      return { enviado: false, motivo: `Meta contestó ${r.status}: ${cuerpo.slice(0, 200)}` };
    }
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lo que ha pulsado el cliente, sacado de lo que manda Meta.
 *
 * El identificador del botón lleva dentro la cita y la hora —`elige|<cita>|<hora>`—
 * a propósito: la respuesta solo trae el teléfono desde el que se contesta, y
 * buscar la cita por teléfono falla en cuanto alguien tiene dos.
 *
 * Devuelve null para todo lo que no sea una hora elegida, que es casi todo lo
 * que manda Meta: acuses de entrega, mensajes escritos, cambios de estado.
 */
export function loQuePulso(payload: unknown): { bookingId: string; hora: string; telefono: string } | null {
  const mensajes = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages;
  const m = Array.isArray(mensajes) ? mensajes[0] : null;
  if (!m) return null;
  const id: unknown =
    m?.interactive?.button_reply?.id ??
    // Las plantillas aprobadas contestan con `button`, no con `interactive`.
    m?.button?.payload;
  if (typeof id !== 'string') return null;
  const partes = id.split('|');
  if (partes.length !== 3 || partes[0] !== 'elige') return null;
  const [, bookingId, hora] = partes;
  if (!bookingId || !hora || Number.isNaN(new Date(hora).getTime())) return null;
  return { bookingId, hora, telefono: String(m.from || '') };
}

/** El identificador que se le pone al botón de una hora. */
export const botonDeHora = (bookingId: string, hora: string) => `elige|${bookingId}|${hora}`;
