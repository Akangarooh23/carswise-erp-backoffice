import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatCard } from '../components/ui/Card.js';
import { StatusBadge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import type { User } from '../types/index.js';

interface BillingSummary {
  free_count: number; plus_count: number; premium_count: number;
  active_trials: number; expired_trials: number; new_paid_30d: number;
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

const TABS = ['subscribers', 'trials'] as const;
type Tab = typeof TABS[number];

export default function BillingPage() {
  const [summary, setSummary]   = useState<BillingSummary | null>(null);
  const [tab, setTab]           = useState<Tab>('subscribers');
  const [users, setUsers]       = useState<User[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [planFilter, setPlan]   = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    api.get<BillingSummary>('/billing/summary').then((r) => { if (r.ok) setSummary(r.data); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const endpoint = tab === 'subscribers'
      ? `/billing/subscribers?page=${page}&limit=50${planFilter ? `&plan=${planFilter}` : ''}`
      : `/billing/trials?filter=all&page=${page}`;
    api.get<User[]>(endpoint).then((r) => {
      if (r.ok) { setUsers(r.data); setTotal(r.meta?.total ?? r.data.length); }
    }).finally(() => setLoading(false));
  }, [tab, page, planFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title="Facturación y suscripciones" />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Free"          value={summary.free_count}    icon="🆓" />
          <StatCard label="Plus"          value={summary.plus_count}    icon="⭐" color="blue" />
          <StatCard label="Premium"       value={summary.premium_count} icon="💎" color="purple" />
          <StatCard label="Trials activos"value={summary.active_trials} icon="⏳" color="yellow" />
          <StatCard label="Trials expirados" value={summary.expired_trials} icon="❌" color="red" />
          <StatCard label="Nuevos pagos (30d)" value={summary.new_paid_30d} icon="💳" color="green" />
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setPage(1); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t === 'subscribers' ? 'Suscriptores' : 'Trials'}
            </button>
          ))}
        </div>

        {tab === 'subscribers' && (
          <div className="flex gap-3 mb-4">
            <select value={planFilter} onChange={(e) => { setPlan(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Plus + Premium</option>
              <option value="plus">Solo Plus</option>
              <option value="premium">Solo Premium</option>
            </select>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Sin resultados</div>
          ) : (
            <>
              <div className="overflow-x-auto"><table className="erp-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Plan</th>
                    <th>Estado</th>
                    {tab === 'trials' && <><th>Trial inicio</th><th>Trial fin</th></>}
                    {tab === 'subscribers' && <th>Desde</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link to={`/users/${u.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                          {u.name || u.email}
                        </Link>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </td>
                      <td><StatusBadge status={u.plan_type} /></td>
                      <td><StatusBadge status={u.status} /></td>
                      {tab === 'trials' && (
                        <>
                          <td className="text-sm text-slate-500">{fmtDate(u.trial_start ?? '')}</td>
                          <td className={`text-sm font-medium ${u.trial_end && new Date(u.trial_end) < new Date() ? 'text-red-500' : 'text-slate-500'}`}>
                            {fmtDate(u.trial_end ?? '')}
                          </td>
                        </>
                      )}
                      {tab === 'subscribers' && (
                        <td className="text-sm text-slate-500">{fmtDate(u.created_at)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
