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
