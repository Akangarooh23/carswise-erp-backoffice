/**
 * El encargo que se le manda a la gestoría cuando el coche entra en trámites.
 *
 * **Un correo por coche, no uno por trámite.** Son tres papeleos —el impuesto,
 * la ITV de homologación y la matrícula— pero es el mismo coche, la misma
 * carpeta y la misma persona quien los hace. Tres correos seguidos del mismo
 * Kia se contestan una vez y con la pregunta de cuál es cuál.
 *
 * Y pide una cosa de vuelta que no es evidente: **el importe real del impuesto**.
 * El cliente pagó una estimación —no tenemos el CO₂ de ningún coche— y hasta que
 * la gestoría no diga lo que costó de verdad no se le puede devolver ni cobrar
 * la diferencia. Ese dato no llega solo: hay que pedirlo, y por eso está escrito
 * aquí en vez de en la cabeza de quien llame.
 *
 * A nombre de quién se matricula va en grande porque es lo que más caro sale
 * equivocado: el coche es del cliente desde Alemania, no nuestro, y una
 * matriculación a nombre de PopCar son dos cambios de titularidad en vez de uno.
 */

export interface Tramite {
  id: string;
  tipo: string;
}

export interface DatosDelEncargo {
  vehiculo: string;
  /** El número de bastidor, si se sabe ya. */
  bastidor?: string | null;
  /** La matrícula alemana con la que ha venido. */
  matricula?: string | null;
  tramites: Tramite[];
  /** A nombre de quién se matricula. */
  titular: {
    nombre?: string | null;
    nif?: string | null;
    direccion?: string | null;
    cp?: string | null;
    provincia?: string | null;
  };
}

/** Lo que impide mandar el encargo. */
export function faltaParaElEncargo(d: DatosDelEncargo): string[] {
  const falta: string[] = [];
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  if (!d.tramites?.length) falta.push('los trámites');
  if (!String(d.titular?.nombre ?? '').trim()) falta.push('a nombre de quién se matricula');
  if (!String(d.titular?.nif ?? '').trim()) falta.push('su NIF');
  return falta;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** «Calle Mauricio Legendre 45 G2B, 28046 MADRID» */
export function direccionDelTitular(t: DatosDelEncargo['titular']): string {
  const ciudad = [t.cp, t.provincia].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
  return [String(t.direccion ?? '').trim(), ciudad].filter(Boolean).join(', ');
}

export function correoDeEncargoALaGestoria(d: DatosDelEncargo): { subject: string; html: string } {
  const coche = String(d.vehiculo ?? '').trim();
  const mat = String(d.matricula ?? '').trim();
  const subject = `Importación a matricular — ${coche}${mat ? ` (${mat})` : ''}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:5px 14px 5px 0;color:#5E5E59;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:5px 0;color:#2A2A28"><strong>${esc(v)}</strong></td></tr>`;

  const delCoche =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Vehículo', coche) +
    (String(d.bastidor ?? '').trim() ? fila('Bastidor', String(d.bastidor)) : '') +
    fila('Matrícula de origen', mat || 'todavía no la tenemos') +
    '</table>';

  const delTitular =
    '<table style="border-collapse:collapse;font-size:14px;margin:8px 0 16px 0">' +
    fila('Nombre', String(d.titular.nombre ?? '')) +
    fila('NIF', String(d.titular.nif ?? '')) +
    (direccionDelTitular(d.titular) ? fila('Domicilio', direccionDelTitular(d.titular)) : '') +
    '</table>';

  const lista =
    '<ul style="margin:8px 0 16px 0;padding-left:20px;font-size:15px;line-height:1.7;color:#2A2A28">' +
    d.tramites
      .map((t) => `<li><strong>${esc(t.tipo)}</strong> <span style="color:#5E5E59">· ${esc(t.id)}</span></li>`)
      .join('') +
    '</ul>';

  const p = (html: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;color:#2A2A28">${html}</p>`;

  const html =
    p('Hola,') +
    p('Os pasamos un coche de importación para matricular:') +
    delCoche +
    p('Lo que hay que hacer:') +
    lista +
    p('<strong>Se matricula a nombre del cliente</strong>, no del nuestro: el coche es suyo desde Alemania y nosotros solo gestionamos la importación.') +
    delTitular +
    p('Y una cosa que necesitamos de vuelta: <strong>el importe real del impuesto de matriculación</strong> en cuanto lo sepáis. El cliente pagó una estimación y hasta que no tengamos la cifra de verdad no podemos devolverle ni cobrarle la diferencia.') +
    p('Cualquier cosa, respondiendo a este correo.');

  return { subject, html };
}
