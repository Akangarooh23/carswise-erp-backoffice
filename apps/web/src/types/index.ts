// ── Auth ─────────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'support' | 'operations' | 'sales';

export interface AuthUser {
  email: string;
  role: Role;
  name: string;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export type UserStatus = 'active' | 'at_risk' | 'blocked';
export type PlanType   = 'free' | 'plus' | 'premium';

export interface User {
  id: string;
  email: string;
  name: string;
  apellidos?: string;
  phone?: string;
  status: UserStatus;
  plan_type: PlanType;
  plan_updated_at?: string;
  next_billing_date?: string;
  stripe_subscription_id?: string;
  trial_start?: string;
  trial_end?: string;
  created_at: string;
  updated_at: string;
  appointment_count?: number;
  ticket_count?: number;
  tax_id?: string | null;
  billing_address?: string | null;
  company_name?: string | null;
}

// ── Marketplace ───────────────────────────────────────────────────────────────
export interface RentingPricesJson {
  km_options: number[];
  '12m'?: (number | null)[] | null;
  '24m'?: (number | null)[] | null;
  '36m'?: (number | null)[] | null;
  '48m'?: (number | null)[] | null;
  '60m'?: (number | null)[] | null;
}

export interface VoOffer {
  id: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  fuel: string;
  power: string;
  displacement: number;
  color: string;
  location: string;
  seller: string;
  description?: string;
  image_url?: string;
  source_url?: string;
  has_guarantee_seal: boolean;
  portal_score: number;
  warranty_months: number;
  seller_type?: 'professional' | 'particular' | null;
  image_urls?: string[] | null;
  has_stock_management?: boolean;
  total_units?: number;
  units_available?: number;
  available_colors?: string[];
  sale_price?: number | null;
  version?: string | null;
  transmission?: string | null;
  internal_location?: string | null;
  available_for_purchase: boolean;
  renting_available: boolean;
  renting_km_year: number;
  renting_12m?: number | null;
  renting_24m?: number | null;
  renting_36m?: number | null;
  renting_48m?: number | null;
  renting_60m?: number | null;
  renting_prices_json?: RentingPricesJson | null;
  carswise_fee?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UnitStatus = 'available' | 'reserved' | 'rented' | 'returned';

export interface VoUnit {
  id: string;
  offer_id: string;
  color: string;
  mileage: number;
  status: UnitStatus;
  notes?: string | null;
  rented_at?: string | null;
  returned_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketOffer {
  id: string;
  portal: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  km: number;
  fuel_type: string;
  image_url?: string;
  url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Appointments ──────────────────────────────────────────────────────────────
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType   = 'oil_change' | 'brakes' | 'tires' | 'inspection' | 'itv' | 'general' | 'other';

export interface Appointment {
  id: string;
  user_id: string;
  agent?: string;
  workshop_id?: string;
  workshop_name?: string;
  workshop_name_resolved?: string;
  scheduled_at: string;
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Tickets ───────────────────────────────────────────────────────────────────
export type TicketStatus   = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketChannel  = 'web' | 'phone' | 'email' | 'whatsapp';

export interface TicketEvent {
  id: string;
  actor: string;
  message: string;
  event_at: string;
}

export interface Ticket {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  title: string;
  description: string;
  channel: TicketChannel;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  events?: TicketEvent[];
}

// ── Workshops ─────────────────────────────────────────────────────────────────
export interface Workshop {
  id: string;
  name: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  notes?: string;
  is_active: boolean;
  appointment_count?: number;
  pending_count?: number;
  created_at: string;
  updated_at: string;
}

// ── IDCars ────────────────────────────────────────────────────────────────────
export interface IdCarFile {
  id: number;
  file_type: 'photo' | 'document' | 'technical_sheet' | 'circulation_permit' | 'itv';
  file_name: string;
  file_size: number;
  file_mime_type: string;
  file_url: string;
  created_at: string;
}

export interface IdCar {
  id: string;
  user_id: string;
  owner_name?: string;
  owner_email?: string;
  brand?: string;
  model?: string;
  year?: number;
  plate?: string;
  fuel_type?: string;
  km?: number;
  created_at: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardStats {
  users: {
    total: number; active: number; at_risk: number; blocked: number;
    plus: number; premium: number; new_30d: number;
  };
  tickets: {
    total: number; open: number; in_progress: number;
    waiting_customer: number; resolved: number; urgent: number; new_7d: number;
  };
  appointments: {
    total: number; scheduled: number; confirmed: number;
    completed: number; cancelled: number; upcoming_7d: number;
  };
  marketplace: {
    total: number; active: number; avg_price: number; min_price: number; max_price: number;
  };
  leads: {
    total: number; pending: number; contacted: number; resolved: number; reschedule: number; new_7d: number;
  };
  recentTickets: Ticket[];
  upcomingAppointments: Appointment[];
}

// ── API helpers ───────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  meta?: { total: number; page: number; limit: number };
  error?: string;
}
