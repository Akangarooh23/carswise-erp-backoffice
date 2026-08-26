/**
 * Los tipos de las pestañas que no son VO.
 *
 * Portales, particulares y las estadísticas de cobertura. VoOffer y VoUnit
 * viven en types/index.ts porque los usa media aplicación; estos solo se usan
 * aquí.
 */

export type PortalOffer = {
  id: string; portal: string; title: string; brand: string; model: string;
  year: number; price: number; mileage: number; fuel: string; image_url?: string; url?: string;
  seller_type?: string;
  color?: string; body_type?: string; transmission?: string; power_cv?: number; power_kw?: number;
  doors?: number; seats?: number; displacement?: string; co2?: string; environmental_label?: string;
  traction?: string; consumption?: number;
  province?: string; city?: string; location?: string;
  is_active?: boolean; last_checked_at?: string | null;
};

export type ParticularsOffer = {
  id: string; user_email: string; title: string; brand: string; model: string;
  version: string | null; year: number; mileage: number; fuel: string; color: string;
  price: number; cv: number | null; transmission_type: string | null;
  vehicle_location: string | null; plate: string | null; notes: string | null;
  listing_url: string | null; updated_at: string;
  owner_name: string | null; owner_phone: string | null;
};

// ── Informe de portales (PDF) ─────────────────────────────────────────────────

export type PortalStat = { portal: string; total: number; active: number; published_cw?: number; updated_last_day: number };
export type PortalStats = { market: PortalStat[]; vo: PortalStat[]; import?: PortalStat[]; marketTotal: number; voTotal: number; importTotal?: number; generatedAt: string };

export type VisitEntry = { slots: any[]; bookings: any[]; loading: boolean };
export type SlotFormState = { date: string; timeStart: string; timeEnd: string };
