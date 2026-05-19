import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { Ticket } from '../types/index.js';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [status, setStatus]   = useState('');
  const [priority, setPriority] = useState('');
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ user_id: '', title: '', description: '', channel: 'web', priority: 'medium' });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q)        params.set('q', q);
    if (status)   params.set('status', status);
    if (priority) params.set('priority', priority);
    const res = await api.get<Ticket[]>(`/tickets?${params}`);
    if (res.ok) { setTickets(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [q, status, priority, page]);

  useEffect(() => { setPage(1); }, [q, status, priority]);
  useEffect(() => { load(page); }, [page, load]);

  async function createTicket() {
    if (!form.user_id || !form.title || !form.description) {
      setFormError('Completa todos los campos obligatorios');
      return;
    }
    setCreating(true);
    setFormError('');
    const res = await api.post('/tickets', form);
    setCreating(false);
    if (res.ok) { setShowCreate(false); setForm({ user_id: '', title: '', description: '', channel: 'web', priority: 'medium' }); load(1); }
    else setFormError('Error al crear el ticket');
  }

  return (
    <div>
      <PageHeader
        title="Tickets de soporte"
        subtitle={`${total.toLocaleString('es-ES')} tickets`}
        actions={
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            + Nuevo ticket
          </button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar título, usuario…" className="w-72" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {['open','in_progress','waiting_customer','resolved','closed'].map((s) => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las prioridades</option>
          {['urgent','high','medium','low'].map((p) => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Sin tickets</div>
        ) : (
          <>
            <div className="overflow-x-auto"><table className="erp-table">
              <thead>
                <tr><th>Ticket</th><th>Usuario</th><th>Canal</th><th>Prioridad</th><th>Estado</th><th>Fecha</th><th></th></tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                        {t.title}
                      </Link>
                      {t.assigned_to && <p className="text-xs text-slate-400 mt-0.5">→ {t.assigned_to}</p>}
                    </td>
                    <td>
                      <p className="text-sm text-slate-700">{t.user_name || t.user_id}</p>
                      {t.user_email && <p className="text-xs text-slate-400">{t.user_email}</p>}
                    </td>
                    <td className="text-sm text-slate-500 capitalize">{t.channel}</td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="text-xs text-slate-400">{fmtDate(t.created_at)}</td>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination page={page} total={total} limit={50} onChange={setPage} />
          </>
        )}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo ticket">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ID de usuario *</label>
            <input value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="UUID o email del usuario"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Título *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción *</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['web','phone','email','whatsapp'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['low','medium','high','urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {formError && <p className="text-red-600 text-xs">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={createTicket} disabled={creating}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {creating ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
