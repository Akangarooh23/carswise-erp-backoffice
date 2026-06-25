import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿';
  const lines = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([bom + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function getLocalDate(daysAgo: number): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FunnelStep   { step: string; label: string; count: number }
interface UtmSource    { source: string; sessions: number; registers: number; leads: number }
interface UtmCampaign  { campaign: string; medium: string; source: string; sessions: number; registers: number; leads: number }
interface TopOffer     { offer_id: string; offer_title: string; offer_url: string | null; views: number; leads: number }
interface FunnelStats  { days: number; funnel: FunnelStep[]; utmSources: UtmSource[]; utmCampaigns: UtmCampaign[]; topOffers: TopOffer[] }
interface FunnelEvent  { id: string; anon_id: string; user_email: string | null; event_type: string; utm_source: string; utm_medium: string; utm_campaign: string; offer_id: string | null; offer_title: string | null; section: string | null; landing_url: string; created_at: string }
interface FunnelSession { anon_id: string; user_email: string | null; first_seen: string; last_seen: string; utm_source: string; utm_medium: string; utm_campaign: string; event_count: number; events: string[]; did_register: boolean; did_lead: boolean }
interface DailyRow     { day: string; landings: number; page_views: number; marketplace_views: number; offer_views: number; registers: number; leads: number; total: number }

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  landing: 'Acceso', page_view: 'Página vista', marketplace_view: 'Marketplace',
  offer_view: 'Oferta vista', register: 'Registro', lead_request: 'Solicitud',
  identify: 'Identificado', login: 'Login',
};

const PAGE_SECTION_LABELS: Record<string, string> = {
  // Home & general
  home:                      'Inicio',
  userDashboard:             'Mi Panel',
  userProfile:               'Mi Perfil',
  plans:                     'Planes',
  contact:                   'Contacto',
  aboutCarswise:             'Sobre CarsWise',
  // Marketplace VO
  portalVo:                  'Marketplace VO',
  portalVoDetail:            'Ficha de oferta VO',
  vehicleDetail:             'Ficha de vehículo',
  // Comprar / asesor
  vehicleOptions:            'Quiero Comprar',
  buyOptions:                'Opciones de compra',
  rentingOptions:            'Opciones de renting',
  consejo:                   'Asesor de vehículo',
  decision:                  'Decisión de compra',
  // Vender
  sellOptions:               'Vender mi Coche',
  sell:                      'Vender (proceso)',
  // Contratar un servicio
  serviceOptions:            'Contratar un Servicio',
  servicesSeo:               'Servicios',
  serviceInsurance:          'Seguro de coche',
  serviceMaintenance:        'Mantenimiento',
  serviceAutogestor:         'Autogestor',
  serviceAppointment:        'Cita de servicio',
  serviceAppointmentCalendar:'Calendario de cita',
  serviceMonthlyPlan:        'Plan mensual',
  // IDCar / ID Digital
  idCarsManage:              'ID Digital de tu vehículo',
  idCarDetail:               'Detalle IDCar',
  idCarCreate:               'Crear IDCar',
  // Blog
  blog:                      'Blog',
  blogCompraUsado:           'Blog · Guía compra VO',
  blogRentingCompra:         'Blog · Renting vs Compra',
  // Legal
  legalNotice:               'Aviso legal',
  privacyPolicy:             'Política de privacidad',
  cookiePolicy:              'Política de cookies',
  termsConditions:           'Términos y condiciones',
  marketingPolicy:           'Política de comunicaciones',
  experianPolicy:            'Política Experian',
  experianTerms:             'Condiciones Experian',
};
const EVENT_COLORS: Record<string, string> = {
  landing: 'bg-slate-100 text-slate-600', page_view: 'bg-sky-50 text-sky-700',
  marketplace_view: 'bg-blue-50 text-blue-700',
  offer_view: 'bg-violet-50 text-violet-700', register: 'bg-emerald-50 text-emerald-700',
  lead_request: 'bg-amber-50 text-amber-700', identify: 'bg-slate-50 text-slate-500',
  login: 'bg-teal-50 text-teal-700',
};
const FUNNEL_COLORS = ['bg-slate-400', 'bg-blue-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400'];
const DATE_SHORTCUTS = [{ label: 'Hoy', daysAgo: 0 }, { label: 'Ayer', daysAgo: 1 }, { label: 'Anteayer', daysAgo: 2 }];
const DAYS_OPTIONS = [7, 14, 30, 60, 90];
const DAYS_LABELS: Record<number, string> = { 7: '7d', 14: '14d', 30: '30d', 60: '60d', 90: '90d' };

const FUNNEL_TABS = [
  { key: 'resumen',    label: 'Resumen' },
  { key: 'diario',     label: 'Desglose diario' },
  { key: 'fuentes',    label: 'UTM Source' },
  { key: 'campanas',   label: 'UTM Campaign' },
  { key: 'ofertas',    label: 'Ofertas más vistas' },
  { key: 'sesiones',   label: 'Por sesión / usuario' },
  { key: 'eventos',    label: 'Eventos recientes' },
  { key: 'generador',  label: '🔗 Generador de links' },
] as const;
type FunnelTab = typeof FUNNEL_TABS[number]['key'];

// ─── UTM channel presets ──────────────────────────────────────────────────────
const UTM_PRESETS = [
  { label: 'Instagram',   source: 'instagram',  medium: 'social' },
  { label: 'WhatsApp',    source: 'whatsapp',   medium: 'social' },
  { label: 'TikTok',      source: 'tiktok',     medium: 'social' },
  { label: 'Facebook',    source: 'facebook',   medium: 'social' },
  { label: 'Email',       source: 'newsletter', medium: 'email'  },
  { label: 'Google Ads',  source: 'google',     medium: 'cpc'    },
];

function buildUtmUrl(base: string, params: { source: string; medium: string; campaign: string; content: string; term: string }): string {
  if (!base.trim()) return '';
  try {
    const url = new URL(base.trim().startsWith('http') ? base.trim() : `https://${base.trim()}`);
    if (params.source)   url.searchParams.set('utm_source',   params.source.trim());
    if (params.medium)   url.searchParams.set('utm_medium',   params.medium.trim());
    if (params.campaign) url.searchParams.set('utm_campaign', params.campaign.trim());
    if (params.content)  url.searchParams.set('utm_content',  params.content.trim());
    if (params.term)     url.searchParams.set('utm_term',     params.term.trim());
    return url.toString();
  } catch {
    return '';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(a: number, b: number) { return !b ? '–' : `${Math.round((a / b) * 100)}%`; }
function fmtDate(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}
function buildTimeParams(selectedDate: string, days: number): URLSearchParams {
  const p = new URLSearchParams();
  if (selectedDate) p.set('date', selectedDate); else p.set('days', String(days));
  return p;
}
function periodLabel(selectedDate: string, days: number): string {
  if (selectedDate) {
    const [today, yesterday, dayBefore] = [getLocalDate(0), getLocalDate(1), getLocalDate(2)];
    if (selectedDate === today)     return 'hoy';
    if (selectedDate === yesterday) return 'ayer';
    if (selectedDate === dayBefore) return 'anteayer';
    return selectedDate;
  }
  return `últimos ${DAYS_LABELS[days] ?? `${days}d`}`;
}

type SortState = { col: string; dir: 'asc' | 'desc' } | null;

function sortRows<T>(rows: T[], sort: SortState): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.col];
    const bv = (b as Record<string, unknown>)[sort.col];
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av ?? '').localeCompare(String(bv ?? ''), 'es');
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function SortTh({ col, label, sort, onSort, right = false }: {
  col: string; label: string; sort: SortState; onSort: (col: string) => void; right?: boolean;
}) {
  const active = sort?.col === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer select-none hover:bg-slate-100 transition-colors"
      style={right ? { textAlign: 'right' } : undefined}
    >
      {right ? (
        <span className="inline-flex items-center gap-1">
          <span className={`text-[10px] ${active ? 'text-brand-600' : 'text-slate-300'}`}>
            {active ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
          {label}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-[10px] ${active ? 'text-brand-600' : 'text-slate-300'}`}>
            {active ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      )}
    </th>
  );
}

function FilterBar({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
  return (
    <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
      {children}
      {onClear && (
        <button onClick={onClear} className="ml-auto text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded border border-slate-200 hover:bg-white">
          × Limpiar
        </button>
      )}
    </div>
  );
}

function FilterInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-44 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}

function FilterSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DrillSessions({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FunnelSession[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setLoading(true);
    api.get<FunnelSession[]>(url)
      .then((r) => { if (r.ok) { setRows(r.data); setTotal(r.meta?.total ?? 0); } })
      .finally(() => setLoading(false));
  }, [url]);
  if (loading) return <div className="px-6 py-4 text-xs text-slate-400">Cargando…</div>;
  if (!rows.length) return <div className="px-6 py-4 text-xs text-slate-400">Sin sesiones para este filtro</div>;
  return (
    <div className="bg-slate-50 border-t border-slate-200">
      {total > rows.length && (
        <div className="px-6 pt-3 text-[11px] text-slate-400">Mostrando {rows.length} de {total} sesiones</div>
      )}
      <div className="overflow-x-auto">
        <table className="erp-table w-full">
          <thead>
            <tr>
              <th>Usuario / Sesión</th><th>Recorrido</th><th>Fuente</th><th>Campaña</th><th>Primera visita</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.anon_id}>
                <td className="text-xs max-w-[180px] truncate">
                  {s.user_email
                    ? <span className="text-blue-600 font-medium">{s.user_email}</span>
                    : <span className="text-slate-400 font-mono">{s.anon_id.slice(0, 16)}…</span>}
                </td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {(s.events as string[]).map((ev, i) => (
                      <span key={i} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_COLORS[ev] ?? 'bg-slate-100 text-slate-600'}`}>
                        {EVENT_LABELS[ev] ?? ev}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-xs text-slate-500">{s.utm_source || '–'}</td>
                <td className="text-xs text-slate-500 max-w-[140px] truncate">{s.utm_campaign || '–'}</td>
                <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(s.first_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DrillEvents({ url, title }: { url: string; title?: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FunnelEvent[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setLoading(true);
    api.get<FunnelEvent[]>(url)
      .then((r) => { if (r.ok) { setRows(r.data); setTotal(r.meta?.total ?? 0); } })
      .finally(() => setLoading(false));
  }, [url]);
  if (loading) return <div className="px-6 py-4 text-xs text-slate-400">Cargando…</div>;
  if (!rows.length) return <div className="px-6 py-4 text-xs text-slate-400">{title ? `Sin ${title}` : 'Sin eventos'}</div>;
  return (
    <div className="bg-slate-50 border-t border-slate-200">
      {total > rows.length && (
        <div className="px-6 pt-3 text-[11px] text-slate-400">Mostrando {rows.length} de {total} eventos</div>
      )}
      <div className="overflow-x-auto">
        <table className="erp-table w-full">
          <thead>
            <tr><th>Evento</th><th>Usuario / Sesión</th><th>Oferta</th><th>Fuente</th><th>Fecha</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {e.event_type === 'page_view' && e.section
                      ? (PAGE_SECTION_LABELS[e.section] ?? e.section)
                      : (EVENT_LABELS[e.event_type] ?? e.event_type)}
                  </span>
                </td>
                <td className="text-xs text-slate-600 max-w-[160px] truncate">
                  {e.user_email || <span className="font-mono text-slate-400">{e.anon_id.slice(0, 16)}…</span>}
                </td>
                <td className="text-xs text-slate-500 max-w-[160px] truncate">{e.offer_title || '–'}</td>
                <td className="text-xs text-slate-500">{e.utm_source || '–'}</td>
                <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
      {items.map(({ label, value }) => (
        <div key={label}>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
          <div className="text-xs text-slate-700 break-all">{value ?? <span className="text-slate-300">–</span>}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const [activeTab, setActiveTab]       = useState<FunnelTab>('resumen');
  const [days, setDays]                 = useState(30);
  const [selectedDate, setSelectedDate] = useState('');
  const [globalUser, setGlobalUser]     = useState('');

  // Stats
  const [stats, setStats]           = useState<FunnelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Events
  const [events, setEvents]       = useState<FunnelEvent[]>([]);
  const [evtTotal, setEvtTotal]   = useState(0);
  const [evtPage, setEvtPage]     = useState(1);
  const [filterType, setFilterType]     = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterEvtQ, setFilterEvtQ]     = useState('');
  const [filterEvtCampaign, setFilterEvtCampaign] = useState('');
  const [filterAnonId, setFilterAnonId] = useState('');
  const [evtLoading, setEvtLoading]     = useState(false);

  // Sessions
  const [sessSrc, setSessSrc]   = useState('');
  const [sessConv, setSessConv] = useState('');
  const [sessQ, setSessQ]       = useState('');
  const [sessCampaign, setSessCampaign] = useState('');
  const [sessions, setSessions]   = useState<FunnelSession[]>([]);
  const [sessTotal, setSessTotal] = useState(0);
  const [sessPage, setSessPage]   = useState(1);
  const [sessLoading, setSessLoading] = useState(false);

  // Daily
  const [daily, setDaily]             = useState<DailyRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyOnlyActive, setDailyOnlyActive] = useState(false);
  const [dailySort, setDailySort]     = useState<SortState>(null);

  // UTM Source filters
  const [utmSrcQ, setUtmSrcQ]     = useState('');
  const [utmSrcSort, setUtmSrcSort] = useState<SortState>(null);

  // UTM Campaign filters
  const [campQ, setCampQ]         = useState('');
  const [campMedium, setCampMedium] = useState('');
  const [campSrcQ, setCampSrcQ]   = useState('');
  const [campSort, setCampSort]   = useState<SortState>(null);

  // Offers filters
  const [offerQ, setOfferQ]               = useState('');
  const [offerMinViews, setOfferMinViews] = useState('');
  const [offerMinLeads, setOfferMinLeads] = useState('');
  const [offerSort, setOfferSort]         = useState<SortState>(null);

  const [exporting, setExporting] = useState<'sessions' | 'events' | null>(null);

  // UTM link builder
  const [utmBase,     setUtmBase]     = useState('https://www.carswiseai.com/marketplace-vo');
  const [utmSource,   setUtmSource]   = useState('');
  const [utmMedium,   setUtmMedium]   = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent,  setUtmContent]  = useState('');
  const [utmTerm,     setUtmTerm]     = useState('');
  const [utmCopied,   setUtmCopied]   = useState(false);

  const generatedUrl = useMemo(
    () => buildUtmUrl(utmBase, { source: utmSource, medium: utmMedium, campaign: utmCampaign, content: utmContent, term: utmTerm }),
    [utmBase, utmSource, utmMedium, utmCampaign, utmContent, utmTerm]
  );

  function applyPreset(preset: typeof UTM_PRESETS[number]) {
    setUtmSource(preset.source);
    setUtmMedium(preset.medium);
  }

  function copyUrl() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(() => {
      setUtmCopied(true);
      setTimeout(() => setUtmCopied(false), 2000);
    });
  }

  // Expanded row per table
  const [expandDaily, setExpandDaily]   = useState<string | null>(null);
  const [expandSrc, setExpandSrc]       = useState<string | null>(null);
  const [expandCamp, setExpandCamp]     = useState<string | null>(null);
  const [expandOffer, setExpandOffer]   = useState<string | null>(null);
  const [expandSess, setExpandSess]     = useState<string | null>(null);
  const [expandEvt, setExpandEvt]       = useState<string | null>(null);

  function xpand(cur: string | null, set: React.Dispatch<React.SetStateAction<string | null>>, key: string) {
    set(cur === key ? null : key);
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    setStatsLoading(true);
    const p = buildTimeParams(selectedDate, days);
    api.get<FunnelStats>(`/funnel/stats?${p}`)
      .then((r) => { if (r.ok) setStats(r.data); })
      .finally(() => setStatsLoading(false));
  }, [days, selectedDate]);

  useEffect(() => {
    if (activeTab !== 'diario') return;
    setDailyLoading(true);
    const p = buildTimeParams(selectedDate, days);
    if (globalUser) p.set('user', globalUser);
    api.get<DailyRow[]>(`/funnel/daily?${p}`)
      .then((r) => { if (r.ok) setDaily(r.data); })
      .finally(() => setDailyLoading(false));
  }, [activeTab, days, selectedDate, globalUser]);

  useEffect(() => {
    if (activeTab !== 'sesiones') return;
    setSessLoading(true);
    const p = buildTimeParams(selectedDate, days);
    p.set('page', String(sessPage)); p.set('limit', '50');
    if (sessSrc)  p.set('source', sessSrc);
    if (sessConv) p.set('converted', sessConv);
    const sQ = sessQ || globalUser;
    if (sQ) p.set('q', sQ);
    api.get<FunnelSession[]>(`/funnel/sessions?${p}`)
      .then((r) => { if (r.ok) { setSessions(r.data); setSessTotal(r.meta?.total ?? 0); } })
      .finally(() => setSessLoading(false));
  }, [activeTab, days, selectedDate, sessPage, sessSrc, sessConv, sessQ, globalUser]);

  useEffect(() => {
    if (activeTab !== 'eventos') return;
    setEvtLoading(true);
    const p = buildTimeParams(selectedDate, days);
    p.set('page', String(evtPage)); p.set('limit', '50');
    if (filterType)   p.set('event_type', filterType);
    if (filterSource) p.set('source', filterSource);
    if (filterAnonId) p.set('anon_id', filterAnonId);
    const evtQ = filterEvtQ || globalUser;
    if (evtQ) p.set('q', evtQ);
    api.get<FunnelEvent[]>(`/funnel/events?${p}`)
      .then((r) => { if (r.ok) { setEvents(r.data); setEvtTotal(r.meta?.total ?? 0); } })
      .finally(() => setEvtLoading(false));
  }, [activeTab, evtPage, filterType, filterSource, filterEvtQ, filterAnonId, globalUser, days, selectedDate]);

  // ── Derived filtered / sorted data (client-side) ─────────────────────────

  const filteredSources = useMemo(() => {
    if (!stats) return [];
    const rows = stats.utmSources.filter((r) =>
      !utmSrcQ || (r.source || '').toLowerCase().includes(utmSrcQ.toLowerCase())
    );
    return sortRows(rows, utmSrcSort);
  }, [stats, utmSrcQ, utmSrcSort]);

  const campMediumOptions = useMemo(() => {
    if (!stats) return [];
    return [...new Set(stats.utmCampaigns.map((r) => r.medium).filter(Boolean))]
      .map((m) => ({ value: m, label: m }));
  }, [stats]);

  const filteredCampaigns = useMemo(() => {
    if (!stats) return [];
    const rows = stats.utmCampaigns.filter((r) =>
      (!campQ      || r.campaign?.toLowerCase().includes(campQ.toLowerCase())) &&
      (!campMedium || r.medium === campMedium) &&
      (!campSrcQ   || (r.source || '').toLowerCase().includes(campSrcQ.toLowerCase()))
    );
    return sortRows(rows, campSort);
  }, [stats, campQ, campMedium, campSrcQ, campSort]);

  const filteredOffers = useMemo(() => {
    if (!stats) return [];
    const rows = stats.topOffers.filter((r) =>
      (!offerQ        || (r.offer_title || r.offer_id).toLowerCase().includes(offerQ.toLowerCase())) &&
      (!offerMinViews || r.views >= Number(offerMinViews)) &&
      (!offerMinLeads || r.leads >= Number(offerMinLeads))
    );
    return sortRows(rows, offerSort);
  }, [stats, offerQ, offerMinViews, offerMinLeads, offerSort]);

  const filteredDaily = useMemo(() => {
    const rows = dailyOnlyActive
      ? daily.filter((r) => r.landings > 0 || r.registers > 0 || r.leads > 0 || r.offer_views > 0)
      : daily;
    return sortRows(rows, dailySort);
  }, [daily, dailyOnlyActive, dailySort]);

  const filteredSessions = useMemo(() => {
    if (!sessCampaign) return sessions;
    return sessions.filter((s) => s.utm_campaign?.toLowerCase().includes(sessCampaign.toLowerCase()));
  }, [sessions, sessCampaign]);

  const filteredEvents = useMemo(() => {
    if (!filterEvtCampaign) return events;
    return events.filter((e) => e.utm_campaign?.toLowerCase().includes(filterEvtCampaign.toLowerCase()));
  }, [events, filterEvtCampaign]);

  // ── Sort togglers ─────────────────────────────────────────────────────────

  function toggleSort(sort: SortState, setSort: (s: SortState) => void, col: string) {
    setSort(sort?.col === col && sort.dir === 'asc' ? { col, dir: 'desc' } : { col, dir: 'asc' });
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  const exportSessions = useCallback(async () => {
    setExporting('sessions');
    try {
      const p = buildTimeParams(selectedDate, days);
      p.set('page', '1'); p.set('limit', '5000');
      if (sessSrc)  p.set('source', sessSrc);
      if (sessConv) p.set('converted', sessConv);
      if (sessQ)    p.set('q', sessQ);
      const r = await api.get<FunnelSession[]>(`/funnel/sessions?${p}`);
      if (!r.ok) return;
      const headers = ['Email / Sesión', 'Recorrido', 'Fuente', 'Medio', 'Campaña', 'Registrado', 'Lead', 'Primera visita', 'Última visita'];
      const rows = (r.data as FunnelSession[]).map((s) => [
        escapeCsv(s.user_email || s.anon_id),
        escapeCsv((s.events as string[]).map((e) => EVENT_LABELS[e] ?? e).join(' → ')),
        escapeCsv(s.utm_source), escapeCsv(s.utm_medium), escapeCsv(s.utm_campaign),
        s.did_register ? 'Sí' : 'No', s.did_lead ? 'Sí' : 'No',
        escapeCsv(s.first_seen ? new Date(s.first_seen).toLocaleString('es-ES') : ''),
        escapeCsv(s.last_seen  ? new Date(s.last_seen).toLocaleString('es-ES')  : ''),
      ]);
      downloadCsv(`funnel-sesiones-${selectedDate || `${days}d`}.csv`, headers, rows);
    } finally { setExporting(null); }
  }, [days, selectedDate, sessSrc, sessConv, sessQ]);

  const exportEvents = useCallback(async () => {
    setExporting('events');
    try {
      const p = buildTimeParams(selectedDate, days);
      p.set('page', '1'); p.set('limit', '5000');
      if (filterType)   p.set('event_type', filterType);
      if (filterSource) p.set('source', filterSource);
      if (filterAnonId) p.set('anon_id', filterAnonId);
      if (filterEvtQ)   p.set('q', filterEvtQ);
      const r = await api.get<FunnelEvent[]>(`/funnel/events?${p}`);
      if (!r.ok) return;
      const headers = ['Evento', 'Email', 'Fuente', 'Medio', 'Campaña', 'Oferta', 'URL landing', 'Fecha'];
      const rows = (r.data as FunnelEvent[]).map((e) => [
        escapeCsv(e.event_type === 'page_view' && e.section ? (PAGE_SECTION_LABELS[e.section] ?? e.section) : (EVENT_LABELS[e.event_type] ?? e.event_type)), escapeCsv(e.user_email || ''),
        escapeCsv(e.utm_source), escapeCsv(e.utm_medium), escapeCsv(e.utm_campaign),
        escapeCsv(e.offer_title || ''), escapeCsv(e.landing_url),
        escapeCsv(e.created_at ? new Date(e.created_at).toLocaleString('es-ES') : ''),
      ]);
      downloadCsv('funnel-eventos.csv', headers, rows);
    } finally { setExporting(null); }
  }, [days, selectedDate, filterType, filterSource, filterAnonId, filterEvtQ]);

  // ── Misc ─────────────────────────────────────────────────────────────────

  const maxCount = stats ? Math.max(...stats.funnel.map((s) => s.count), 1) : 1;

  function goToEventsForSession(anonId: string) {
    setFilterAnonId(anonId); setEvtPage(1); setActiveTab('eventos');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing & Funnel"
        subtitle="Seguimiento del embudo de captación y atribución UTM"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input type="text" placeholder="Filtrar por usuario (email)…" value={globalUser}
                onChange={(e) => { setGlobalUser(e.target.value); setSessPage(1); setEvtPage(1); }}
                className="text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 w-52 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              {globalUser && <button onClick={() => setGlobalUser('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">×</button>}
            </div>
            <div className="flex items-center gap-1">
              {DATE_SHORTCUTS.map(({ label, daysAgo }) => {
                const date = getLocalDate(daysAgo);
                return (
                  <button key={label} onClick={() => { setSelectedDate(date); setSessPage(1); setEvtPage(1); }}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${selectedDate === date ? 'bg-brand-600 border-brand-600 text-white font-medium' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                );
              })}
              <span className="text-slate-200 text-xs px-0.5">|</span>
              {DAYS_OPTIONS.map((d) => (
                <button key={d} onClick={() => { setSelectedDate(''); setDays(d); setSessPage(1); setEvtPage(1); }}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${!selectedDate && days === d ? 'bg-brand-600 border-brand-600 text-white font-medium' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  {DAYS_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Sub-tab navigation */}
      <div className="flex gap-0.5 border-b border-slate-200 overflow-x-auto">
        {FUNNEL_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {activeTab === 'resumen' && (
        statsLoading ? <div className="text-slate-400 text-sm text-center py-16">Cargando…</div>
        : !stats ? <div className="text-red-500 text-sm text-center py-16">Error al cargar los datos</div>
        : (
          <Card>
            <h3 className="font-semibold text-slate-800 text-sm mb-4">
              Embudo de conversión <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
            </h3>
            <div className="space-y-2.5">
              {stats.funnel.map((step, i) => {
                const prev = i > 0 ? stats.funnel[i - 1].count : null;
                const barW = step.count ? Math.round((step.count / maxCount) * 100) : 0;
                return (
                  <div key={step.step} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-right text-xs text-slate-500">{step.label}</div>
                    <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                      <div className={`h-full rounded-lg transition-all ${FUNNEL_COLORS[i]}`} style={{ width: `${barW}%` }} />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-slate-700">
                        {step.count.toLocaleString('es-ES')}
                        {prev !== null && <span className="ml-2 font-normal text-slate-400">({pct(step.count, prev)} del paso anterior)</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )
      )}

      {/* ── DESGLOSE DIARIO ── */}
      {activeTab === 'diario' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">
              Desglose diario <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
            </h3>
          </div>
          <FilterBar onClear={dailyOnlyActive || dailySort ? () => { setDailyOnlyActive(false); setDailySort(null); } : undefined}>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={dailyOnlyActive} onChange={(e) => setDailyOnlyActive(e.target.checked)}
                className="rounded border-slate-300" />
              Solo días con actividad
            </label>
            <span className="text-xs text-slate-400 ml-2">· Haz clic en los encabezados para ordenar</span>
          </FilterBar>
          {dailyLoading ? <div className="text-slate-400 text-sm text-center py-12">Cargando…</div>
          : filteredDaily.length === 0 ? <p className="text-slate-400 text-sm text-center py-12">Sin datos aún</p>
          : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <SortTh col="day"               label="Día"          sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} />
                    <SortTh col="landings"           label="Accesos"      sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                    <SortTh col="page_views"         label="Pág. vistas"  sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                    <SortTh col="marketplace_views"  label="Marketplace"  sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                    <SortTh col="offer_views"        label="Ofertas"      sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                    <SortTh col="registers"          label="Registros"    sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                    <SortTh col="leads"              label="Solicitudes"  sort={dailySort} onSort={(c) => toggleSort(dailySort, setDailySort, c)} right />
                  </tr>
                </thead>
                <tbody>
                  {filteredDaily.map((row) => {
                    const dayKey = String(row.day).slice(0, 10);
                    const open = expandDaily === dayKey;
                    const label = new Date(dayKey + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
                    return (
                      <>
                        <tr key={dayKey} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandDaily, setExpandDaily, dayKey)}>
                          <td className="text-xs font-medium text-slate-700 whitespace-nowrap">
                            <span className="text-slate-300 mr-1.5 select-none">{open ? '▾' : '▸'}</span>{label}
                          </td>
                          <td className="text-right text-sm text-slate-600">{row.landings || '–'}</td>
                          <td className="text-right text-sm text-slate-600">{row.page_views || '–'}</td>
                          <td className="text-right text-sm text-slate-600">{row.marketplace_views || '–'}</td>
                          <td className="text-right text-sm text-slate-600">{row.offer_views || '–'}</td>
                          <td className="text-right">{row.registers > 0 ? <span className="text-emerald-700 font-semibold text-sm">{row.registers}</span> : <span className="text-slate-300 text-sm">–</span>}</td>
                          <td className="text-right">{row.leads > 0 ? <span className="text-amber-700 font-semibold text-sm">{row.leads}</span> : <span className="text-slate-300 text-sm">–</span>}</td>
                        </tr>
                        {open && (
                          <tr key={`${dayKey}-d`}>
                            <td colSpan={6} className="p-0">
                              <DrillSessions url={`/funnel/sessions?date=${dayKey}&limit=50`} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── UTM SOURCE ── */}
      {activeTab === 'fuentes' && (
        statsLoading ? <div className="text-slate-400 text-sm text-center py-16">Cargando…</div>
        : !stats ? null : (
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">
                Por fuente (UTM Source) <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
              </h3>
            </div>
            <FilterBar onClear={utmSrcQ || utmSrcSort ? () => { setUtmSrcQ(''); setUtmSrcSort(null); } : undefined}>
              <FilterInput placeholder="Buscar fuente…" value={utmSrcQ} onChange={setUtmSrcQ} />
              <span className="text-xs text-slate-400">· Haz clic en los encabezados para ordenar</span>
            </FilterBar>
            {filteredSources.length === 0
              ? <p className="text-slate-400 text-sm text-center py-12">Sin resultados</p>
              : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <SortTh col="source"    label="Fuente"     sort={utmSrcSort} onSort={(c) => toggleSort(utmSrcSort, setUtmSrcSort, c)} />
                        <SortTh col="sessions"  label="Sesiones"   sort={utmSrcSort} onSort={(c) => toggleSort(utmSrcSort, setUtmSrcSort, c)} right />
                        <SortTh col="registers" label="Registros"  sort={utmSrcSort} onSort={(c) => toggleSort(utmSrcSort, setUtmSrcSort, c)} right />
                        <SortTh col="leads"     label="Leads"      sort={utmSrcSort} onSort={(c) => toggleSort(utmSrcSort, setUtmSrcSort, c)} right />
                        <th className="text-right w-20">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSources.map((row) => {
                        const key = row.source || '(directo)';
                        const open = expandSrc === key;
                        return (
                          <>
                            <tr key={key} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandSrc, setExpandSrc, key)}>
                              <td className="font-medium text-sm">
                                <span className="text-slate-300 mr-1.5 select-none">{open ? '▾' : '▸'}</span>{key}
                              </td>
                              <td className="text-right text-sm text-slate-600">{row.sessions.toLocaleString('es-ES')}</td>
                              <td className="text-right text-sm text-slate-600">{row.registers}</td>
                              <td className="text-right text-sm text-slate-600">{row.leads}</td>
                              <td className="text-right text-sm text-slate-500">{pct(row.leads, row.sessions)}</td>
                            </tr>
                            {open && (
                              <tr key={`${key}-d`}>
                                <td colSpan={5} className="p-0">
                                  <DrillSessions url={`/funnel/sessions?source=${encodeURIComponent(row.source)}&${buildTimeParams(selectedDate, days)}&limit=50`} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        )
      )}

      {/* ── UTM CAMPAIGN ── */}
      {activeTab === 'campanas' && (
        statsLoading ? <div className="text-slate-400 text-sm text-center py-16">Cargando…</div>
        : !stats ? null : (
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">
                Por campaña (UTM Campaign) <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
              </h3>
            </div>
            <FilterBar onClear={campQ || campMedium || campSrcQ || campSort ? () => { setCampQ(''); setCampMedium(''); setCampSrcQ(''); setCampSort(null); } : undefined}>
              <FilterInput placeholder="Buscar campaña…"  value={campQ}    onChange={setCampQ} />
              <FilterInput placeholder="Buscar fuente…"   value={campSrcQ} onChange={setCampSrcQ} />
              {campMediumOptions.length > 0 && (
                <FilterSelect value={campMedium} onChange={setCampMedium} placeholder="Todos los medios"
                  options={campMediumOptions} />
              )}
              <span className="text-xs text-slate-400">· Haz clic en los encabezados para ordenar</span>
            </FilterBar>
            {filteredCampaigns.length === 0
              ? <p className="text-slate-400 text-sm text-center py-12">Sin resultados</p>
              : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <SortTh col="campaign"  label="Campaña"    sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} />
                        <SortTh col="medium"    label="Medio"      sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} />
                        <SortTh col="source"    label="Fuente"     sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} />
                        <SortTh col="sessions"  label="Sesiones"   sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} right />
                        <SortTh col="registers" label="Registros"  sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} right />
                        <SortTh col="leads"     label="Leads"      sort={campSort} onSort={(c) => toggleSort(campSort, setCampSort, c)} right />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.map((row, i) => {
                        const key = `${row.campaign}|${row.medium}|${row.source}|${i}`;
                        const open = expandCamp === key;
                        return (
                          <>
                            <tr key={key} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandCamp, setExpandCamp, key)}>
                              <td className="text-sm font-medium max-w-[200px] truncate">
                                <span className="text-slate-300 mr-1.5 select-none">{open ? '▾' : '▸'}</span>{row.campaign}
                              </td>
                              <td className="text-sm text-slate-500 capitalize">{row.medium || '–'}</td>
                              <td className="text-sm text-slate-500">{row.source || '–'}</td>
                              <td className="text-right text-sm text-slate-600">{row.sessions.toLocaleString('es-ES')}</td>
                              <td className="text-right text-sm text-slate-600">{row.registers}</td>
                              <td className="text-right text-sm text-slate-600">{row.leads}</td>
                            </tr>
                            {open && (
                              <tr key={`${key}-d`}>
                                <td colSpan={6} className="p-0">
                                  <DrillSessions url={`/funnel/sessions?campaign=${encodeURIComponent(row.campaign)}&${buildTimeParams(selectedDate, days)}&limit=50`} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        )
      )}

      {/* ── OFERTAS MÁS VISTAS ── */}
      {activeTab === 'ofertas' && (
        statsLoading ? <div className="text-slate-400 text-sm text-center py-16">Cargando…</div>
        : !stats ? null : (
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">
                Ofertas más vistas <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
              </h3>
            </div>
            <FilterBar onClear={offerQ || offerMinViews || offerMinLeads || offerSort ? () => { setOfferQ(''); setOfferMinViews(''); setOfferMinLeads(''); setOfferSort(null); } : undefined}>
              <FilterInput placeholder="Buscar vehículo…" value={offerQ} onChange={setOfferQ} />
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">Vistas ≥</span>
                <input type="number" min="0" value={offerMinViews} onChange={(e) => setOfferMinViews(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-16 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">Leads ≥</span>
                <input type="number" min="0" value={offerMinLeads} onChange={(e) => setOfferMinLeads(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-16 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <span className="text-xs text-slate-400">· Haz clic en los encabezados para ordenar</span>
            </FilterBar>
            {filteredOffers.length === 0
              ? <p className="text-slate-400 text-sm text-center py-12">Sin resultados</p>
              : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <SortTh col="offer_title" label="Vehículo" sort={offerSort} onSort={(c) => toggleSort(offerSort, setOfferSort, c)} />
                        <SortTh col="views"        label="Vistas"   sort={offerSort} onSort={(c) => toggleSort(offerSort, setOfferSort, c)} right />
                        <SortTh col="leads"        label="Leads"    sort={offerSort} onSort={(c) => toggleSort(offerSort, setOfferSort, c)} right />
                        <th className="text-right w-20">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOffers.map((row) => {
                        const open = expandOffer === row.offer_id;
                        return (
                          <>
                            <tr key={row.offer_id} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandOffer, setExpandOffer, row.offer_id)}>
                              <td className="text-sm font-medium">
                                <span className="text-slate-300 mr-1.5 select-none">{open ? '▾' : '▸'}</span>
                                {row.offer_url
                                  ? <a href={row.offer_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="truncate max-w-xs text-blue-600 hover:text-blue-800 hover:underline">{row.offer_title || row.offer_id}</a>
                                  : <span className="truncate max-w-xs">{row.offer_title || row.offer_id}</span>}
                              </td>
                              <td className="text-right text-sm text-slate-600">{row.views}</td>
                              <td className="text-right text-sm text-slate-600">{row.leads}</td>
                              <td className="text-right text-sm text-slate-500">{pct(row.leads, row.views)}</td>
                            </tr>
                            {open && (
                              <tr key={`${row.offer_id}-d`}>
                                <td colSpan={4} className="p-0">
                                  <DrillEvents url={`/funnel/events?offer_id=${encodeURIComponent(row.offer_id)}&${buildTimeParams(selectedDate, days)}&limit=50`} />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        )
      )}

      {/* ── POR SESIÓN / USUARIO ── */}
      {activeTab === 'sesiones' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800 text-sm">
              Por sesión / usuario <span className="text-slate-400 font-normal">({sessTotal.toLocaleString('es-ES')})</span>
            </h3>
            <button onClick={exportSessions} disabled={exporting === 'sessions'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {exporting === 'sessions' ? '…' : '↓'} Exportar Excel
            </button>
          </div>
          <FilterBar onClear={sessQ || sessSrc || sessConv || sessCampaign ? () => { setSessQ(''); setSessSrc(''); setSessConv(''); setSessCampaign(''); setSessPage(1); } : undefined}>
            <FilterInput placeholder="Email / usuario…"  value={sessQ}        onChange={(v) => { setSessQ(v); setSessPage(1); }} />
            <FilterInput placeholder="Campaña…"          value={sessCampaign} onChange={setSessCampaign} />
            <FilterSelect value={sessSrc} onChange={(v) => { setSessSrc(v); setSessPage(1); }} placeholder="Todas las fuentes"
              options={[
                { value: 'google', label: 'Google' }, { value: 'facebook', label: 'Facebook' },
                { value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' },
                { value: 'whatsapp', label: 'WhatsApp' }, { value: 'direct', label: 'Directo' },
              ]} />
            <FilterSelect value={sessConv} onChange={(v) => { setSessConv(v); setSessPage(1); }} placeholder="Toda conversión"
              options={[
                { value: 'register',      label: 'Registrados' },
                { value: 'register-only', label: 'Registrado, sin solicitud' },
                { value: 'lead',          label: 'Con solicitud' },
                { value: 'none',          label: 'Sin convertir' },
              ]} />
          </FilterBar>
          {sessLoading ? <div className="text-slate-400 text-sm text-center py-12">Cargando…</div>
          : filteredSessions.length === 0 ? <p className="text-slate-400 text-sm text-center py-12">Sin sesiones registradas aún</p>
          : (
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Usuario / Sesión</th><th>Recorrido</th><th>Fuente</th>
                    <th>Campaña</th><th>Registrado</th><th>Lead</th><th>Primera visita</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((s) => {
                    const open = expandSess === s.anon_id;
                    return (
                      <>
                        <tr key={s.anon_id} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandSess, setExpandSess, s.anon_id)}>
                          <td className="text-xs max-w-[160px] truncate">
                            <span className="text-slate-300 mr-1 select-none">{open ? '▾' : '▸'}</span>
                            {s.user_email
                              ? <span className="text-blue-600 font-medium">{s.user_email}</span>
                              : <span className="text-slate-400 font-mono">{s.anon_id.slice(0, 16)}…</span>}
                          </td>
                          <td>
                            <div className="flex items-center gap-1 flex-wrap">
                              {(s.events as string[]).map((ev, i) => (
                                <span key={i} className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${EVENT_COLORS[ev] ?? 'bg-slate-100 text-slate-600'}`}>
                                  {EVENT_LABELS[ev] ?? ev}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-xs text-slate-500">{s.utm_source || '–'}</td>
                          <td className="text-xs text-slate-500 max-w-[140px] truncate">{s.utm_campaign || '–'}</td>
                          <td className="text-center">{s.did_register ? <span className="text-emerald-600 text-xs font-semibold">✓</span> : <span className="text-slate-300 text-xs">–</span>}</td>
                          <td className="text-center">{s.did_lead ? <span className="text-amber-600 text-xs font-semibold">✓</span> : <span className="text-slate-300 text-xs">–</span>}</td>
                          <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(s.first_seen)}</td>
                          <td><button onClick={(e) => { e.stopPropagation(); goToEventsForSession(s.anon_id); }} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Ver eventos →</button></td>
                        </tr>
                        {open && (
                          <tr key={`${s.anon_id}-d`}>
                            <td colSpan={8} className="p-0">
                              <DrillEvents url={`/funnel/events?anon_id=${encodeURIComponent(s.anon_id)}&limit=50`} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {sessTotal > 50 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Pág. {sessPage} · {Math.ceil(sessTotal / 50)} páginas</span>
              <div className="flex gap-2">
                <button disabled={sessPage <= 1} onClick={() => setSessPage((p) => p - 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
                <button disabled={sessPage >= Math.ceil(sessTotal / 50)} onClick={() => setSessPage((p) => p + 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── GENERADOR DE LINKS UTM ── */}
      {activeTab === 'generador' && (
        <div className="space-y-5">
          <Card>
            <h3 className="font-semibold text-slate-800 text-sm mb-4">Generador de links con UTM</h3>

            {/* Presets de canal */}
            <div className="mb-5">
              <p className="text-xs text-slate-500 mb-2 font-medium">Canal rápido</p>
              <div className="flex flex-wrap gap-2">
                {UTM_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                      utmSource === p.source && utmMedium === p.medium
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Campos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">URL base <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={utmBase}
                  onChange={(e) => setUtmBase(e.target.value)}
                  placeholder="https://www.carswiseai.com/marketplace-vo/..."
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {[
                    { label: 'Marketplace',  url: 'https://www.carswiseai.com/marketplace-vo' },
                    { label: 'Renting',      url: 'https://www.carswiseai.com/marketplace-vo?tipo=renting' },
                    { label: 'Inicio',       url: 'https://www.carswiseai.com' },
                  ].map((s) => (
                    <button key={s.label} onClick={() => setUtmBase(s.url)}
                      className="text-[11px] text-brand-600 hover:underline border border-brand-200 rounded px-2 py-0.5 bg-brand-50 hover:bg-brand-100 transition-colors">
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">utm_source <span className="text-slate-400">(canal)</span></label>
                <input type="text" value={utmSource} onChange={(e) => setUtmSource(e.target.value)}
                  placeholder="instagram, google, email…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">utm_medium <span className="text-slate-400">(tipo)</span></label>
                <input type="text" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="social, email, cpc…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">utm_campaign <span className="text-slate-400">(nombre campaña)</span></label>
                <input type="text" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)}
                  placeholder="junio-renting, black-friday…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">utm_content <span className="text-slate-400">(opcional · variante)</span></label>
                <input type="text" value={utmContent} onChange={(e) => setUtmContent(e.target.value)}
                  placeholder="stories, post, boton…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            {/* Link generado */}
            {generatedUrl ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Link generado</p>
                  <button
                    onClick={copyUrl}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                      utmCopied
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>
                    {utmCopied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-xs text-slate-700 font-mono break-all leading-relaxed">{generatedUrl}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-400">
                Rellena al menos la URL base y utm_source para generar el link
              </div>
            )}
          </Card>

          {/* Tabla de parámetros */}
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Referencia de parámetros UTM</h3>
            </div>
            <table className="erp-table w-full">
              <thead>
                <tr>
                  <th>Parámetro</th><th>Para qué sirve</th><th>Ejemplos</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  { param: 'utm_source', desc: 'De dónde viene el usuario', ex: 'instagram, google, newsletter, whatsapp' },
                  { param: 'utm_medium', desc: 'Tipo de canal o formato',   ex: 'social, email, cpc, referral' },
                  { param: 'utm_campaign', desc: 'Nombre de la campaña',     ex: 'junio-renting, verano-2026, black-friday' },
                  { param: 'utm_content', desc: 'Variante del anuncio (A/B)', ex: 'stories, carrusel, bio-link' },
                  { param: 'utm_term',   desc: 'Palabra clave (Google Ads)', ex: 'coche-segunda-mano-madrid' },
                ].map((r) => (
                  <tr key={r.param}>
                    <td><code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{r.param}</code></td>
                    <td className="text-slate-600">{r.desc}</td>
                    <td className="text-slate-400 font-mono text-[11px]">{r.ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── EVENTOS RECIENTES ── */}
      {activeTab === 'eventos' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 text-sm">
                Eventos recientes <span className="text-slate-400 font-normal">({evtTotal.toLocaleString('es-ES')})</span>
              </h3>
              {filterAnonId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                  Sesión: <span className="font-mono">{filterAnonId.slice(0, 14)}…</span>
                  <button onClick={() => { setFilterAnonId(''); setEvtPage(1); }} className="hover:text-blue-900 ml-0.5">×</button>
                </span>
              )}
            </div>
            <button onClick={exportEvents} disabled={exporting === 'events'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {exporting === 'events' ? '…' : '↓'} Exportar Excel
            </button>
          </div>
          <FilterBar onClear={filterEvtQ || filterType || filterSource || filterEvtCampaign ? () => { setFilterEvtQ(''); setFilterType(''); setFilterSource(''); setFilterEvtCampaign(''); setEvtPage(1); } : undefined}>
            <FilterInput placeholder="Email / usuario…" value={filterEvtQ}       onChange={(v) => { setFilterEvtQ(v); setEvtPage(1); }} />
            <FilterInput placeholder="Campaña…"         value={filterEvtCampaign} onChange={setFilterEvtCampaign} />
            <FilterSelect value={filterType} onChange={(v) => { setFilterType(v); setEvtPage(1); }} placeholder="Todos los eventos"
              options={Object.entries(EVENT_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            <FilterSelect value={filterSource} onChange={(v) => { setFilterSource(v); setEvtPage(1); }} placeholder="Todas las fuentes"
              options={[
                { value: 'google', label: 'Google' }, { value: 'facebook', label: 'Facebook' },
                { value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' },
                { value: 'whatsapp', label: 'WhatsApp' }, { value: 'direct', label: 'Directo' },
              ]} />
          </FilterBar>
          {evtLoading ? <div className="text-slate-400 text-sm text-center py-12">Cargando…</div>
          : filteredEvents.length === 0 ? <p className="text-slate-400 text-sm text-center py-12">Sin eventos registrados aún</p>
          : (
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr><th>Evento</th><th>Usuario / Anon</th><th>Fuente</th><th>Campaña</th><th>Oferta</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e) => {
                    const open = expandEvt === e.id;
                    return (
                      <>
                        <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => xpand(expandEvt, setExpandEvt, e.id)}>
                          <td>
                            <span className="text-slate-300 mr-1 select-none">{open ? '▾' : '▸'}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-600'}`}>{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                          </td>
                          <td className="text-xs text-slate-600 max-w-[160px] truncate">
                            {e.user_email || (
                              <button onClick={(ev) => { ev.stopPropagation(); setFilterAnonId(e.anon_id); setEvtPage(1); }} className="text-slate-400 font-mono hover:text-blue-600 hover:underline">
                                {e.anon_id.slice(0, 18)}…
                              </button>
                            )}
                          </td>
                          <td className="text-xs text-slate-500">{e.utm_source || <span className="text-slate-300">–</span>}</td>
                          <td className="text-xs text-slate-500 max-w-[140px] truncate">{e.utm_campaign || <span className="text-slate-300">–</span>}</td>
                          <td className="text-xs text-slate-500 max-w-[160px] truncate">
                            {e.offer_title
                              ? e.offer_id
                                ? <a href={`https://www.carswiseai.com/marketplace-vo/${e.offer_id}`} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-blue-600 hover:text-blue-800 hover:underline">{e.offer_title}</a>
                                : e.offer_title
                              : <span className="text-slate-300">–</span>}
                          </td>
                          <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                        </tr>
                        {open && (
                          <tr key={`${e.id}-d`}>
                            <td colSpan={6} className="p-0">
                              <DetailGrid items={[
                                { label: 'Tipo evento',   value: <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-600'}`}>{EVENT_LABELS[e.event_type] ?? e.event_type}</span> },
                                { label: 'Email',         value: e.user_email || '–' },
                                { label: 'ID sesión',     value: <span className="font-mono text-[10px]">{e.anon_id}</span> },
                                { label: 'Fuente',        value: e.utm_source || '–' },
                                { label: 'Medio',         value: e.utm_medium || '–' },
                                { label: 'Campaña',       value: e.utm_campaign || '–' },
                                { label: 'Sección',       value: e.section || '–' },
                                { label: 'Oferta',        value: e.offer_title || '–' },
                                { label: 'ID oferta',     value: e.offer_id ? <span className="font-mono text-[10px]">{e.offer_id}</span> : '–' },
                                { label: 'Landing URL',   value: e.landing_url ? <a href={e.landing_url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-blue-600 hover:underline break-all">{e.landing_url}</a> : '–' },
                                { label: 'Fecha',         value: fmtDate(e.created_at) },
                              ]} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {evtTotal > 50 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Pág. {evtPage} · {Math.ceil(evtTotal / 50)} páginas</span>
              <div className="flex gap-2">
                <button disabled={evtPage <= 1} onClick={() => setEvtPage((p) => p - 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
                <button disabled={evtPage >= Math.ceil(evtTotal / 50)} onClick={() => setEvtPage((p) => p + 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
