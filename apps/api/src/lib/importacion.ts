/**
 * La lectura de un Excel de importación del marketplace.
 *
 * Estaba dentro de la ruta, mezclada con las consultas, y por eso no se podía
 * probar. Aquí está sola: filas dentro, grupos y descartes fuera, sin tocar la
 * base. Lo que hace la ruta con eso —insertar, actualizar— sigue en la ruta.
 *
 * Un fichero de importación describe **unidades**, no anuncios: tres Golf del
 * mismo año y precio, en tres colores, son un anuncio con tres coches detrás.
 * De ahí que se agrupe por marca, modelo, año y precio.
 *
 * Lo que se cuenta importa tanto como lo que se importa. Antes, una fila que se
 * caía por repetida no aparecía en ningún sitio: el trabajador subía 120 filas,
 * leía «40 unidades añadidas» y no tenía forma de saber qué había pasado con
 * las otras 80.
 */
import { z } from 'zod';

/**
 * Una celda vacía de Excel llega como cadena vacía, no como nada.
 *
 * Y `Number('')` es 0. Sin esto, dejar en blanco la cuota de 12 meses no
 * significa «no ofrecemos 12 meses»: significa «12 meses cuestan cero euros».
 */
const numeroOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().nullable()
);

/** Igual, pero cuando el blanco debe caer al valor de siempre. */
const numeroConDefecto = (porDefecto: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? porDefecto : v),
    z.coerce.number().int()
  );

export const filaSchema = z.object({
  title:                  z.string().min(1),
  brand:                  z.string().min(1),
  model:                  z.string().min(1),
  year:                   z.coerce.number().int().min(1990).max(2035),
  price:                  z.coerce.number().min(0).default(0),
  fuel:                   z.string().default(''),
  power:                  z.string().default(''),
  location:               z.string().default(''),
  seller:                 z.string().default(''),
  seller_type:            z.string().default(''),
  image_urls:             z.string().default(''),
  source_url:             z.string().default(''),
  description:            z.string().default(''),
  available_for_purchase: z.coerce.number().default(1),
  renting_available:      z.coerce.number().default(0),
  renting_km_year:        numeroConDefecto(15000),
  renting_12m:            numeroOpcional,
  renting_24m:            numeroOpcional,
  renting_36m:            numeroOpcional,
  renting_48m:            numeroOpcional,
  renting_60m:            numeroOpcional,
  unit_color:             z.string().default(''),
  unit_mileage:           z.coerce.number().int().min(0).default(0),
});

export type Fila = z.infer<typeof filaSchema>;

export interface Descarte {
  /** La fila del Excel tal cual la vio el trabajador: 1 es la de cabeceras. */
  numero: number;
  motivo: string;
}

export interface Preparado {
  /** Cada grupo es un anuncio con sus unidades. */
  grupos: Fila[][];
  /** Filas que no se pueden leer: falta la marca, el año no es un año… */
  rechazadas: Descarte[];
  /** Filas legibles que describen una unidad ya descrita en la misma subida. */
  repetidas: Descarte[];
}

/** Marca + modelo + año + precio: lo que hace que dos filas sean el mismo anuncio. */
export function llaveAnuncio(f: Fila): string {
  return `${f.brand.trim().toLowerCase()}|${f.model.trim().toLowerCase()}|${f.year}|${f.price}`;
}

/** Color + kilómetros: lo que hace que dos filas sean el mismo coche. */
function llaveUnidad(f: Fila): string {
  return `${f.unit_color.trim().toLowerCase()}|${f.unit_mileage}`;
}

/**
 * Por qué una fila no se pudo leer, en algo que se pueda enseñar.
 *
 * Zod da rutas y códigos; el trabajador necesita el nombre de la columna.
 */
function motivo(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => {
      const col = i.path.join('.') || 'la fila';
      if (i.code === 'invalid_type' || i.message === 'Required') return `falta ${col}`;
      // Una celda vacía llega como texto de longitud cero: para el trabajador
      // eso es «falta», no «es demasiado pequeño».
      if (i.code === 'too_small' && 'type' in i && i.type === 'string') return `falta ${col}`;
      if (i.code === 'too_small') return `${col} está fuera de rango`;
      if (i.code === 'too_big')   return `${col} está fuera de rango`;
      return `${col}: ${i.message.toLowerCase()}`;
    })
    .join('; ');
}

// ── La rejilla de precios de renting ────────────────────────────────────────
//
// Un renting no tiene un precio: tiene veinte. Cinco plazos por cinco tramos de
// kilómetros al año, y eso vive en `renting_prices_json`. Las cinco columnas
// sueltas —renting_12m, renting_24m…— son la fila de 15.000 km de esa rejilla.
//
// El formulario del ERP ya mantenía las dos cosas a la vez. La importación de
// Excel no: escribía las columnas y dejaba la rejilla como estaba. Como la web
// cotiza desde la rejilla, importar un precio nuevo cambiaba el «desde» del
// listado y dejaba el configurador cotizando el precio viejo. Sin aviso.

export const KM_OPCIONES = [10000, 15000, 20000, 25000, 30000];
const PLAZOS = ['12m', '24m', '36m', '48m', '60m'] as const;
type Plazo = (typeof PLAZOS)[number];

export interface Rejilla {
  km_options: number[];
  '12m'?: (number | null)[] | null;
  '24m'?: (number | null)[] | null;
  '36m'?: (number | null)[] | null;
  '48m'?: (number | null)[] | null;
  '60m'?: (number | null)[] | null;
}

/**
 * La rejilla que queda tras importar una fila.
 *
 * Lo que trae el Excel manda sobre el tramo de 15.000 km; los demás tramos se
 * conservan. Machacarlos sería peor: un Excel con una sola cifra por plazo no
 * sabe nada de los otros cuatro tramos, y borrarlos dejaría la oferta sin
 * precio para quien pida 10.000 o 30.000 km al año.
 *
 * Devuelve `null` cuando no queda ni un precio: así no se guarda una rejilla
 * vacía que luego la web interpretaría como «ofrece renting sin precios».
 */
export function fusionaRejilla(fila: Fila, actual: Rejilla | null): Rejilla | null {
  const kms = actual?.km_options?.length ? actual.km_options : KM_OPCIONES;
  const i15 = kms.indexOf(15000);
  const rejilla: Rejilla = { ...actual, km_options: kms };

  let algunPrecio = false;
  for (const plazo of PLAZOS) {
    const delExcel = fila[`renting_${plazo.replace('m', '')}m` as keyof Fila] as number | null;
    const anterior = (actual?.[plazo] ?? null) as (number | null)[] | null;

    if (delExcel == null && !anterior) { delete rejilla[plazo]; continue; }

    const tramos = anterior ? [...anterior] : new Array<number | null>(kms.length).fill(null);
    while (tramos.length < kms.length) tramos.push(null);
    // Si la rejilla no tuviera 15.000 km, el dato del Excel no tiene sitio
    // donde ir: se conserva lo que hubiera y no se inventa un tramo.
    if (delExcel != null && i15 >= 0) tramos[i15] = delExcel;

    if (tramos.some((p) => p != null && p > 0)) { rejilla[plazo] = tramos; algunPrecio = true; }
    else delete rejilla[plazo];
  }

  return algunPrecio ? rejilla : null;
}

/**
 * Las cinco columnas sueltas, sacadas de la rejilla.
 *
 * No se escriben nunca por su cuenta: son la fila de 15.000 km, y punto. Así no
 * pueden discrepar. Antes se escribían desde el Excel y la rejilla desde otro
 * sitio, y bastaba con dejar una celda en blanco para que el listado perdiera
 * el «desde X €/mes» mientras el configurador seguía cotizando.
 */
export function columnasDesdeRejilla(rejilla: Rejilla | null): Record<Plazo, number | null> {
  const i15 = rejilla ? rejilla.km_options.indexOf(15000) : -1;
  const salida = {} as Record<Plazo, number | null>;
  for (const plazo of PLAZOS) {
    const tramos = (rejilla?.[plazo] ?? null) as (number | null)[] | null;
    const v = i15 >= 0 && tramos ? tramos[i15] : null;
    salida[plazo] = v != null && v > 0 ? v : null;
  }
  return salida;
}

export function prepara(filas: unknown[]): Preparado {
  const grupos = new Map<string, Fila[]>();
  const vistas = new Map<string, Set<string>>();
  const rechazadas: Descarte[] = [];
  const repetidas: Descarte[] = [];

  filas.forEach((cruda, i) => {
    // +2: la primera fila del Excel son las cabeceras, y se cuenta desde 1.
    const numero = i + 2;
    const leida = filaSchema.safeParse(cruda);
    if (!leida.success) { rechazadas.push({ numero, motivo: motivo(leida.error) }); return; }

    const fila = leida.data;
    const anuncio = llaveAnuncio(fila);
    const unidad = llaveUnidad(fila);

    if (!vistas.has(anuncio)) vistas.set(anuncio, new Set());
    if (vistas.get(anuncio)!.has(unidad)) {
      repetidas.push({
        numero,
        motivo: fila.unit_color || fila.unit_mileage
          ? `mismo color y kilómetros que otra fila de ${fila.brand} ${fila.model}`
          : `sin color ni kilómetros: no se distingue de otra fila de ${fila.brand} ${fila.model}`,
      });
      return;
    }
    vistas.get(anuncio)!.add(unidad);

    if (!grupos.has(anuncio)) grupos.set(anuncio, []);
    grupos.get(anuncio)!.push(fila);
  });

  return { grupos: [...grupos.values()], rechazadas, repetidas };
}
