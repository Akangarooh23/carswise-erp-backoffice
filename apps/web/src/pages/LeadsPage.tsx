import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import { enlaceAlAnuncio } from '../lib/enlace-al-anuncio.js';

// ─── Leads (solicitudes) types ────────────────────────────────────────────────

interface LeadMeta {
  name?: string;
  phone?: string;
  when?: string;
  vehicle_url?: string;
  portal?: string;
  erp_notes?: string;
  erp_response?: string;
  appointment_date?: string;
  appointment_time?: string;
  appointment_address?: string;
  appointment_contact?: string;
  reschedule_proposals?: Array<{ date: string; time: string }>;
  /** La fianza que se le dijo al pedir una importación. Histórica: es lo que se
   *  le prometió, no lo que saldría hoy si el precio ha cambiado. */
  deposit_quoted?: string | number | null;
  /** Cuándo se cobró la fianza. Vacío mientras no esté pagada. */
  deposit_paid_at?: string | null;
  /** Cuándo le hemos dicho que lo tendrá. Estimación, no promesa. */
  delivery_estimate?: string | null;
  /** Cuándo se le devolvió la fianza. Vacío si no se ha devuelto. */
  deposit_refunded_at?: string | null;
}

interface Lead {
  id: string;
  user_email: string;
  vehicle_id: string;
  appointment_type: 'info' | 'visit' | 'question' | 'renting' | 'import';
  title: string;
  meta: LeadMeta;
  status: string;
  created_at: string;
  updated_at: string;
  notified_at: string | null;
}

interface LeadStats {
  total: number;
  pending: number;
  contacted: number;
  resolved: number;
  discarded: number;
  type_info: number;
  type_visit: number;
  type_question: number;
  type_renting: number;
  type_import: number;
  portal_importacion: number;
  portal_renting: number;
  portal_compra: number;
  portal_externo: number;
  new_7d: number;
}

interface LeadHistoryEntry {
  id: string;
  operator: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

// ─── Call queue types ─────────────────────────────────────────────────────────

interface CallQueueItem {
  anon_id: string;
  user_email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  first_seen: string;
  last_seen: string;
  offers_viewed: Array<{ title: string; url: string | null }> | null;
  offer_view_count: number;
  outreach_status: 'pending' | 'no_answer' | 'called' | 'not_interested';
  outreach_notes: string | null;
  outreach_updated_at: string | null;
}

interface CallQueueStats {
  pending: number;
  no_answer: number;
  resolved: number;
}

interface FunnelEventDetail {
  id: string;
  event_type: string;
  offer_title: string | null;
  utm_source: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  landing:          'Acceso',
  marketplace_view: 'Marketplace',
  offer_view:       'Oferta vista',
  register:         'Registro',
  lead_request:     'Solicitud',
};
const EVENT_COLORS: Record<string, string> = {
  landing:          'bg-brand-100 text-brand-400',
  marketplace_view: 'bg-acento-tenue text-acento-texto',
  offer_view:       'bg-acento-tenue text-acento-texto',
  register:         'bg-emerald-50 text-emerald-700',
  lead_request:     'bg-amber-50 text-amber-700',
};

const TYPE_LABELS: Record<string, string> = {
  info:     'Solicitar info',
  visit:    'Agendar visita',
  question: 'Preguntar',
  renting:  'Oferta de renting',
  // Una solicitud de importación. Salía la palabra «import», en crudo y en gris.
  import:   'Importar un coche',
};
const TYPE_COLORS: Record<string, string> = {
  info:     'bg-acento-tenue text-acento-texto',
  import:   'bg-blue-100 text-blue-700',
  visit:    'bg-emerald-100 text-emerald-700',
  question: 'bg-acento-tenue text-acento-texto',
  renting:  'bg-emerald-100 text-emerald-800',
};
const STATUS_COLORS: Record<string, string> = {
  Pendiente:              'bg-amber-100 text-amber-700',
  Contactado:             'bg-acento-tenue text-acento-texto',
  'En proceso':           'bg-acento-tenue text-acento-texto',
  'Cita confirmada':      'bg-green-100 text-green-700',
  'Visita realizada':     'bg-brand-100 text-brand-500',
  Interesado:             'bg-brand-100 text-brand-500',
  Vendido:                'bg-emerald-100 text-emerald-700',
  Cerrado:                'bg-green-100 text-green-700',
  Descartado:             'bg-brand-100 text-brand-400',
  'Reagendar solicitado': 'bg-orange-100 text-orange-700',
  Cancelado:              'bg-red-100 text-red-700',
  // Los pasos de un expediente de importación. Van en azul, como todo lo de
  // importación, y se van oscureciendo según avanza.
  'Depósito retenido':        'bg-blue-50 text-blue-700',
  'Verificado y pagado':    'bg-blue-100 text-blue-700',
  'En transporte':        'bg-blue-100 text-blue-800',
  'En trámites':          'bg-indigo-100 text-indigo-700',
  Entregado:              'bg-emerald-100 text-emerald-700',
};

const ALL_STATUSES = ['Pendiente', 'Contactado', 'En proceso', 'Cita confirmada', 'Visita realizada', 'Interesado', 'Vendido', 'Descartado', 'Reagendar solicitado', 'Cancelado'];

// Statuses available per lead type — visit has all, renting/info/question exclude appointment-specific ones
/**
 * Los pasos de un expediente de importación, en orden.
 *
 * El coche está en Alemania y tarda semanas: entre «le he llamado» y «lo tiene»
 * pasan cosas que hay que poder distinguir. Con «En proceso» a secas, quien
 * coge el teléfono no sabe si el coche está comprado, en un camión o en la ITV.
 */
export const PASOS_IMPORTACION = ['Pendiente', 'Contactado', 'Depósito retenido', 'Verificado y pagado', 'En transporte', 'En trámites', 'Entregado'];

function getAvailableStatuses(type: string): string[] {
  if (type === 'visit') return ALL_STATUSES;
  if (type === 'import') return [...PASOS_IMPORTACION, 'Descartado', 'Cancelado'];
  if (type === 'renting') return ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Cancelado'];
  return ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Cancelado'];
}

const WHEN_LABELS: Record<string, string> = {
  thisweek: 'Esta semana',
  nextweek: 'La próxima semana',
  them:     'Ellos indican',
};
const OUTREACH_COLORS: Record<string, string> = {
  pending:        'bg-amber-100 text-amber-700',
  no_answer:      'bg-orange-100 text-orange-700',
  called:         'bg-emerald-100 text-emerald-700',
  not_interested: 'bg-brand-100 text-brand-400',
};
const OUTREACH_LABELS: Record<string, string> = {
  pending:        'Por llamar',
  no_answer:      'No contesta',
  called:         'Llamado',
  not_interested: 'Descartado',
};

// Quick reply templates for common situations
const REPLY_TEMPLATES = [
  { label: 'En contacto', text: 'Hemos recibido su solicitud y nos ponemos en contacto con usted en breve para resolver todas sus dudas.' },
  { label: 'Cita asignada', text: 'Hemos asignado su cita con los detalles indicados. Por favor, confírmela desde su panel para que el vehículo quede reservado a su nombre.' },
  { label: 'No disponible', text: 'Lamentablemente el vehículo que le interesaba ya no está disponible. Podemos buscarle alternativas similares, ¿le interesa que le contactemos con opciones parecidas?' },
  { label: 'Llamada programada', text: 'Nuestro equipo le llamará en el horario que nos ha indicado para resolver sus dudas y ayudarle en el proceso.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModalidad(portal: string | undefined): { label: string; color: string } | null {
  // La importación es una sección del marketplace, aunque su `portal` no
  // empiece por «marketplace-vo»: viene de otra tabla y se guardó así.
  if (portal === 'importacion') return { label: 'Importación', color: 'bg-blue-100 text-blue-700' };
  if (!portal || !portal.startsWith('marketplace-vo')) return null;
  if (portal === 'marketplace-vo-renting') return { label: 'Renting', color: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Compra', color: 'bg-acento-tenue text-acento-texto' };
}

function formatOrigen(portal: string | undefined): { label: string; color: string } {
  if (!portal) return { label: '–', color: 'bg-brand-100 text-brand-400' };
  // Sin esto caía en el caso de abajo y salía «Portal: Importacion», como si
  // viniera de un portal de fuera y sin tilde.
  if (portal === 'importacion') return { label: 'Marketplace · Importación', color: 'bg-blue-100 text-blue-700' };
  if (portal === 'marketplace-vo-compra')  return { label: 'Marketplace · Compra',  color: 'bg-acento-tenue text-acento-texto' };
  if (portal === 'marketplace-vo-renting') return { label: 'Marketplace · Renting', color: 'bg-emerald-100 text-emerald-700' };
  if (portal.startsWith('marketplace-vo')) return { label: 'Marketplace VO',        color: 'bg-acento-tenue text-acento-texto' };
  const name = portal.charAt(0).toUpperCase() + portal.slice(1);
  return { label: `Portal: ${name}`, color: 'bg-acento-tenue text-acento-texto' };
}

function fmtDateTime(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

// Returns age label + urgency color for a Pendiente lead
function getAge(dateStr: string): { label: string; color: string } {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  const hours  = Math.floor(mins / 60);
  const days   = Math.floor(hours / 24);
  if (days > 0)   return { label: `hace ${days}d`,  color: 'text-red-600 bg-red-50 border-red-200' };
  if (hours >= 4) return { label: `hace ${hours}h`, color: 'text-red-600 bg-red-50 border-red-200' };
  if (hours >= 1) return { label: `hace ${hours}h`, color: 'text-amber-600 bg-amber-50 border-amber-200' };
  return { label: `hace ${mins}m`, color: 'text-brand-400 bg-brand-50 border-brand-200' };
}

// Calendar helpers
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Mon=0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<'solicitudes' | 'llamadas' | 'calendario'>('solicitudes');

  // ── Solicitudes state ──
  const [leads, setLeads]               = useState<Lead[]>([]);
  const [leadStats, setLeadStats]       = useState<LeadStats | null>(null);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [q, setQ]                       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [selected, setSelected]         = useState<Lead | null>(null);
  const [editStatus, setEditStatus]     = useState('');
  const [editNotes, setEditNotes]       = useState('');
  const [editResponse, setEditResponse] = useState('');
  const [editApptDate, setEditApptDate] = useState('');
  const [editApptTime, setEditApptTime] = useState('');
  const [editApptAddress, setEditApptAddress]   = useState('');
  const [editApptContact, setEditApptContact]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [notifying, setNotifying]       = useState(false);
  const [history, setHistory]           = useState<LeadHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);

  // ── Calendar state ──
  const [calendarLeads, setCalendarLeads]   = useState<Lead[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [weekStart, setWeekStart]           = useState<Date>(() => getWeekStart(new Date()));

  // ── Call queue state ──
  const [callQueue, setCallQueue]         = useState<CallQueueItem[]>([]);
  const [callStats, setCallStats]         = useState<CallQueueStats | null>(null);
  const [callLoading, setCallLoading]     = useState(false);
  const [callDays, setCallDays]           = useState(30);
  const [callPage, setCallPage]           = useState(1);
  const [callTotal, setCallTotal]         = useState(0);
  const callLimit = 50;
  const [exporting, setExporting]         = useState(false);
  const [showResolved, setShowResolved]   = useState(false);
  const [callType, setCallType]           = useState<'offer_no_lead' | 'registered_no_lead'>('offer_no_lead');
  const [expandedAnon, setExpandedAnon]     = useState<string | null>(null);
  const [noteText, setNoteText]             = useState('');
  const [actionSaving, setActionSaving]     = useState(false);
  const [expandedInfoAnon, setExpandedInfoAnon] = useState<string | null>(null);
  const [anonEvents, setAnonEvents]             = useState<Record<string, FunnelEventDetail[]>>({});
  const [eventsLoading, setEventsLoading]       = useState<string | null>(null);

  // ── Sale price modal (shown when marking a lead as Vendido) ──
  const [saleModal, setSaleModal]         = useState(false);
  const [salePrice, setSalePrice]         = useState('');
  const [saleNotes, setSaleNotes]         = useState('');
  const [savingSale, setSavingSale]       = useState(false);

  // ── Renting contract creation modal ──
  const [contractModal, setContractModal]         = useState(false);
  const [contractColor, setContractColor]         = useState('');
  const [contractQty, setContractQty]             = useState('1');
  const [contractDuration, setContractDuration]   = useState('36');
  const [contractKm, setContractKm]               = useState('15000');
  const [contractPrice, setContractPrice]         = useState('');
  const [contractStart, setContractStart]         = useState(() => new Date().toISOString().slice(0, 10));
  const [contractNotes, setContractNotes]         = useState('');
  const [creatingContract, setCreatingContract]   = useState(false);

  const limit = 50;

  // ── Load solicitudes ──
  const loadLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q)            params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType)   params.set('type', filterType);
    if (filterOrigin) params.set('origin', filterOrigin);
    const [res, statsRes] = await Promise.all([
      api.get<{ data: Lead[]; meta: { total: number } }>(`/leads?${params}`),
      api.get<{ data: LeadStats }>('/leads/stats'),
    ]);
    if (res.ok && res.data) {
      setLeads(res.data as unknown as Lead[]);
      setTotal((res as unknown as { meta: { total: number } }).meta?.total ?? 0);
    }
    if (statsRes.ok && statsRes.data) setLeadStats(statsRes.data as unknown as LeadStats);
    setLoading(false);
  }, [page, q, filterStatus, filterType, filterOrigin]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Auto-refresh when AppLayout detects a new lead
  useEffect(() => {
    function onNewLeads() { loadLeads(); }
    window.addEventListener('cw:new-leads', onNewLeads);
    return () => window.removeEventListener('cw:new-leads', onNewLeads);
  }, [loadLeads]);

  // ── Load calendar ──
  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    const res = await api.get<{ data: Lead[] }>('/leads?status=Cita+confirmada&limit=200&page=1');
    if (res.ok && res.data) {
      setCalendarLeads(res.data as unknown as Lead[]);
    }
    setCalendarLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'calendario') loadCalendar();
  }, [activeTab, loadCalendar]);

  // ── Load call queue ──
  const loadCallQueue = useCallback(async () => {
    setCallLoading(true);
    const r = await api.get<CallQueueItem[]>(`/funnel/callqueue?days=${callDays}&page=${callPage}&limit=${callLimit}&type=${callType}`);
    if (r.ok) {
      setCallQueue(r.data as unknown as CallQueueItem[]);
      setCallStats((r as unknown as { stats: CallQueueStats }).stats ?? null);
      setCallTotal((r as unknown as { meta: { total: number } }).meta?.total ?? 0);
    }
    setCallLoading(false);
  }, [callDays, callPage, callLimit, callType]);

  useEffect(() => {
    if (activeTab === 'llamadas') loadCallQueue();
  }, [activeTab, loadCallQueue]);

  // ── Export leads CSV ──
  async function exportLeadsCsv() {
    setExporting(true);
    const params = new URLSearchParams({ page: '1', limit: '1000' });
    if (q)            params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType)   params.set('type', filterType);
    if (filterOrigin) params.set('origin', filterOrigin);
    const res = await api.get<{ data: Lead[] }>(`/leads?${params}`);
    if (res.ok) {
      const rows = res.data as unknown as Lead[];
      const e = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['Fecha', 'Email', 'Vehículo', 'Tipo', 'Origen', 'Estado', 'Contacto', 'Teléfono', 'Cuándo', 'Respuesta PopCar'].join(',');
      const lines = rows.map((r) => [
        e(r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES') : ''),
        e(r.user_email),
        e(r.title),
        e(r.appointment_type),
        e(r.meta?.portal || ''),
        e(r.status),
        e(r.meta?.name || ''),
        e(r.meta?.phone || ''),
        e(r.meta?.when || ''),
        e(r.meta?.erp_response || ''),
      ].join(','));
      const csv = [header, ...lines].join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  // ── Solicitudes handlers ──
  async function openLead(lead: Lead) {
    setSelected(lead);
    setEditStatus(lead.status);
    setEditNotes(lead.meta?.erp_notes ?? '');
    setEditResponse(lead.meta?.erp_response ?? '');
    setEditApptDate(lead.meta?.appointment_date ?? '');
    setEditApptTime(lead.meta?.appointment_time ?? '');
    setEditApptAddress(lead.meta?.appointment_address ?? '');
    setEditApptContact(lead.meta?.appointment_contact ?? '');
    setHistory([]);
    setHistoryLoading(true);
    const r = await api.get<{ data: LeadHistoryEntry[] }>(`/leads/${lead.id}/history`);
    if (r.ok) setHistory((r as unknown as { data: LeadHistoryEntry[] }).data ?? []);
    setHistoryLoading(false);
  }

  async function saveLead(overrideSalePrice?: string, overrideSaleNotes?: string) {
    if (!selected) return;
    // If changing to Vendido and price not yet captured, open sale price modal first
    if (editStatus === 'Vendido' && overrideSalePrice === undefined) {
      setSalePrice('');
      setSaleNotes('');
      setSaleModal(true);
      return;
    }
    setSaving(true);
    const res = await api.patch(`/leads/${selected.id}`, {
      status: editStatus, notes: editNotes, erp_response: editResponse,
      appointment_date: editApptDate || null, appointment_time: editApptTime,
      appointment_address: editApptAddress, appointment_contact: editApptContact,
      ...(editStatus === 'Vendido' ? {
        sale_price: overrideSalePrice ? Number(overrideSalePrice) : null,
        sale_notes: overrideSaleNotes ?? null,
      } : {}),
    });
    if (res.ok) { await loadLeads(); setSelected(null); }
    setSaving(false);
  }

  /**
 * Marca —o desmarca— la fianza como cobrada.
 *
 * Se guarda al momento y no al darle a Guardar: es un hecho, no un borrador, y
 * de él depende que se compre un coche en Alemania. Al cobrarla, el expediente
 * pasa solo a «Depósito retenido» si estaba antes de eso.
 */
  async function marcaFianza(cobrada: boolean) {
    if (!selected) return;
    const r = await api.patch(`/leads/${selected.id}`, { deposit_paid: cobrada });
    if (r.ok) { await loadLeads(); setSelected(null); }
  }

  /**
   * Devuelve la fianza.
   *
   * Es dinero saliendo, así que se pregunta antes y se pide el motivo: al
   * cliente le llega ese motivo en el correo, con su factura rectificativa.
   */
  async function devuelveFianza() {
    if (!selected) return;
    const motivo = window.prompt('¿Por qué se le devuelve la fianza? Se lo contamos en el correo.', 'No se ha hecho el pedido');
    if (motivo === null) return;
    setDevolviendo(true);
    const r = await api.post<{ importe?: number; rectificativa?: string }>(
      `/leads/${selected.id}/devolver-fianza`, { motivo }
    );
    setDevolviendo(false);
    if (!r.ok) {
      window.alert(r.error === 'sin_cobro_guardado'
        ? 'No hay cobro guardado de esta fianza: devuélvela desde Stripe y márcalo aquí después.'
        : `No se ha podido devolver: ${r.error ?? 'error'}`);
      return;
    }
    await loadLeads();
    setSelected(null);
  }

  /** La fecha de entrega. Si cambia, la API se lo cuenta al cliente. */
  async function guardaEntrega(fecha: string) {
    if (!selected) return;
    if ((selected.meta?.delivery_estimate ?? '') === fecha) return;
    const r = await api.patch(`/leads/${selected.id}`, { delivery_estimate: fecha || null });
    if (r.ok) await loadLeads();
  }

  async function confirmSalePrice() {
    setSavingSale(true);
    await saveLead(salePrice || '0', saleNotes);
    setSaleModal(false);
    setSavingSale(false);
  }

  function openContractModal(lead: Lead) {
    // Pre-fill from contact_when: "Plazo: 36m · 15.000 km/año · 278 €/mes · 2x Blanco"
    const when = (lead.meta?.when ?? '') as string;
    const mDuration = when.match(/(\d+)m/);
    const mKm       = when.match(/([\d.]+)\s*km\/año/);
    const mPrice    = when.match(/([\d.,]+)\s*€\/mes/);
    const mColor    = when.match(/·\s*(\d+x\s*)?([\w\s]+)\s*$/);
    if (mDuration) setContractDuration(mDuration[1]);
    if (mKm)       setContractKm(mKm[1].replace('.', ''));
    if (mPrice)    setContractPrice(mPrice[1].replace('.', '').replace(',', '.'));
    if (mColor)    setContractColor(mColor[2].trim());
    setContractStart(new Date().toISOString().slice(0, 10));
    setContractQty('1');
    setContractNotes('');
    setContractModal(true);
  }

  async function createContract() {
    if (!selected) return;
    if (!contractDuration || !contractPrice || !contractStart) {
      alert('Rellena duración, precio mensual y fecha de inicio');
      return;
    }
    setCreatingContract(true);
    const res = await api.post('/contracts/renting', {
      lead_id: selected.id,
      color: contractColor || null,
      quantity: Number(contractQty) || 1,
      duration_months: Number(contractDuration),
      km_year: Number(contractKm) || null,
      monthly_price: Number(contractPrice),
      start_date: contractStart,
      notes: contractNotes || null,
    });
    if (res.ok) {
      setContractModal(false);
      setSelected(null);
      await loadLeads();
    } else {
      alert('Error al crear el contrato: ' + ((res as { error?: string }).error ?? 'desconocido'));
    }
    setCreatingContract(false);
  }

  async function notifyClient() {
    if (!selected) return;
    setNotifying(true);
    await api.patch(`/leads/${selected.id}`, {
      status: editStatus, notes: editNotes, erp_response: editResponse,
      appointment_date: editApptDate || null, appointment_time: editApptTime,
      appointment_address: editApptAddress, appointment_contact: editApptContact,
    });
    const res = await api.post(`/leads/${selected.id}/notify`, {});
    if (res.ok) { await loadLeads(); setSelected(null); }
    else alert('Error al enviar la notificación. Revisa la consola del servidor.');
    setNotifying(false);
  }

  // ── Call queue handlers ──
  async function doOutreach(anonId: string, userEmail: string | null, status: string, notes?: string) {
    setActionSaving(true);
    const r = await api.post('/funnel/outreach', { anon_id: anonId, user_email: userEmail, status, notes: notes ?? null });
    if (r.ok) {
      setCallQueue((prev) =>
        prev.map((item) =>
          item.anon_id === anonId
            ? { ...item, outreach_status: status as CallQueueItem['outreach_status'], outreach_notes: notes ?? item.outreach_notes }
            : item
        )
      );
      setExpandedAnon(null);
      setNoteText('');
    }
    setActionSaving(false);
  }

  async function toggleInfoExpand(item: CallQueueItem) {
    const anonId = item.anon_id;
    if (expandedInfoAnon === anonId) { setExpandedInfoAnon(null); return; }
    setExpandedInfoAnon(anonId);
    if (anonEvents[anonId]) return;
    setEventsLoading(anonId);
    const r = await api.get<FunnelEventDetail[]>(
      `/funnel/events?anon_id=${encodeURIComponent(anonId)}&limit=30&days=90`
    );
    if (r.ok) setAnonEvents((prev) => ({ ...prev, [anonId]: r.data as unknown as FunnelEventDetail[] }));
    setEventsLoading(null);
  }

  function startCallAction(anonId: string, existingNotes: string | null) {
    setExpandedAnon(expandedAnon === anonId ? null : anonId);
    setNoteText(existingNotes ?? '');
  }

  const visibleQueue = showResolved
    ? callQueue
    : callQueue.filter((i) => i.outreach_status === 'pending' || i.outreach_status === 'no_answer');

  // ── Calendar computed ──
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = isoDate(new Date());

  const calendarByDay: Record<string, Lead[]> = {};
  for (const lead of calendarLeads) {
    const d = lead.meta?.appointment_date?.slice(0, 10);
    if (d) {
      if (!calendarByDay[d]) calendarByDay[d] = [];
      calendarByDay[d].push(lead);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      <PageHeader title="Leads" subtitle="Solicitudes recibidas, calendario de citas y cola de llamadas proactivas" />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-brand-200">
        {([
          { key: 'solicitudes',  label: 'Solicitudes',        badge: leadStats?.pending ?? null },
          { key: 'calendario',   label: 'Calendario de citas', badge: null },
          { key: 'llamadas',     label: 'Cola de llamadas',    badge: callStats?.pending ?? (activeTab === 'llamadas' ? 0 : null) },
        ] as const).map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              activeTab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-brand-400 hover:text-brand-500'
            }`}
          >
            {label}
            {badge !== null && badge > 0 && (
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                activeTab === key ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'
              }`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ SOLICITUDES */}
      {activeTab === 'solicitudes' && (
        <>
          {leadStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total',        value: leadStats.total,     color: 'bg-brand-50 border-brand-200' },
                { label: 'Pendientes',   value: leadStats.pending,   color: 'bg-amber-50 border-amber-200' },
                { label: 'Esta semana',  value: leadStats.new_7d,    color: 'bg-acento-tenue border-acento' },
                { label: 'Contactados',  value: leadStats.contacted, color: 'bg-brand-50 border-brand-200' },
                { label: 'Resueltos',    value: leadStats.resolved,  color: 'bg-green-50 border-green-200' },
              ].map((s) => (
                <div key={s.label} className={`${s.color} border rounded-xl p-4`}>
                  <p className="text-2xl font-bold text-brand-600">{s.value}</p>
                  <p className="text-xs text-brand-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* De qué son las solicitudes.

              La API calculaba estas cifras desde el principio y no las pintaba
              nadie: cálculo muerto. Y con ellas a la vista se ve de un vistazo si
              lo que entra son visitas, rentings o importaciones, que es lo que
              dice a qué dedicar el día. Solo salen las que tienen algo. */}
          {leadStats && (
            <div className="flex flex-wrap gap-2 mb-6">
              {[
                { label: 'Visitas',        value: leadStats.type_visit,    clase: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                { label: 'Info',           value: leadStats.type_info,     clase: 'bg-acento-tenue border-acento text-acento-texto' },
                { label: 'Preguntas',      value: leadStats.type_question, clase: 'bg-brand-50 border-brand-200 text-brand-500' },
                { label: 'Renting',        value: leadStats.type_renting,  clase: 'bg-green-50 border-green-200 text-green-800' },
                { label: 'Importaciones',  value: leadStats.type_import,   clase: 'bg-blue-50 border-blue-200 text-blue-800' },
              ].filter((x) => Number(x.value) > 0).map((x) => (
                <span key={x.label} className={`${x.clase} border rounded-lg px-3 py-1.5 text-[13px]`}>
                  <strong className="font-bold">{x.value}</strong> {x.label}
                </span>
              ))}
              {Number(leadStats.portal_externo) > 0 && (
                <span className="bg-brand-50 border border-brand-200 text-brand-400 rounded-lg px-3 py-1.5 text-[13px]">
                  <strong className="font-bold">{leadStats.portal_externo}</strong> de portales de fuera
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input
              type="text"
              placeholder="Buscar por email, vehículo…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="border border-brand-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los estados</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los tipos</option>
              <option value="info">Solicitar info</option>
              <option value="visit">Agendar visita</option>
              <option value="question">Preguntar</option>
              <option value="renting">Oferta de renting</option>
            </select>
            <select value={filterOrigin} onChange={(e) => { setFilterOrigin(e.target.value); setPage(1); }}
              className="border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los orígenes</option>
              <option value="marketplace-vo-compra">Marketplace · Compra</option>
              <option value="marketplace-vo-renting">Marketplace · Renting</option>
              <option value="portales">Portales externos</option>
            </select>
            <button onClick={exportLeadsCsv} disabled={exporting}
              className="ml-auto px-3 py-2 text-xs border border-brand-200 rounded-lg text-brand-400 hover:bg-brand-50 disabled:opacity-60 whitespace-nowrap">
              {exporting ? 'Exportando…' : '↓ Exportar Excel'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-brand-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-brand-300 text-sm">Cargando…</div>
            ) : leads.length === 0 ? (
              <div className="p-12 text-center text-brand-300 text-sm">No hay solicitudes todavía.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Origen</th><th>Modalidad</th><th>Tipo</th><th>Contacto</th><th>Vehículo</th><th>Cuándo</th><th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => {
                      const isPending = lead.status === 'Pendiente';
                      const age = isPending ? getAge(lead.created_at) : null;
                      return (
                        <tr key={lead.id} className="cursor-pointer hover:bg-brand-50" onClick={() => openLead(lead)}>
                          <td className="text-brand-400 text-xs whitespace-nowrap">
                            <div>{new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            {age && (
                              <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${age.color}`}>
                                {age.label}
                              </span>
                            )}
                          </td>
                          <td>
                            {(() => { const o = formatOrigen(lead.meta?.portal); return (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${o.color}`}>{o.label}</span>
                            ); })()}
                          </td>
                          <td>
                            {(() => { const m = getModalidad(lead.meta?.portal); return m
                              ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>{m.label}</span>
                              : <span className="text-brand-300 text-xs">–</span>;
                            })()}
                          </td>
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[lead.appointment_type] ?? 'bg-brand-100 text-brand-400'}`}>
                              {TYPE_LABELS[lead.appointment_type] ?? lead.appointment_type}
                            </span>
                          </td>
                          <td>
                            <p className="font-medium text-brand-600 text-sm">{lead.meta?.name ?? '—'}</p>
                            <p className="text-xs text-brand-400">{lead.user_email}</p>
                            <p className="text-xs text-brand-300">{lead.meta?.phone ?? ''}</p>
                          </td>
                          <td className="text-sm text-brand-500 max-w-[220px] truncate">{lead.title}</td>
                          <td className="text-xs text-brand-400">
                            {lead.meta?.when ? (WHEN_LABELS[lead.meta.when] ?? lead.meta.when) : '—'}
                          </td>
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-brand-100 text-brand-400'}`}>
                              {lead.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {total > limit && (
            <div className="mt-4">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════ CALENDARIO */}
      {activeTab === 'calendario' && (
        <>
          {/* Week navigator */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg hover:bg-brand-50 text-brand-400"
            >
              ← Semana anterior
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-brand-500">
                {weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                {' — '}
                {weekDays[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {isoDate(weekStart) !== isoDate(getWeekStart(new Date())) && (
                <button
                  onClick={() => setWeekStart(getWeekStart(new Date()))}
                  className="text-xs text-brand-600 hover:underline mt-0.5"
                >
                  Volver a esta semana
                </button>
              )}
            </div>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg hover:bg-brand-50 text-brand-400"
            >
              Semana siguiente →
            </button>
          </div>

          {calendarLoading ? (
            <div className="p-12 text-center text-brand-300 text-sm">Cargando citas…</div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day, i) => {
                const dateKey = isoDate(day);
                const isToday = dateKey === today;
                const dayLeads = calendarByDay[dateKey] ?? [];
                return (
                  <div
                    key={dateKey}
                    className={`rounded-xl border min-h-[160px] ${
                      isToday
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-brand-200 bg-white'
                    }`}
                  >
                    {/* Day header */}
                    <div className={`px-2 py-2 border-b text-center rounded-t-xl ${
                      isToday ? 'border-brand-200 bg-brand-100' : 'border-brand-100 bg-brand-50'
                    }`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-brand-700' : 'text-brand-300'}`}>
                        {DAY_LABELS[i]}
                      </p>
                      <p className={`text-lg font-bold leading-tight ${isToday ? 'text-brand-700' : 'text-brand-500'}`}>
                        {day.getDate()}
                      </p>
                    </div>

                    {/* Appointments */}
                    <div className="p-1.5 space-y-1.5">
                      {dayLeads.length === 0 ? (
                        <p className="text-[10px] text-brand-300 text-center py-3">Sin citas</p>
                      ) : (
                        dayLeads
                          .sort((a, b) => (a.meta?.appointment_time ?? '').localeCompare(b.meta?.appointment_time ?? ''))
                          .map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => openLead(lead)}
                              className="w-full text-left bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 hover:bg-emerald-100 transition-colors group"
                            >
                              {lead.meta?.appointment_time && (
                                <p className="text-[10px] font-bold text-emerald-700 mb-0.5">
                                  {lead.meta.appointment_time}
                                </p>
                              )}
                              <p className="text-[11px] font-semibold text-brand-500 truncate leading-tight">
                                {lead.meta?.name ?? lead.user_email}
                              </p>
                              <p className="text-[10px] text-brand-400 truncate leading-tight">
                                {lead.title}
                              </p>
                              {lead.meta?.appointment_contact && (
                                <p className="text-[10px] text-emerald-600 mt-0.5">
                                  {lead.meta.appointment_contact}
                                </p>
                              )}
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total citas semana */}
          <p className="text-xs text-brand-300 mt-3 text-right">
            {weekDays.reduce((acc, d) => acc + (calendarByDay[isoDate(d)]?.length ?? 0), 0)} cita{weekDays.reduce((acc, d) => acc + (calendarByDay[isoDate(d)]?.length ?? 0), 0) !== 1 ? 's' : ''} esta semana
            {' · '}
            <button onClick={loadCalendar} className="text-brand-600 hover:underline">Actualizar</button>
          </p>
        </>
      )}

      {/* ════════════════════════════════════════════════════════ COLA LLAMADAS */}
      {activeTab === 'llamadas' && (
        <>
          {/* Segment selector */}
          <div className="flex gap-1 mb-5 bg-brand-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => { setCallType('offer_no_lead'); setCallPage(1); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                callType === 'offer_no_lead' ? 'bg-white shadow text-brand-500' : 'text-brand-400 hover:text-brand-500'
              }`}
            >
              Vieron oferta
            </button>
            <button
              onClick={() => { setCallType('registered_no_lead'); setCallPage(1); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                callType === 'registered_no_lead' ? 'bg-white shadow text-brand-500' : 'text-brand-400 hover:text-brand-500'
              }`}
            >
              Registrados inactivos
            </button>
          </div>

          {/* Explanation banner */}
          <div className="mb-5 bg-acento-tenue border border-acento rounded-xl px-4 py-3 text-xs text-acento-texto leading-relaxed">
            {callType === 'registered_no_lead' ? (
              <><strong>¿Qué es esto?</strong> Usuarios que crearon una cuenta pero nunca hicieron ninguna solicitud.
              Son leads cálidos: ya confiaron lo suficiente para registrarse.
              Puedes llamarles: <em>"Hemos visto que creaste una cuenta, ¿te puedo ayudar a encontrar el vehículo que buscas?"</em></>
            ) : (
              <><strong>¿Qué es esto?</strong> Usuarios que vieron una o más ofertas pero no solicitaron visita ni información.
              Puedes llamarles proactivamente: <em>"Hemos visto que viste el [vehículo], ¿te puedo ayudar a resolver alguna duda?"</em></>
            )}
          </div>

          {/* Stats + controls */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="flex gap-3">
              {[
                { label: 'Por llamar',        value: callStats?.pending   ?? '–', color: 'bg-amber-50 border-amber-200 text-amber-800' },
                { label: 'No contesta',       value: callStats?.no_answer ?? '–', color: 'bg-orange-50 border-orange-200 text-orange-800' },
                { label: 'Resueltos',         value: callStats?.resolved  ?? '–', color: 'bg-brand-50 border-brand-200 text-brand-400' },
              ].map((s) => (
                <div key={s.label} className={`${s.color} border rounded-xl px-4 py-3 min-w-[100px]`}>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-400">Período:</span>
              {[7, 14, 30, 60].map((d) => (
                <button key={d}
                  onClick={() => { setCallDays(d); setCallPage(1); }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    callDays === d
                      ? 'bg-brand-600 border-brand-600 text-white font-medium'
                      : 'border-brand-200 text-brand-400 hover:bg-brand-50'
                  }`}>
                  {d}d
                </button>
              ))}
              <button
                onClick={() => setShowResolved((v) => !v)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  showResolved
                    ? 'bg-brand-400 border-brand-400 text-white'
                    : 'border-brand-200 text-brand-400 hover:bg-brand-50'
                }`}>
                {showResolved ? '✓ Mostrando todos' : 'Mostrar resueltos'}
              </button>
            </div>
          </div>

          {/* Queue table */}
          <div className="bg-white rounded-xl border border-brand-200 overflow-hidden">
            {callLoading ? (
              <div className="p-12 text-center text-brand-300 text-sm">Cargando cola…</div>
            ) : visibleQueue.length === 0 ? (
              <div className="p-12 text-center text-brand-300 text-sm">
                {showResolved
                  ? callType === 'registered_no_lead'
                    ? 'No hay registrados inactivos en este período.'
                    : 'No hay visitas sin conversión en este período.'
                  : '¡Cola vacía! Todos los contactos han sido gestionados.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-brand-50 border-b border-brand-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide">Contacto</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide">
                      {callType === 'registered_no_lead' ? 'Actividad · contexto de llamada' : 'Oferta(s) vistas · contexto de llamada'}
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide w-36">Última visita</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide w-24">Fuente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide w-28">Estado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-brand-400 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {visibleQueue.map((item) => {
                    const isExpanded     = expandedAnon === item.anon_id;
                    const isInfoExpanded = expandedInfoAnon === item.anon_id;
                    const isResolved     = item.outreach_status === 'called' || item.outreach_status === 'not_interested';
                    return (
                      <>
                        <tr key={item.anon_id}
                          onClick={() => toggleInfoExpand(item)}
                          className={`${isResolved ? 'opacity-50' : ''} hover:bg-brand-50 transition-colors cursor-pointer`}>
                          <td className="px-4 py-3">
                            {item.user_email ? (
                              <span className="text-acento-texto font-medium text-xs">{item.user_email}</span>
                            ) : (
                              <span className="text-brand-300 font-mono text-xs">{item.anon_id.slice(0, 20)}…</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(item.offers_viewed ?? []).length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {(item.offers_viewed ?? []).map((o, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-acento-tenue border border-acento text-acento-texto rounded text-xs font-medium max-w-[240px] truncate">
                                    {o.title}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-brand-300 text-xs italic">
                                {callType === 'registered_no_lead' ? 'Registrado · sin consultas de oferta' : 'Sin oferta registrada'}
                              </span>
                            )}
                            {item.outreach_notes && (
                              <p className="text-xs text-brand-300 mt-1 italic">"{item.outreach_notes}"</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-brand-400 whitespace-nowrap">
                            {fmtDateTime(item.last_seen)}
                          </td>
                          <td className="px-4 py-3 text-xs text-brand-400">
                            {item.utm_source || <span className="text-brand-300">–</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${OUTREACH_COLORS[item.outreach_status]}`}>
                              {OUTREACH_LABELS[item.outreach_status]}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {isResolved ? (
                              <button
                                onClick={() => doOutreach(item.anon_id, item.user_email, 'pending')}
                                disabled={actionSaving}
                                className="text-xs text-brand-300 hover:text-brand-400 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 disabled:opacity-40">
                                ↩ Reabrir
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => startCallAction(item.anon_id, item.outreach_notes)}
                                  disabled={actionSaving}
                                  className={`text-xs rounded-lg px-2.5 py-1 font-medium border transition-colors disabled:opacity-40 ${
                                    isExpanded
                                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                  }`}>
                                  ✓ Llamado
                                </button>
                                <button
                                  onClick={() => doOutreach(item.anon_id, item.user_email, 'no_answer')}
                                  disabled={actionSaving}
                                  className="text-xs bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40">
                                  ↩ No contesta
                                </button>
                                <button
                                  onClick={() => doOutreach(item.anon_id, item.user_email, 'not_interested')}
                                  disabled={actionSaving}
                                  className="text-xs text-brand-300 hover:text-brand-400 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 disabled:opacity-40">
                                  × Descartar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isInfoExpanded && (
                          <tr key={`${item.anon_id}-info`}>
                            <td colSpan={6} className="px-5 py-4 bg-brand-50 border-b border-brand-200">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                  <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wide mb-2">Datos del contacto</p>
                                  <dl className="space-y-1.5">
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-brand-300 w-24 shrink-0">Email</dt>
                                      <dd className="text-brand-500 font-medium break-all">{item.user_email ?? <span className="font-mono text-brand-300">{item.anon_id}</span>}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-brand-300 w-24 shrink-0">Primera visita</dt>
                                      <dd className="text-brand-400">{fmtDateTime(item.first_seen)}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-brand-300 w-24 shrink-0">Última visita</dt>
                                      <dd className="text-brand-400">{fmtDateTime(item.last_seen)}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-brand-300 w-24 shrink-0">Fuente</dt>
                                      <dd className="text-brand-400">{item.utm_source || '–'}</dd>
                                    </div>
                                    {item.utm_campaign && (
                                      <div className="flex gap-2 text-xs">
                                        <dt className="text-brand-300 w-24 shrink-0">Campaña</dt>
                                        <dd className="text-brand-400">{item.utm_campaign}</dd>
                                      </div>
                                    )}
                                  </dl>
                                  {(item.offers_viewed ?? []).length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wide mb-1.5">Oferta(s) de interés</p>
                                      <div className="space-y-1">
                                        {(item.offers_viewed ?? []).map((o, i) => (
                                          <div key={i} className="flex items-center gap-2 text-xs text-acento-texto bg-acento-tenue border border-acento rounded-lg px-2.5 py-1.5">
                                            {' '}
                                            {o.url ? (
                                              <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-acento-texto truncate">
                                                {o.title}
                                              </a>
                                            ) : (
                                              <span className="truncate">{o.title}</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wide mb-2">Actividad en la visita</p>
                                  {eventsLoading === item.anon_id ? (
                                    <p className="text-brand-300 text-xs">Cargando…</p>
                                  ) : (anonEvents[item.anon_id] ?? []).length === 0 ? (
                                    <p className="text-brand-300 text-xs italic">Sin eventos detallados registrados</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {(anonEvents[item.anon_id] ?? []).map((ev) => (
                                        <div key={ev.id} className="flex items-start gap-2">
                                          <span className="text-[10px] text-brand-300 whitespace-nowrap mt-0.5 w-10 shrink-0">
                                            {ev.created_at ? new Date(ev.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                                          </span>
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${EVENT_COLORS[ev.event_type] ?? 'bg-brand-100 text-brand-400'}`}>
                                            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                          </span>
                                          {ev.offer_title && (
                                            <span className="text-xs text-brand-400 truncate max-w-[180px]">{ev.offer_title}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {isExpanded && (
                          <tr key={`${item.anon_id}-expand`} className="bg-emerald-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex flex-col gap-2 max-w-xl">
                                <p className="text-xs font-medium text-emerald-800">Notas de la llamada (opcional)</p>
                                <textarea
                                  rows={2}
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  placeholder="Ej: Interesado pero pide financiación, volver a llamar en 2 semanas…"
                                  className="w-full border border-emerald-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none bg-white"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => doOutreach(item.anon_id, item.user_email, 'called', noteText)}
                                    disabled={actionSaving}
                                    className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-60">
                                    {actionSaving ? 'Guardando…' : '✓ Confirmar llamada'}
                                  </button>
                                  <button
                                    onClick={() => { setExpandedAnon(null); setNoteText(''); }}
                                    className="px-3 py-1.5 text-xs text-brand-400 border border-brand-200 rounded-lg hover:bg-white">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {callTotal > callLimit && (
            <div className="mt-3">
              <Pagination page={callPage} limit={callLimit} total={callTotal} onChange={setCallPage} />
            </div>
          )}
          {callTotal > 0 && (
            <p className="text-xs text-brand-300 mt-2 text-right">
              {callTotal} contacto{callTotal !== 1 ? 's' : ''} en total · últimos {callDays} días
            </p>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════ LEAD MODAL */}
      {selected && (
        <Modal open={true} title={`Lead: ${selected.meta?.name ?? selected.user_email}`} onClose={() => setSelected(null)} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selected.appointment_type === 'import' && (
                /* El expediente: lo que se le dijo, si lo ha pagado y cuándo lo
                   tendrá. Es lo que hay que mirar antes de cogerle el teléfono. */
                <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-3">
                  {/* Un expediente de importación se lleva en su sección: ahí
                      están todos, repartidos por la etapa en la que van. Aquí
                      se deja lo justo para quien llega por el lead. */}
                  <a href="/importaciones"
                     className="inline-block text-[11px] font-bold text-blue-700 underline underline-offset-2">
                    Ver en Importaciones →
                  </a>
                  {selected.meta?.deposit_quoted != null && (
                    <div>
                      <span className="text-blue-700 text-xs block font-semibold">Fianza que se le dijo</span>
                      <span className="font-bold text-blue-800 text-lg">
                        {Number(selected.meta.deposit_quoted).toLocaleString('es-ES')} €
                      </span>
                      <span className="text-blue-700/80 text-xs block mt-0.5">
                        El 30 % del precio con el coste de traerlo, al pedirlo. No se recalcula.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-blue-200/70">
                    {/* Hasta que la fianza no está, no se compra nada en Alemania:
                        es el paso que más cambia el expediente. */}
                    {selected.meta?.deposit_paid_at ? (
                      <>
                        <span className="text-[13px] font-bold text-emerald-700">
                          ✓ Fianza cobrada el {new Date(selected.meta.deposit_paid_at).toLocaleDateString('es-ES')}
                        </span>
                        <button onClick={() => marcaFianza(false)}
                                className="text-[11px] text-brand-400 underline underline-offset-2">
                          no estaba cobrada
                        </button>
                        {/* Se devuelve si al final no se hace el pedido. Sale
                            aquí, junto al cobro, porque es deshacerlo. */}
                        {selected.meta?.deposit_refunded_at ? (
                          <span className="text-[13px] font-bold text-brand-500">
                            ↩ Devuelta el {new Date(selected.meta.deposit_refunded_at).toLocaleDateString('es-ES')}
                          </span>
                        ) : (
                          <button onClick={devuelveFianza} disabled={devolviendo}
                                  className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                            {devolviendo ? 'Devolviendo…' : 'Devolver la fianza'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button onClick={() => marcaFianza(true)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800">
                        Marcar fianza como cobrada
                      </button>
                    )}
                  </div>

                  {/* La fecha no existe hasta que hay pedido.

                      Antes de pedirlo a Alemania no hay plazo que dar: ponerla
                      antes es inventarse una fecha y mandársela al cliente, que
                      es justo lo que este campo intenta evitar. */}
                  {(() => {
                    const hechoElPedido = PASOS_IMPORTACION.indexOf(selected.status) >=
                      PASOS_IMPORTACION.indexOf('Verificado y pagado');
                    return (
                      <div className="pt-1 border-t border-blue-200/70">
                        <label className="text-blue-700 text-xs font-semibold block mb-1">
                          Cuándo le hemos dicho que lo tendrá
                        </label>
                        {hechoElPedido ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input type="date" defaultValue={selected.meta?.delivery_estimate ?? ''}
                                   onBlur={(e) => guardaEntrega(e.target.value)}
                                   className="px-2 py-1 text-sm border border-blue-200 rounded-lg bg-white" />
                            <span className="text-blue-700/80 text-[11px]">
                              Si la cambias, se le avisa por correo con las dos fechas.
                            </span>
                          </div>
                        ) : (
                          <p className="text-blue-700/80 text-[12px]">
                            Todavía no: la fecha la dan al hacer el pedido a Alemania. Este
                            expediente está en <strong>{selected.status}</strong>.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              <div><span className="text-brand-300 text-xs block">Tipo</span><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${TYPE_COLORS[selected.appointment_type] ?? 'bg-brand-100 text-brand-400'}`}>{TYPE_LABELS[selected.appointment_type] ?? selected.appointment_type}</span></div>
              <div><span className="text-brand-300 text-xs block">{selected.appointment_type === 'renting' ? 'Opción solicitada' : 'Cuándo'}</span><span className="font-medium">{selected.appointment_type === 'renting' ? (selected.meta?.when ?? '—') : (WHEN_LABELS[selected.meta?.when ?? ''] ?? selected.meta?.when ?? '—')}</span></div>
              <div><span className="text-brand-300 text-xs block">Email</span><span className="font-medium">{selected.user_email}</span></div>
              <div><span className="text-brand-300 text-xs block">Teléfono</span><span className="font-medium">{selected.meta?.phone ?? '—'}</span></div>
              <div className="col-span-2"><span className="text-brand-300 text-xs block">Vehículo</span><span className="font-medium">{selected.title}</span></div>
              {enlaceAlAnuncio(selected.meta?.vehicle_url) && (
                <div className="col-span-2"><span className="text-brand-300 text-xs block">Enlace al anuncio</span><a href={enlaceAlAnuncio(selected.meta?.vehicle_url) ?? undefined} target="_blank" rel="noreferrer" className="text-brand-600 underline text-xs truncate block">{enlaceAlAnuncio(selected.meta?.vehicle_url)}</a></div>
              )}
              {selected.meta?.portal && (
                <div><span className="text-brand-300 text-xs block">Portal</span><span className="font-medium capitalize">{selected.meta.portal}</span></div>
              )}
              <div><span className="text-brand-300 text-xs block">Recibido</span><span className="font-medium">{new Date(selected.created_at).toLocaleString('es-ES')}</span></div>
            </div>

            {/* Status — filtered by lead type */}
            <div>
              <label className="block text-xs font-medium text-brand-400 mb-1">Estado</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {getAvailableStatuses(selected.appointment_type).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {selected.appointment_type === 'visit' && (
              <div className="bg-acento-tenue border border-acento rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-acento-texto">Datos de la cita</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-brand-400 mb-1">Fecha</label>
                    <input type="date" value={editApptDate} onChange={(e) => setEditApptDate(e.target.value)}
                      className="w-full border border-brand-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-brand-400 mb-1">Hora</label>
                    <input type="time" value={editApptTime} onChange={(e) => setEditApptTime(e.target.value)}
                      className="w-full border border-brand-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-brand-400 mb-1">Dirección</label>
                    <input type="text" value={editApptAddress} onChange={(e) => setEditApptAddress(e.target.value)}
                      placeholder="Calle, ciudad…"
                      className="w-full border border-brand-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-brand-400 mb-1">Persona de contacto (pregunta por…)</label>
                    <input type="text" value={editApptContact} onChange={(e) => setEditApptContact(e.target.value)}
                      placeholder="Nombre del comercial o responsable"
                      className="w-full border border-brand-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              </div>
            )}

            {selected.meta?.reschedule_proposals?.length ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-700">El cliente propone estas opciones — selecciona una para rellenar la fecha</p>
                <div className="space-y-1.5">
                  {selected.meta.reschedule_proposals.map((p, i) => {
                    const isSelected = editApptDate === p.date && editApptTime === (p.time || '');
                    return (
                      <button key={i} type="button"
                        onClick={(e) => { e.stopPropagation(); setEditApptDate(p.date); setEditApptTime(p.time || ''); setEditStatus('Contactado'); }}
                        className={`w-full text-left text-sm px-3 py-2.5 border rounded-lg transition-colors flex justify-between items-center font-medium ${
                          isSelected ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-orange-300 hover:bg-orange-100 text-brand-500 cursor-pointer'
                        }`}>
                        <span>
                          {p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : p.date}
                          {p.time && <span className="ml-2 text-brand-400">{p.time}</span>}
                        </span>
                        <span className={`text-xs font-semibold ml-2 shrink-0 ${isSelected ? 'text-green-700' : 'text-orange-600'}`}>
                          {isSelected ? '✓ Seleccionada' : 'Usar esta →'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {editApptDate && <p className="text-xs text-orange-700 pt-1">✓ Fecha aplicada en el campo de arriba. Completa dirección y contacto, luego notifica.</p>}
              </div>
            ) : null}

            {/* Reply templates */}
            <div>
              <label className="block text-xs font-medium text-brand-400 mb-1.5">Respuesta al cliente</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REPLY_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setEditResponse(t.text)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-brand-200 bg-brand-50 text-brand-400 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea rows={3} value={editResponse} onChange={(e) => setEditResponse(e.target.value)}
                placeholder="Mensaje que verá el cliente en su panel y recibirá por email…"
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-400 mb-1">Notas internas</label>
              <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas privadas (no se envían al cliente)…"
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            {/* ── Historial de cambios ── */}
            {(historyLoading || history.length > 0) && (
              <div className="border-t border-brand-100 pt-3">
                <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wide mb-2">Historial</p>
                {historyLoading ? (
                  <p className="text-xs text-brand-300">Cargando…</p>
                ) : (
                  <ol className="space-y-1">
                    {history.map((h) => (
                      <li key={h.id} className="flex gap-2 text-xs text-brand-400">
                        <span className="text-brand-300 whitespace-nowrap">
                          {new Date(h.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-medium text-brand-500">{h.operator}</span>
                        <span>
                          {h.field === 'status' ? <>cambió estado: <em>{h.old_value || '–'}</em> → <strong>{h.new_value}</strong></> :
                           h.field === 'erp_response' ? <>actualizó respuesta al cliente</> :
                           h.field === 'appointment_date' ? <>fijó cita: <strong>{h.new_value || 'borrada'}</strong></> :
                           <>{h.field}: {h.old_value} → {h.new_value}</>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {selected.notified_at && (
              <p className="text-xs text-brand-300 text-right pt-1">
                Último email enviado: {new Date(selected.notified_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">Cancelar</button>
              {/* Renting contract button — shown for any renting lead (marketplace or external portal) not yet closed */}
              {(selected.appointment_type === 'renting' || selected.meta?.portal === 'marketplace-vo-renting') &&
               selected.status !== 'Cerrado' && selected.status !== 'Descartado' && selected.status !== 'Cancelado' && (
                <button onClick={() => openContractModal(selected)}
                  className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">
                  Crear contrato de renting
                </button>
              )}
              <button onClick={() => saveLead()} disabled={saving}
                className="px-4 py-2 text-sm border border-brand-300 text-brand-500 bg-white hover:bg-brand-50 rounded-lg disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button onClick={notifyClient} disabled={notifying || saving}
                className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-60 font-medium">
                {notifying ? 'Enviando…' : `${selected.notified_at ? 'Reenviar notificación' : 'Guardar y notificar cliente'}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Renting contract creation modal */}
      <Modal open={contractModal && !!selected} onClose={() => setContractModal(false)} title="Crear contrato de renting">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-brand-400">
              <strong>{selected.title}</strong>
              <span className="text-brand-300 ml-2">· {selected.meta?.name || selected.user_email}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Color</label>
                <input value={contractColor} onChange={e => setContractColor(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Blanco" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Unidades</label>
                <input type="number" min="1" max="50" value={contractQty} onChange={e => setContractQty(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Duración (meses) *</label>
                <select value={contractDuration} onChange={e => setContractDuration(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm">
                  {[12, 24, 36, 48, 60].map(m => <option key={m} value={m}>{m} meses</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Km/año</label>
                <select value={contractKm} onChange={e => setContractKm(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm">
                  {[10000, 15000, 20000, 25000, 30000].map(k => <option key={k} value={k}>{k.toLocaleString('es-ES')} km/año</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Precio €/mes *</label>
                <input type="number" min="0" step="0.01" value={contractPrice} onChange={e => setContractPrice(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" placeholder="278.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-400 mb-1">Fecha inicio *</label>
                <input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {contractDuration && contractPrice && (
              <p className="text-xs text-brand-400 bg-brand-50 rounded-lg px-3 py-2">
                Valor total contrato: <strong>{(Number(contractDuration) * Number(contractPrice)).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €</strong>
                {' · '}Fin previsto: <strong>{(() => {
                  const d = new Date(contractStart); d.setMonth(d.getMonth() + Number(contractDuration));
                  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                })()}</strong>
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-brand-400 mb-1">Notas internas</label>
              <textarea value={contractNotes} onChange={e => setContractNotes(e.target.value)}
                rows={2} className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Condiciones especiales, unidad asignada, etc." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setContractModal(false)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">Cancelar</button>
              <button onClick={createContract} disabled={creatingContract}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-60">
                {creatingContract ? 'Creando…' : '✓ Formalizar contrato'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sale price modal */}
      <Modal open={saleModal} onClose={() => setSaleModal(false)} title="Registrar precio de venta">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-brand-400">
              Vas a marcar <strong>{selected.title || selected.meta?.name}</strong> como <strong>Vendido</strong>.
              <br />
              <span className="text-xs text-brand-300">Introduce el precio de venta para que aparezca en Contratos.</span>
            </p>
            <div>
              <label className="block text-xs font-semibold text-brand-400 mb-1">Precio de venta (€)</label>
              <input
                type="number" min="0" step="100"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ej: 18500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-400 mb-1">Notas de venta (opcional)</label>
              <textarea
                value={saleNotes}
                onChange={e => setSaleNotes(e.target.value)}
                rows={2}
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ej: venta directa, financiado, sin extras…"
              />
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => { setSaleModal(false); saveLead('0', ''); }}
                className="text-xs text-brand-300 hover:text-brand-400 underline"
              >
                Guardar sin precio
              </button>
              <div className="flex gap-2">
                <button onClick={() => setSaleModal(false)} className="px-4 py-2 text-sm text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
                  Cancelar
                </button>
                <button onClick={confirmSalePrice} disabled={savingSale}
                  className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                  {savingSale ? 'Guardando…' : 'Confirmar venta'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
