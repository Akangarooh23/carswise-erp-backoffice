import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { StatusBadge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { Appointment, AppointmentStatus } from '../types/index.js';

function fmtDateTime(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
}

const TYPE_LABELS: Record<string, string> = {
  oil_change: 'Cambio de aceite', brakes: 'Frenos', tires: 'Neumáticos',
  inspection: 'Inspección', itv: 'ITV', general: 'General', other: 'Otro',
};

const STATUS_OPTIONS: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

export default function AppointmentsPage() {
  const [items, setItems]     = useState<Appointment[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [status, setStatus]   = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [newStatus, setNewStatus] = useState<AppointmentStatus>('scheduled');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q)      params.set('q', q);
    if (status) params.set('status', status);
    const res = await api.get<Appointment[]>(`/appointments?${params}`);
    if (res.ok) { setItems(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [q, status, page]);

  useEffect(() => { setPage(1); }, [q, status]);
  useEffect(() => { load(page); }, [page, load]);

  function openDetail(a: Appointment) {
    setSelected(a);
    setNewStatus(a.status);
    setNotes(a.notes ?? '');
  }

  async function saveUpdate() {
    if (!selected) return;
    setSaving(true);
    await api.patch(`/appointments/${selected.id}`, { status: newStatus, notes });
    setSaving(false);
    setSelected(null);
    load(page);
  }

  return (
    <div>
      <PageHeader title="Citas Mantenimiento" subtitle={`${total.toLocaleString('es-ES')} citas de mantenimiento`} />

      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar usuario, taller…" className="w-72" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" onChange={(e) => setStatus(e.target.checked ? 'scheduled' : '')} />
          Solo próximas
        </label>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Sin citas</div>
        ) : (
          <>
            <div className="overflow-x-auto"><table className="erp-table">
              <thead>
                <tr><th>Usuario</th><th>Tipo</th><th>Taller</th><th>Fecha</th><th>Agente</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm font-medium text-slate-700">{a.user_id}</td>
                    <td className="text-sm text-slate-500">{TYPE_LABELS[a.type] ?? a.type}</td>
                    <td className="text-sm text-slate-500">{a.workshop_name || a.workshop_name_resolved || '–'}</td>
                    <td className="text-sm text-slate-500">{fmtDateTime(a.scheduled_at)}</td>
                    <td className="text-sm text-slate-500">{a.agent || '–'}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      <button onClick={() => openDetail(a)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination page={page} total={total} limit={50} onChange={setPage} />
          </>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Gestionar cita">
        {selected && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-700">{TYPE_LABELS[selected.type]}</p>
              <p className="text-slate-500 mt-1">{fmtDateTime(selected.scheduled_at)} · {selected.workshop_name || '–'}</p>
              <p className="text-slate-400 text-xs mt-1">Usuario: {selected.user_id}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Estado</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button key={s} onClick={() => setNewStatus(s)}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      newStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}>
                    {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notas internas</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveUpdate} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
