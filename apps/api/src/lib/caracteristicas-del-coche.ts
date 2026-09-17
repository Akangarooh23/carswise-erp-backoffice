/**
 * Las características de un coche de garaje, corregidas desde el ERP.
 *
 * El cliente sube su coche y muchas veces lo deja a medias —sin cilindrada, sin
 * CO₂— o mal: un T-Roc DSG apuntado como «manual». Quien lleva el encargo tiene
 * que poder arreglarlo sin pedirle al cliente que entre, y el arreglo tiene que
 * **llegar al anuncio**, que es donde lo lee el comprador.
 *
 * Aquí están las reglas, sin base de datos: qué se puede tocar, cómo se limpia
 * cada campo y qué se escribe en el anuncio.
 *
 * ## Tres cosas que no eran obvias
 *
 * **Hay columnas repetidas.** La tabla guarda el año, los kilómetros, el precio,
 * el CO₂ y las ITV dos veces: en texto (lo que escribe y lee PopCar) y con tipo
 * (`year_int`, `mileage_km`…, lo que lee el ERP). Las de tipo se rellenaban una
 * vez y ya no se tocaban: el ERP enseñaba 30.000 km mientras el cliente veía
 * otra cifra. Se escriben las dos a la vez, siempre.
 *
 * **El precio de un encargo no se toca aquí.** Es el que el dueño ha firmado, y
 * cambiarlo va por el encargo: se guarda allí y se le vuelve a mandar. Si se
 * pudiera cambiar desde esta ficha, el anuncio saldría a un precio que nadie ha
 * aceptado — justo lo que se cerró en el encargo.
 *
 * **Guardar actualiza el anuncio vivo**, menos el precio. Antes solo se copiaba
 * al publicar, y en parte: la potencia salía como «CV» a secas, la cilindrada a
 * cero —en su sitio se escribía el CO₂— y el cambio y la ubicación, vacíos.
 */

export type Tipo = 'texto' | 'entero' | 'decimal' | 'fecha' | 'opcion' | 'matricula';

export interface Campo {
  clave: string;
  etiqueta: string;
  tipo: Tipo;
  /** Para las de elegir: [valor que se guarda, cómo se lee]. */
  opciones?: readonly (readonly [string, string])[];
  /** Límites de los números, para no guardar un año 20222 por un dedo de más. */
  min?: number;
  max?: number;
  unidad?: string;
}

/*
 * Los valores son los que guarda el formulario del cliente en PopCar, para que
 * lo que se corrige aquí él lo vea elegido en su pantalla y no en blanco.
 */
export const COMBUSTIBLES = [
  ['gasolina', 'Gasolina'], ['diesel', 'Diésel'], ['hibrido', 'Híbrido'],
  ['electrico', 'Eléctrico'], ['gas', 'Gas'],
] as const;
export const CAMBIOS = [['manual', 'Manual'], ['automatico', 'Automático']] as const;
export const CARROCERIAS = [
  ['berlina', 'Berlina'], ['suv', 'SUV'], ['familiar', 'Familiar'], ['coupe', 'Coupé'],
  ['cabrio', 'Cabrio'], ['monovolumen', 'Monovolumen'], ['pickup', 'Pickup'],
  ['todoterreno', 'Todoterreno'], ['furgoneta', 'Furgoneta'],
] as const;
export const ETIQUETAS = [['0', '0 emisiones'], ['eco', 'ECO'], ['c', 'C'], ['b', 'B']] as const;
const SI_NO = [['si', 'Sí'], ['no', 'No']] as const;

const ESTE_AÑO = new Date().getFullYear();

/** Los que se pueden corregir, en el orden en que se enseñan. */
export const CAMPOS: readonly Campo[] = [
  { clave: 'brand', etiqueta: 'Marca', tipo: 'texto' },
  { clave: 'model', etiqueta: 'Modelo', tipo: 'texto' },
  { clave: 'version', etiqueta: 'Versión', tipo: 'texto' },
  { clave: 'year', etiqueta: 'Año', tipo: 'entero', min: 1950, max: ESTE_AÑO + 1 },
  { clave: 'plate', etiqueta: 'Matrícula', tipo: 'matricula' },
  { clave: 'mileage', etiqueta: 'Kilómetros', tipo: 'entero', min: 0, max: 2_000_000, unidad: 'km' },
  { clave: 'fuel', etiqueta: 'Combustible', tipo: 'opcion', opciones: COMBUSTIBLES },
  { clave: 'transmission_type', etiqueta: 'Cambio', tipo: 'opcion', opciones: CAMBIOS },
  { clave: 'body_type', etiqueta: 'Carrocería', tipo: 'opcion', opciones: CARROCERIAS },
  { clave: 'cv', etiqueta: 'Potencia', tipo: 'entero', min: 1, max: 2000, unidad: 'CV' },
  { clave: 'displacement', etiqueta: 'Cilindrada', tipo: 'entero', min: 0, max: 10_000, unidad: 'cc' },
  { clave: 'co2', etiqueta: 'CO₂', tipo: 'decimal', min: 0, max: 1000, unidad: 'g/km' },
  { clave: 'environmental_label', etiqueta: 'Etiqueta ambiental', tipo: 'opcion', opciones: ETIQUETAS },
  { clave: 'color', etiqueta: 'Color', tipo: 'texto' },
  { clave: 'doors', etiqueta: 'Puertas', tipo: 'entero', min: 1, max: 9 },
  { clave: 'seats', etiqueta: 'Plazas', tipo: 'entero', min: 1, max: 9 },
  { clave: 'vehicle_location', etiqueta: 'Ubicación', tipo: 'texto' },
  { clave: 'last_itv', etiqueta: 'Última ITV', tipo: 'fecha' },
  { clave: 'next_itv', etiqueta: 'Próxima ITV', tipo: 'fecha' },
  { clave: 'service_book', etiqueta: 'Libro de mantenimiento', tipo: 'opcion', opciones: SI_NO },
  { clave: 'official_service', etiqueta: 'Revisiones en servicio oficial', tipo: 'opcion', opciones: SI_NO },
  { clave: 'last_service_date', etiqueta: 'Última revisión', tipo: 'fecha' },
  { clave: 'last_service_km', etiqueta: 'Km de la última revisión', tipo: 'entero', min: 0, max: 2_000_000, unidad: 'km' },
  { clave: 'price', etiqueta: 'Precio', tipo: 'entero', min: 0, max: 10_000_000, unidad: '€' },
];

/** La que no existía: la cilindrada no tenía columna en el coche. */
export const ENSURE_COLUMNAS = `
  ALTER TABLE moveadvisor_user_vehicles
    ADD COLUMN IF NOT EXISTS displacement VARCHAR(16)`;

export interface Limpieza {
  /** Lo que se guarda, ya limpio: texto, o null para vaciarlo. */
  campos: Record<string, string | null>;
  /** Un error por campo que no se ha podido entender. Si hay alguno, no se guarda nada. */
  errores: Record<string, string>;
}

const texto = (v: unknown) => String(v ?? '').trim();

/**
 * Lo que llega del formulario, limpio y comprobado.
 *
 * Solo lo que viene: un campo que no se manda no se toca. Uno que se manda
 * vacío se vacía — también es corregir.
 */
export function limpiaLosCambios(
  entrada: Record<string, unknown> | null | undefined,
  { hayEncargo = false }: { hayEncargo?: boolean } = {},
): Limpieza {
  const campos: Record<string, string | null> = {};
  const errores: Record<string, string> = {};
  const e = entrada ?? {};

  for (const c of CAMPOS) {
    if (!(c.clave in e)) continue;
    const bruto = texto(e[c.clave]);

    if (c.clave === 'price' && hayEncargo) {
      errores.price = 'El precio de este coche va por el encargo: se cambia allí y se le vuelve a mandar para que lo firme';
      continue;
    }
    if (bruto === '') {
      // Sin marca o modelo no hay anuncio posible: vaciarlos no es corregir.
      if (c.clave === 'brand' || c.clave === 'model') { errores[c.clave] = `${c.etiqueta} no puede quedar vacío`; continue; }
      campos[c.clave] = null;
      continue;
    }

    switch (c.tipo) {
      case 'texto':
        campos[c.clave] = bruto.slice(0, 120);
        break;
      case 'matricula': {
        const m = bruto.toUpperCase().replace(/[\s-]+/g, '');
        if (!/^[A-Z0-9]{4,10}$/.test(m)) { errores[c.clave] = 'La matrícula solo lleva letras y números'; break; }
        campos[c.clave] = m;
        break;
      }
      case 'entero':
      case 'decimal': {
        // «30.000 km», «1.498», «136,5»: se quita lo que no es número.
        const normal = c.tipo === 'entero'
          ? bruto.replace(/[^\d]/g, '')
          : bruto.replace(/[^\d,.]/g, '').replace(',', '.');
        const n = Number(normal);
        if (normal === '' || !Number.isFinite(n)) { errores[c.clave] = `${c.etiqueta} tiene que ser un número`; break; }
        if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) {
          errores[c.clave] = `${c.etiqueta} no puede ser ${bruto}`;
          break;
        }
        campos[c.clave] = c.tipo === 'entero' ? String(Math.round(n)) : String(n);
        break;
      }
      case 'fecha': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto) || Number.isNaN(new Date(`${bruto}T00:00:00Z`).getTime())) {
          errores[c.clave] = `${c.etiqueta} tiene que ser una fecha`;
          break;
        }
        campos[c.clave] = bruto;
        break;
      }
      case 'opcion': {
        const valor = bruto.toLowerCase();
        if (!c.opciones?.some(([v]) => v === valor)) { errores[c.clave] = `${c.etiqueta} no admite «${bruto}»`; break; }
        campos[c.clave] = valor;
        break;
      }
    }
  }
  return { campos, errores };
}

/**
 * Las columnas con tipo que acompañan a las de texto.
 *
 * Se devuelven como expresiones sobre el valor de texto, para que la base haga
 * la conversión igual que la hizo al rellenarlas: si el texto se vacía, la de
 * tipo también.
 */
export const GEMELAS: Readonly<Record<string, { columna: string; tipo: string }>> = {
  year: { columna: 'year_int', tipo: 'SMALLINT' },
  mileage: { columna: 'mileage_km', tipo: 'INTEGER' },
  price: { columna: 'price_amount', tipo: 'NUMERIC(12,2)' },
  co2: { columna: 'co2_g_km', tipo: 'NUMERIC(10,2)' },
  last_itv: { columna: 'last_itv_date', tipo: 'DATE' },
  next_itv: { columna: 'next_itv_date', tipo: 'DATE' },
};

/** Cómo se lee una opción guardada: «automatico» → «Automático». */
export function comoSeLee(opciones: readonly (readonly [string, string])[], valor: unknown): string {
  const v = texto(valor);
  if (!v) return '';
  return opciones.find(([k]) => k === v.toLowerCase())?.[1] ?? v;
}

const entero = (v: unknown): number | null => {
  const n = Number(texto(v).replace(/[^\d]/g, ''));
  return texto(v) !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Lo que se escribe en el anuncio. El precio no está: va por el encargo. */
export interface ElAnuncio {
  title: string;
  brand: string;
  model: string;
  version: string | null;
  year: number;
  mileage: number;
  fuel: string;
  color: string;
  power: string;
  displacement: number;
  transmission: string | null;
  body_type: string | null;
  doors: number | null;
  seats: number | null;
  location: string;
  description: string;
}

/**
 * Lo que el comprador lee del coche, sacado de lo que hay guardado.
 *
 * Con las palabras con que se lee, no con las que se guardan: en la ficha pone
 * «Automático», no «automatico». Lo que no se sabe se deja vacío y la ficha
 * dice «—»; nunca «CV» a secas ni una cilindrada de cero.
 */
export function loQueVaAlAnuncio(v: Record<string, unknown>): ElAnuncio {
  const marca = texto(v.brand);
  const modelo = texto(v.model);
  const version = texto(v.version);
  const titulo = [marca, modelo, version].filter(Boolean).join(' ') || texto(v.title);
  const cv = entero(v.cv);
  return {
    title: titulo,
    brand: marca,
    model: modelo,
    version: version || null,
    year: entero(v.year) ?? 0,
    mileage: entero(v.mileage) ?? 0,
    fuel: comoSeLee(COMBUSTIBLES, v.fuel),
    color: texto(v.color),
    power: cv ? `${cv} CV` : '',
    displacement: entero(v.displacement) ?? 0,
    transmission: comoSeLee(CAMBIOS, v.transmission_type) || null,
    body_type: comoSeLee(CARROCERIAS, v.body_type) || null,
    doors: entero(v.doors),
    seats: entero(v.seats),
    location: texto(v.vehicle_location),
    description: texto(v.notes),
  };
}
