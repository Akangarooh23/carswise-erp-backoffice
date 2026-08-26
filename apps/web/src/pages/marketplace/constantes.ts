/**
 * Lo que no cambia: pestañas, filtros, columnas y portales.
 *
 * Estaba todo en la cabecera de la pantalla. Aquí se puede leer de una vez y,
 * sobre todo, se puede importar desde una prueba.
 */

import type { VoOffer, RentingPricesJson } from '../../types/index.js';

export const TABS = [
  { key: 'vo',             label: 'VO Empresas Renting'   },
  { key: 'particulares',   label: 'Particulares PopCar' },
  { key: 'offers',         label: 'Ofertas de portales'   },
  { key: 'renting',        label: 'Ofertas Renting'       },
  { key: 'concesionarios', label: 'VO Concesionarios'     },
  { key: 'exportacion',    label: 'Importación'           },
] as const;
export type Tab = typeof TABS[number]['key'];

export const STATUS_FILTERS = [
  { value: '',      label: 'Todos'         },
  { value: 'true',  label: 'Publicados'    },
  { value: 'false', label: 'Despublicados' },
];

export const EXCEL_HEADERS = ['title','brand','model','year','price','fuel','power','location','seller','seller_type','image_urls','source_url','description','available_for_purchase','renting_available','renting_km_year','renting_12m','renting_24m','renting_36m','renting_48m','renting_60m','unit_color','unit_mileage'];

export const EMPTY_FORM: Partial<VoOffer> = {
  title: '', brand: '', model: '', version: '', transmission: '', year: new Date().getFullYear(),
  price: 0, sale_price: null, mileage: 0, fuel: '', power: '', displacement: 0,
  color: '', location: '', internal_location: '', seller: '', seller_type: null, description: '',
  image_url: '', image_urls: [], source_url: '',
  warranty_months: 0, has_guarantee_seal: false, portal_score: 80, is_active: true,
  available_for_purchase: true, renting_available: false,
  renting_km_year: 15000,
  renting_12m: null, renting_24m: null, renting_36m: null, renting_48m: null, renting_60m: null,
};

export const EMPTY_RENTING_FORM: Partial<VoOffer> = {
  ...EMPTY_FORM,
  available_for_purchase: false,
  renting_available: true,
  carswise_fee: 400,
};

export const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento';
export const LABEL_CLS = 'block text-xs font-medium text-brand-400 mb-1';
export const FUELS = ['Gasolina','Diésel','Híbrido','Híbrido enchufable','Eléctrico','GLP','Gas Natural','Otros'];

// ── Los tramos y plazos de la rejilla de renting ────────────────────────────

export const RENTING_KM_OPTIONS = [10000, 15000, 20000, 25000, 30000];
export const RENTING_DURATIONS  = ['12m', '24m', '36m', '48m', '60m'] as const;
export type RentDuration = typeof RENTING_DURATIONS[number];

// Vehículos disponibles en cada portal ("En la web"). Medidos en vivo 2026-07-23 salvo indicación.
// Sin clave = volumen no medible / bloqueado (C2C, coches.net DataDome).
export const PORTAL_DISPONIBLES: Record<string, number> = {
  autoscout24: 269207, cochescom: 79000 /* estimado */, flexicar: 25000, autohero: 5000 /* estimado */, milanuncios: 200000 /* estimado */,
  autocasion: 125291, clicars: 1730, ocasionplus: 13572, canalcar: 494,
  modrive: 1967, vian: 618, gamboa: 463,
};

export const PORTAL_LABELS: Record<string, string> = {
  autoscout24: 'AutoScout24', cochescom: 'coches.com', flexicar: 'Flexicar',
  autohero: 'Autohero', wallapop: 'Wallapop', milanuncios: 'Milanuncios',
  cochesnet: 'coches.net', 'coches.net': 'coches.net', ocasionplus: 'OcasiónPlus',
  autocasion: 'Autocasión',
  modrive: 'Modrive', vian: 'VIAN', gamboa: 'Gamboa',
  'marketplace-vo': 'Marketplace VO', 'renting-leasys': 'Renting (Leasys)',
};
export function portalLabel(p: string): string {
  return PORTAL_LABELS[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : '—');
}
