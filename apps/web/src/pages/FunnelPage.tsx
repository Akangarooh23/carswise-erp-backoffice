import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'; // UTF-8 BOM so Excel reads accents correctly
  const lines = [
    headers.join(';'),
    ...rows.map((r) => r.join(';')),
  ].join('\r\n');
  const blob = new Blob([bom + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getLocalDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface FunnelStep {
  step: string;
  label: string;
  count: number;
}
interface UtmSource {
  source: string;
  sessions: number;
  registers: number;
  leads: number;
}
interface UtmCampaign {
  campaign: string;
  medium: string;
  source: string;
  sessions: number;
  registers: number;
  leads: number;
}
interface TopOffer {
  offer_id: string;
  offer_title: string;
  offer_url: string | null;
  views: number;
  leads: number;
}
interface FunnelStats {
  days: number;
  funnel: FunnelStep[];
  utmSources: UtmSource[];
  utmCampaigns: UtmCampaign[];
  topOffers: TopOffer[];
}

interface FunnelEvent {
  id: string;
  anon_id: string;
  user_email: string | null;
  event_type: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  offer_id: string | null;
  offer_title: string | null;
  landing_url: string;
  created_at: string;
}

interface FunnelSession {
  anon_id: string;
  user_email: string | null;
  first_seen: string;
  last_seen: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  event_count: number;
  events: string[];
  did_register: boolean;
  did_lead: boolean;
}

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

const FUNNEL_COLORS = ['bg-slate-400', 'bg-blue-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400'];

interface DailyRow {
  day: string;
  landings: number;
  marketplace_views: number;
  offer_views: number;
  registers: number;
  leads: number;
  total: number;
}

function pct(a: number, b: number) {
  if (!b) return '–';
  return `${Math.round((a / b) * 100)}%`;
}
function fmtDate(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

const DATE_SHORTCUTS = [
  { label: 'Hoy',       daysAgo: 0 },
  { label: 'Ayer',      daysAgo: 1 },
  { label: 'Anteayer',  daysAgo: 2 },
];
const DAYS_OPTIONS = [7, 14, 30, 60, 90];
const DAYS_LABELS: Record<number, string> = { 7: '7d', 14: '14d', 30: '30d', 60: '60d', 90: '90d' };

function buildTimeParams(selectedDate: string, days: number): URLSearchParams {
  const p = new URLSearchParams();
  if (selectedDate) p.set('date', selectedDate);
  else              p.set('days', String(days));
  return p;
}

function periodLabel(selectedDate: string, days: number): string {
  if (selectedDate) {
    const today     = getLocalDate(0);
    const yesterday = getLocalDate(1);
    const dayBefore = getLocalDate(2);
    if (selectedDate === today)     return 'hoy';
    if (selectedDate === yesterday) return 'ayer';
    if (selectedDate === dayBefore) return 'anteayer';
    return selectedDate;
  }
  return `últimos ${DAYS_LABELS[days] ?? `${days}d`}`;
}

export default function FunnelPage() {
  const [days, setDays]             = useState(30);
  const [selectedDate, setSelectedDate] = useState('');
  // Global user filter (applies to sessions, events and daily)
  const [globalUser, setGlobalUser] = useState('');
  const [stats, setStats]     = useState<FunnelStats | null>(null);
  const [events, setEvents]   = useState<FunnelEvent[]>([]);
  const [evtTotal, setEvtTotal] = useState(0);
  const [evtPage, setEvtPage] = useState(1);
  // Events filters
  const [filterType, setFilterType]     = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterEvtQ, setFilterEvtQ]     = useState('');
  // Sessions filters
  const [sessSrc, setSessSrc]           = useState('');
  const [sessConv, setSessConv]         = useState('');
  const [sessQ, setSessQ]               = useState('');
  const [sessions, setSessions]         = useState<FunnelSession[]>([]);
  const [sessTotal, setSessTotal]       = useState(0);
  const [sessPage, setSessPage]         = useState(1);
  const [sessLoading, setSessLoading]   = useState(false);
  // Daily breakdown
  const [daily, setDaily]               = useState<DailyRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [filterAnonId, setFilterAnonId] = useState('');
  const [loading, setLoading]           = useState(true);
  const [evtLoading, setEvtLoading]     = useState(false);
  const [exporting, setExporting]       = useState<'sessions' | 'events' | null>(null);
  const eventsCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const params = buildTimeParams(selectedDate, days);
    api.get<FunnelStats>(`/funnel/stats?${params}`)
      .then((r) => { if (r.ok) setStats(r.data); })
      .finally(() => setLoading(false));
  }, [days, selectedDate]);

  useEffect(() => {
    setEvtLoading(true);
    const params = buildTimeParams(selectedDate, days);
    params.set('page', String(evtPage));
    params.set('limit', '50');
    if (filterType)   params.set('event_type', filterType);
    if (filterSource) params.set('source', filterSource);
    if (filterAnonId) params.set('anon_id', filterAnonId);
    const evtQ = filterEvtQ || globalUser;
    if (evtQ) params.set('q', evtQ);
    api.get<FunnelEvent[]>(`/funnel/events?${params}`)
      .then((r) => {
        if (r.ok) {
          setEvents(r.data);
          setEvtTotal(r.meta?.total ?? 0);
        }
      })
      .finally(() => setEvtLoading(false));
  }, [evtPage, filterType, filterSource, filterEvtQ, filterAnonId, globalUser, days, selectedDate]);

  useEffect(() => {
    setSessLoading(true);
    const params = buildTimeParams(selectedDate, days);
    params.set('page', String(sessPage));
    params.set('limit', '50');
    if (sessSrc)  params.set('source', sessSrc);
    if (sessConv) params.set('converted', sessConv);
    const sQ = sessQ || globalUser;
    if (sQ) params.set('q', sQ);
    api.get<FunnelSession[]>(`/funnel/sessions?${params}`)
      .then((r) => {
        if (r.ok) {
          setSessions(r.data);
          setSessTotal(r.meta?.total ?? 0);
        }
      })
      .finally(() => setSessLoading(false));
  }, [days, selectedDate, sessPage, sessSrc, sessConv, sessQ, globalUser]);

  useEffect(() => {
    setDailyLoading(true);
    const params = buildTimeParams(selectedDate, days);
    if (globalUser) params.set('user', globalUser);
    api.get<DailyRow[]>(`/funnel/daily?${params}`)
      .then((r) => { if (r.ok) setDaily(r.data); })
      .finally(() => setDailyLoading(false));
  }, [days, selectedDate, globalUser]);

  const exportSessions = useCallback(async () => {
    setExporting('sessions');
    try {
      const params = buildTimeParams(selectedDate, days);
      params.set('page', '1');
      params.set('limit', '5000');
      if (sessSrc)  params.set('source', sessSrc);
      if (sessConv) params.set('converted', sessConv);
      if (sessQ)    params.set('q', sessQ);
      const r = await api.get<FunnelSession[]>(`/funnel/sessions?${params}`);
      if (!r.ok) return;
      const headers = ['Email / Sesión', 'Recorrido', 'Fuente', 'Medio', 'Campaña', 'Registrado', 'Lead', 'Primera visita', 'Última visita'];
      const rows = (r.data as FunnelSession[]).map((s) => [
        escapeCsv(s.user_email || s.anon_id),
        escapeCsv((s.events as string[]).map((e) => EVENT_LABELS[e] ?? e).join(' → ')),
        escapeCsv(s.utm_source),
        escapeCsv(s.utm_medium),
        escapeCsv(s.utm_campaign),
        s.did_register ? 'Sí' : 'No',
        s.did_lead     ? 'Sí' : 'No',
        escapeCsv(s.first_seen ? new Date(s.first_seen).toLocaleString('es-ES') : ''),
        escapeCsv(s.last_seen  ? new Date(s.last_seen).toLocaleString('es-ES')  : ''),
      ]);
      const suffix = selectedDate || `${days}d`;
      downloadCsv(`funnel-sesiones-${suffix}.csv`, headers, rows);
    } finally {
      setExporting(null);
    }
  }, [days, selectedDate, sessSrc, sessConv, sessQ]);

  const exportEvents = useCallback(async () => {
    setExporting('events');
    try {
      const params = buildTimeParams(selectedDate, days);
      params.set('page', '1');
      params.set('limit', '5000');
      if (filterType)   params.set('event_type', filterType);
      if (filterSource) params.set('source', filterSource);
      if (filterAnonId) params.set('anon_id', filterAnonId);
      if (filterEvtQ)   params.set('q', filterEvtQ);
      const r = await api.get<FunnelEvent[]>(`/funnel/events?${params}`);
      if (!r.ok) return;
      const headers = ['Evento', 'Email', 'Fuente', 'Medio', 'Campaña', 'Oferta', 'URL landing', 'Fecha'];
      const rows = (r.data as FunnelEvent[]).map((e) => [
        escapeCsv(EVENT_LABELS[e.event_type] ?? e.event_type),
        escapeCsv(e.user_email || ''),
        escapeCsv(e.utm_source),
        escapeCsv(e.utm_medium),
        escapeCsv(e.utm_campaign),
        escapeCsv(e.offer_title || ''),
        escapeCsv(e.landing_url),
        escapeCsv(e.created_at ? new Date(e.created_at).toLocaleString('es-ES') : ''),
      ]);
      downloadCsv(`funnel-eventos.csv`, headers, rows);
    } finally {
      setExporting(null);
    }
  }, [days, selectedDate, filterType, filterSource, filterAnonId, filterEvtQ]);

  const maxCount = stats ? Math.max(...stats.funnel.map((s) => s.count), 1) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing & Funnel"
        subtitle="Seguimiento del embudo de captación y atribución UTM"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar por usuario (email)…"
                value={globalUser}
                onChange={(e) => { setGlobalUser(e.target.value); setSessPage(1); setEvtPage(1); }}
                className="text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 w-52 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              {globalUser && (
                <button onClick={() => setGlobalUser('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">×</button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Specific day shortcuts */}
              {DATE_SHORTCUTS.map(({ label, daysAgo }) => {
                const date = getLocalDate(daysAgo);
                const active = selectedDate === date;
                return (
                  <button key={label}
                    onClick={() => { setSelectedDate(date); setSessPage(1); setEvtPage(1); }}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      active
                        ? 'bg-brand-600 border-brand-600 text-white font-medium'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}>
                    {label}
                  </button>
                );
              })}
              <span className="text-slate-200 text-xs px-0.5">|</span>
              {/* Interval buttons */}
              {DAYS_OPTIONS.map((d) => (
                <button key={d}
                  onClick={() => { setSelectedDate(''); setDays(d); setSessPage(1); setEvtPage(1); }}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    !selectedDate && days === d
                      ? 'bg-brand-600 border-brand-600 text-white font-medium'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                  {DAYS_LABELS[d] ?? `${d}d`}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {loading ? (
        <div className="text-slate-400 text-sm text-center py-16">Cargando estadísticas…</div>
      ) : !stats ? (
        <div className="text-red-500 text-sm text-center py-16">Error al cargar los datos</div>
      ) : (
        <>
          {/* Funnel visual */}
          <Card>
            <h3 className="font-semibold text-slate-800 text-sm mb-4">
              Embudo de conversión <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
            </h3>
            <div className="space-y-2.5">
              {stats.funnel.map((step, i) => {
                const prev = i > 0 ? stats.funnel[i - 1].count : null;
                const barW  = step.count ? Math.round((step.count / maxCount) * 100) : 0;
                return (
                  <div key={step.step} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-right text-xs text-slate-500 leading-tight">{step.label}</div>
                    <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg transition-all ${FUNNEL_COLORS[i]}`}
                        style={{ width: `${barW}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-slate-700">
                        {step.count.toLocaleString('es-ES')}
                        {prev !== null && (
                          <span className="ml-2 font-normal text-slate-400">({pct(step.count, prev)} del paso anterior)</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Daily breakdown */}
          <Card padding={false}>
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">
                Desglose diario <span className="text-slate-400 font-normal text-xs">· {periodLabel(selectedDate, days)}</span>
              </h3>
            </div>
            {dailyLoading ? (
              <div className="text-slate-400 text-sm text-center py-6">Cargando…</div>
            ) : daily.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Sin datos aún</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th className="w-28">Día</th>
                      <th className="text-right w-20">Accesos</th>
                      <th className="text-right w-24">Marketplace</th>
                      <th className="text-right w-24">Ofertas</th>
                      <th className="text-right w-24">Registros</th>
                      <th className="text-right w-24">Solicitudes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((row) => (
                      <tr key={row.day}>
                        <td className="text-xs font-medium text-slate-700 whitespace-nowrap">
                          {new Date(String(row.day).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })}
                        </td>
                        <td className="text-right text-sm text-slate-600">{row.landings || '–'}</td>
                        <td className="text-right text-sm text-slate-600">{row.marketplace_views || '–'}</td>
                        <td className="text-right text-sm text-slate-600">{row.offer_views || '–'}</td>
                        <td className="text-right">
                          {row.registers > 0
                            ? <span className="text-emerald-700 font-semibold text-sm">{row.registers}</span>
                            : <span className="text-slate-300 text-sm">–</span>}
                        </td>
                        <td className="text-right">
                          {row.leads > 0
                            ? <span className="text-amber-700 font-semibold text-sm">{row.leads}</span>
                            : <span className="text-slate-300 text-sm">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* UTM Sources */}
            <Card padding={false}>
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Por fuente (UTM Source)</h3>
              </div>
              {stats.utmSources.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin datos UTM aún</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead><tr><th className="w-full">Fuente</th><th className="text-right w-20">Sesiones</th><th className="text-right w-24">Registros</th><th className="text-right w-16">Leads</th><th className="text-right w-16">Conv.</th></tr></thead>
                    <tbody>
                      {stats.utmSources.map((row) => (
                        <tr key={row.source}>
                          <td className="font-medium text-sm">{row.source || '(directo)'}</td>
                          <td className="text-right text-sm text-slate-600">{row.sessions.toLocaleString('es-ES')}</td>
                          <td className="text-right text-sm text-slate-600">{row.registers}</td>
                          <td className="text-right text-sm text-slate-600">{row.leads}</td>
                          <td className="text-right text-sm text-slate-500">{pct(row.leads, row.sessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* UTM Campaigns */}
            <Card padding={false}>
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Por campaña (UTM Campaign)</h3>
              </div>
              {stats.utmCampaigns.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin campañas UTM aún</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full">
                    <thead><tr><th className="w-full">Campaña</th><th className="w-20">Medio</th><th className="w-20">Fuente</th><th className="text-right w-20">Sesiones</th><th className="text-right w-16">Leads</th></tr></thead>
                    <tbody>
                      {stats.utmCampaigns.map((row, i) => (
                        <tr key={i}>
                          <td className="text-sm font-medium max-w-[140px] truncate">{row.campaign}</td>
                          <td className="text-sm text-slate-500 capitalize">{row.medium || '–'}</td>
                          <td className="text-sm text-slate-500">{row.source || '–'}</td>
                          <td className="text-right text-sm text-slate-600">{row.sessions.toLocaleString('es-ES')}</td>
                          <td className="text-right text-sm text-slate-600">{row.leads}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Top offers */}
          {stats.topOffers.length > 0 && (
            <Card padding={false}>
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Ofertas más vistas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="erp-table w-full">
                  <thead><tr><th className="w-full">Vehículo</th><th className="text-right w-24">Vistas</th><th className="text-right w-24">Leads</th><th className="text-right w-20">Conv.</th></tr></thead>
                  <tbody>
                    {stats.topOffers.map((row) => (
                      <tr key={row.offer_id}>
                        <td className="text-sm font-medium">
                          {row.offer_url ? (
                            <a href={row.offer_url} target="_blank" rel="noopener noreferrer"
                               className="block truncate max-w-xs text-blue-600 hover:text-blue-800 hover:underline">
                              {row.offer_title || row.offer_id}
                            </a>
                          ) : (
                            <span className="block truncate max-w-xs">{row.offer_title || row.offer_id}</span>
                          )}
                        </td>
                        <td className="text-right text-sm text-slate-600">{row.views}</td>
                        <td className="text-right text-sm text-slate-600">{row.leads}</td>
                        <td className="text-right text-sm text-slate-500">{pct(row.leads, row.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Sessions per user/anon */}
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800 text-sm">
            Por sesión / usuario <span className="text-slate-400 font-normal">({sessTotal.toLocaleString('es-ES')})</span>
          </h3>
          <button
            onClick={exportSessions}
            disabled={exporting === 'sessions'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {exporting === 'sessions' ? '…' : '↓'} Exportar Excel
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar email…"
              value={sessQ}
              onChange={(e) => { setSessQ(e.target.value); setSessPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-44 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={sessSrc}
              onChange={(e) => { setSessSrc(e.target.value); setSessPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todas las fuentes</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="direct">Directo</option>
            </select>
            <select
              value={sessConv}
              onChange={(e) => { setSessConv(e.target.value); setSessPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Toda conversión</option>
              <option value="register">Registrados</option>
              <option value="lead">Con solicitud</option>
              <option value="none">Sin convertir</option>
            </select>
            {(sessQ || sessSrc || sessConv) && (
              <button
                onClick={() => { setSessQ(''); setSessSrc(''); setSessConv(''); setSessPage(1); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                × Limpiar
              </button>
            )}
          </div>
        </div>
        {sessLoading ? (
          <div className="text-slate-400 text-sm text-center py-8">Cargando…</div>
        ) : sessions.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin sesiones registradas aún</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Usuario / Sesión</th>
                  <th>Recorrido</th>
                  <th>Fuente</th>
                  <th>Campaña</th>
                  <th>Registrado</th>
                  <th>Lead</th>
                  <th>Primera visita</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.anon_id}>
                    <td className="text-xs max-w-[160px] truncate">
                      {s.user_email
                        ? <span className="text-blue-600 font-medium">{s.user_email}</span>
                        : <span className="text-slate-400 font-mono">{s.anon_id.slice(0, 16)}…</span>
                      }
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
                    <td className="text-center">
                      {s.did_register
                        ? <span className="text-emerald-600 text-xs font-semibold">✓</span>
                        : <span className="text-slate-300 text-xs">–</span>}
                    </td>
                    <td className="text-center">
                      {s.did_lead
                        ? <span className="text-amber-600 text-xs font-semibold">✓</span>
                        : <span className="text-slate-300 text-xs">–</span>}
                    </td>
                    <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(s.first_seen)}</td>
                    <td>
                      <button
                        onClick={() => {
                          setFilterAnonId(s.anon_id);
                          setEvtPage(1);
                          eventsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        Ver eventos →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sessTotal > 50 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Pág. {sessPage} · {Math.ceil(sessTotal / 50)} páginas</span>
            <div className="flex gap-2">
              <button disabled={sessPage <= 1} onClick={() => setSessPage((p) => p - 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
              <button disabled={sessPage >= Math.ceil(sessTotal / 50)} onClick={() => setSessPage((p) => p + 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
            </div>
          </div>
        )}
      </Card>

      {/* Recent events */}
      <div ref={eventsCardRef}>
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
          <button
            onClick={exportEvents}
            disabled={exporting === 'events'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {exporting === 'events' ? '…' : '↓'} Exportar Excel
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar email…"
              value={filterEvtQ}
              onChange={(e) => { setFilterEvtQ(e.target.value); setEvtPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-40 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setEvtPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los eventos</option>
              {Object.entries(EVENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filterSource}
              onChange={(e) => { setFilterSource(e.target.value); setEvtPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todas las fuentes</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="direct">Directo</option>
            </select>
            {(filterEvtQ || filterType || filterSource) && (
              <button
                onClick={() => { setFilterEvtQ(''); setFilterType(''); setFilterSource(''); setEvtPage(1); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                × Limpiar
              </button>
            )}
          </div>
        </div>
        {evtLoading ? (
          <div className="text-slate-400 text-sm text-center py-8">Cargando…</div>
        ) : events.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin eventos registrados aún</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Usuario / Anon</th>
                  <th>Fuente</th>
                  <th>Campaña</th>
                  <th>Oferta</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-600'}`}>
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[160px] truncate">
                      {e.user_email || (
                        <button
                          onClick={() => { setFilterAnonId(e.anon_id); setEvtPage(1); }}
                          className="text-slate-400 font-mono hover:text-blue-600 hover:underline">
                          {e.anon_id.slice(0, 18)}…
                        </button>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{e.utm_source || <span className="text-slate-300">–</span>}</td>
                    <td className="text-xs text-slate-500 max-w-[140px] truncate">{e.utm_campaign || <span className="text-slate-300">–</span>}</td>
                    <td className="text-xs text-slate-500 max-w-[160px] truncate">
                      {e.offer_title
                        ? e.offer_id
                          ? <a href={`https://www.carswiseai.com/marketplace-vo/${e.offer_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">{e.offer_title}</a>
                          : e.offer_title
                        : <span className="text-slate-300">–</span>}
                    </td>
                    <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {evtTotal > 50 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Pág. {evtPage} · {Math.ceil(evtTotal / 50)} páginas
            </span>
            <div className="flex gap-2">
              <button disabled={evtPage <= 1} onClick={() => setEvtPage((p) => p - 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
                ← Anterior
              </button>
              <button disabled={evtPage >= Math.ceil(evtTotal / 50)} onClick={() => setEvtPage((p) => p + 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
