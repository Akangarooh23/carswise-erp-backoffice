import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { StatusBadge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import type { User } from '../types/index.js';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_OPTIONS = ['', 'active', 'at_risk', 'blocked'];
const PLAN_OPTIONS   = ['', 'free', 'plus', 'premium'];
const STATUS_LABELS: Record<string, string> = { '': 'Todos los estados', active: 'Activo', at_risk: 'En riesgo', blocked: 'Bloqueado' };
const PLAN_LABELS:   Record<string, string> = { '': 'Todos los planes', free: 'Free', plus: 'Plus', premium: 'Premium' };

export default function UsersPage() {
  const [users, setUsers]     = useState<User[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [status, setStatus]   = useState('');
  const [plan, setPlan]       = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q)      params.set('q', q);
    if (status) params.set('status', status);
    if (plan)   params.set('plan', plan);
    const res = await api.get<User[]>(`/users?${params}`);
    if (res.ok) { setUsers(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [q, status, plan, page]);

  useEffect(() => { setPage(1); }, [q, status, plan]);
  useEffect(() => { load(page); }, [page, load]);

  return (
    <div>
      <PageHeader title="Usuarios" subtitle={`${total.toLocaleString('es-ES')} usuarios registrados`} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, email…" className="w-72" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No se encontraron usuarios</div>
        ) : (
          <>
            <div className="overflow-x-auto"><table className="erp-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Citas</th>
                  <th>Tickets</th>
                  <th>Registro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-medium text-slate-800 text-sm">{u.name || '(sin nombre)'}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td><StatusBadge status={u.status} /></td>
                    <td><StatusBadge status={u.plan_type} /></td>
                    <td className="text-sm text-slate-500">{u.appointment_count ?? 0}</td>
                    <td className="text-sm text-slate-500">{u.ticket_count ?? 0}</td>
                    <td className="text-xs text-slate-400">{fmtDate(u.created_at)}</td>
                    <td>
                      <Link to={`/users/${u.id}`}
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                        Ver →
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
    </div>
  );
}
