/**
 * Lo que le llega al cliente por correo, también al móvil.
 *
 * El correo es el canal que manda: lleva el papel, el enlace y queda guardado.
 * Esto es el toque encima —«tu cita del taller es mañana»— para quien tiene la
 * app de PopCar, que sin él solo se entera si abre la bandeja de entrada.
 *
 * Es la misma tabla y la misma cuenta de Firebase que usa PopCar
 * (`lib/avisos-push.js` allí): los móviles los apunta la app contra la web, y
 * aquí solo se leen. Por eso no hay nada que guardar ni que borrar desde el ERP
 * salvo los móviles que Google dice que ya no existen.
 *
 * Tres reglas, y las tres son a propósito:
 *
 *   · **Nunca lanza.** Un aviso que no sale no puede hacer que la pantalla diga
 *     que el correo falló, porque el correo ya salió.
 *   · **Sin `FIREBASE_SERVICE_ACCOUNT` no hace nada**, ni siquiera mirar la base.
 *   · **Va detrás del correo, nunca en su lugar.** Lo llama `enviar()` después de
 *     que Resend acepte, no antes.
 */
import crypto from 'node:crypto';
import { query } from '../db/pool.js';

const FCM = 'https://fcm.googleapis.com/v1/projects';
const OAUTH = 'https://oauth2.googleapis.com/token';
const AMBITO = 'https://www.googleapis.com/auth/firebase.messaging';

/** Lo que se ve en la notificación, y a qué pantalla de la app lleva al tocarla. */
export interface AvisoAlMovil {
  titulo: string;
  cuerpo: string;
  /** Una de las pantallas que la app sabe abrir. Si no se dice, el resumen. */
  pantalla?: string;
}

/*
 * Cuánto cabe. Android corta el título a una línea y el cuerpo a dos en la
 * pantalla bloqueada; lo que pase de ahí no se lee, y un asunto de correo con
 * el coche, la fecha larga y la hora pasa de largo.
 */
const MAX_TITULO = 65;
const MAX_CUERPO = 140;

const corta = (t: string, max: number) => {
  const limpio = String(t ?? '').replace(/\s+/g, ' ').trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
};

/**
 * El aviso que corresponde a un correo.
 *
 * Si quien manda el correo ha escrito el suyo, ése. Si no, el asunto como
 * título: un correo al cliente sin aviso escrito sigue llegando al móvil, que es
 * lo que se pidió —todo por correo y por móvil—, y el asunto ya está escrito
 * para que alguien lo entienda sin abrir nada.
 */
export function elAvisoDelCorreo(subject: string, movil?: AvisoAlMovil | null): AvisoAlMovil {
  if (movil && movil.titulo) {
    return {
      titulo: corta(movil.titulo, MAX_TITULO),
      cuerpo: corta(movil.cuerpo || 'Te lo hemos mandado también por correo.', MAX_CUERPO),
      pantalla: movil.pantalla || 'resumen',
    };
  }
  return {
    titulo: corta(subject, MAX_TITULO),
    cuerpo: 'Te lo hemos mandado por correo, con todos los detalles.',
    pantalla: 'resumen',
  };
}

interface Credenciales { client_email: string; private_key: string; project_id: string }

function credenciales(): Credenciales | null {
  const crudo = String(process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
  if (!crudo) return null;
  try {
    // Como en PopCar: el JSON tal cual o en base64, que es como sobrevive a un
    // panel de variables de entorno.
    const json = crudo.startsWith('{') ? crudo : Buffer.from(crudo, 'base64').toString('utf8');
    const d = JSON.parse(json) as Partial<Credenciales>;
    if (!d.client_email || !d.private_key || !d.project_id) return null;
    return d as Credenciales;
  } catch {
    return null;
  }
}

export function estaConfigurado(): boolean {
  return credenciales() !== null;
}

const base64url = (v: string | Buffer) =>
  Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let token = { valor: '', caduca: 0 };

/** El token de Google, firmado con la cuenta de servicio y guardado casi una hora. */
async function tokenDeAcceso(cred: Credenciales): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (token.valor && token.caduca > ahora + 60) return token.valor;

  const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = base64url(JSON.stringify({ iss: cred.client_email, scope: AMBITO, aud: OAUTH, iat: ahora, exp: ahora + 3600 }));
  const firma = crypto.createSign('RSA-SHA256')
    .update(`${cabecera}.${cuerpo}`)
    .sign(cred.private_key.replace(/\\n/g, '\n'));

  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecera}.${cuerpo}.${base64url(firma)}`,
    }).toString(),
  });
  const datos = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !datos.access_token) {
    console.error('[avisos-al-movil] Google no da token:', datos.error_description || res.status);
    return '';
  }
  token = { valor: datos.access_token, caduca: ahora + Number(datos.expires_in || 3600) };
  return token.valor;
}

/**
 * Lo manda a todos los móviles de ese correo. Devuelve cuántos salieron.
 *
 * Si la tabla no existe todavía —nadie ha apuntado nunca un móvil— la consulta
 * falla y se devuelve cero: no se crea desde aquí, porque quien la llena es la
 * app contra PopCar.
 */
export async function avisaAlMovil(correo: string, aviso: AvisoAlMovil): Promise<number> {
  try {
    const cred = credenciales();
    if (!cred) return 0;
    const email = String(correo ?? '').trim().toLowerCase();
    if (!email) return 0;

    const r = await query(
      `SELECT token FROM moveadvisor_push_devices WHERE lower(user_email) = $1`,
      [email]
    ).catch(() => ({ rows: [] as { token: string }[] }));
    const moviles = (r.rows as { token: string }[]).map((x) => x.token).filter(Boolean);
    if (!moviles.length) return 0;

    const acceso = await tokenDeAcceso(cred);
    if (!acceso) return 0;

    let salieron = 0;
    for (const t of moviles) {
      try {
        const res = await fetch(`${FCM}/${cred.project_id}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t,
              notification: { title: aviso.titulo, body: aviso.cuerpo },
              data: { pantalla: aviso.pantalla || 'resumen' },
              android: { priority: 'high', notification: { default_sound: true } },
            },
          }),
        });
        if (res.ok) { salieron += 1; continue; }
        const error = (await res.json().catch(() => ({}))) as { error?: { status?: string } };
        const codigo = String(error?.error?.status ?? '');
        // Un móvil que ya no existe se quita, igual que en PopCar.
        if (res.status === 404 || codigo === 'NOT_FOUND' || codigo === 'UNREGISTERED') {
          await query(`DELETE FROM moveadvisor_push_devices WHERE token = $1`, [t]).catch(() => {});
        } else {
          console.error('[avisos-al-movil] FCM responde', res.status, codigo);
        }
      } catch (err) {
        console.error('[avisos-al-movil] no ha salido:', (err as Error).message);
      }
    }
    return salieron;
  } catch (err) {
    console.error('[avisos-al-movil]', (err as Error).message);
    return 0;
  }
}
