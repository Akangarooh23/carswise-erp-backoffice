/**
 * Cómo se llama un papel cuando ya está guardado.
 *
 * ## Por qué no vale el nombre del fichero
 *
 * Lo que manda el taller, el perito o la ITV se llama `02384u723.pdf`,
 * `scan_0007.jpg` o `Peritaci%C3%B3n%20Oficial.pdf`. En la lista de un coche
 * salen cinco papeles así y no se sabe cuál es cuál sin abrirlos uno a uno.
 *
 * Con el papel y la matrícula delante se lee de un vistazo:
 * «Informe de historial (Carfax) · 5228HNS».
 *
 * Es la misma regla que PopCar aplica a lo que sube el cliente —ahí vive en
 * `lib/como-se-llama-el-papel.js`— y que aquí faltaba: un documento subido
 * desde el ERP se quedaba con el nombre que trajera. Son dos repositorios, así
 * que es una copia; lo que se copia es la regla, que es corta y estable, y no
 * la implementación entera.
 *
 * ## La extensión se respeta
 *
 * Es lo que hace que el navegador sepa abrirlo. Renombrar a secas convierte un
 * PDF en un fichero sin tipo que hay que descargar y adivinar.
 *
 * ## Y el original no se pierde
 *
 * Se guarda detrás, tras un guion largo, **cuando aporta algo**. El día que
 * alguien discuta un papel —«os mandé el informe de octubre»— se identifica
 * por el nombre con el que lo tenía él, y ese nombre no vive en ningún otro
 * sitio.
 */

/** Entre lo que ponemos nosotros y lo que traía el fichero. */
const SEPARADOR = ' — ';

/**
 * Los papeles que se guardan con su clave de máquina, no con su nombre.
 *
 * El `papel` de un documento viene de dos sitios. Desde el ERP lo elige una
 * persona en un desplegable, y ya es legible: «Informe de la revisión». Desde
 * PopCar lo pone el código al recibir lo que sube el cliente, y es una clave:
 * `mandato_firmado`.
 *
 * Sin traducirlas, un mandato se llamaría «mandato_firmado · 5228HNS», que es
 * exactamente lo que esto venía a evitar. Lo descubrí al probar el renombrado
 * sobre los cuatro documentos que ya había: tres salían peor de lo que
 * estaban.
 */
const COMO_SE_LLAMAN: Record<string, string> = {
  mandato_firmado: 'Mandato firmado',
  clausula_precio_firmada: 'Precio de salida firmado',
  technical_sheet: 'Ficha técnica',
  circulation_permit: 'Permiso de circulación',
  itv: 'ITV',
  insurance: 'Seguro',
  maintenance: 'Factura de mantenimiento',
  document: 'Documento',
};

/** El papel, dicho como lo leería una persona. */
export function comoSeDice(papel: unknown): string {
  const p = texto(papel);
  return COMO_SE_LLAMAN[p] ?? p;
}

const texto = (v: unknown) => String(v ?? '').trim();

/**
 * El nombre tal y como lo escribió una persona.
 *
 * Los navegadores guardan lo descargado con el nombre codificado:
 * `Peritaci%C3%B3n%20Oficial.pdf`. Eso llega así desde el disco y, sin
 * deshacerlo, se queda así para siempre en la lista. Si no es un nombre
 * codificado, `decodeURIComponent` o lo deja igual o revienta —un `%` suelto
 * en «descuento 50%.pdf»—, y entonces vale el de partida.
 */
export function comoLoEscribioUnaPersona(nombre: unknown): string {
  const n = texto(nombre);
  if (!/%[0-9A-Fa-f]{2}/.test(n)) return n;
  try {
    return decodeURIComponent(n);
  } catch {
    return n;
  }
}

/** La extensión, en minúsculas y con el punto. Vacía si no tiene. */
export function laExtension(nombre: unknown): string {
  const n = texto(nombre);
  const punto = n.lastIndexOf('.');
  if (punto <= 0 || punto === n.length - 1) return '';
  const ext = n.slice(punto).toLowerCase();
  // Un punto en mitad del nombre no es una extensión: «factura 26.001».
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function sinExtension(nombre: string): string {
  const ext = laExtension(nombre);
  return ext ? nombre.slice(0, -ext.length) : nombre;
}

/** La matrícula como se escribe: sin espacios ni guiones, en mayúsculas. */
export function comoSeEscribe(matricula: unknown): string {
  return texto(matricula).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Si el nombre original aporta algo o es ruido.
 *
 * `scan_0007`, `IMG_2841`, `documento (1)` o una ristra de dígitos no dicen
 * nada: meterlos detrás alarga la línea sin informar. Uno con palabras sí,
 * porque es por el que lo conoce quien lo mandó.
 */
export function diceAlgo(nombre: unknown): boolean {
  const base = sinExtension(texto(nombre)).trim();
  if (base.length < 4) return false;
  // Los que pone el sistema, con su numerito. El paréntesis es parte del
  // patrón: sin él, «documento (1)» se colaba como si dijera algo.
  if (/^(img|image|scan|foto|photo|doc|documento|file|archivo)[\s_-]*(\(?\d+\)?)?$/i.test(base)) return false;
  // Solo dígitos o dígitos con separadores: un identificador de quien lo emitió.
  if (/^[\d\s_.-]+$/.test(base)) return false;
  return /[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3}/.test(base);
}

/**
 * Si el nombre ya se lo pusimos nosotros.
 *
 * Al volver a guardar, la pantalla devuelve el documento con el nombre que ya
 * le pusimos. Sin esto, cada guardado lo metería otra vez como si fuera el del
 * fichero y acabaría en «Carfax · 5228HNS — Carfax · 5228HNS — …».
 */
export function yaEsNuestro(nombre: unknown, papel: unknown): boolean {
  const n = texto(nombre);
  // Por su nombre legible, que es el que está escrito en el fichero guardado.
  // Comparando con la clave -«mandato_firmado»- no reconocería «Mandato
  // firmado · 5228HNS — …» y lo volvería a prefijar en cada guardado.
  const p = comoSeDice(papel);

  /*
   * Contra TODAS las etiquetas que ponemos, no solo contra la de este papel.
   *
   * El mismo documento puede haberse guardado con otra: la cláusula del
   * precio llegó de PopCar como «Documento · 5228HNS — …» porque allí esa
   * clave no estaba traducida. Mirando solo la suya, no se reconocería y se
   * volvería a prefijar — «Precio de salida firmado · 5228HNS — Documento ·
   * 5228HNS — …».
   *
   * Lo que se exige es el patrón entero: la etiqueta **y detrás algo nuestro**
   * —el punto medio o el guion largo—. Sin eso pasa lo contrario, que es
   * peor: «ITV _ 2026.04.27.pdf» empieza por «ITV», lo trajo el cliente y es
   * lo único que distingue ese papel de los otros dos suyos.
   */
  const etiquetas = [p, ...Object.values(COMO_SE_LLAMAN)].filter(Boolean);
  return etiquetas.some((e) => n === e || n.startsWith(`${e} · `) || n.startsWith(`${e}${SEPARADOR}`));
}

/**
 * El nombre con el que se guarda.
 *
 * @param papel     El que eligió quien lo sube: «Informe de la revisión».
 * @param matricula La del coche, si se sabe.
 * @param original  Como venía el fichero.
 */
export function comoSeLlama(
  { papel, matricula, original }: { papel?: unknown; matricula?: unknown; original?: unknown },
): string {
  const limpio = comoLoEscribioUnaPersona(original);
  const p = comoSeDice(papel);

  // Sin papel elegido no hay nada mejor que el nombre del fichero: inventar
  // una etiqueta seria peor que no poner ninguna.
  if (!p) return limpio;
  if (yaEsNuestro(limpio, p)) return limpio;

  const matri = comoSeEscribe(matricula);
  const delante = matri ? `${p} · ${matri}` : p;
  const ext = laExtension(limpio);

  return diceAlgo(limpio) ? `${delante}${SEPARADOR}${limpio}` : `${delante}${ext}`;
}

/**
 * De qué coche es un cajón, para poder poner la matrícula.
 *
 * La ruta que sube un documento solo sabe de qué cuelga —un encargo, una
 * revisión, un pedido—, y la matrícula vive dos saltos más allá. Se busca
 * aquí, no se le pide a quien sube: lo que manda el navegador es cosmético y
 * acabaría poniéndole a un papel la matrícula de otro coche el día que alguien
 * tenga dos pestañas abiertas.
 *
 * Los ámbitos de importación —lead, pedido, trámite, transporte— se quedan sin
 * matrícula a propósito: un coche alemán sin matricular aquí todavía no tiene,
 * y poner la alemana en la lista de un expediente español confunde más que
 * ayuda. Sin matrícula, el nombre es «Papel — original», que ya ordena.
 */
export const DE_QUE_COCHE: Record<string, string> = {
  encargo: `SELECT v.plate FROM erp_encargos_venta e
              JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
             WHERE e.id = $1`,
  revision: `SELECT v.plate FROM erp_revisiones_taller r
               JOIN moveadvisor_user_vehicles v ON v.id = r.vehicle_id
              WHERE r.id = $1`,
};
