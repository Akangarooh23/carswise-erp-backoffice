/**
 * El mandato de gestión de venta: lo único que nos deja cobrarle.
 *
 * Hasta ahora `firmado_at` era una fecha que se escribía sola al pulsar «Abrir
 * encargo». De esa fecha colgaban las dos cosas que le cobramos —los 299 € si
 * vendemos y los 150 € si se va— y detrás no había **nada**: ni documento, ni
 * constancia de que el cliente hubiera aceptado el trato. El día que uno
 * discutiera la factura, no habría qué enseñar.
 *
 * Aquí están las dos mitades de arreglarlo:
 *
 *   1. **El documento**, hecho con lo que ya está en el encargo, para que no se
 *      escriba a mano y no pueda decir un precio distinto del acordado.
 *   2. **La constancia**: cuándo lo firmó de verdad y cómo lo sabemos.
 *
 * ## La regla que sale de aquí
 *
 * **Sin mandato firmado no se le factura nada**, ni la gestión ni la
 * cancelación. Es lo contrario de lo prudente en las demás reglas de este flujo
 * —donde ante la duda se cobra—, y a propósito: en las demás la duda es sobre
 * *cuánto*, y aquí es sobre *si hay trato*. Cobrar sin trato no se corrige
 * luego.
 *
 * ## Lo que esto NO es
 *
 * **No es una firma electrónica.** No hay certificado ni sello de tiempo: lo que
 * hay es un documento que el cliente firma y alguien de aquí apunta cuándo y
 * cómo llegó firmado. Es lo mismo que se hace con el resto de papeles del coche.
 * Si algún día hace falta firma cualificada, esto es donde se enchufa.
 *
 * El **porqué** de todo el flujo está en el manual de ejecución «Flujo
 * particular — Nosotros lo vendemos por ti».
 */
import { DIAS_HASTA_SALIR_GRATIS, FEE_DE_GESTION, FEE_DE_CANCELACION } from './encargo-de-venta.js';
import { LO_QUE_CUESTA as LO_QUE_CUESTA_EL_TALLER } from './revision-del-taller.js';

/**
 * Cómo nos consta que lo firmó.
 *
 * Son las tres maneras en que llega de verdad, no una taxonomía: en la mesa, un
 * papel firmado que manda por foto o por correo, o un correo suyo diciendo que
 * acepta. Lo que importa no es cuál sea, sino que haya **una** y que quede
 * escrito cuál.
 */
export const COMO_SE_FIRMA = ['en_persona', 'papel_firmado', 'por_correo'] as const;
export type ComoSeFirma = (typeof COMO_SE_FIRMA)[number];

export function esUnaFirma(v: unknown): v is ComoSeFirma {
  return (COMO_SE_FIRMA as readonly string[]).includes(String(v ?? '').trim());
}

/** Cómo se dice en la pantalla. */
export const COMO_LO_DECIMOS: Record<ComoSeFirma, string> = {
  en_persona: 'Lo firmó delante de nosotros',
  papel_firmado: 'Nos ha mandado el papel firmado',
  por_correo: 'Lo ha aceptado por correo',
};

/** La serie de los mandatos. Un número por encargo, para poder referirlo. */
export const SERIE = 'PC-MAND';

export interface ConFirma {
  firmado_at?: string | Date | null;
  firma_como?: unknown;
}

/**
 * Si el mandato está firmado.
 *
 * Hacen falta las dos cosas: una fecha que se pueda leer **y** cómo nos consta.
 * Solo con la fecha estaríamos donde estábamos —un dato que el ERP se escribe a
 * sí mismo—, y es justo lo que se quería quitar.
 */
export function estaFirmado(e: ConFirma | null | undefined): boolean {
  if (!e) return false;
  if (!esUnaFirma(e.firma_como)) return false;
  const d = e.firmado_at ? new Date(e.firmado_at) : null;
  return Boolean(d && !Number.isNaN(d.getTime()));
}

/**
 * Y por qué no, para quien tiene que llamar al cliente.
 *
 * Cadena vacía cuando sí. Como en las demás puertas: al otro lado hay alguien
 * explicándolo por teléfono, y «false» no se explica.
 */
export function porQueNoEstaFirmado(e: ConFirma | null | undefined): string {
  if (!e) return 'No hay encargo';
  const hayFecha = Boolean(e.firmado_at && !Number.isNaN(new Date(e.firmado_at).getTime()));
  if (!hayFecha && !esUnaFirma(e.firma_como)) return 'Todavía no ha firmado el mandato';
  if (!hayFecha) return 'Falta la fecha en la que lo firmó';
  if (!esUnaFirma(e.firma_como)) return 'Falta decir cómo nos consta que lo firmó';
  return '';
}

/**
 * Si se le puede facturar algo.
 *
 * Es `estaFirmado` con otro nombre, y el nombre es el que importa: quien lea
 * `if (!sePuedeCobrar(e))` en el cierre no tiene que ir a buscar qué tiene que
 * ver una firma con una factura.
 */
export function sePuedeCobrar(e: ConFirma | null | undefined): boolean {
  return estaFirmado(e);
}

// ── El documento ──────────────────────────────────────────────────────────────

export interface DatosDelMandato {
  mandato_id: string;
  cliente_nombre: string;
  cliente_email: string;
  /** Su DNI, si se lo han pedido ya. Aquí todavía no hace falta. */
  cliente_dni?: string | null;
  matricula: string;
  marca: string;
  modelo: string;
  ano: number | null;
  kilometros: number | null;
  /** El precio de salida acordado con él, si lo hay. */
  precio: number | null;
  /** Si firma también la cláusula del precio. Cambia una condición del texto. */
  acepto_el_precio: boolean;
  fecha: Date;
}

const escapa = (t: unknown) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Los miles con punto, a mano.
 *
 * `toLocaleString('es-ES')` depende del ICU que lleve el Node que ejecute esto:
 * en unas máquinas devuelve `8.500` y en otras `8500`. En una pantalla da
 * igual; en un contrato no, porque el mismo mandato se imprimiría distinto
 * según dónde se generara y no habría manera de saber cuál firmó el cliente.
 */
export function miles(n: number): string {
  const entero = Math.round(Math.abs(n)).toString();
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + conPuntos;
}

const euros = (n: number) => `${miles(n)} €`;

/**
 * Y la fecha, también a mano y por lo mismo.
 *
 * Es la fecha del contrato: tiene que leerse igual en la copia del cliente y en
 * la nuestra.
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const dia = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const P = (texto: string, tam = '11pt', color = '#1c1917') =>
  `<p style="margin:0 0 8pt;font-size:${tam};line-height:1.55;color:${color}">${texto}</p>`;

/**
 * Las condiciones, numeradas.
 *
 * Van en una función y no en una constante porque tres de ellas cambian con el
 * encargo —el precio, si firmó la cláusula, la matrícula—. Escritas a mano en
 * un documento, esas tres son exactamente las que acabarían diciendo una cosa
 * distinta de lo que hay en el ERP.
 */
export function lasCondiciones(d: DatosDelMandato): string[] {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ') || 'el vehículo';
  return [
    `PopCar gestiona la venta de ${coche}, matrícula ${d.matricula || '—'}, por cuenta de su `
      + `titular. <b>PopCar no compra el vehículo</b> ni en este acto ni en ningún momento `
      + `posterior: la venta se produce entre el titular y el comprador que se encuentre.`,
    'El vehículo permanece en poder de su titular durante todo el encargo. Es él quien lo '
      + 'enseña a los interesados, en las horas que él mismo indica.',
    d.precio
      ? `El precio de salida acordado es de <b>${euros(d.precio)}</b>. Cualquier cambio se `
        + 'acuerda con el titular antes de aplicarlo.'
      : 'El precio de salida se acordará con el titular antes de publicar el anuncio.',
    `PopCar se encarga del anuncio, de atender las llamadas, de filtrar a los interesados y `
      + `de organizar las visitas. Encarga también una <b>revisión mecánica</b> del vehículo `
      + `en un taller de su red, cuyo coste de ${euros(LO_QUE_CUESTA_EL_TALLER)} asume PopCar, `
      + `venda el vehículo o no.`,
    `<b>Si el vehículo se vende a través de PopCar</b>, el titular abona ${euros(FEE_DE_GESTION)} `
      + `en concepto de gestión integral de la venta, IVA incluido. No hay ningún pago por `
      + `adelantado: si no se vende, no se paga esta cantidad.`,
    d.acepto_el_precio
      ? `<b>Si el titular retira el encargo antes de ${DIAS_HASTA_SALIR_GRATIS} días</b> desde `
        + `la firma, abona ${euros(FEE_DE_CANCELACION)} en concepto de cancelación. Pasados `
        + `esos ${DIAS_HASTA_SALIR_GRATIS} días puede retirarlo <b>sin coste alguno</b>.`
      : `<b>Si el titular retira el encargo</b> sin que el vehículo se haya vendido, abona `
        + `${euros(FEE_DE_CANCELACION)} en concepto de cancelación. Esta cantidad deja de ser `
        + `exigible a los ${DIAS_HASTA_SALIR_GRATIS} días si el titular acepta por escrito el `
        + `precio de salida propuesto por PopCar.`,
    `Este encargo <b>no tiene fecha de vencimiento</b>: se mantiene hasta que el vehículo se `
      + `vende o hasta que el titular lo retira. El titular puede retirarlo en cualquier `
      + `momento comunicándolo a PopCar.`,
    'El titular declara ser el titular registral del vehículo y estar facultado para venderlo, '
      + 'y que el vehículo está libre de cargas, reservas de dominio y embargos.',
  ];
}

/**
 * El documento entero.
 *
 * Es HTML con el tipo de Word, igual que los manuales y la guía del cliente:
 * Word lo abre como suyo, se imprime bien y se puede firmar a mano. Un `.docx`
 * de verdad pediría una biblioteca entera para lo mismo.
 */
export function elMandato(d: DatosDelMandato): string {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ');
  const ficha: [string, string][] = [
    ['Nº de mandato', d.mandato_id],
    ['Titular', d.cliente_nombre || d.cliente_email || '—'],
    ...(d.cliente_dni ? ([['DNI', d.cliente_dni]] as [string, string][]) : []),
    ['Correo', d.cliente_email || '—'],
    ['Vehículo', [coche, d.ano ? `(${d.ano})` : ''].filter(Boolean).join(' ') || '—'],
    ['Matrícula', d.matricula || '—'],
    ...(d.kilometros ? ([['Kilómetros', `${d.kilometros.toLocaleString('es-ES')} km`]] as [string, string][]) : []),
    ['Fecha', dia(d.fecha)],
  ];

  const filas = ficha.map(([k, v]) => `
    <tr>
      <td style="padding:3pt 10pt 3pt 0;font-size:10pt;color:#57534e;white-space:nowrap">${escapa(k)}</td>
      <td style="padding:3pt 0;font-size:10pt;color:#1c1917"><b>${escapa(v)}</b></td>
    </tr>`).join('');

  const condiciones = lasCondiciones(d).map((c, i) => `
    <p style="margin:0 0 9pt;font-size:10.5pt;line-height:1.55;color:#1c1917">
      <b>${i + 1}.</b> ${c}
    </p>`).join('');

  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
    + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    + `<head><meta charset="utf-8"><title>Mandato de gestión de venta ${escapa(d.mandato_id)}</title>`
    + '<style>@page{size:A4;margin:2cm} body{font-family:Calibri,sans-serif;color:#1c1917}</style>'
    + '</head><body>'
    + '<h1 style="font-size:19pt;margin:0 0 4pt">Mandato de gestión de venta</h1>'
    + P('PopCar gestiona la venta de tu coche. Tú lo conservas y lo enseñas; de lo demás '
      + 'nos encargamos nosotros.', '11pt', '#57534e')
    + `<table style="margin:14pt 0 4pt;border-collapse:collapse">${filas}</table>`
    + '<hr style="border:none;border-top:0.5pt solid #e7e5e4;margin:14pt 0">'
    + '<h2 style="font-size:12.5pt;margin:0 0 10pt">Condiciones</h2>'
    + condiciones
    + '<hr style="border:none;border-top:0.5pt solid #e7e5e4;margin:16pt 0">'
    + P('El titular declara haber leído y aceptar las condiciones anteriores.', '10.5pt')
    + '<table style="margin-top:26pt;width:100%"><tr>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">Firma del titular<br><br><br>'
    + '_______________________________</td>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">Por PopCar<br><br><br>'
    + '_______________________________</td>'
    + '</tr></table>'
    + '</body></html>';
}

/** Cómo se llama el fichero que se descarga. */
export function comoSeLlamaElFichero(mandatoId: string): string {
  return `mandato-${String(mandatoId || 'sin-numero').toLowerCase()}.doc`;
}
