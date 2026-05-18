import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { StatCard } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge.js';
import type { DashboardStats } from '../types/index.js';

function fmt(n: number) { return n?.toLocaleString('es-ES') ?? '–'; }
function fmtPrice(n: number) {
  if (!n) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get<DashboardStats>('/dashboard/stats').then((res) => {
      if (res.ok) setStats(res.data);
      else setError('No se pudieron cargar las estadísticas');
    }).catch(() => setError('Error de conexión')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-400 text-sm pt-4">Cargando dashboard…</div>;
  if (error)   return <div className="text-red-500 text-sm pt-4">{error}</div>;
  if (!stats)  return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Vista general del negocio CarsWise" />

      {/* Users */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Usuarios</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total usuarios"    value={fmt(stats.users.total)}   sub={`+${fmt(stats.users.new_30d)} este mes`} icon="👤" color="blue" />
          <StatCard label="Activos"           value={fmt(stats.users.active)}  icon="✅" color="green" />
          <StatCard label="Plan Plus"         value={fmt(stats.users.plus)}    icon="⭐" color="blue" />
          <StatCard label="Plan Premium"      value={fmt(stats.users.premium)} icon="💎" color="purple" />
        </div>
      </section>

      {/* Tickets */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Tickets de soporte</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Abiertos"     value={fmt(stats.tickets.open)}        icon="🎫" color="blue" />
          <StatCard label="En curso"     value={fmt(stats.tickets.in_progress)} icon="⚡" color="purple" />
          <StatCard label="Urgentes"     value={fmt(stats.tickets.urgent)}      icon="🔴" color="red" />
          <StatCard label="Resueltos"    value={fmt(stats.tickets.resolved)}    sub={`${fmt(stats.tickets.new_7d)} nuevos esta semana`} icon="✅" color="green" />
        </div>
      </section>

      {/* Appointments + Marketplace */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Citas</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Programadas"  value={fmt(stats.appointments.scheduled)}  icon="📅" color="blue" />
            <StatCard label="Próximos 7d"  value={fmt(stats.appointments.upcoming_7d)} icon="⏰" color="yellow" />
          </div>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Marketplace VO</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Activos"      value={fmt(stats.marketplace.active)}    icon="🚗" color="blue" />
            <StatCard label="Precio medio" value={fmtPrice(stats.marketplace.avg_price)} icon="💶" color="green" />
          </div>
        </section>
      </div>

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent tickets */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Tickets recientes</h3>
            <Link to="/tickets" className="text-blue-600 hover:text-blue-700 text-xs font-medium">Ver todos →</Link>
          </div>
          {stats.recentTickets.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sin tickets</p>
          ) : (
            <table className="erp-table">
              <thead><tr><th>Título</th><th>Prioridad</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                        {t.title}
                      </Link>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(t.created_at)}</p>
                    </td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming appointments */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">Próximas citas</h3>
            <Link to="/appointments" className="text-blue-600 hover:text-blue-700 text-xs font-medium">Ver todas →</Link>
          </div>
          {stats.upcomingAppointments.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sin citas próximas</p>
          ) : (
            <table className="erp-table">
              <thead><tr><th>Usuario</th><th>Tipo</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.upcomingAppointments.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm font-medium text-slate-700">{a.user_id}</td>
                    <td className="text-sm text-slate-500 capitalize">{a.type.replace('_', ' ')}</td>
                    <td className="text-sm text-slate-500">{fmtDate(a.scheduled_at)}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
