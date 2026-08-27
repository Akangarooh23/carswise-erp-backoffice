/**
 * Todo el correo que sale del ERP.
 *
 * Antes cada ruta tenía su propia función de envío —cuatro copias— y su propia
 * maqueta. Una de ellas, la de recuperar contraseña, llevaba el remitente
 * escrito a fuego, así que cambiar `RESEND_FROM_EMAIL` en Vercel no la tocaba:
 * seguía saliendo de una dirección de la marca anterior.
 *
 * Aquí hay un remitente, una dirección de respuesta y una plantilla. Si mañana
 * cambia el buzón, se cambia en un sitio.
 *
 * Sobre la maqueta: los clientes de correo de hace veinte años siguen vivos, y
 * Gmail borra cualquier `<style>`. Por eso va todo en `style=` a mano, con
 * tablas y colores literales. No se pueden usar los tokens del ERP porque en un
 * correo no hay CSS que los resuelva.
 */
import { config } from '../config.js';

const RESEND = 'https://api.resend.com/emails';

/** La marca, escrita una vez. */
export const MARCA = {
  nombre: 'PopCar',
  sitio: 'www.popcar.tech',
  get sitioUrl() { return config.PUBLIC_SITE_URL; },
};

/** Negro, amarillo y grises cálidos: la misma paleta que el ERP y la web. */
const C = {
  negro:     '#111111',
  texto:     '#2A2A28',
  tenue:     '#5E5E59',
  borde:     '#C9C7C0',
  fondo:     '#F5F5F4',
  amarillo:  '#FFC400',
  amarilloF: '#FFF6D9',
  blanco:    '#FFFFFF',
};

const TIPO = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** De quién sale. La variable de entorno manda; si falta, el buzón de la marca. */
export function remitente(): string {
  return (config.RESEND_FROM_EMAIL || '').trim() || `${MARCA.nombre} <notifications@popcar.tech>`;
}

/**
 * A dónde va la respuesta si el cliente le da a Responder.
 *
 * Devuelve `undefined` cuando no está puesta, y así `JSON.stringify` quita el
 * campo del cuerpo en vez de mandar una cadena vacía, que Resend rechaza.
 */
export function respuestaA(): string | undefined {
  return (config.REPLY_TO_EMAIL || '').trim() || undefined;
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export interface Bloque {
  /** Encabezado del correo. Va en frase, sin admiraciones. */
  titulo: string;
  /** El cuerpo, ya en HTML. Usa `parrafo`, `datos`, `aviso` y `boton`. */
  cuerpo: string;
}

/** Un párrafo normal. */
export const parrafo = (html: string, tam = 15) =>
  `<p style="margin:0 0 14px 0;font-size:${tam}px;line-height:1.55;color:${C.texto}">${html}</p>`;

/** Una caja de datos: la cita, el contrato, el resumen del renting. */
export function datos(filas: [string, string][]): string {
  const tr = filas
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:5px 12px 5px 0;font-size:14px;color:${C.tenue};white-space:nowrap">${k}</td>
           <td style="padding:5px 0;font-size:14px;color:${C.texto};font-weight:600">${v}</td>
         </tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
            style="width:100%;background:${C.fondo};border:1px solid ${C.borde};border-radius:10px;padding:16px 18px;margin:0 0 18px 0">
            ${tr}
          </table>`;
}

/** Lo que el cliente tiene que hacer para que algo ocurra. Solo uno por correo. */
export function aviso(titulo: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
            style="width:100%;background:${C.amarilloF};border:1px solid ${C.amarillo};border-radius:10px;padding:16px 18px;margin:0 0 18px 0">
            <tr><td>
              <p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:${C.negro}">${titulo}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:${C.texto}">${texto}</p>
            </td></tr>
          </table>`;
}

/**
 * Una dirección lista para meter en un `href`.
 *
 * Las direcciones de los anuncios vienen de portales de fuera y llevan `&` y
 * parámetros dentro. Un `&` sin escapar en un atributo es HTML inválido y hay
 * clientes de correo que lo destrozan, y una comilla permitiría salirse del
 * atributo y escribir marcado propio.
 *
 * Y solo http y https: `javascript:` no tiene nada que hacer en un correo, y
 * aunque hoy los clientes lo bloqueen, no es algo que se deba dejar salir.
 */
export function urlSegura(url: unknown): string {
  const limpia = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(limpia)) return '';
  return esc(limpia);
}

/**
 * El botón. Amarillo relleno con texto negro: es el único sitio del correo
 * donde aparece el amarillo a este tamaño, y así no compite con nada.
 */
export const boton = (texto: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0">
     <tr><td style="background:${C.amarillo};border-radius:8px">
       <a href="${urlSegura(url)}" style="display:inline-block;padding:13px 26px;font-family:${TIPO};font-size:15px;font-weight:700;color:${C.negro};text-decoration:none">${texto}</a>
     </td></tr>
   </table>`;

/** Un enlace discreto, para lo secundario. */
export const enlace = (texto: string, url: string) =>
  `<p style="margin:0 0 14px 0;font-size:14px"><a href="${urlSegura(url)}" style="color:${C.negro};font-weight:600">${texto}</a></p>`;

/**
 * La maqueta completa: cabecera negra con la marca, tarjeta blanca y pie.
 *
 * El ancho va a 560 px porque es lo que cabe en la vista previa de Gmail sin
 * que el cliente tenga que desplazarse de lado en el móvil.
 */
export function plantilla({ titulo, cuerpo }: Bloque): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${C.fondo}">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;font-family:${TIPO}">

        <tr><td style="background:${C.negro};border-radius:12px 12px 0 0;padding:20px 26px">
          <span style="font-size:19px;font-weight:800;letter-spacing:-0.3px;color:${C.amarillo}">Pop</span><span style="font-size:19px;font-weight:800;letter-spacing:-0.3px;color:${C.blanco}">Car</span>
        </td></tr>

        <tr><td style="background:${C.blanco};border:1px solid ${C.borde};border-top:none;border-radius:0 0 12px 12px;padding:28px 26px 22px">
          <h1 style="margin:0 0 18px 0;font-size:20px;line-height:1.3;font-weight:700;color:${C.negro}">${esc(titulo)}</h1>
          ${cuerpo}
        </td></tr>

        <tr><td style="padding:16px 26px 0">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${C.tenue}">
            ${MARCA.nombre} — <a href="${MARCA.sitioUrl}" style="color:${C.tenue}">${MARCA.sitio}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface Envio {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
  /**
   * Si es `true`, el correo sale al destinatario de verdad aunque
   * `RESEND_TEST_EMAIL` esté puesta. Es para lo que le llega al cliente: si un
   * desvío de pruebas se queda olvidado en producción, el cliente no se entera
   * de su propia cita.
   */
  alClienteSiempre?: boolean;
}

/**
 * A dónde va de verdad.
 *
 * `RESEND_TEST_EMAIL` existe porque en desarrollo Resend solo deja mandar al
 * dueño de la cuenta. Pero solo vale en desarrollo: si esa variable se queda
 * olvidada en producción, el cliente deja de recibir su propia confirmación de
 * cita y nadie se entera, porque el envío sigue saliendo bien. En producción se
 * ignora siempre.
 */
function destinatario(to: string, alClienteSiempre?: boolean): string {
  if (alClienteSiempre) return to;
  if (config.NODE_ENV === 'production') return to;
  return config.RESEND_TEST_EMAIL || to;
}

/** Manda. Lanza si Resend contesta mal, para que la ruta pueda decirlo. */
export async function enviar({ to, subject, html, attachments, alClienteSiempre }: Envio): Promise<void> {
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada');
  const destino = destinatario(to, alClienteSiempre);
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remitente(),
      reply_to: respuestaA(),
      to: destino,
      subject,
      html,
      attachments,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Resend devolvió ${res.status}`);
  }
}
