import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Badge } from '../components/ui/Badge.js';

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
function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function inNDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

type Range = 'today' | 'week' | 'month' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  today: 'Hoy',
  week:  'Esta semana',
  month: 'Este mes',
  all:   'Todas',
};

function groupByDay(bookings: Booking[]): Record<string, Booking[]> {
  const map: Record<string, Booking[]> = {};
  for (const b of bookings) {
    const day = b.starts_at.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(b);
  }
  return map;
}

export default function BookingsPage() {
  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [range, setRange]             = useState<Range>('week');
  const [search, setSearch]           = useState('');
  const [cancelling, setCancelling]   = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIso();
    let from = today;
    let to   = '';
    if (range === 'today') { from = today; to = today + 'T23:59:59Z'; }
    else if (range === 'week')  { from = today; to = inNDays(7) + 'T23:59:59Z'; }
    else if (range === 'month') { from = today; to = inNDays(30) + 'T23:59:59Z'; }
    const params = new URLSearchParams({ status: 'confirmed', from });
    if (to) params.set('to', to);
    const r = await api.get<any>(`/all-bookings?${params}`);
    if (r.ok) setBookings((r as any).bookings || []);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(b: Booking) {
    if (!window.confirm(`¿Cancelar la visita de ${b.buyer_name || b.buyer_email} el ${fmtDateTime(b.starts_at)}?`)) return;
    setCancelling(b.id);
    await api.post(`/visit-bookings/${b.id}/cancel`, {});
    setBookings((prev) => prev.filter((x) => x.id !== b.id));
    setCancelling(null);
  }

  const filtered = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.buyer_name || '').toLowerCase().includes(q)
      || (b.buyer_email || '').toLowerCase().includes(q)
      || (b.vehicle_title || '').toLowerCase().includes(q)
      || (b.offer_id || '').toLowerCase().includes(q)
      || (b.buyer_phone || '').includes(q);
  });

  const grouped  = groupByDay(filtered);
  const days     = Object.keys(grouped).sort();
  const isToday  = (d: string) => d === todayIso();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda de visitas"
        subtitle={`${bookings.length} cita${bookings.length !== 1 ? 's' : ''} confirmada${bookings.length !== 1 ? 's' : ''}`}
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Range tabs */}
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
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar comprador, vehículo…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? '…' : '↺ Actualizar'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando agenda…</div>
      ) : days.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <div className="text-4xl mb-3">📅</div>
          <div className="font-medium">Sin citas en este período</div>
          <div className="text-xs mt-1">Prueba a ampliar el rango de fechas</div>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-2">
                <div className={`px-3 py-1 rounded-lg text-xs font-bold ${isToday(day) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {isToday(day) ? 'HOY' : fmtDate(day + 'T12:00:00')}
                </div>
                <span className="text-xs text-slate-400">{grouped[day].length} cita{grouped[day].length !== 1 ? 's' : ''}</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              {/* Bookings for this day */}
              <div className="space-y-2">
                {grouped[day].map((b) => {
                  const isExpanded = expandedId === b.id;
                  const isProfessional = !b.offer_id?.startsWith('idcar-');
                  return (
                    <div key={b.id} className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      {/* Main row */}
                      <div
                        className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      >
                        {/* Time */}
                        <div className="text-center shrink-0 w-14">
                          <div className="text-lg font-bold text-slate-800 leading-none">{fmtTime(b.starts_at)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{fmtTime(b.ends_at)}</div>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-10 bg-slate-100 shrink-0" />

                        {/* Vehicle + buyer */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 text-sm truncate">{b.vehicle_title || b.offer_id}</div>
                          <div className="text-xs text-slate-500 truncate">
                            {b.buyer_name ? <strong>{b.buyer_name} · </strong> : null}
                            {b.buyer_phone || b.buyer_email}
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={isProfessional ? 'blue' : 'slate'}>
                            {isProfessional ? 'CarsWise' : 'Particular'}
                          </Badge>
                          <Badge variant="green">Confirmada</Badge>
                        </div>

                        {/* Expand arrow */}
                        <span className="text-slate-300 text-sm select-none">{isExpanded ? '▾' : '▸'}</span>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-slate-50 px-4 py-3 bg-slate-50">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-3">
                            <div><span className="font-semibold text-slate-500">Email</span><br/><span className="text-slate-700">{b.buyer_email}</span></div>
                            <div><span className="font-semibold text-slate-500">Teléfono</span><br/><span className="text-slate-700">{b.buyer_phone || '–'}</span></div>
                            <div><span className="font-semibold text-slate-500">Oferta ID</span><br/><span className="font-mono text-slate-400 text-[10px]">{b.offer_id}</span></div>
                            <div><span className="font-semibold text-slate-500">Fuente</span><br/><span className="text-slate-700 capitalize">{b.source}</span></div>
                            {b.notes && <div className="col-span-2"><span className="font-semibold text-slate-500">Notas</span><br/><span className="text-slate-600 italic">{b.notes}</span></div>}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                              disabled={cancelling === b.id}
                              className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                            >
                              {cancelling === b.id ? 'Cancelando…' : 'Cancelar cita'}
                            </button>
                            <a
                              href={`mailto:${b.buyer_email}`}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Contactar comprador
                            </a>
                          </div>
                        </div>
                      )}
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
