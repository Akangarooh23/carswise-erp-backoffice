import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';

interface Summary {
  total_users: number;
  users_with_utm: number;
  mkt_email_consents: number;
  mkt_sms_consents: number;
  legal_consents: number;
}
interface SourceRow    { source: string; total: number; mkt_email: number; mkt_sms: number; legal: number; }
interface CampaignRow  { campaign: string; source: string; medium: string; total: number; mkt_email: number; legal: number; }
interface MediumRow    { medium: string; total: number; }
interface TimelineRow  { date: string; source: string; total: number; }

interface AnalyticsData {
  summary: Summary;
  bySource: SourceRow[];
  byCampaign: CampaignRow[];
  byMedium: MediumRow[];
  timeline: TimelineRow[];
}

const SOURCE_COLORS: Record<string, string> = {
  instagram: '#e1306c',
  facebook:  '#1877f2',
  google:    '#4285f4',
  twitter:   '#1da1f2',
  tiktok:    '#010101',
  email:     '#f59e0b',
  test:      '#8b5cf6',
  '(directo)': '#64748b',
};
function sourceColor(s: string) {
  return SOURCE_COLORS[s?.toLowerCase()] ?? '#0ea5e9';
}

function pct(num: number, den: number) {
  if (!den) return '–';
  return `${Math.round((num / den) * 100)}%`;
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// Group timeline rows by date, summing all sources per day
function timelineByDate(rows: TimelineRow[]) {
  const map: Record<string, number> = {};
  rows.forEach((r) => { map[r.date] = (map[r.date] ?? 0) + r.total; });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

export default function MarketingAnalyticsPage() {
  const [data, setData]     = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]     = useState(30);

  useEffect(() => {
    setLoading(true);
    api.get<AnalyticsData>(`/analytics/marketing?days=${days}`)
      .then((r) => { if (r.ok) setData(r.data); })
      .finally(() => setLoading(false));
  }, [days]);

  const DAY_OPTIONS = [7, 14, 30, 60, 90];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analítica de Marketing"
        subtitle="Origen de registros y conversión por UTM"
        actions={
          <div className="flex gap-1.5">
            {DAY_OPTIONS.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <p className="text-center text-slate-400 text-sm py-20">Cargando…</p>
      ) : !data ? (
        <p className="text-center text-red-400 text-sm py-20">Error al cargar datos</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard label="Registros totales"   value={data.summary.total_users} />
            <KpiCard label="Desde campaña UTM"   value={data.summary.users_with_utm}
              sub={pct(data.summary.users_with_utm, data.summary.total_users) + ' del total'} />
            <KpiCard label="Consent T&C"         value={data.summary.legal_consents}
              sub={pct(data.summary.legal_consents, data.summary.total_users)} />
            <KpiCard label="Consent Mkt Email"   value={data.summary.mkt_email_consents}
              sub={pct(data.summary.mkt_email_consents, data.summary.total_users)} />
            <KpiCard label="Consent Mkt SMS"     value={data.summary.mkt_sms_consents}
              sub={pct(data.summary.mkt_sms_consents, data.summary.total_users)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Por fuente */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Registros por fuente (UTM Source)</h3>
              </div>
              {data.bySource.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">Sin datos UTM en este período</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.bySource.map((row) => (
                    <div key={row.source} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sourceColor(row.source) }} />
                          <span className="text-sm font-medium text-slate-700 capitalize">{row.source}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>{row.total} reg.</span>
                          <span className="text-emerald-600 font-medium">{pct(row.mkt_email, row.total)} mkt</span>
                          <span className="text-blue-600 font-medium">{pct(row.legal, row.total)} T&C</span>
                        </div>
                      </div>
                      <Bar value={row.total} max={data.bySource[0].total} color={sourceColor(row.source)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Por medio */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Registros por medio (UTM Medium)</h3>
              </div>
              {data.byMedium.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">Sin datos UTM en este período</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.byMedium.map((row) => (
                    <div key={row.medium} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 capitalize">{row.medium}</span>
                        <span className="text-xs text-slate-500">{row.total} reg.</span>
                      </div>
                      <Bar value={row.total} max={data.byMedium[0].total} color="#0ea5e9" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Por campaña */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Registros por campaña (UTM Campaign)</h3>
            </div>
            {data.byCampaign.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10">Sin datos de campaña en este período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Campaña</th>
                      <th>Fuente</th>
                      <th>Medio</th>
                      <th className="text-right">Registros</th>
                      <th className="text-right">Consent T&C</th>
                      <th className="text-right">Consent Mkt Email</th>
                      <th className="text-right">Conv. Mkt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCampaign.map((row, i) => (
                      <tr key={i}>
                        <td className="font-medium text-slate-700">{row.campaign || '–'}</td>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: sourceColor(row.source) }} />
                            <span className="capitalize text-slate-600 text-xs">{row.source || '–'}</span>
                          </span>
                        </td>
                        <td className="text-xs text-slate-500 capitalize">{row.medium || '–'}</td>
                        <td className="text-right font-semibold text-slate-800">{row.total}</td>
                        <td className="text-right text-xs text-blue-600">{row.legal} <span className="text-slate-400">({pct(row.legal, row.total)})</span></td>
                        <td className="text-right text-xs text-emerald-600">{row.mkt_email} <span className="text-slate-400">({pct(row.mkt_email, row.total)})</span></td>
                        <td className="text-right">
                          <span className={`text-xs font-semibold ${
                            row.total > 0 && row.mkt_email / row.total > 0.5 ? 'text-emerald-600' : 'text-slate-500'
                          }`}>
                            {pct(row.mkt_email, row.total)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Registros diarios (últimos {days} días)</h3>
            </div>
            {data.timeline.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10">Sin registros en este período</p>
            ) : (
              <div className="px-5 py-4">
                {(() => {
                  const byDate = timelineByDate(data.timeline);
                  const maxVal = Math.max(...byDate.map(([, v]) => v), 1);
                  return (
                    <div className="flex items-end gap-1" style={{ height: 120 }}>
                      {byDate.map(([date, total]) => {
                        const h = Math.max(4, Math.round((total / maxVal) * 100));
                        const label = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                        return (
                          <div key={date} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                              {label}: {total}
                            </div>
                            <div
                              className="w-full rounded-t bg-blue-500 hover:bg-blue-400 transition-colors cursor-default"
                              style={{ height: `${h}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex justify-between mt-2 text-[10px] text-slate-400">
                  {(() => {
                    const byDate = timelineByDate(data.timeline);
                    const first = byDate[0]?.[0];
                    const last  = byDate[byDate.length - 1]?.[0];
                    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                    return <><span>{first ? fmt(first) : ''}</span><span>{last ? fmt(last) : ''}</span></>;
                  })()}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
