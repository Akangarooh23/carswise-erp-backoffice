import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { StatCard } from '../components/ui/Card.js';
import Atencion from '../components/ui/Atencion.js';
import CochesEnMarcha from '../components/dashboard/CochesEnMarcha.js';
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

  if (loading) return <div className="text-brand-300 text-sm pt-4">Cargando dashboard…</div>;
  if (error)   return <div className="text-red-500 text-sm pt-4">{error}</div>;
  if (!stats)  return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Vista general del negocio" />

      {/* Lo que espera a alguien, antes que nada. Si no hay nada, se dice. */}
      <Atencion avisos={[
        { etiqueta: 'tickets urgentes',   valor: stats.tickets?.urgent ?? 0,       a: '/tickets',      icono: 'aviso',      tono: 'urgente' },
        { etiqueta: 'tickets abiertos',   valor: stats.tickets?.open ?? 0,         a: '/tickets',      icono: 'ticket' },
        { etiqueta: 'leads pendientes',   valor: stats.leads?.pending ?? 0,        a: '/leads',        icono: 'megafono' },
        { etiqueta: 'leads por reagendar', valor: stats.leads?.reschedule ?? 0,     a: '/leads',        icono: 'historial' },
        { etiqueta: 'citas en 7 días',    valor: stats.appointments?.upcoming_7d ?? 0, a: '/appointments', icono: 'calendario' },
        { etiqueta: 'usuarios en riesgo', valor: stats.users?.at_risk ?? 0,        a: '/users',        icono: 'usuarios',   tono: 'urgente' },
        // Las dos de importación cuestan dinero mientras siguen ahí: un gasto sin
        // factura no se deduce, y un coche sin depósito lo estamos financiando.
        { etiqueta: 'facturas de proveedor sin llegar', valor: stats.importacion?.facturas_sin_llegar ?? 0, a: '/provider-billing', icono: 'documento', tono: 'urgente' },
        { etiqueta: 'importaciones sin depósito', valor: stats.importacion?.sin_deposito ?? 0, a: '/importaciones', icono: 'euro' },
      ]} />

      {/*
        * La importación primero, que es el negocio que está corriendo.
        *
        * Antes esto abría con «total usuarios» y «plan premium», y de lo que
        * pasa cada día —coches viniendo de Alemania, dinero de clientes
        * retenido, facturas que no llegan— no decía nada.
        */}
      {stats.importacion && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Importación</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Coches en marcha" value={fmt(stats.importacion.en_marcha)}
                      sub={`${fmt(stats.importacion.entregados)} entregados`}
                      icon="coche" color="neutro" a="/importaciones" />
            <StatCard label="Depósitos retenidos" value={fmtPrice(Number(stats.importacion.retenido))}
                      sub="dinero de clientes sin entregar" icon="euro" color="espera" a="/importaciones" />
            <StatCard label="Facturas sin llegar" value={fmt(stats.importacion.facturas_sin_llegar)}
                      sub={`${fmtPrice(Number(stats.importacion.facturas_sin_llegar_importe))} sin facturar`}
                      icon="documento" color={stats.importacion.facturas_sin_llegar ? "espera" : "neutro"}
                      a="/provider-billing" />
            <StatCard label="Coches publicados" value={fmt(stats.importacion.publicados)}
                      sub={`${fmt(stats.importacion.vivos)} siguen a la venta`}
                      icon="ojo" color="neutro" a="/marketplace" />
          </div>
        </section>
      )}

      {/* Users */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Usuarios</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total usuarios"    value={fmt(stats.users?.total)}   sub={`+${fmt(stats.users?.new_30d)} este mes`} icon="usuarios" color="neutro" a="/users" />
          <StatCard label="Activos"           value={fmt(stats.users?.active)}  icon="comprobado" color="bien" a="/users" />
          <StatCard label="Plan Plus"         value={fmt(stats.users?.plus)}    icon="estrella" color="neutro" a="/users" />
          <StatCard label="Plan Premium"      value={fmt(stats.users?.premium)} icon="diamante" color="neutro" a="/users" />
        </div>
      </section>

      {/* Tickets */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Tickets de soporte</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Abiertos"     value={fmt(stats.tickets?.open)}        icon="ticket" color="neutro" a="/tickets" />
          <StatCard label="En curso"     value={fmt(stats.tickets?.in_progress)} icon="historial" color="neutro" a="/tickets" />
          <StatCard label="Urgentes"     value={fmt(stats.tickets?.urgent)}      icon="aviso" color="urgente" a="/tickets" />
          <StatCard label="Resueltos"    value={fmt(stats.tickets?.resolved)}    sub={`${fmt(stats.tickets?.new_7d)} nuevos esta semana`} icon="comprobado" color="bien" a="/tickets" />
        </div>
      </section>

      {/* Appointments + Marketplace */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Citas</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Programadas"  value={fmt(stats.appointments?.scheduled)}  icon="calendario" color="neutro" a="/appointments" />
            <StatCard label="Próximos 7d"  value={fmt(stats.appointments?.upcoming_7d)} icon="reloj" color="espera" a="/appointments" />
          </div>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Marketplace VO</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Activos"      value={fmt(stats.marketplace?.active)}    icon="coche" color="neutro" a="/marketplace" />
            <StatCard label="Precio medio" value={fmtPrice(stats.marketplace?.avg_price ?? 0)} icon="euro" color="bien" a="/marketplace" />
          </div>
        </section>
      </div>

      {/* Leads / Solicitudes */}
      {stats.leads && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-300 mb-3">Solicitudes (Leads)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Total"        value={fmt(stats.leads.total)}      sub={`+${fmt(stats.leads.new_7d)} esta semana`} icon="bandeja" color="neutro" a="/leads" />
            <StatCard label="Pendientes"   value={fmt(stats.leads.pending)}    icon="reloj" color="espera" a="/leads" />
            <StatCard label="Contactados"  value={fmt(stats.leads.contacted)}  icon="megafono" color="neutro" a="/leads" />
            <StatCard label="Reagendar"    value={fmt(stats.leads.reschedule)} icon="historial" color="neutro" a="/leads" />
            <StatCard label="Resueltos"    value={fmt(stats.leads.resolved)}   icon="comprobado" color="bien" a="/leads" />
          </div>
        </section>
      )}

      {/* Y lo que hay que hacer con cada coche, no solo cuántos hay. */}
      <CochesEnMarcha />

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent tickets */}
        <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-brand-100">
            <h3 className="font-semibold text-brand-600 text-sm">Tickets recientes</h3>
            <Link to="/tickets" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Ver todos →</Link>
          </div>
          {stats.recentTickets.length === 0 ? (
            <p className="text-brand-300 text-sm text-center py-8">Sin tickets</p>
          ) : (
            <div className="overflow-x-auto"><table className="erp-table">
              <thead><tr><th>Título</th><th>Prioridad</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="text-acento-texto hover:underline text-sm font-medium">
                        {t.title}
                      </Link>
                      <p className="text-xs text-brand-300 mt-0.5">{fmtDate(t.created_at)}</p>
                    </td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        {/* Upcoming appointments */}
        <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-brand-100">
            <h3 className="font-semibold text-brand-600 text-sm">Próximas citas</h3>
            <Link to="/appointments" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Ver todas →</Link>
          </div>
          {stats.upcomingAppointments.length === 0 ? (
            <p className="text-brand-300 text-sm text-center py-8">Sin citas próximas</p>
          ) : (
            <div className="overflow-x-auto"><table className="erp-table">
              <thead><tr><th>Usuario</th><th>Tipo</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.upcomingAppointments.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm font-medium text-brand-500">{a.user_id}</td>
                    <td className="text-sm text-brand-400 capitalize">{a.type.replace('_', ' ')}</td>
                    <td className="text-sm text-brand-400">{fmtDate(a.scheduled_at)}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
