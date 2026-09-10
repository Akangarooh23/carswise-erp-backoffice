/**
 * El contrato de compraventa entre el dueño del coche y quien se lo compra.
 *
 * En el mandato que el cliente firma pone que **hacemos el contrato y la
 * transferencia**. La transferencia ya sale sola al cerrar el encargo. El
 * contrato no existía: se prometía por escrito y no lo generaba nadie.
 *
 * ## Aquí no somos parte
 *
 * El coche va del particular al comprador. Nosotros no vendemos nada: lo
 * redactamos, y eso hay que decirlo dentro del papel. Es la misma disciplina
 * que en el mandato con «PopCar no compra el vehículo», y por la misma razón:
 * es la frase que más fácil sería dar por supuesta, y el día que el documento
 * dijera otra cosa estaríamos firmando otro negocio.
 *
 * ## Los huecos son a propósito
 *
 * Faltan datos que el ERP no tiene y que no puede inventarse: los DNI, los
 * domicilios y el bastidor. Se piden al cerrar —que es cuando existen— pero
 * **si falta alguno el documento sale igual, con la línea en blanco para
 * rellenar a mano**.
 *
 * Bloquear el cierre por un DNI sería peor: cerrar emite una factura, y una
 * factura no puede quedarse esperando a que alguien encuentre un carné. Un
 * hueco se rellena con un bolígrafo; un cierre que no se puede hacer se queda
 * abierto para siempre.
 *
 * ## Lo que esto no es
 *
 * No es asesoramiento legal ni un modelo revisado por un abogado. Es el
 * documento que ya se hacía a mano, hecho siempre igual y con los datos que
 * tenemos. Si alguien de fuera tiene que repasar la redacción, este es el sitio.
 */

/** La serie de los contratos. Un número por venta, para poder referirla. */
export const SERIE = 'PC-CV';

/** Lo que hay que rellenar a mano cuando no lo sabemos. */
export const HUECO = '_______________________';

export interface DatosDelContrato {
  contrato_id: string;
  /** Quien vende: el dueño del coche. */
  vendedor_nombre: string;
  vendedor_dni: string;
  vendedor_domicilio: string;
  /** Quien compra. Sale de la visita que acabó en venta, si la hubo. */
  comprador_nombre: string;
  comprador_dni: string;
  comprador_domicilio: string;
  matricula: string;
  bastidor: string;
  marca: string;
  modelo: string;
  ano: number | null;
  kilometros: number | null;
  /** El precio de la venta, no el de salida del anuncio. */
  precio: number | null;
  fecha: Date;
}

const escapa = (t: unknown) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Lo que no sabemos sale como una raya, no como un vacío.
 *
 * Un campo en blanco se pasa por alto al imprimir; una raya se ve y se rellena.
 */
const oHueco = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s || HUECO;
};

/** Los miles con punto, a mano y no por el ICU: es un contrato. */
export function miles(n: number): string {
  const entero = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + entero;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const dia = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

/**
 * Qué falta por rellenar, dicho para la pantalla.
 *
 * No bloquea nada: es lo que se le enseña a quien va a imprimirlo, para que
 * sepa qué va a tener que escribir a mano antes de dárselo a firmar.
 */
export function loQueFaltaDelContrato(d: Partial<DatosDelContrato>): string[] {
  const falta: string[] = [];
  if (!String(d.vendedor_dni ?? '').trim()) falta.push('el DNI del vendedor');
  if (!String(d.comprador_nombre ?? '').trim()) falta.push('el nombre del comprador');
  if (!String(d.comprador_dni ?? '').trim()) falta.push('el DNI del comprador');
  if (!Number(d.precio ?? 0)) falta.push('el precio de venta');
  /*
   * El bastidor va aparte y al final: el IDCar no lo guarda, así que falta
   * siempre. Decirlo con los demás haría que la lista pareciera un error del
   * ERP en vez de un dato que hay que copiar de la ficha técnica.
   */
  if (!String(d.bastidor ?? '').trim()) falta.push('el bastidor, que está en la ficha técnica');
  return falta;
}

/** Si se puede dar a firmar tal cual sale. */
export function estaCompleto(d: Partial<DatosDelContrato>): boolean {
  return loQueFaltaDelContrato(d).length === 0;
}

/**
 * Las cláusulas.
 *
 * En una función y no en una constante porque tres cambian con la venta: el
 * precio, el coche y quién es cada uno. Escritas a mano en un documento, esas
 * tres son las que acabarían diciendo algo distinto de lo que hay en el ERP.
 */
export function lasClausulas(d: DatosDelContrato): string[] {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ') || 'el vehículo';
  return [
    `El vendedor transmite al comprador la propiedad del vehículo <b>${escapa(coche)}</b>, `
      + `matrícula <b>${escapa(oHueco(d.matricula))}</b>, número de bastidor `
      + `<b>${escapa(oHueco(d.bastidor))}</b>`
      + `${d.kilometros ? `, con ${miles(d.kilometros)} km` : ''}.`,
    d.precio
      ? `El precio acordado es de <b>${miles(d.precio)} €</b>, que el comprador abona en este `
        + `acto, sirviendo el presente documento como carta de pago.`
      : `El precio acordado es de <b>${HUECO} €</b>, que el comprador abona en este acto, `
        + `sirviendo el presente documento como carta de pago.`,
    'El vendedor declara que el vehículo es de su propiedad y que se encuentra libre de '
      + 'cargas, gravámenes, reservas de dominio y embargos, y que está al corriente del '
      + 'impuesto de circulación.',
    'El comprador recibe el vehículo en el estado en que se encuentra, que declara conocer '
      + 'y aceptar, habiendo tenido ocasión de examinarlo antes de la firma.',
    'Los gastos e impuestos derivados del cambio de titularidad son por cuenta del comprador, '
      + 'salvo pacto en contrario.',
    'Desde este momento el vehículo queda bajo la responsabilidad del comprador a todos los '
      + 'efectos, incluidas multas y sanciones posteriores a la firma.',
    /*
     * La frase que dice que no somos parte.
     *
     * Va la última porque no es una condición entre ellos, es una aclaración
     * sobre nosotros. Pero va, y va dentro del contrato: si solo estuviera en
     * el mandato, el comprador —que no ha firmado ningún mandato— no tendría
     * forma de saber a quién le ha comprado el coche.
     */
    'PopCar ha intervenido únicamente como gestor de la venta por encargo del vendedor. '
      + 'No es parte de esta compraventa ni adquiere el vehículo en ningún momento.',
  ];
}

/**
 * El documento entero.
 *
 * HTML con el tipo de Word, igual que el mandato y los manuales: se abre, se
 * imprime bien y se puede rellenar y firmar a mano.
 */
export function elContrato(d: DatosDelContrato): string {
  const coche = [d.marca, d.modelo].filter(Boolean).join(' ');

  const parte = (titulo: string, nombre: string, dni: string, domicilio: string) => `
    <p style="margin:0 0 3pt;font-size:9.5pt;font-weight:bold;color:#8a6d00;
              letter-spacing:1pt">${escapa(titulo)}</p>
    <table style="margin:0 0 14pt;border-collapse:collapse">
      ${[
        ['Nombre', oHueco(nombre)],
        ['DNI / NIE', oHueco(dni)],
        ['Domicilio', oHueco(domicilio)],
      ].map(([k, v]) => `
        <tr>
          <td style="padding:3pt 10pt 3pt 0;font-size:10pt;color:#57534e;white-space:nowrap">${escapa(k)}</td>
          <td style="padding:3pt 0;font-size:10pt;color:#1c1917">${escapa(v)}</td>
        </tr>`).join('')}
    </table>`;

  const clausulas = lasClausulas(d).map((c, i) => `
    <p style="margin:0 0 9pt;font-size:10.5pt;line-height:1.55;color:#1c1917">
      <b>${i + 1}.</b> ${c}
    </p>`).join('');

  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
    + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    + `<head><meta charset="utf-8"><title>Contrato de compraventa ${escapa(d.contrato_id)}</title>`
    + '<style>@page{size:A4;margin:2cm} body{font-family:Calibri,sans-serif;color:#1c1917}</style>'
    + '</head><body>'
    + '<h1 style="font-size:19pt;margin:0 0 4pt">Contrato de compraventa de vehículo</h1>'
    + `<p style="margin:0 0 16pt;font-size:10pt;color:#57534e">`
    + `Nº ${escapa(d.contrato_id)} · ${escapa(dia(d.fecha))}</p>`
    + parte('VENDE', d.vendedor_nombre, d.vendedor_dni, d.vendedor_domicilio)
    + parte('COMPRA', d.comprador_nombre, d.comprador_dni, d.comprador_domicilio)
    + '<hr style="border:none;border-top:0.5pt solid #e7e5e4;margin:6pt 0 14pt">'
    + `<p style="margin:0 0 12pt;font-size:10.5pt;color:#1c1917">Ambas partes acuerdan la `
    + `compraventa del vehículo ${escapa(coche || 'indicado')}`
    + `${d.ano ? ` (${d.ano})` : ''} en las siguientes condiciones:</p>`
    + clausulas
    + '<hr style="border:none;border-top:0.5pt solid #e7e5e4;margin:16pt 0">'
    + '<p style="margin:0 0 8pt;font-size:10.5pt">Y en prueba de conformidad, ambas partes '
    + 'firman el presente documento por duplicado.</p>'
    + '<table style="margin-top:26pt;width:100%"><tr>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">El vendedor<br><br><br>'
    + '_______________________________</td>'
    + '<td style="width:50%;font-size:10pt;color:#57534e">El comprador<br><br><br>'
    + '_______________________________</td>'
    + '</tr></table>'
    + '</body></html>';
}

/** Cómo se llama el fichero que se descarga. */
export function comoSeLlamaElFichero(contratoId: string): string {
  return `contrato-${String(contratoId || 'sin-numero').toLowerCase()}.doc`;
}
