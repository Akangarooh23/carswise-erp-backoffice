/**
 * La cláusula del precio de salida, firmada aparte y después del taller.
 *
 * ## Qué es
 *
 * El mandato dice que PopCar gestiona la venta y lo que se cobra. Esto dice **a
 * qué precio sale el coche**, y es lo que le abre al cliente la única puerta que
 * tiene para irse sin pagar: aceptando por escrito el precio propuesto, a los
 * treinta días de publicarse el anuncio puede retirar el encargo sin coste. Sin aceptarlo, la
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
 * ## Y bloquea publicar
 *
 * Un anuncio nuestro sale con un precio que el dueño ha aceptado por escrito, y
 * con ése y no con otro. Antes esto no bloqueaba —«cambia lo que paga si se
 * retira, no si podemos venderlo»— y así se podía anunciar a 16.600 € el coche
 * de alguien que había firmado 17.900 €, o a un precio que nunca vio.
 *
 * Por eso no basta con que la haya firmado: tiene que haber firmado **el precio
 * que hay guardado**. Si después se acuerda otro, se le vuelve a mandar y hasta
 * que no lo firma el anuncio no se puede publicar, y el que ya está publicado
 * se queda con el precio que sí firmó.
 *
 * ## Lo que esto NO es
 *
 * **No es una firma electrónica**, igual que el mandato: es un documento que
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
    ADD COLUMN IF NOT EXISTS clausula_firmada_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clausula_precio      NUMERIC(12,2)`;

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

/** Lo que hace falta de la fila para saber si el precio firmado vale. */
export interface PrecioDeLaFila {
  clausula_enviada_at?: string | Date | null;
  clausula_firmada_at?: string | Date | null;
  /** El precio que decía el papel que se le mandó. */
  clausula_precio?: number | string | null;
  /** El precio acordado que hay guardado ahora en el encargo. */
  precio_referencia?: number | string | null;
}

const cifra = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const fecha = (v: unknown): boolean =>
  Boolean(v) && !Number.isNaN(new Date(v as string).getTime());

/**
 * Si el papel que se le mandó dice el precio que hay guardado.
 *
 * Se le mandó uno a 17.900 € y después se guardó 18.500 €: el papel ya no vale,
 * aunque lo tenga firmado. Hay que volver a mandárselo.
 */
export function elPapelDiceElPrecio(e: PrecioDeLaFila | null | undefined): boolean {
  if (!e) return false;
  const papel = cifra(e.clausula_precio);
  const guardado = cifra(e.precio_referencia);
  return papel !== null && papel === guardado;
}

/** Si ya se le ha mandado el papel **con el precio de ahora**. */
export function estaMandada(e: PrecioDeLaFila | null | undefined): boolean {
  return fecha(e?.clausula_enviada_at) && elPapelDiceElPrecio(e);
}

/**
 * Si ha firmado **el precio que hay guardado**.
 *
 * Firmar uno distinto no cuenta: es la diferencia entre «ha aceptado un
 * precio» y «ha aceptado éste».
 */
export function estaAceptada(e: PrecioDeLaFila | null | undefined): boolean {
  return fecha(e?.clausula_firmada_at) && elPapelDiceElPrecio(e);
}

const euros0 = (n: number) => `${miles(n)} €`;

/**
 * Por qué el precio no deja publicar. Cadena vacía cuando sí deja.
 *
 * Una frase para cada caso, porque cada uno se arregla de una manera: mandarlo,
 * esperar a que lo suba, o volver a mandarlo con el precio nuevo.
 */
export function porQueElPrecioNoDeja(e: PrecioDeLaFila | null | undefined): string {
  if (estaAceptada(e)) return '';
  const guardado = cifra(e?.precio_referencia);
  if (guardado === null) return 'Falta acordar el precio de salida';
  const papel = cifra(e?.clausula_precio);
  if (fecha(e?.clausula_firmada_at) && papel !== null && papel !== guardado) {
    return `Firmó el precio de ${euros0(papel)} y el guardado es ${euros0(guardado)}: hay que volver a mandárselo`;
  }
  if (estaMandada(e)) return `Se le ha mandado el precio de salida (${euros0(guardado)}) y todavía no lo ha subido firmado`;
  if (fecha(e?.clausula_enviada_at) && papel !== null) {
    return `Se le mandó el precio de ${euros0(papel)} y el guardado es ${euros0(guardado)}: hay que volver a mandárselo`;
  }
  return 'Falta mandarle el precio de salida para que lo firme';
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
      + `alguno pasados ${DIAS_HASTA_SALIR_GRATIS} días</b> desde la publicación del anuncio. Sin `
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
