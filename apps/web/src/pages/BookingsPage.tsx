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

interface Paso {
  evento: string;
  actor: string;
  datos: Record<string, unknown> | null;
  created_at: string;
}

/** Cómo se lee cada paso del rastro. La misma lista que en `lib/citas.js`. */
const PASO: Record<string, string> = {
  solicitada:               'El cliente pidió la visita',
  concesionario_contactado: 'Hablado con el concesionario',
  horas_propuestas:         'El concesionario propone otras horas',
  whatsapp_enviado:         'Mandado al cliente por WhatsApp',
  cliente_respondio:        'El cliente eligió una hora',
  nota:                     'Nota',
  confirmada:               'Cita confirmada',
  movida:                   'Cita movida a otra hora',
  cancelada:                'Cita cancelada',
  concesionario_avisado:    'Avisado el concesionario de que el cliente va',
};
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

/**
 * La ficha del coche en el marketplace VO.
 *
 * Vale para todas, también para las de IDCar: viven en la misma tabla de ofertas
 * y tienen su ficha igual. Lo que no tienen las que no vienen de un portal es un
 * anuncio propio en internet, y por eso el enlace va siempre a la ficha nuestra
 * y no a la del portal de origen.
 */
function enlaceOferta(offerId: string): string {
  if (!offerId) return '';
  return `https://www.popcar.tech/marketplace-vo/${encodeURIComponent(offerId)}`;
}

function isToday(d: string) { return d === todayIso(); }
function isProfessional(b: Booking) { return !b.offer_id?.startsWith('idcar-'); }

/**
 * Los pasos que ha dado una visita, en orden.
 *
 * El estado dice dónde está; esto dice cómo ha llegado. Sirve para lo de todos
 * los días: saber si ya se llamó al concesionario sin tener que preguntar a
 * quien lo hizo.
 */
function Rastro({ pasos }: { pasos: Paso[] }) {
  if (!pasos.length) {
    return <p className="text-[12.5px] text-brand-300">Todavía no hay ningún paso apuntado.</p>;
  }
  return (
    <ol className="space-y-2">
      {pasos.map((p, i) => {
        const d = (p.datos ?? {}) as Record<string, unknown>;
        const horas = Array.isArray(d.horas) ? (d.horas as string[]) : null;
        return (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="text-brand-300 tabular-nums shrink-0 w-28">
              {new Date(p.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="flex-1">
              <span className="text-brand-600 font-medium">{PASO[p.evento] ?? p.evento}</span>
              <span className="text-brand-300"> · {p.actor}</span>
              {typeof d.motivo === 'string' && d.motivo && (
                <span className="block text-brand-400 italic">«{d.motivo}»</span>
              )}
              {typeof d.nota === 'string' && d.nota && (
                <span className="block text-brand-500 whitespace-pre-wrap mt-0.5">{d.nota}</span>
              )}
              {typeof d.donde === 'string' && d.donde && (
                <span className="block text-brand-400">{d.donde}</span>
              )}
              {horas && (
                <span className="block text-brand-400">
                  {horas.map((h) => `${fmtDate(h)} ${fmtTime(h)}`).join(' · ')}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const [confirmar, setConfirmar] = useState<Booking | null>(null);
  const [donde, setDonde] = useState('');
  const [preguntarPor, setPreguntarPor] = useState('');
  const [proponer, setProponer] = useState<Booking | null>(null);
  const [horas, setHoras] = useState<{ dia: string; hora: string }[]>([{ dia: '', hora: '' }]);
  const [proponiendo, setProponiendo] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; enviado: boolean; motivo?: string; telefono: string } | null>(null);
  const [rastroDe, setRastroDe] = useState<string | null>(null);
  const [rastro, setRastro] = useState<Paso[]>([]);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [mover, setMover] = useState<Booking | null>(null);
  const [nuevoDia, setNuevoDia] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [moviendo, setMoviendo] = useState(false);
  const [laEligio, setLaEligio] = useState(false);

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

  /** De un día y una hora sueltos a la fecha que espera la API. */
  const aFecha = (dia: string, hora: string) => (dia && hora ? new Date(`${dia}T${hora}:00`).toISOString() : '');

  async function mandarPropuesta() {
    if (!proponer) return;
    const fechas = horas.map((h) => aFecha(h.dia, h.hora)).filter(Boolean);
    if (!fechas.length) { setResultado({ mal: true, texto: 'Pon al menos una hora.' }); return; }
    setProponiendo(true);
    const r = await api.post<{ texto: string; enviado: boolean; motivo?: string; telefono: string }>(
      `/visit-bookings/${proponer.id}/proponer`, { horas: fechas }
    );
    setProponiendo(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido guardar la propuesta.' }); return; }
    // El diálogo no se cierra: ahora enseña el mensaje, que es lo que hay que
    // mandar o comprobar. Cerrarlo y dejarlo en un aviso lo haría desaparecer.
    setMensaje({ ...r.data!, telefono: r.data?.telefono || proponer.buyer_phone || '' });
    load();
  }

  /**
   * Trae los pasos y los enseña. Siempre: no alterna.
   *
   * Estaba metido dentro de `verRastro`, que alterna, y refrescar después de
   * guardar una nota cerraba el panel en vez de recargarlo —React no había
   * aplicado todavía el `setRastroDe(null)` de la línea anterior, así que veía
   * el panel como abierto y lo cerraba—. La nota se guardaba bien; lo que no se
   * veía era el resultado, que es la mitad de lo que hace falta.
   */
  async function cargaRastro(b: Booking) {
    setRastroDe(b.id);
    setRastro([]);
    const r = await api.get<{ pasos: Paso[] }>(`/visit-bookings/${b.id}/pasos`);
    if (r.ok) setRastro((r as unknown as { pasos: Paso[] }).pasos || r.data?.pasos || []);
  }

  /** Abre o cierra el rastro, según esté. */
  async function verRastro(b: Booking) {
    if (rastroDe === b.id) { setRastroDe(null); return; }
    await cargaRastro(b);
  }

  /**
   * Escribir una nota sobre la cita.
   *
   * Va al rastro como un paso más, con quién la escribió y cuándo. No es un
   * campo que se edita: dos personas llevando la misma cita se pisarían el
   * texto, y lo que se apunta de una gestión no se corrige, se añade.
   */
  const NotaNueva = ({ b }: { b: Booking }) => (
    <div className="mt-3 pt-3 border-t border-brand-100">
      <label className="block text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-1.5">
        Añadir una nota
      </label>
      <div className="flex gap-2 items-start">
        <textarea
          value={notaNueva}
          onChange={(e) => setNotaNueva(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Lo que haya que saber: qué dijo el concesionario, si el cliente llamó…"
          className="flex-1 px-3 py-2 text-[13px] border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
        />
        <Boton tam="sm" variante="secundario" cargando={guardandoNota}
               onClick={() => guardaNota(b)}>
          Guardar
        </Boton>
      </div>
    </div>
  );

  async function guardaNota(b: Booking) {
    const texto = notaNueva.trim();
    if (!texto) return;
    setGuardandoNota(true);
    const r = await api.post(`/visit-bookings/${b.id}/paso`, { evento: 'nota', nota: texto });
    setGuardandoNota(false);
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido guardar la nota.' }); return; }
    setNotaNueva('');
    setRastroDe(null);
    await verRastro(b);
  }

  async function apuntaPaso(b: Booking, evento: string, texto: string) {
    const r = await api.post(`/visit-bookings/${b.id}/paso`, { evento });
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido apuntar.' }); return; }
    setResultado({ mal: false, texto });
    if (rastroDe === b.id) await cargaRastro(b);
  }

  /** Abre el diálogo ya con el día y la hora que tenía: casi siempre cambia uno de los dos. */
  function abreMover(b: Booking) {
    const d = new Date(b.starts_at);
    const dosCifras = (n: number) => String(n).padStart(2, '0');
    setNuevoDia(`${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`);
    setNuevaHora(`${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`);
    setLaEligio(false);
    setMover(b);
  }

  async function guardarNuevaHora() {
    if (!mover || !nuevoDia || !nuevaHora) return;
    setMoviendo(true);
    // Se manda la hora tal y como la ha escrito quien la teclea, en su huso: si
    // se convirtiera a UTC aquí, una cita de las 10 podría acabar a las 8.
    const startsAt = new Date(`${nuevoDia}T${nuevaHora}:00`).toISOString();
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${mover.id}/reprogramar`, { startsAt, laEligioElCliente: laEligio });
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

  async function confirmarVisita(b: Booking) {
    setConfirmando(b.id);
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${b.id}/confirm`, {
      donde: donde.trim(),
      preguntarPor: preguntarPor.trim(),
    });
    setConfirmando(null);
    setConfirmar(null);
    setDonde('');
    setPreguntarPor('');
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
                {/* Los tres finales de la llamada al concesionario: que sí, que
                    no a esa hora pero sí a otras, o que ya no hay coche. */}
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {/* Abre el diálogo en vez de confirmar de golpe: al cliente
                      hay que decirle dónde va y por quién preguntar, y quien
                      acaba de hablar con el concesionario lo tiene delante. */}
                  <Boton tam="sm" variante="acento"
                         onClick={() => { setConfirmar(b); setDonde(''); setPreguntarPor(''); }}>
                    Puede
                  </Boton>
                  <Boton tam="sm" variante="secundario"
                         onClick={() => { setProponer(b); setHoras([{ dia: '', hora: '' }]); setMensaje(null); }}>
                    Propone otras horas
                  </Boton>
                  <Boton tam="sm" variante="fantasma" onClick={() => { setCancelar(b); setMotivo(''); }}>
                    No puede ser
                  </Boton>
                  <button onClick={() => verRastro(b)}
                          className="px-2 py-1 text-[11px] font-bold text-brand-400 underline underline-offset-2">
                    {rastroDe === b.id ? 'Ocultar' : 'Ver'} rastro
                  </button>
                </div>

                {rastroDe === b.id && (
                  <div className="w-full mt-1 rounded-lg border border-brand-200 bg-white px-4 py-3">
                    <Rastro pasos={rastro} />
                    <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-brand-100">
                      {/* Lo que hace una persona por teléfono no cambia nada en
                          la base: si no se apunta, no existe para nadie más. */}
                      <Boton tam="sm" variante="secundario"
                             onClick={() => apuntaPaso(b, 'concesionario_contactado', 'Apuntado que has hablado con el concesionario.')}>
                        He llamado al concesionario
                      </Boton>
                      <Boton tam="sm" variante="secundario"
                             onClick={() => apuntaPaso(b, 'concesionario_avisado', 'Apuntado que el concesionario ya sabe que el cliente va.')}>
                        Le he dicho que el cliente va
                      </Boton>
                    </div>
                    <NotaNueva b={b} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setConfirmar(null)} role="dialog" aria-modal="true" aria-label="Confirmar la visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Confirmar la visita</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {confirmar.buyer_name || confirmar.buyer_email} · {fmtDate(confirmar.starts_at)} a las {fmtTime(confirmar.starts_at)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-brand-400">
                Estos dos datos van en el correo del cliente y en sus recordatorios.
                Los tienes de la llamada al concesionario.
              </p>
              <label className="block text-xs font-medium text-brand-500">
                Dónde es
                <input value={donde} onChange={(e) => setDonde(e.target.value)} maxLength={200}
                       placeholder="Calle y número, o el nombre del concesionario"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <label className="block text-xs font-medium text-brand-500">
                Por quién preguntar
                <input value={preguntarPor} onChange={(e) => setPreguntarPor(e.target.value)} maxLength={120}
                       placeholder="Nombre de quien le atiende"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <p className="text-[12px] text-brand-300">
                Si los dejas vacíos la cita se confirma igual, y al cliente se le dice que le
                confirmaremos la dirección antes de la visita.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setConfirmar(null)}>Volver</Boton>
              <Boton variante="acento" cargando={confirmando === confirmar.id} onClick={() => confirmar && confirmarVisita(confirmar)}>
                Confirmar y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {proponer && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4 py-8 overflow-y-auto"
             onClick={() => { setProponer(null); setMensaje(null); }} role="dialog" aria-modal="true"
             aria-label="Horas que propone el concesionario">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-brand-200 shadow-2xl my-auto"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Horas que propone el concesionario</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {proponer.buyer_name || proponer.buyer_email} · {proponer.vehicle_title || proponer.offer_id}
              </p>
            </div>

            {!mensaje ? (
              <>
                <div className="px-6 py-5 space-y-3">
                  <p className="text-[13px] text-brand-400">
                    Pon las que te haya dado. Se las mandamos al cliente para que elija, y la cita
                    sigue pendiente hasta que conteste.
                  </p>
                  {horas.map((h, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <label className="flex-1 text-xs font-medium text-brand-500">
                        Día
                        <input type="date" value={h.dia}
                               onChange={(e) => setHoras(horas.map((x, j) => j === i ? { ...x, dia: e.target.value } : x))}
                               className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                      </label>
                      <label className="w-28 text-xs font-medium text-brand-500">
                        Hora
                        <input type="time" value={h.hora}
                               onChange={(e) => setHoras(horas.map((x, j) => j === i ? { ...x, hora: e.target.value } : x))}
                               className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                      </label>
                      {horas.length > 1 && (
                        <button onClick={() => setHoras(horas.filter((_, j) => j !== i))}
                                className="px-2 py-2 text-brand-300 hover:text-red-600" aria-label="Quitar esta hora">✕</button>
                      )}
                    </div>
                  ))}
                  {horas.length < 6 && (
                    <button onClick={() => setHoras([...horas, { dia: '', hora: '' }])}
                            className="text-[13px] font-medium text-acento-texto underline underline-offset-2">
                      Añadir otra hora
                    </button>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
                  <Boton variante="fantasma" onClick={() => setProponer(null)}>Volver</Boton>
                  <Boton variante="acento" cargando={proponiendo} onClick={mandarPropuesta}>
                    Preparar mensaje
                  </Boton>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-5 space-y-3">
                  {mensaje.enviado ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
                      Mandado por WhatsApp al {mensaje.telefono}. Esto es lo que se le ha dicho:
                    </div>
                  ) : (
                    <div className="rounded-lg border border-acento bg-acento-tenue px-4 py-2.5 text-[13px] text-acento-texto">
                      No ha salido solo{mensaje.motivo ? ` — ${mensaje.motivo}` : ''}. Copia el mensaje y
                      mándaselo tú al <b>{mensaje.telefono || 'teléfono que tengas'}</b>. El paso ya está apuntado.
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-600 font-sans">
                    {mensaje.texto}
                  </pre>
                </div>
                <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
                  <Boton variante="secundario"
                         onClick={() => { navigator.clipboard?.writeText(mensaje.texto); setResultado({ mal: false, texto: 'Mensaje copiado.' }); }}>
                    Copiar mensaje
                  </Boton>
                  <Boton variante="acento" onClick={() => { setProponer(null); setMensaje(null); }}>Hecho</Boton>
                </div>
              </>
            )}
          </div>
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
              {/* No es lo mismo moverla nosotros que aplicar la que ha elegido
                  él: cambia el rastro y cambia lo que se le escribe. */}
              <label className="flex items-start gap-2.5 text-[13px] text-brand-500 cursor-pointer">
                <input type="checkbox" checked={laEligio} onChange={(e) => setLaEligio(e.target.checked)}
                       className="mt-0.5 accent-[var(--acento,#FFC400)]" />
                <span>
                  Esta hora <b>la ha elegido el cliente</b>, contestando a las que le propusimos
                </span>
              </label>

              <p className="text-[12px] text-brand-300">
                {laEligio
                  ? 'Se apunta que contestó y la cita queda confirmada. Se le escribe confirmándosela, no diciéndole que se la hemos movido.'
                  : 'La visita queda confirmada en la hora nueva: quien tenía que aprobarla es quien la ha propuesto. Al cliente se le escribe con las dos horas, el calendario y un enlace por si no le viene bien.'}
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
                                {/* Solo mientras está pendiente.
                                    La marca dice que ese hueco lo generó el sistema —L a V de 9 a
                                    18— y que nadie había acordado esa hora. En cuanto alguien llama
                                    al concesionario y la confirma, deja de ser verdad: la hora ya
                                    está acordada, y seguir avisando de lo contrario confunde. */}
                                {b.slot_source === 'auto' && b.status === 'pending' && (
                                  <span title="Este hueco lo generó el sistema; nadie ha acordado aún esa hora"
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                    hora propuesta por el sistema
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
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Oferta</div>
                                  {/* Enlace al anuncio de verdad: quien va a llamar al
                                      concesionario necesita ver el coche, y copiar un
                                      identificador a mano se hace mal. */}
                                  {enlaceOferta(b.offer_id) ? (
                                    <a href={enlaceOferta(b.offer_id)} target="_blank" rel="noreferrer"
                                       onClick={(e) => e.stopPropagation()}
                                       className="font-mono text-acento-texto text-[10px] underline underline-offset-2 break-all">
                                      {b.offer_id} ↗
                                    </a>
                                  ) : (
                                    <div className="font-mono text-brand-300 text-[10px] break-all">{b.offer_id}</div>
                                  )}
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
                                {/* También en las confirmadas: lo que pasa después
                                    de confirmar —que el cliente llame, que cambie
                                    algo— hay que poder apuntarlo igual. */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); verRastro(b); }}
                                  className="px-3 py-1.5 text-xs font-bold text-brand-400 underline underline-offset-2"
                                >
                                  {rastroDe === b.id ? 'Ocultar' : 'Ver'} rastro y notas
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

                              {rastroDe === b.id && (
                                <div className="mt-3 rounded-lg border border-brand-200 bg-white px-4 py-3">
                                  <Rastro pasos={rastro} />
                                  <NotaNueva b={b} />
                                </div>
                              )}
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
