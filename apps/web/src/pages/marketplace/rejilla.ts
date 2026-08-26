/**
 * La rejilla de precios de un renting.
 *
 * Un renting no tiene un precio: tiene cinco plazos por cinco tramos de
 * kilómetros al año, y eso vive en `renting_prices_json`. Las cinco columnas
 * sueltas —renting_12m, renting_24m…— son solo la fila de 15.000 km.
 *
 * Aquí está la conversión de las columnas a rejilla, que es lo que necesita el
 * formulario cuando abre un vehículo antiguo que aún no tiene rejilla.
 */
import type { VoOffer, RentingPricesJson } from '../../types/index.js';
import { RENTING_KM_OPTIONS } from './constantes.js';
export function getRentingPrices(form: Partial<VoOffer>): RentingPricesJson {
  if (form.renting_prices_json) return form.renting_prices_json as RentingPricesJson;
  // Migrate from old simple fields: place existing prices in the 15k column
  const km15kIdx = RENTING_KM_OPTIONS.indexOf(15000);
  function toRow(v: unknown): (number | null)[] | null {
    if (v == null || v === '') return null;
    const arr: (number | null)[] = new Array(RENTING_KM_OPTIONS.length).fill(null);
    arr[km15kIdx] = Number(v);
    return arr;
  }
  const r12 = toRow(form.renting_12m);
  const r24 = toRow(form.renting_24m);
  const r36 = toRow(form.renting_36m);
  const r48 = toRow(form.renting_48m);
  const r60 = toRow(form.renting_60m);
  if (!r12 && !r24 && !r36 && !r48 && !r60) return { km_options: RENTING_KM_OPTIONS };
  return { km_options: RENTING_KM_OPTIONS, '12m': r12, '24m': r24, '36m': r36, '48m': r48, '60m': r60 };
}
