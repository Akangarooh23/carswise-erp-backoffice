/**
 * Lo que va adjunto, dicho en la pantalla igual que en el correo.
 *
 * Es el espejo de `apps/api/src/lib/lo-que-va-adjunto.ts`. Está duplicado
 * porque los dos lados se compilan por separado, y existe porque la vista
 * previa tiene que enseñar **el correo que va a salir**: si la frase que anuncia
 * los adjuntos solo apareciera al mandarlo, revisar dejaría de servir para lo
 * único que sirve.
 *
 * Lo que hay que sostener es que **dicen lo mismo**. De eso se ocupa
 * `lo-que-va-adjunto.test.ts`, que compara las dos.
 */

/**
 * En qué idioma está el correo al que se le pega la línea.
 *
 * `de` sale en alemán con su inglés debajo, que es como van los correos al
 * vendedor. `en` es inglés a secas: el transportista puede ser polaco o
 * checo —la mitad de los que hacen esta ruta lo son— y ahí el alemán no
 * ayuda y el español menos.
 */
export type IdiomaDelCorreo = 'de' | 'es' | 'en';

/** Un papel que se ha marcado para que vaya. */
export interface PapelAdjunto {
  /** El nombre del fichero, tal cual lo verá en su buzón. */
  nombre: string;
  /** Qué es, de la lista de papeles que se esperan. Puede no tenerlo. */
  papel?: string | null;
}

/**
 * Cómo se llama cada papel nuestro en alemán.
 *
 * Solo los que se le mandan a un alemán. Los que no estén salen con su nombre
 * en español, que es peor que traducido pero mejor que omitido: el fichero va
 * igual y el que lee tiene el paréntesis para identificarlo.
 */
const EN_ALEMAN: Record<string, string> = {
  'Ficha del vehículo (parte I)': 'Zulassungsbescheinigung Teil I',
  'Ficha del vehículo (parte II)': 'Zulassungsbescheinigung Teil II',
  'COC (certificado de conformidad)': 'COC (Übereinstimmungsbescheinigung)',
  'Factura del vendedor alemán': 'Kaufrechnung',
  'Contrato de compraventa': 'Kaufvertrag',
  'Justificante de baja en Alemania': 'Abmeldebescheinigung',
  'Permiso de circulación': 'Zulassungsbescheinigung',
  'Ficha técnica': 'Fahrzeugschein',
  Factura: 'Rechnung',
  'Informe de inspección': 'Prüfbericht',
};

/** Y en inglés, para la segunda mitad de los correos que van en dos idiomas. */
const EN_INGLES: Record<string, string> = {
  'Ficha del vehículo (parte I)': 'registration part I',
  'Ficha del vehículo (parte II)': 'registration part II',
  'COC (certificado de conformidad)': 'certificate of conformity (COC)',
  'Factura del vendedor alemán': 'purchase invoice',
  'Contrato de compraventa': 'sales contract',
  'Justificante de baja en Alemania': 'deregistration certificate',
  'Permiso de circulación': 'registration certificate',
  'Ficha técnica': 'technical data sheet',
  Factura: 'invoice',
  'Informe de inspección': 'inspection report',
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Cómo se nombra un papel en un idioma.
 *
 * Sin `papel` queda el nombre del fichero solo: es lo único que se sabe de él,
 * y decir «un documento» sería decir menos.
 */
export function comoSeLlama(p: PapelAdjunto, idioma: IdiomaDelCorreo): string {
  const papel = String(p?.papel ?? '').trim();
  const nombre = String(p?.nombre ?? '').trim();
  if (!papel) return nombre;
  const traducido =
    idioma === 'de' ? (EN_ALEMAN[papel] ?? papel)
    : idioma === 'en' ? (EN_INGLES[papel] ?? papel)
    : papel;
  return nombre ? `${traducido} (${nombre})` : traducido;
}

/** Lo mismo en inglés, para el bloque de abajo de los correos alemanes. */
export function comoSeLlamaEnIngles(p: PapelAdjunto): string {
  const papel = String(p?.papel ?? '').trim();
  const nombre = String(p?.nombre ?? '').trim();
  if (!papel) return nombre;
  const traducido = EN_INGLES[papel] ?? papel;
  return nombre ? `${traducido} (${nombre})` : traducido;
}

/**
 * La línea que se pega al final del correo.
 *
 * Vacía si no va nada: un correo que dice «adjuntos: ninguno» es ruido, y peor,
 * hace dudar de si se ha perdido algo por el camino.
 */
export function lineaDeAdjuntos(papeles: PapelAdjunto[], idioma: IdiomaDelCorreo): string {
  const utiles = (papeles ?? []).filter((p) => p && String(p.nombre ?? '').trim());
  if (!utiles.length) return '';

  const estilo = 'margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#2A2A28';

  if (idioma === 'de') {
    const de = utiles.map((p) => esc(comoSeLlama(p, 'de'))).join(', ');
    const en = utiles.map((p) => esc(comoSeLlamaEnIngles(p))).join(', ');
    return (
      `<p style="${estilo}"><strong>Anhang:</strong> ${de}</p>` +
      `<p style="${estilo};color:#5E5E59"><em>Attached: ${en}</em></p>`
    );
  }

  if (idioma === 'en') {
    const en = utiles.map((p) => esc(comoSeLlamaEnIngles(p))).join(', ');
    return `<p style="${estilo}"><strong>Attached:</strong> ${en}</p>`;
  }

  const es = utiles.map((p) => esc(comoSeLlama(p, 'es'))).join(', ');
  return `<p style="${estilo}"><strong>Se adjunta:</strong> ${es}</p>`;
}
