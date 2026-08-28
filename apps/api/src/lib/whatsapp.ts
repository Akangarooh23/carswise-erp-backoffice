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
