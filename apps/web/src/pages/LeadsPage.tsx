import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';

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
}

interface Lead {
  id: string;
  user_email: string;
  vehicle_id: string;
  appointment_type: 'info' | 'visit' | 'question' | 'renting';
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
  landing:          'bg-slate-100 text-slate-600',
  marketplace_view: 'bg-blue-50 text-blue-700',
  offer_view:       'bg-violet-50 text-violet-700',
  register:         'bg-emerald-50 text-emerald-700',
  lead_request:     'bg-amber-50 text-amber-700',
};

const TYPE_LABELS: Record<string, string> = {
  info:     'Solicitar info',
  visit:    'Agendar visita',
  question: 'Preguntar',
  renting:  '🔑 Oferta de renting',
};
const TYPE_COLORS: Record<string, string> = {
  info:     'bg-blue-100 text-blue-700',
  visit:    'bg-emerald-100 text-emerald-700',
  question: 'bg-violet-100 text-violet-700',
  renting:  'bg-emerald-100 text-emerald-800',
};
const STATUS_COLORS: Record<string, string> = {
  Pendiente:              'bg-amber-100 text-amber-700',
  Contactado:             'bg-blue-100 text-blue-700',
  'En proceso':           'bg-violet-100 text-violet-700',
  'Cita confirmada':      'bg-green-100 text-green-700',
  'Visita realizada':     'bg-teal-100 text-teal-700',
  Interesado:             'bg-sky-100 text-sky-700',
  Vendido:                'bg-emerald-100 text-emerald-700',
  Cerrado:                'bg-green-100 text-green-700',
  Descartado:             'bg-slate-100 text-slate-500',
  'Reagendar solicitado': 'bg-orange-100 text-orange-700',
  Cancelado:              'bg-red-100 text-red-700',
};

const ALL_STATUSES = ['Pendiente', 'Contactado', 'En proceso', 'Cita confirmada', 'Visita realizada', 'Interesado', 'Vendido', 'Descartado', 'Reagendar solicitado', 'Cancelado'];

// Statuses available per lead type — visit has all, renting/info/question exclude appointment-specific ones
function getAvailableStatuses(type: string): string[] {
  if (type === 'visit') return ALL_STATUSES;
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
  not_interested: 'bg-slate-100 text-slate-500',
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
  if (!portal || !portal.startsWith('marketplace-vo')) return null;
  if (portal === 'marketplace-vo-renting') return { label: 'Renting', color: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Compra', color: 'bg-blue-100 text-blue-700' };
}

function formatOrigen(portal: string | undefined): { label: string; color: string } {
  if (!portal) return { label: '–', color: 'bg-slate-100 text-slate-500' };
  if (portal === 'marketplace-vo-compra')  return { label: 'Marketplace · Compra',  color: 'bg-blue-100 text-blue-700' };
  if (portal === 'marketplace-vo-renting') return { label: 'Marketplace · Renting', color: 'bg-emerald-100 text-emerald-700' };
  if (portal.startsWith('marketplace-vo')) return { label: 'Marketplace VO',        color: 'bg-blue-50 text-blue-600' };
  const name = portal.charAt(0).toUpperCase() + portal.slice(1);
  return { label: `Portal: ${name}`, color: 'bg-violet-100 text-violet-700' };
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
  return { label: `hace ${mins}m`, color: 'text-slate-500 bg-slate-50 border-slate-200' };
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
      const header = ['Fecha', 'Email', 'Vehículo', 'Tipo', 'Origen', 'Estado', 'Contacto', 'Teléfono', 'Cuándo', 'Respuesta CarsWise'].join(',');
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

  async function saveLead() {
    if (!selected) return;
    setSaving(true);
    const res = await api.patch(`/leads/${selected.id}`, {
      status: editStatus, notes: editNotes, erp_response: editResponse,
      appointment_date: editApptDate || null, appointment_time: editApptTime,
      appointment_address: editApptAddress, appointment_contact: editApptContact,
    });
    if (res.ok) { await loadLeads(); setSelected(null); }
    setSaving(false);
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
      <div className="flex gap-1 mb-6 border-b border-slate-200">
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
                : 'border-transparent text-slate-500 hover:text-slate-700'
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
                { label: 'Total',        value: leadStats.total,     color: 'bg-slate-50 border-slate-200' },
                { label: 'Pendientes',   value: leadStats.pending,   color: 'bg-amber-50 border-amber-200' },
                { label: 'Esta semana',  value: leadStats.new_7d,    color: 'bg-blue-50 border-blue-200' },
                { label: 'Contactados',  value: leadStats.contacted, color: 'bg-sky-50 border-sky-200' },
                { label: 'Resueltos',    value: leadStats.resolved,  color: 'bg-green-50 border-green-200' },
              ].map((s) => (
                <div key={s.label} className={`${s.color} border rounded-xl p-4`}>
                  <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input
              type="text"
              placeholder="Buscar por email, vehículo…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los estados</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los tipos</option>
              <option value="info">Solicitar info</option>
              <option value="visit">Agendar visita</option>
              <option value="question">Preguntar</option>
              <option value="renting">🔑 Oferta de renting</option>
            </select>
            <select value={filterOrigin} onChange={(e) => { setFilterOrigin(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los orígenes</option>
              <option value="marketplace-vo-compra">Marketplace · Compra</option>
              <option value="marketplace-vo-renting">Marketplace · Renting</option>
              <option value="portales">Portales externos</option>
            </select>
            <button onClick={exportLeadsCsv} disabled={exporting}
              className="ml-auto px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap">
              {exporting ? 'Exportando…' : '↓ Exportar Excel'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Cargando…</div>
            ) : leads.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">No hay solicitudes todavía.</div>
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
                        <tr key={lead.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openLead(lead)}>
                          <td className="text-slate-500 text-xs whitespace-nowrap">
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
                              : <span className="text-slate-300 text-xs">–</span>;
                            })()}
                          </td>
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[lead.appointment_type] ?? 'bg-slate-100 text-slate-600'}`}>
                              {TYPE_LABELS[lead.appointment_type] ?? lead.appointment_type}
                            </span>
                          </td>
                          <td>
                            <p className="font-medium text-slate-800 text-sm">{lead.meta?.name ?? '—'}</p>
                            <p className="text-xs text-slate-500">{lead.user_email}</p>
                            <p className="text-xs text-slate-400">{lead.meta?.phone ?? ''}</p>
                          </td>
                          <td className="text-sm text-slate-700 max-w-[220px] truncate">{lead.title}</td>
                          <td className="text-xs text-slate-500">
                            {lead.meta?.when ? (WHEN_LABELS[lead.meta.when] ?? lead.meta.when) : '—'}
                          </td>
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? 'bg-slate-100 text-slate-600'}`}>
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
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              ← Semana anterior
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">
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
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
            >
              Semana siguiente →
            </button>
          </div>

          {calendarLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Cargando citas…</div>
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
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Day header */}
                    <div className={`px-2 py-2 border-b text-center rounded-t-xl ${
                      isToday ? 'border-brand-200 bg-brand-100' : 'border-slate-100 bg-slate-50'
                    }`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-brand-700' : 'text-slate-400'}`}>
                        {DAY_LABELS[i]}
                      </p>
                      <p className={`text-lg font-bold leading-tight ${isToday ? 'text-brand-700' : 'text-slate-700'}`}>
                        {day.getDate()}
                      </p>
                    </div>

                    {/* Appointments */}
                    <div className="p-1.5 space-y-1.5">
                      {dayLeads.length === 0 ? (
                        <p className="text-[10px] text-slate-300 text-center py-3">Sin citas</p>
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
                                  ⏰ {lead.meta.appointment_time}
                                </p>
                              )}
                              <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">
                                {lead.meta?.name ?? lead.user_email}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate leading-tight">
                                {lead.title}
                              </p>
                              {lead.meta?.appointment_contact && (
                                <p className="text-[10px] text-emerald-600 mt-0.5">
                                  👤 {lead.meta.appointment_contact}
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
          <p className="text-xs text-slate-400 mt-3 text-right">
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
          <div className="flex gap-1 mb-5 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => { setCallType('offer_no_lead'); setCallPage(1); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                callType === 'offer_no_lead' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Vieron oferta
            </button>
            <button
              onClick={() => { setCallType('registered_no_lead'); setCallPage(1); }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                callType === 'registered_no_lead' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Registrados inactivos
            </button>
          </div>

          {/* Explanation banner */}
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 leading-relaxed">
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
                { label: 'Resueltos',         value: callStats?.resolved  ?? '–', color: 'bg-slate-50 border-slate-200 text-slate-600' },
              ].map((s) => (
                <div key={s.label} className={`${s.color} border rounded-xl px-4 py-3 min-w-[100px]`}>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Período:</span>
              {[7, 14, 30, 60].map((d) => (
                <button key={d}
                  onClick={() => { setCallDays(d); setCallPage(1); }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    callDays === d
                      ? 'bg-brand-600 border-brand-600 text-white font-medium'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                  {d}d
                </button>
              ))}
              <button
                onClick={() => setShowResolved((v) => !v)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  showResolved
                    ? 'bg-slate-600 border-slate-600 text-white'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}>
                {showResolved ? '✓ Mostrando todos' : 'Mostrar resueltos'}
              </button>
            </div>
          </div>

          {/* Queue table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {callLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Cargando cola…</div>
            ) : visibleQueue.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                {showResolved
                  ? callType === 'registered_no_lead'
                    ? 'No hay registrados inactivos en este período.'
                    : 'No hay visitas sin conversión en este período.'
                  : '¡Cola vacía! Todos los contactos han sido gestionados.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contacto</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {callType === 'registered_no_lead' ? 'Actividad · contexto de llamada' : 'Oferta(s) vistas · contexto de llamada'}
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Última visita</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Fuente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Estado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleQueue.map((item) => {
                    const isExpanded     = expandedAnon === item.anon_id;
                    const isInfoExpanded = expandedInfoAnon === item.anon_id;
                    const isResolved     = item.outreach_status === 'called' || item.outreach_status === 'not_interested';
                    return (
                      <>
                        <tr key={item.anon_id}
                          onClick={() => toggleInfoExpand(item)}
                          className={`${isResolved ? 'opacity-50' : ''} hover:bg-slate-50 transition-colors cursor-pointer`}>
                          <td className="px-4 py-3">
                            {item.user_email ? (
                              <span className="text-blue-700 font-medium text-xs">{item.user_email}</span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">{item.anon_id.slice(0, 20)}…</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {(item.offers_viewed ?? []).length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {(item.offers_viewed ?? []).map((o, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 border border-violet-200 text-violet-800 rounded text-xs font-medium max-w-[240px] truncate">
                                    🚗 {o.title}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">
                                {callType === 'registered_no_lead' ? 'Registrado · sin consultas de oferta' : 'Sin oferta registrada'}
                              </span>
                            )}
                            {item.outreach_notes && (
                              <p className="text-xs text-slate-400 mt-1 italic">"{item.outreach_notes}"</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {fmtDateTime(item.last_seen)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {item.utm_source || <span className="text-slate-300">–</span>}
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
                                className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40">
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
                                  className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40">
                                  × Descartar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isInfoExpanded && (
                          <tr key={`${item.anon_id}-info`}>
                            <td colSpan={6} className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Datos del contacto</p>
                                  <dl className="space-y-1.5">
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-slate-400 w-24 shrink-0">Email</dt>
                                      <dd className="text-slate-700 font-medium break-all">{item.user_email ?? <span className="font-mono text-slate-400">{item.anon_id}</span>}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-slate-400 w-24 shrink-0">Primera visita</dt>
                                      <dd className="text-slate-600">{fmtDateTime(item.first_seen)}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-slate-400 w-24 shrink-0">Última visita</dt>
                                      <dd className="text-slate-600">{fmtDateTime(item.last_seen)}</dd>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                      <dt className="text-slate-400 w-24 shrink-0">Fuente</dt>
                                      <dd className="text-slate-600">{item.utm_source || '–'}</dd>
                                    </div>
                                    {item.utm_campaign && (
                                      <div className="flex gap-2 text-xs">
                                        <dt className="text-slate-400 w-24 shrink-0">Campaña</dt>
                                        <dd className="text-slate-600">{item.utm_campaign}</dd>
                                      </div>
                                    )}
                                  </dl>
                                  {(item.offers_viewed ?? []).length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Oferta(s) de interés</p>
                                      <div className="space-y-1">
                                        {(item.offers_viewed ?? []).map((o, i) => (
                                          <div key={i} className="flex items-center gap-2 text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
                                            🚗{' '}
                                            {o.url ? (
                                              <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-violet-600 truncate">
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
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Actividad en la visita</p>
                                  {eventsLoading === item.anon_id ? (
                                    <p className="text-slate-400 text-xs">Cargando…</p>
                                  ) : (anonEvents[item.anon_id] ?? []).length === 0 ? (
                                    <p className="text-slate-400 text-xs italic">Sin eventos detallados registrados</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {(anonEvents[item.anon_id] ?? []).map((ev) => (
                                        <div key={ev.id} className="flex items-start gap-2">
                                          <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5 w-10 shrink-0">
                                            {ev.created_at ? new Date(ev.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                                          </span>
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${EVENT_COLORS[ev.event_type] ?? 'bg-slate-100 text-slate-600'}`}>
                                            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                          </span>
                                          {ev.offer_title && (
                                            <span className="text-xs text-slate-500 truncate max-w-[180px]">{ev.offer_title}</span>
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
                                    className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-white">
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
            <p className="text-xs text-slate-400 mt-2 text-right">
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
              <div><span className="text-slate-400 text-xs block">Tipo</span><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${TYPE_COLORS[selected.appointment_type] ?? 'bg-slate-100 text-slate-600'}`}>{TYPE_LABELS[selected.appointment_type] ?? selected.appointment_type}</span></div>
              <div><span className="text-slate-400 text-xs block">{selected.appointment_type === 'renting' ? 'Opción solicitada' : 'Cuándo'}</span><span className="font-medium">{selected.appointment_type === 'renting' ? (selected.meta?.when ?? '—') : (WHEN_LABELS[selected.meta?.when ?? ''] ?? selected.meta?.when ?? '—')}</span></div>
              <div><span className="text-slate-400 text-xs block">Email</span><span className="font-medium">{selected.user_email}</span></div>
              <div><span className="text-slate-400 text-xs block">Teléfono</span><span className="font-medium">{selected.meta?.phone ?? '—'}</span></div>
              <div className="col-span-2"><span className="text-slate-400 text-xs block">Vehículo</span><span className="font-medium">{selected.title}</span></div>
              {selected.meta?.vehicle_url && (
                <div className="col-span-2"><span className="text-slate-400 text-xs block">Enlace al anuncio</span><a href={selected.meta.vehicle_url} target="_blank" rel="noreferrer" className="text-brand-600 underline text-xs truncate block">{selected.meta.vehicle_url}</a></div>
              )}
              {selected.meta?.portal && (
                <div><span className="text-slate-400 text-xs block">Portal</span><span className="font-medium capitalize">{selected.meta.portal}</span></div>
              )}
              <div><span className="text-slate-400 text-xs block">Recibido</span><span className="font-medium">{new Date(selected.created_at).toLocaleString('es-ES')}</span></div>
            </div>

            {/* Status — filtered by lead type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {getAvailableStatuses(selected.appointment_type).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {selected.appointment_type === 'visit' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-700">📅 Datos de la cita</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Fecha</label>
                    <input type="date" value={editApptDate} onChange={(e) => setEditApptDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Hora</label>
                    <input type="time" value={editApptTime} onChange={(e) => setEditApptTime(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Dirección</label>
                    <input type="text" value={editApptAddress} onChange={(e) => setEditApptAddress(e.target.value)}
                      placeholder="Calle, ciudad…"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Persona de contacto (pregunta por…)</label>
                    <input type="text" value={editApptContact} onChange={(e) => setEditApptContact(e.target.value)}
                      placeholder="Nombre del comercial o responsable"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              </div>
            )}

            {selected.meta?.reschedule_proposals?.length ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-700">🔄 El cliente propone estas opciones — selecciona una para rellenar la fecha</p>
                <div className="space-y-1.5">
                  {selected.meta.reschedule_proposals.map((p, i) => {
                    const isSelected = editApptDate === p.date && editApptTime === (p.time || '');
                    return (
                      <button key={i} type="button"
                        onClick={(e) => { e.stopPropagation(); setEditApptDate(p.date); setEditApptTime(p.time || ''); setEditStatus('Contactado'); }}
                        className={`w-full text-left text-sm px-3 py-2.5 border rounded-lg transition-colors flex justify-between items-center font-medium ${
                          isSelected ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-orange-300 hover:bg-orange-100 text-slate-700 cursor-pointer'
                        }`}>
                        <span>
                          📅 {p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : p.date}
                          {p.time && <span className="ml-2 text-slate-500">⏰ {p.time}</span>}
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
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Respuesta al cliente</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REPLY_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setEditResponse(t.text)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea rows={3} value={editResponse} onChange={(e) => setEditResponse(e.target.value)}
                placeholder="Mensaje que verá el cliente en su panel y recibirá por email…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas internas</label>
              <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas privadas (no se envían al cliente)…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>

            {/* ── Historial de cambios ── */}
            {(historyLoading || history.length > 0) && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Historial</p>
                {historyLoading ? (
                  <p className="text-xs text-slate-400">Cargando…</p>
                ) : (
                  <ol className="space-y-1">
                    {history.map((h) => (
                      <li key={h.id} className="flex gap-2 text-xs text-slate-500">
                        <span className="text-slate-300 whitespace-nowrap">
                          {new Date(h.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-medium text-slate-700">{h.operator}</span>
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
              <p className="text-xs text-slate-400 text-right pt-1">
                Último email enviado: {new Date(selected.notified_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={saveLead} disabled={saving}
                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button onClick={notifyClient} disabled={notifying || saving}
                className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-60 font-medium">
                {notifying ? 'Enviando…' : `📧 ${selected.notified_at ? 'Reenviar notificación' : 'Guardar y notificar cliente'}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
