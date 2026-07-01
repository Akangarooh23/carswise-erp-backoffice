import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';

type Booking = {
  id: string;
  offer_id: string;
  vehicle_title: string;
  starts_at: string;
  ends_at: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string;
  notes: string;
  status: string;
  source: string;
  slot_source: string;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function inNDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

type Range = 'today' | 'week' | 'month' | 'all';
const RANGE_LABELS: Record<Range, string> = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', all: 'Todas' };

function groupByDay(bookings: Booking[]): Record<string, Booking[]> {
  const map: Record<string, Booking[]> = {};
  for (const b of bookings) {
    const day = b.starts_at.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(b);
  }
  return map;
}

function isToday(d: string) { return d === todayIso(); }
function isProfessional(b: Booking) { return !b.offer_id?.startsWith('idcar-'); }

export default function BookingsPage() {
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [range, setRange]           = useState<Range>('week');
  const [search, setSearch]         = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIso();
    let from = today, to = '';
    if (range === 'today')  { from = today; to = today + 'T23:59:59Z'; }
    if (range === 'week')   { from = today; to = inNDays(7) + 'T23:59:59Z'; }
    if (range === 'month')  { from = today; to = inNDays(30) + 'T23:59:59Z'; }
    const params = new URLSearchParams({ status: 'confirmed', from });
    if (to) params.set('to', to);
    const r = await api.get<any>(`/all-bookings?${params}`);
    if (r.ok) setBookings((r as any).bookings || []);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(b: Booking) {
    if (!window.confirm(`¿Cancelar la visita de ${b.buyer_name || b.buyer_email}?`)) return;
    setCancelling(b.id);
    await api.post(`/visit-bookings/${b.id}/cancel`, {});
    setBookings((prev) => prev.filter((x) => x.id !== b.id));
    setCancelling(null);
  }

  const filtered = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [b.buyer_name, b.buyer_email, b.vehicle_title, b.offer_id, b.buyer_phone]
      .some((v) => (v || '').toLowerCase().includes(q));
  });

  // Stats
  const today = todayIso();
  const todayCount = bookings.filter((b) => b.starts_at.slice(0, 10) === today).length;
  const weekEnd = inNDays(7);
  const weekCount = bookings.filter((b) => b.starts_at.slice(0, 10) <= weekEnd).length;

  const grouped = groupByDay(filtered);
  const days = Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda de visitas"
        subtitle="Gestión de citas confirmadas"
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Hoy', value: todayCount, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'Esta semana', value: weekCount, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
          { label: range === 'all' ? 'Total' : 'Período', value: bookings.length, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${range === r ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar comprador, vehículo…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pulse">📅</div>
            <div className="text-sm">Cargando agenda…</div>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-5xl mb-4">📭</div>
            <div className="font-semibold text-slate-600">Sin citas en este período</div>
            <div className="text-sm text-slate-400 mt-1">Prueba con un rango de fechas más amplio</div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    isToday(day) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isToday(day) ? '● HOY' : fmtDate(day + 'T12:00:00')}
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  {grouped[day].length} cita{grouped[day].length !== 1 ? 's' : ''}
                </div>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {grouped[day].map((b) => {
                  const isExpanded = expandedId === b.id;
                  const isProf = isProfessional(b);

                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    >
                      {/* Left accent bar */}
                      <div className="flex">
                        <div className={`w-1 shrink-0 ${isProf ? 'bg-blue-500' : 'bg-slate-300'}`} />
                        <div className="flex-1">
                          {/* Main row */}
                          <div className="flex items-center gap-4 px-4 py-3">
                            {/* Time block */}
                            <div className="shrink-0 text-center w-16">
                              <div className="text-xl font-black text-slate-800 leading-none tabular-nums">
                                {fmtTime(b.starts_at)}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                                {fmtTime(b.ends_at)}
                              </div>
                            </div>

                            <div className="w-px h-10 bg-slate-100 shrink-0" />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-800 text-sm truncate">
                                {b.vehicle_title || b.offer_id}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs font-semibold text-slate-700">{b.buyer_name || '–'}</span>
                                {b.buyer_phone && (
                                  <span className="text-xs text-slate-400">· {b.buyer_phone}</span>
                                )}
                              </div>
                            </div>

                            {/* Type badge */}
                            <div className="shrink-0 flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                isProf ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {isProf ? 'CarsWise' : 'Particular'}
                              </span>
                              <span className="text-slate-300 text-xs">{isExpanded ? '▾' : '▸'}</span>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-slate-50 bg-slate-50 px-5 py-4">
                              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs mb-4">
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Email</div>
                                  <div className="text-slate-700 font-medium">{b.buyer_email}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Teléfono</div>
                                  <div className="text-slate-700 font-medium">{b.buyer_phone || '–'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">ID Oferta</div>
                                  <div className="font-mono text-slate-400 text-[10px]">{b.offer_id}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Reservado</div>
                                  <div className="text-slate-500">{new Date(b.created_at).toLocaleDateString('es-ES')}</div>
                                </div>
                                {b.notes && (
                                  <div className="col-span-2">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Notas</div>
                                    <div className="text-slate-600 italic">"{b.notes}"</div>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                                  disabled={cancelling === b.id}
                                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                  {cancelling === b.id ? 'Cancelando…' : '✕ Cancelar cita'}
                                </button>
                                <a
                                  href={`mailto:${b.buyer_email}?subject=Tu visita al ${b.vehicle_title || 'vehículo'}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                >
                                  ✉ Contactar
                                </a>
                                {b.buyer_phone && (
                                  <a
                                    href={`tel:${b.buyer_phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                  >
                                    📞 Llamar
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
