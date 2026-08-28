import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';
import Boton from '../components/ui/Boton.js';

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
  const [cancelar, setCancelar] = useState<Booking | null>(null);
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ mal: boolean; texto: string } | null>(null);
  const [pendientes, setPendientes] = useState<Booking[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [mover, setMover] = useState<Booking | null>(null);
  const [nuevoDia, setNuevoDia] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [moviendo, setMoviendo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIso();
    let from = today, to = '';
    if (range === 'today')  { from = today; to = today + 'T23:59:59Z'; }
    if (range === 'week')   { from = today; to = inNDays(7) + 'T23:59:59Z'; }
    if (range === 'month')  { from = today; to = inNDays(30) + 'T23:59:59Z'; }
    // Las pendientes se piden aparte y sin acotar por fecha: son trabajo que
    // hay que despachar, y una que caiga fuera del rango elegido no puede
    // desaparecer de la vista sin más.
    const params = new URLSearchParams({ status: 'confirmed', from });
    if (to) params.set('to', to);
    const [conf, pend] = await Promise.all([
      api.get<any>(`/all-bookings?${params}`),
      api.get<any>(`/all-bookings?status=pending&from=${today}`),
    ]);
    if (conf.ok) setBookings((conf as any).bookings || []);
    if (pend.ok) setPendientes((pend as any).bookings || []);
    setLoading(false);
  }, [range]);

  /** Abre el diálogo ya con el día y la hora que tenía: casi siempre cambia uno de los dos. */
  function abreMover(b: Booking) {
    const d = new Date(b.starts_at);
    const dosCifras = (n: number) => String(n).padStart(2, '0');
    setNuevoDia(`${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`);
    setNuevaHora(`${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`);
    setMover(b);
  }

  async function guardarNuevaHora() {
    if (!mover || !nuevoDia || !nuevaHora) return;
    setMoviendo(true);
    // Se manda la hora tal y como la ha escrito quien la teclea, en su huso: si
    // se convirtiera a UTC aquí, una cita de las 10 podría acabar a las 8.
    const startsAt = new Date(`${nuevoDia}T${nuevaHora}:00`).toISOString();
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${mover.id}/reprogramar`, { startsAt });
    setMoviendo(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido cambiar la hora.' }); return; }
    const quien = mover.buyer_name || 'El cliente';
    setMover(null);
    setResultado(
      r.data?.avisado
        ? { mal: false, texto: `Visita movida y confirmada. ${quien} ya lo sabe: le hemos escrito con la hora nueva y el calendario.` }
        : { mal: true, texto: `Movida, pero no hemos podido avisar a ${quien}. Llámale antes de que se presente a la hora vieja.` }
    );
    load();
  }

  async function confirmar(b: Booking) {
    setConfirmando(b.id);
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${b.id}/confirm`, {});
    setConfirmando(null);
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido confirmar la visita.' }); return; }
    setResultado(
      r.data?.avisado
        ? { mal: false, texto: `Visita confirmada. ${b.buyer_name || 'El cliente'} ya lo sabe: le hemos escrito con el calendario.` }
        : { mal: true, texto: `Confirmada, pero no hemos podido avisar a ${b.buyer_name || 'el cliente'}. Llámale al ${b.buyer_phone || 'teléfono que tengas'}.` }
    );
    load();
  }

  useEffect(() => { load(); }, [load]);

  async function confirmarCancelacion() {
    if (!cancelar) return;
    const b = cancelar;
    setCancelling(b.id);
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${b.id}/cancel`, { motivo });
    setCancelling(null);
    setCancelar(null);
    setMotivo('');
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido cancelar la visita.' }); return; }
    // Recargar y no filtrar a mano: la cancelada puede estar en las confirmadas
    // o en las pendientes, y quitarla de una sola dejaba la otra lista mintiendo.
    load();
    // Que el aviso saliera o no cambia lo que hay que hacer después, así que se
    // dice; no se da por hecho que el cliente está enterado.
    setResultado(
      r.data?.avisado
        ? { mal: false, texto: `Visita cancelada. ${b.buyer_name || 'El cliente'} ya lo sabe: le hemos escrito.` }
        : { mal: true, texto: `Visita cancelada, pero no hemos podido avisar a ${b.buyer_name || 'el cliente'}. Llámale al ${b.buyer_phone || 'teléfono que tengas'}.` }
    );
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

      {resultado && (
        <div className={
          'flex items-start gap-2.5 rounded-lg border px-4 py-2.5 text-[13px] ' +
          (resultado.mal
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800')
        } role={resultado.mal ? 'alert' : undefined}>
          <span className="flex-1">{resultado.texto}</span>
          <button onClick={() => setResultado(null)} className="font-bold shrink-0" aria-label="Cerrar">✕</button>
        </div>
      )}

      {/* Las pendientes van arriba y no dentro del listado: son trabajo por
          hacer, y una lista donde se mezclan con las cerradas no se despacha. */}
      {pendientes.length > 0 && (
        <div className="rounded-xl border border-acento bg-acento-tenue overflow-hidden">
          <div className="px-4 py-3 border-b border-acento/50">
            <h2 className="text-sm font-bold text-acento-texto">
              {pendientes.length === 1 ? 'Una visita por confirmar' : `${pendientes.length} visitas por confirmar`}
            </h2>
            <p className="text-[12.5px] text-acento-texto/85 mt-0.5 max-w-3xl">
              Cayeron en un horario que generó el sistema, no lo publicó nadie. El cliente sabe que
              está pendiente y no ha recibido calendario. Al confirmar se le escribe.
            </p>
          </div>
          <ul className="divide-y divide-acento/40">
            {pendientes.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="shrink-0 text-center w-16">
                  <div className="text-lg font-black text-acento-texto leading-none tabular-nums">{fmtTime(b.starts_at)}</div>
                  <div className="text-[10px] text-acento-texto/70 tabular-nums">{fmtDate(b.starts_at)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-brand-600 text-sm truncate">{b.vehicle_title || b.offer_id}</div>
                  <div className="text-xs text-brand-400">
                    {b.buyer_name || '–'}{b.buyer_phone ? ` · ${b.buyer_phone}` : ''}
                  </div>
                  {b.notes && <div className="text-xs text-brand-300 italic mt-0.5">"{b.notes}"</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Boton tam="sm" variante="acento" cargando={confirmando === b.id} onClick={() => confirmar(b)}>
                    Confirmar
                  </Boton>
                  {/* El caso de «ese día no, pero el jueves sí». Sin esto había
                      que cancelar y esperar a que el cliente volviera a pedir. */}
                  <Boton tam="sm" variante="secundario" onClick={() => abreMover(b)}>
                    Otra hora
                  </Boton>
                  <Boton tam="sm" variante="fantasma" onClick={() => { setCancelar(b); setMotivo(''); }}>
                    No puede ser
                  </Boton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mover && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setMover(null)} role="dialog" aria-modal="true" aria-label="Cambiar la hora de la visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Mover la visita a otra hora</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {mover.buyer_name || mover.buyer_email} · {mover.vehicle_title || mover.offer_id}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-brand-400">
                Ahora es el <b className="text-brand-600">{fmtDate(mover.starts_at)} a las {fmtTime(mover.starts_at)}</b>.
                Pon la hora que te haya dado el concesionario.
              </p>
              <div className="flex gap-3">
                <label className="flex-1 text-xs font-medium text-brand-500">
                  Día
                  <input type="date" value={nuevoDia} onChange={(e) => setNuevoDia(e.target.value)}
                         className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                </label>
                <label className="w-32 text-xs font-medium text-brand-500">
                  Hora
                  <input type="time" value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)}
                         className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                </label>
              </div>
              <p className="text-[12px] text-brand-300">
                La visita queda <b>confirmada</b> en la hora nueva: quien tenía que aprobarla es
                quien la ha propuesto. Al cliente se le escribe con las dos horas, el calendario
                y un enlace por si no le viene bien.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setMover(null)}>Volver</Boton>
              <Boton variante="acento" cargando={moviendo} onClick={guardarNuevaHora}>
                Mover y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {cancelar && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setCancelar(null)} role="dialog" aria-modal="true" aria-label="Cancelar visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Cancelar la visita</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {cancelar.buyer_name || cancelar.buyer_email} · {cancelar.vehicle_title || cancelar.offer_id}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-brand-500" htmlFor="motivo-cancelacion">
                Motivo (se le cuenta al cliente)
              </label>
              <textarea
                id="motivo-cancelacion"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="El coche ya no está disponible, el taller cierra ese día…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
              />
              <p className="text-[12px] text-brand-300">
                Se le manda un correo avisándole, con un enlace para pedir otra hora. Si lo dejas
                vacío se le avisa igual, solo que sin explicación.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setCancelar(null)}>Volver</Boton>
              <Boton variante="peligro" cargando={cancelling === cancelar.id} onClick={confirmarCancelacion}>
                Cancelar y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Hoy', value: todayCount, color: 'text-acento-texto', bg: 'bg-acento-tenue', border: 'border-acento-tenue' },
          { label: 'Esta semana', value: weekCount, color: 'text-brand-500', bg: 'bg-brand-50', border: 'border-brand-100' },
          { label: range === 'all' ? 'Total' : 'Período', value: bookings.length, color: 'text-brand-500', bg: 'bg-brand-50', border: 'border-brand-100' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs font-semibold text-brand-300 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-brand-100 rounded-lg p-1 gap-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${range === r ? 'bg-white shadow-sm text-brand-600' : 'text-brand-400 hover:text-brand-500'}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar comprador, vehículo…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-brand-300">
          <div className="text-center">
            <div className="flex justify-center mb-3 animate-pulse"><Icono nombre="calendario" tam={34} /></div>
            <div className="text-sm">Cargando agenda…</div>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="flex justify-center mb-4 text-brand-200"><Icono nombre="bandeja" tam={42} /></div>
            <div className="font-semibold text-brand-400">Sin citas en este período</div>
            <div className="text-sm text-brand-300 mt-1">Prueba con un rango de fechas más amplio</div>
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
                    isToday(day) ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-400'
                  }`}
                >
                  {isToday(day) ? '● HOY' : fmtDate(day + 'T12:00:00')}
                </div>
                <div className="text-xs text-brand-300 font-medium">
                  {grouped[day].length} cita{grouped[day].length !== 1 ? 's' : ''}
                </div>
                <div className="flex-1 h-px bg-brand-100" />
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {grouped[day].map((b) => {
                  const isExpanded = expandedId === b.id;
                  const isProf = isProfessional(b);

                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    >
                      {/* Left accent bar */}
                      <div className="flex">
                        <div className={`w-1 shrink-0 ${isProf ? 'bg-acento-tenue0' : 'bg-brand-300'}`} />
                        <div className="flex-1">
                          {/* Main row */}
                          <div className="flex items-center gap-4 px-4 py-3">
                            {/* Time block */}
                            <div className="shrink-0 text-center w-16">
                              <div className="text-xl font-black text-brand-600 leading-none tabular-nums">
                                {fmtTime(b.starts_at)}
                              </div>
                              <div className="text-[10px] text-brand-300 mt-0.5 tabular-nums">
                                {fmtTime(b.ends_at)}
                              </div>
                            </div>

                            <div className="w-px h-10 bg-brand-100 shrink-0" />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-brand-600 text-sm truncate">
                                {b.vehicle_title || b.offer_id}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs font-semibold text-brand-500">{b.buyer_name || '–'}</span>
                                {b.buyer_phone && (
                                  <span className="text-xs text-brand-300">· {b.buyer_phone}</span>
                                )}
                                {/* Si nadie publicó horarios para esa oferta, el sistema se los
                                    inventa —L a V de 9 a 18— y el cliente reserva sobre una hora
                                    que nadie ha confirmado. Mejor verlo aquí que en la puerta. */}
                                {b.slot_source === 'auto' && (
                                  <span title="Hueco generado automáticamente: nadie confirmó ese horario"
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                    horario sin confirmar
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Type badge */}
                            <div className="shrink-0 flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                isProf ? 'bg-acento-tenue text-acento-texto' : 'bg-brand-100 text-brand-400'
                              }`}>
                                {isProf ? 'PopCar' : 'Particular'}
                              </span>
                              <span className="text-brand-300 text-xs">{isExpanded ? '▾' : '▸'}</span>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-brand-50 bg-brand-50 px-5 py-4">
                              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs mb-4">
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Email</div>
                                  <div className="text-brand-500 font-medium">{b.buyer_email}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Teléfono</div>
                                  <div className="text-brand-500 font-medium">{b.buyer_phone || '–'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">ID Oferta</div>
                                  <div className="font-mono text-brand-300 text-[10px]">{b.offer_id}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Reservado</div>
                                  <div className="text-brand-400">{new Date(b.created_at).toLocaleDateString('es-ES')}</div>
                                </div>
                                {b.notes && (
                                  <div className="col-span-2">
                                    <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Notas</div>
                                    <div className="text-brand-400 italic">"{b.notes}"</div>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCancelar(b); setMotivo(''); }}
                                  disabled={cancelling === b.id}
                                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                  {cancelling === b.id ? 'Cancelando…' : '✕ Cancelar cita'}
                                </button>
                                {/* Una confirmada también se mueve: el concesionario
                                    puede cambiar de día después de haber dicho que sí. */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); abreMover(b); }}
                                  className="px-3 py-1.5 text-xs font-bold text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                                >
                                  Otra hora
                                </button>
                                <a
                                  href={`mailto:${b.buyer_email}?subject=Tu visita al ${b.vehicle_title || 'vehículo'}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-1.5 text-xs font-bold text-acento-texto bg-acento-tenue border border-acento rounded-lg hover:bg-acento-tenue transition-colors"
                                >
                                  Contactar
                                </a>
                                {b.buyer_phone && (
                                  <a
                                    href={`tel:${b.buyer_phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                  >
                                    Llamar
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
