import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';

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
  landing:          'Visita',
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

function pct(a: number, b: number) {
  if (!b) return '–';
  return `${Math.round((a / b) * 100)}%`;
}
function fmtDate(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

export default function FunnelPage() {
  const [days, setDays]       = useState(30);
  const [stats, setStats]     = useState<FunnelStats | null>(null);
  const [events, setEvents]   = useState<FunnelEvent[]>([]);
  const [evtTotal, setEvtTotal] = useState(0);
  const [evtPage, setEvtPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [sessions, setSessions]       = useState<FunnelSession[]>([]);
  const [sessTotal, setSessTotal]     = useState(0);
  const [sessPage, setSessPage]       = useState(1);
  const [sessLoading, setSessLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evtLoading, setEvtLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<FunnelStats>(`/funnel/stats?days=${days}`)
      .then((r) => { if (r.ok) setStats(r.data); })
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    setEvtLoading(true);
    const params = new URLSearchParams({ page: String(evtPage), limit: '50' });
    if (filterType)   params.set('event_type', filterType);
    if (filterSource) params.set('source', filterSource);
    api.get<FunnelEvent[]>(`/funnel/events?${params}`)
      .then((r) => {
        if (r.ok) {
          setEvents(r.data);
          setEvtTotal(r.meta?.total ?? 0);
        }
      })
      .finally(() => setEvtLoading(false));
  }, [evtPage, filterType, filterSource]);

  useEffect(() => {
    setSessLoading(true);
    api.get<FunnelSession[]>(`/funnel/sessions?days=${days}&page=${sessPage}&limit=50`)
      .then((r) => {
        if (r.ok) {
          setSessions(r.data);
          setSessTotal(r.meta?.total ?? 0);
        }
      })
      .finally(() => setSessLoading(false));
  }, [days, sessPage]);

  const maxCount = stats ? Math.max(...stats.funnel.map((s) => s.count), 1) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing & Funnel"
        subtitle="Seguimiento del embudo de captación y atribución UTM"
        actions={
          <div className="flex items-center gap-1.5">
            {DAYS_OPTIONS.map((d) => (
              <button key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  days === d
                    ? 'bg-brand-600 border-brand-600 text-white font-medium'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}>
                {d}d
              </button>
            ))}
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
              Embudo de conversión <span className="text-slate-400 font-normal text-xs">· últimos {days} días</span>
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
                  <table className="erp-table">
                    <thead><tr><th>Fuente</th><th className="text-right">Sesiones</th><th className="text-right">Registros</th><th className="text-right">Leads</th><th className="text-right">Conv.</th></tr></thead>
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
                  <table className="erp-table">
                    <thead><tr><th>Campaña</th><th>Medio</th><th>Fuente</th><th className="text-right">Sesiones</th><th className="text-right">Leads</th></tr></thead>
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
                <table className="erp-table">
                  <thead><tr><th>Vehículo</th><th className="text-right">Vistas</th><th className="text-right">Leads</th><th className="text-right">Conv.</th></tr></thead>
                  <tbody>
                    {stats.topOffers.map((row) => (
                      <tr key={row.offer_id}>
                        <td className="text-sm font-medium max-w-[320px] truncate">{row.offer_title || row.offer_id}</td>
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
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">
            Por sesión / usuario <span className="text-slate-400 font-normal">({sessTotal.toLocaleString('es-ES')})</span>
          </h3>
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
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-slate-800 text-sm">
            Eventos recientes <span className="text-slate-400 font-normal">({evtTotal.toLocaleString('es-ES')})</span>
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setEvtPage(1); }}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Todos los eventos</option>
              {Object.entries(EVENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
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
                      {e.user_email || <span className="text-slate-300">{e.anon_id.slice(0, 18)}…</span>}
                    </td>
                    <td className="text-xs text-slate-500">{e.utm_source || <span className="text-slate-300">–</span>}</td>
                    <td className="text-xs text-slate-500 max-w-[140px] truncate">{e.utm_campaign || <span className="text-slate-300">–</span>}</td>
                    <td className="text-xs text-slate-500 max-w-[160px] truncate">{e.offer_title || <span className="text-slate-300">–</span>}</td>
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
  );
}
