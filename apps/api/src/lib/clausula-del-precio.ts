/**
 * La cláusula del precio de salida, firmada aparte y después del taller.
 *
 * ## Qué es
 *
 * El mandato dice que PopCar gestiona la venta y lo que se cobra. Esto dice **a
 * qué precio sale el coche**, y es lo que le abre al cliente la única puerta que
 * tiene para irse sin pagar: aceptando por escrito el precio propuesto, a los
 * treinta días puede retirar el encargo sin coste. Sin aceptarlo, la
 * cancelación son 150 € desde el día uno y para siempre.
 *
 * Así que esto no es papeleo nuestro: es el papel que **le conviene a él**. Por
 * eso se le manda y no se da por hecho con una casilla que marcamos nosotros.
 *
 * ## Por qué va después del taller
 *
 * Porque el precio se fija con lo que diga el taller. Un coche que sale «con
 * reparos» no vale lo mismo que uno limpio, y pedirle que acepte un precio antes
 * de saberlo es pedirle que acepte una cifra que vamos a tener que cambiar — y
 * entonces lo que firmó ya no es lo que estamos anunciando.
 *
 * El orden completo es: mandato → papeles y fotos → taller → precio → anuncio.
 *
 * ## Lo que esto NO es
 *
 * **No bloquea publicar.** Se puede anunciar el coche de quien no la ha firmado:
 * lo que cambia es lo que paga si se retira, no si podemos venderlo. Son dos
 * cosas distintas y meterlas en la misma puerta dejaría fuera a los que Juan
 * puso dentro a propósito.
 *
 * **Y no es una firma electrónica**, igual que el mandato: es un documento que
 * el cliente firma y que queda guardado con la fecha en que llegó.
 */
import { DIAS_HASTA_SALIR_GRATIS, FEE_DE_CANCELACION, FEE_DE_GESTION } from './encargo-de-venta.js';
import { miles } from './mandato-de-venta.js';

/** La serie. Un número por encargo, para poder referirla en una llamada. */
export const SERIE = 'PC-PRECIO';

/** Cómo se guarda el papel que sube él, para que el ERP lo enseñe en su ficha. */
export const PAPEL_FIRMADO = 'clausula_precio_firmada';

/**
 * Lo que hace falta guardar, encima de lo que ya había.
 *
 * `acepto_el_precio` existía y era una casilla que marcábamos nosotros: eso es
 * exactamente lo que el mandato vino a quitar para la firma, y aquí estaba
 * pasando lo mismo. Ahora esa casilla la enciende el documento firmado.
 */
export const ENSURE_COLUMNAS = `
  ALTER TABLE erp_encargos_venta
    ADD COLUMN IF NOT EXISTS clausula_id          TEXT,
    ADD COLUMN IF NOT EXISTS clausula_enviada_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clausula_firmada_at  TIMESTAMPTZ`;

export interface EstadoDeLaClausula {
  /** Si hay mandato firmado. Sin trato no hay precio que acordar. */
  mandato_firmado: boolean;
  /** Si la revisión del taller está hecha. */
  taller_hecho: boolean;
  /** Y si el taller cerró la puerta: entonces no hay precio que acordar. */
  taller_lo_tumbo?: boolean;
  /** El precio de salida acordado, o null si todavía no hay. */
  precio: number | null;
  /** Cuándo la firmó, si la firmó. */
  firmada_at?: string | Date | null;
}

/**
 * Por qué no se le puede pedir todavía que acepte el precio.
 *
 * Cadena vacía cuando sí. Devuelve la frase y no un booleano porque al otro lado
 * hay alguien que tiene que saber qué falta antes de llamarle.
 */
export function porQueNoSeLePuedePedir(e: EstadoDeLaClausula | null | undefined): string {
  if (!e) return 'No hay encargo';
  if (!e.mandato_firmado) return 'Antes tiene que firmar el mandato';
  /*
   * El taller primero, y no es una formalidad.
   *
   * El precio se fija con lo que diga. Un coche que sale «con reparos» no vale
   * lo mismo que uno limpio: pedirle que acepte una cifra antes de saberlo es
   * pedirle que acepte una que vamos a tener que cambiar.
   */
  if (!e.taller_hecho) return 'Antes tiene que pasar por el taller: el precio se fija con lo que diga';
  /*
   * Y si el taller lo tumbó, no hay precio que acordar.
   *
   * Ese coche no se va a publicar. Mandarle un papel para que acepte el precio
   * de salida de un anuncio que no va a existir es peor que no mandarle nada: le
   * dice que seguimos adelante justo cuando hay que llamarle para contarle que
   * no.
   */
  if (e.taller_lo_tumbo) return 'El taller no deja vender este coche: no hay precio que acordar';
  if (!e.precio || e.precio <= 0) return 'Falta acordar el precio de salida';
  return '';
}

/** Si ya la ha firmado. */
export function estaAceptada(e: { clausula_firmada_at?: string | Date | null } | null | undefined): boolean {
  if (!e?.clausula_firmada_at) return false;
  return !Number.isNaN(new Date(e.clausula_firmada_at).getTime());
}

export interface DatosDeLaClausula {
  clausula_id: string;
  cliente_nombre: string;
  cliente_email: string;
  matricula: string;
  marca: string;
  modelo: string;
  precio: number;
  fecha: Date;
}

const escapa = (t: unknown) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const euros = (n: number) => `${miles(n)} €`;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const dia = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const P = (texto: string, tam = '11pt', color = '#1c1917') =>
  `<p style="margin:0 0 8pt;font-size:${tam};line-height:1.55;color:${color}">${texto}</p>`;

/**
 * Lo que dice el papel.
 *
 * Tres cosas y en este orden: qué coche, a qué precio sale, y qué gana él
 * firmándolo. La tercera va **dentro** y no en el correo: quien firma tiene que
 * poder leer en el propio documento qué está aceptando, sin volver a la bandeja
 * de entrada.
 */
export function loQueDice(d: DatosDeLaClausula): string[] {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ') || 'el vehículo';
  return [
    `El titular y PopCar acuerdan que <b>${escapa(coche)}</b>, matrícula `
      + `${escapa(d.matricula) || '—'}, sale a la venta por un precio de `
      + `<b>${euros(d.precio)}</b>.`,
    'Este precio se ha propuesto a partir del valor de mercado del vehículo y de la '
      + 'revisión mecánica realizada en un taller de la red de PopCar. Cualquier cambio '
      + 'posterior se acuerda con el titular antes de aplicarlo.',
    `Al aceptar este precio por escrito, <b>el titular puede retirar el encargo sin coste `
      + `alguno pasados ${DIAS_HASTA_SALIR_GRATIS} días</b> desde la firma del mandato. Sin `
      + `esta aceptación, la retirada del encargo conlleva ${euros(FEE_DE_CANCELACION)} en `
      + `concepto de cancelación en cualquier momento.`,
    `Esta aceptación no modifica ninguna otra condición del mandato de gestión de venta, `
      + `y en particular no supone pago alguno por adelantado: los ${euros(FEE_DE_GESTION)} `
      + `de gestión solo se abonan si el vehículo se vende a través de PopCar.`,
  ];
}

/** El documento, para imprimirlo, firmarlo y devolverlo. */
export function laClausula(d: DatosDeLaClausula): string {
  const puntos = loQueDice(d).map((c, i) => `
    <tr>
      <td style="width:22pt;vertical-align:top;font-size:11pt;color:#78716c">${i + 1}.</td>
      <td style="font-size:11pt;line-height:1.55;color:#1c1917">${c}</td>
    </tr>`).join('');

  return '<html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:Calibri,Arial,sans-serif;margin:40pt 46pt;color:#1c1917">'
    + P(`<b style="font-size:15pt">Aceptación del precio de salida</b>`, '15pt')
    + P(`${escapa(d.clausula_id)} · ${dia(d.fecha)}`, '10pt', '#78716c')
    + P(`<b>Titular:</b> ${escapa(d.cliente_nombre) || '—'} (${escapa(d.cliente_email) || '—'})`)
    + `<table style="border-collapse:collapse;margin:14pt 0">${puntos}</table>`
    + P('Firmando este documento el titular acepta el precio de salida indicado.', '10pt', '#57534e')
    + '<table style="width:100%;margin-top:26pt"><tr>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">El titular<br><br><br>'
    + '_______________________________</td>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">Por PopCar<br><br><br>'
    + '_______________________________</td>'
    + '</tr></table>'
    + '</body></html>';
}

/** Cómo se llama el fichero que se descarga. */
export function comoSeLlamaElFichero(clausulaId: string): string {
  return `precio-${String(clausulaId || 'sin-numero').toLowerCase()}.doc`;
}
