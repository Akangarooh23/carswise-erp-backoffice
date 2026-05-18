import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';

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
  appointment_type: 'info' | 'visit' | 'question';
  title: string;
  meta: LeadMeta;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  pending: number;
  contacted: number;
  discarded: number;
  type_info: number;
  type_visit: number;
  type_question: number;
  new_7d: number;
}

const TYPE_LABELS: Record<string, string> = {
  info:     'Solicitar info',
  visit:    'Agendar visita',
  question: 'Preguntar',
};

const TYPE_COLORS: Record<string, string> = {
  info:     'bg-blue-100 text-blue-700',
  visit:    'bg-emerald-100 text-emerald-700',
  question: 'bg-violet-100 text-violet-700',
};

const STATUS_COLORS: Record<string, string> = {
  Pendiente:              'bg-amber-100 text-amber-700',
  Contactado:             'bg-blue-100 text-blue-700',
  'En proceso':           'bg-violet-100 text-violet-700',
  Cerrado:                'bg-green-100 text-green-700',
  Descartado:             'bg-slate-100 text-slate-500',
  'Reagendar solicitado': 'bg-orange-100 text-orange-700',
  Cancelado:              'bg-red-100 text-red-700',
};

const STATUSES = ['Pendiente', 'Contactado', 'En proceso', 'Cerrado', 'Descartado', 'Reagendar solicitado', 'Cancelado'];

const WHEN_LABELS: Record<string, string> = {
  thisweek: 'Esta semana',
  nextweek: 'La próxima semana',
  them:     'Ellos indican',
};

export default function LeadsPage() {
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [editStatus, setEditStatus]                   = useState('');
  const [editNotes, setEditNotes]                     = useState('');
  const [editResponse, setEditResponse]               = useState('');
  const [editApptDate, setEditApptDate]               = useState('');
  const [editApptTime, setEditApptTime]               = useState('');
  const [editApptAddress, setEditApptAddress]         = useState('');
  const [editApptContact, setEditApptContact]         = useState('');
  const [saving, setSaving]                           = useState(false);
  const [notifying, setNotifying]                     = useState(false);

  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q)            params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType)   params.set('type', filterType);

    const [res, statsRes] = await Promise.all([
      api.get<{ data: Lead[]; meta: { total: number } }>(`/leads?${params}`),
      api.get<{ data: Stats }>('/leads/stats'),
    ]);

    if (res.ok && res.data) { setLeads(res.data as unknown as Lead[]); setTotal((res as unknown as { meta: { total: number } }).meta?.total ?? 0); }
    if (statsRes.ok && statsRes.data) setStats(statsRes.data as unknown as Stats);
    setLoading(false);
  }, [page, q, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  function openLead(lead: Lead) {
    setSelected(lead);
    setEditStatus(lead.status);
    setEditNotes(lead.meta?.erp_notes ?? '');
    setEditResponse(lead.meta?.erp_response ?? '');
    setEditApptDate(lead.meta?.appointment_date ?? '');
    setEditApptTime(lead.meta?.appointment_time ?? '');
    setEditApptAddress(lead.meta?.appointment_address ?? '');
    setEditApptContact(lead.meta?.appointment_contact ?? '');
  }

  async function saveLead() {
    if (!selected) return;
    setSaving(true);
    const res = await api.patch(`/leads/${selected.id}`, {
      status: editStatus,
      notes: editNotes,
      erp_response: editResponse,
      appointment_date: editApptDate || null,
      appointment_time: editApptTime,
      appointment_address: editApptAddress,
      appointment_contact: editApptContact,
    });
    if (res.ok) { await load(); setSelected(null); }
    setSaving(false);
  }

  async function notifyClient() {
    if (!selected) return;
    setNotifying(true);
    await api.patch(`/leads/${selected.id}`, {
      status: editStatus,
      notes: editNotes,
      erp_response: editResponse,
      appointment_date: editApptDate || null,
      appointment_time: editApptTime,
      appointment_address: editApptAddress,
      appointment_contact: editApptContact,
    });
    const res = await api.post(`/leads/${selected.id}/notify`, {});
    if (res.ok) { await load(); setSelected(null); }
    else alert('Error al enviar la notificación. Revisa la consola del servidor.');
    setNotifying(false);
  }

  return (
    <div className="fade-in">
      <PageHeader title="Leads / Solicitudes" subtitle="Peticiones de información recibidas desde la web" />

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'bg-slate-50 border-slate-200' },
            { label: 'Pendientes', value: stats.pending, color: 'bg-amber-50 border-amber-200' },
            { label: 'Esta semana', value: stats.new_7d, color: 'bg-blue-50 border-blue-200' },
            { label: 'Contactados', value: stats.contacted, color: 'bg-green-50 border-green-200' },
          ].map((s) => (
            <div key={s.label} className={`${s.color} border rounded-xl p-4`}>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por email, vehículo…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos los tipos</option>
          <option value="info">Solicitar info</option>
          <option value="visit">Agendar visita</option>
          <option value="question">Preguntar</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Cargando…</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No hay solicitudes todavía.</div>
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Contacto</th>
                <th>Vehículo</th>
                <th>Cuándo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openLead(lead)}>
                  <td className="text-slate-500 text-xs whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > limit && (
        <div className="mt-4">
          <Pagination page={page} limit={limit} total={total} onChange={setPage} />
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <Modal open={true} title={`Lead: ${selected.meta?.name ?? selected.user_email}`} onClose={() => setSelected(null)} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400 text-xs block">Tipo</span><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${TYPE_COLORS[selected.appointment_type]}`}>{TYPE_LABELS[selected.appointment_type]}</span></div>
              <div><span className="text-slate-400 text-xs block">Cuándo</span><span className="font-medium">{WHEN_LABELS[selected.meta?.when ?? ''] ?? selected.meta?.when ?? '—'}</span></div>
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

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Cita — solo para visitas */}
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

            {/* Reschedule proposals from client */}
            {selected.status === 'Reagendar solicitado' && selected.meta?.reschedule_proposals?.length ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-700">🔄 El cliente propone estas opciones — haz clic para seleccionar</p>
                <div className="space-y-1">
                  {selected.meta.reschedule_proposals.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => { setEditApptDate(p.date); setEditApptTime(p.time || ''); }}
                      className="w-full text-left text-sm px-3 py-2 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex justify-between items-center"
                    >
                      <span>
                        📅 {p.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : p.date}
                        {p.time && <span className="ml-2">⏰ {p.time}</span>}
                      </span>
                      <span className="text-xs text-orange-600 font-medium">Usar esta →</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Respuesta al cliente</label>
              <textarea
                rows={3}
                value={editResponse}
                onChange={(e) => setEditResponse(e.target.value)}
                placeholder="Mensaje que verá el cliente en su panel y recibirá por email…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas internas</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas privadas (no se envían al cliente)…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 flex-wrap">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveLead} disabled={saving}
                className="px-4 py-2 text-sm border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button onClick={notifyClient} disabled={notifying || saving}
                className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-60 font-medium">
                {notifying ? 'Enviando…' : '📧 Guardar y notificar cliente'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
