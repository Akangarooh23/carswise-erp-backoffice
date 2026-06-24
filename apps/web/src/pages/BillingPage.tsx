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

interface SaleInvoice {
  id: string;
  date: string;
  contact_name: string;
  user_email: string;
  vehicle_title: string;
  portal: string | null;
  amount: number | null;
  status: string;
}

interface RentingInvoice {
  id: string;
  date: string;
  contact_name: string;
  user_email: string;
  vehicle_title: string;
  color: string | null;
  duration_months: number | null;
  km_year: number | null;
  monthly_price: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

function fmtDate(s: string | null) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n == null) return '–';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}
function fmtPortal(portal: string | null) {
  if (!portal || portal.startsWith('marketplace')) return 'CarsWise';
  return portal.charAt(0).toUpperCase() + portal.slice(1).replace(/-/g, ' ');
}

const TABS = ['subscribers', 'free', 'ventas', 'renting'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  subscribers: 'Suscripciones',
  free:        'Usuarios free',
  ventas:      'Ventas vehículos',
  renting:     'Contratos renting',
};

const RENTING_STATUS_BADGE: Record<string, string> = {
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-100 text-red-600',
};
const RENTING_STATUS_LABEL: Record<string, string> = {
  active: 'Activo', completed: 'Finalizado', cancelled: 'Cancelado',
};

export default function BillingPage() {
  const [summary, setSummary]   = useState<BillingSummary | null>(null);
  const [tab, setTab]           = useState<Tab>('subscribers');
  const [users, setUsers]       = useState<User[]>([]);
  const [sales, setSales]       = useState<SaleInvoice[]>([]);
  const [rentings, setRentings] = useState<RentingInvoice[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [planFilter, setPlan]   = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    api.get<BillingSummary>('/billing/summary').then((r) => { if (r.ok) setSummary(r.data); });
  }, []);

  useEffect(() => { setPage(1); }, [tab]);

  useEffect(() => {
    setLoading(true);
    if (tab === 'subscribers' || tab === 'free') {
      const endpoint = tab === 'subscribers'
        ? `/billing/subscribers?page=${page}&limit=50${planFilter ? `&plan=${planFilter}` : ''}`
        : `/billing/trials?filter=all&page=${page}`;
      api.get<User[]>(endpoint).then((r) => {
        if (r.ok) { setUsers(r.data); setTotal(r.meta?.total ?? r.data.length); }
      }).finally(() => setLoading(false));
    } else {
      const type = tab === 'ventas' ? 'compra' : 'renting';
      api.get<unknown[]>(`/contracts?type=${type}&page=${page}&limit=50`).then((r) => {
        if (!r.ok) { setLoading(false); return; }
        const meta = r.meta as { total: number };
        setTotal(meta?.total ?? r.data.length);
        if (tab === 'ventas') setSales(r.data as SaleInvoice[]);
        else setRentings(r.data as RentingInvoice[]);
      }).finally(() => setLoading(false));
    }
  }, [tab, page, planFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title="Facturación clientes" subtitle="Suscripciones cobradas por CarsWise · Ventas y rentings gestionados (cobrados por el proveedor)" />

      {/* Summary suscripciones */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Free"               value={summary.free_count}     icon="🆓" />
          <StatCard label="Plus"               value={summary.plus_count}     icon="⭐" color="blue" />
          <StatCard label="Premium"            value={summary.premium_count}  icon="💎" color="purple" />
          <StatCard label="Trials activos"     value={summary.active_trials}  icon="⏳" color="yellow" />
          <StatCard label="Trials expirados"   value={summary.expired_trials} icon="❌" color="red" />
          <StatCard label="Nuevos pagos (30d)" value={summary.new_paid_30d}   icon="💳" color="green" />
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Aviso para tabs de proveedor */}
        {(tab === 'ventas' || tab === 'renting') && (
          <p className="text-xs text-slate-400 mb-4 ml-1">
            Estos importes son cobrados directamente por el proveedor al cliente. CarsWise actúa como intermediario.
          </p>
        )}

        {tab === 'subscribers' && (
          <div className="flex gap-3 mb-4 mt-3">
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
          ) : (tab === 'subscribers' || tab === 'free') ? (
            users.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin resultados</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Plan</th>
                      <th>Estado</th>
                      {tab === 'subscribers' && <><th>Suscrito desde</th><th>Próxima renovación</th></>}
                      {tab === 'free' && <th>Registro</th>}
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
                        {tab === 'subscribers' && (
                          <>
                            <td className="text-sm text-slate-500">{fmtDate(u.plan_updated_at ?? u.created_at)}</td>
                            <td className="text-sm text-slate-500">{fmtDate(u.next_billing_date ?? '')}</td>
                          </>
                        )}
                        {tab === 'free' && (
                          <td className="text-sm text-slate-500">{fmtDate(u.created_at)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination page={page} total={total} limit={50} onChange={setPage} />
              </>
            )
          ) : tab === 'ventas' ? (
            sales.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin ventas registradas</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead>
                    <tr>
                      <th>Fecha venta</th>
                      <th>Cliente</th>
                      <th>Vehículo</th>
                      <th>Portal (proveedor)</th>
                      <th>Importe proveedor</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(s.date)}</td>
                        <td>
                          <p className="text-sm font-medium text-slate-800">{s.contact_name || '–'}</p>
                          <p className="text-xs text-slate-400">{s.user_email}</p>
                        </td>
                        <td className="text-sm text-slate-700">{s.vehicle_title || '–'}</td>
                        <td>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            !s.portal || s.portal.startsWith('marketplace')
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-orange-50 text-orange-700'
                          }`}>
                            {fmtPortal(s.portal)}
                          </span>
                        </td>
                        <td className="text-sm font-semibold text-slate-700 whitespace-nowrap">{fmtEur(s.amount)}</td>
                        <td>
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                            Vendido
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination page={page} total={total} limit={50} onChange={setPage} />
              </>
            )
          ) : (
            rentings.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin contratos de renting registrados</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead>
                    <tr>
                      <th>Nº contrato</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Cliente</th>
                      <th>Vehículo</th>
                      <th>Duración</th>
                      <th>Cuota/mes (proveedor)</th>
                      <th>Total contrato</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentings.map((r) => (
                      <tr key={r.id}>
                        <td className="font-mono text-xs text-slate-500">{r.id}</td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.start_date)}</td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.end_date)}</td>
                        <td>
                          <p className="text-sm font-medium text-slate-800">{r.contact_name || '–'}</p>
                          <p className="text-xs text-slate-400">{r.user_email}</p>
                        </td>
                        <td className="text-sm text-slate-700">
                          {r.vehicle_title || '–'}
                          {r.color ? <span className="text-xs text-slate-400 ml-1">· {r.color}</span> : null}
                        </td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">
                          {r.duration_months ? `${r.duration_months} meses` : '–'}
                          {r.km_year ? <><br />{(r.km_year / 1000).toFixed(0)}k km/año</> : null}
                        </td>
                        <td className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                          {fmtEur(r.monthly_price)}<span className="text-xs font-normal text-slate-400">/mes</span>
                        </td>
                        <td className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                          {r.monthly_price && r.duration_months ? fmtEur(r.monthly_price * r.duration_months) : '–'}
                        </td>
                        <td>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${RENTING_STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {RENTING_STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination page={page} total={total} limit={50} onChange={setPage} />
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
