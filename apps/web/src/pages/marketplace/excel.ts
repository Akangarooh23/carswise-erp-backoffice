/**
 * El Excel del marketplace: plantilla, exportación y lectura.
 *
 * Un fichero de importación describe unidades, no anuncios: tres Golf del mismo
 * año y precio en tres colores son un anuncio con tres coches detrás. Por eso
 * las columnas unit_color y unit_mileage no son un extra — sin ellas las filas
 * salen indistinguibles y la importación se queda con una sola.
 * 
 * Estaba dentro de la pantalla, así que no había forma de probar que exportar y
 * volver a importar no pierde nada.
 */

import * as XLSX from 'xlsx';
import type { VoOffer, RentingPricesJson } from '../../types/index.js';
import type { ParticularsOffer, PortalOffer } from './tipos.js';
import { EXCEL_HEADERS, RENTING_KM_OPTIONS } from './constantes.js';

/**
 * Las columnas del fichero que se exporta.
 *
 * No son las mismas que las de la plantilla. `json_to_sheet` recorta a la lista
 * que se le pasa, así que la versión no salía por mucho que se calculara: se
 * añadía al objeto de la fila y se tiraba al escribir. Aquí va, detrás del
 * modelo, que es donde se lee.
 *
 * Y no se mete en EXCEL_HEADERS porque esa lista es la de la plantilla, y la
 * importación no sabe leer la versión: una columna que se rellena y se pierde
 * en silencio es peor que no tenerla.
 */
export const COLUMNAS_EXPORTACION = EXCEL_HEADERS.flatMap((c) => (c === 'model' ? [c, 'version'] : [c]));

export function xlsxDownload(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function parseXlsx(buffer: ArrayBuffer): Record<string, string>[] {
  const wb    = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
}

/**
 * Lo que va en cada celda al exportar.
 *
 * Una fila por vehículo, con las columnas en el orden de EXCEL_HEADERS. El
 * color y los kilómetros se repiten en unit_color y unit_mileage: sin esas dos
 * columnas las filas de un mismo anuncio salen indistinguibles y al reimportar
 * solo entra una.
 */
export function filasParaExcel(items: VoOffer[]): Record<string, string | number>[] {
  return items.map((o) => ({
    title: o.title, brand: o.brand, model: o.model, version: o.version ?? '', year: o.year,
    price: o.price, mileage: o.mileage, fuel: o.fuel ?? '', power: o.power ?? '',
    color: o.color ?? '', location: o.location ?? '', seller: o.seller ?? '',
    seller_type: o.seller_type ?? '',
    image_urls: Array.isArray(o.image_urls) ? o.image_urls.join('|') : (o.image_url ?? ''),
    source_url: o.source_url ?? '', description: o.description ?? '',
    available_for_purchase: o.available_for_purchase !== false ? 1 : 0,
    renting_available: o.renting_available ? 1 : 0,
    renting_km_year: o.renting_km_year ?? 15000,
    renting_12m: o.renting_12m ?? '',
    renting_24m: o.renting_24m ?? '',
    renting_36m: o.renting_36m ?? '',
    renting_48m: o.renting_48m ?? '',
    renting_60m: o.renting_60m ?? '',
    // Sin estas dos, exportar y volver a importar deja una sola unidad por
    // anuncio: las filas salen indistinguibles.
    unit_color: o.color ?? '',
    unit_mileage: o.mileage ?? 0,
  }));
}

/** Exporta y descarga. Lo de arriba se puede probar; esto necesita navegador. */
export function exportXlsx(items: VoOffer[]) {
  const ws = XLSX.utils.json_to_sheet(filasParaExcel(items), { header: COLUMNAS_EXPORTACION });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marketplace VO');
  xlsxDownload(wb, `marketplace-vo-${Date.now()}.xlsx`);
}

/** Lo que va en cada celda al exportar particulares. */
export function filasDeParticulares(rows: ParticularsOffer[]): Record<string, string | number>[] {
  return rows.map((o) => ({
    titulo: o.title, marca: o.brand, modelo: o.model, version: o.version ?? '',
    anio: o.year, km: o.mileage, combustible: o.fuel, color: o.color ?? '',
    precio: o.price, cv: o.cv ?? '', cambio: o.transmission_type ?? '',
    ubicacion: o.vehicle_location ?? '', matricula: o.plate ?? '',
    propietario: o.owner_name ?? '', telefono: o.owner_phone ?? '',
    email_cliente: o.user_email, notas: o.notes ?? '',
    url_anuncio: o.listing_url ?? '', actualizado: o.updated_at,
  }));
}

export function exportParticularsXlsx(rows: ParticularsOffer[]) {
  const ws = XLSX.utils.json_to_sheet(filasDeParticulares(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Particulares');
  xlsxDownload(wb, `particulares-${Date.now()}.xlsx`);
}

/** Lo que va en cada celda al exportar lo recogido de un portal. */
export function filasDePortal(rows: PortalOffer[]): Record<string, string | number>[] {
  return rows.map((o) => ({
    portal: o.portal, titulo: o.title, marca: o.brand, modelo: o.model,
    anio: o.year, precio: o.price, km: o.mileage, combustible: o.fuel ?? '',
    color: o.color ?? '', carroceria: o.body_type ?? '', cambio: o.transmission ?? '',
    cv: o.power_cv ?? '', kw: o.power_kw ?? '', puertas: o.doors ?? '',
    plazas: o.seats ?? '', cilindrada: o.displacement ?? '', co2: o.co2 ?? '',
    etiqueta_dgt: o.environmental_label ?? '', traccion: o.traction ?? '',
    consumo: o.consumption ?? '', provincia: o.province ?? '', ciudad: o.city ?? '',
    tipo_vendedor: o.seller_type ?? '', activo: o.is_active ? 'Sí' : 'No', url: o.url ?? '',
  }));
}

export function exportPortalXlsx(rows: PortalOffer[], sheetName: string, filePrefix: string) {
  const ws = XLSX.utils.json_to_sheet(filasDePortal(rows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  xlsxDownload(wb, `${filePrefix}-${Date.now()}.xlsx`);
}

export function downloadTemplate() {
  // Three units of the same Golf (same offer, different colors/mileage)
  const example = [
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'PopCar', seller_type: 'professional',
      image_urls: 'https://example.com/foto1.jpg|https://example.com/foto2.jpg',
      source_url: '', description: 'Vehículo en excelente estado.',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Blanco', unit_mileage: 9000,
    },
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'PopCar', seller_type: 'professional',
      image_urls: '', source_url: '', description: '',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Negro', unit_mileage: 15000,
    },
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'PopCar', seller_type: 'professional',
      image_urls: '', source_url: '', description: '',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Blanco', unit_mileage: 18500,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(example, { header: EXCEL_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  xlsxDownload(wb, 'plantilla-importacion-marketplace.xlsx');
}
