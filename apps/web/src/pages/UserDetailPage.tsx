import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';
import { StatusBadge } from '../components/ui/Badge.js';
import type { User, Appointment, Ticket } from '../types/index.js';

interface LeadRecord {
  id: string;
  lead_type: string;
  vehicle_title: string;
  vehicle_url: string;
  status: string;
  appointment_date?: string;
  appointment_time?: string;
  appointment_address?: string;
  appointment_contact?: string;
  created_at: string;
}

interface UserDetail extends User {
  appointments: Appointment[];
  tickets: Ticket[];
  leads: LeadRecord[];
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}
function fmtDateTime(s: string) {
  return s ? new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser]     = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<UserDetail>(`/users/${id}`)
      .then((r) => { if (r.ok) setUser(r.data); })
      .finally(() => setLoading(false));
  }, [id]);

  async function updateStatus(status: string) {
    if (!id) return;
    setSaving(true);
    const r = await api.patch<UserDetail>(`/users/${id}/status`, { status });
    if (r.ok) setUser((u) => u ? { ...u, status: r.data.status } : u);
    setSaving(false);
  }

  async function updatePlan(plan: string) {
    if (!id) return;
    setSaving(true);
    const r = await api.patch<UserDetail>(`/users/${id}/plan`, { plan });
    if (r.ok) setUser((u) => u ? { ...u, plan_type: r.data.plan_type } : u);
    setSaving(false);
  }

  if (loading) return <div className="text-slate-400 text-sm">Cargando…</div>;
  if (!user)   return <div className="text-red-500 text-sm">Usuario no encontrado</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title={user.name || user.email}
        subtitle={user.email}
        actions={
          <Link to="/users" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile card */}
        <Card>
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Perfil</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd><StatusBadge status={user.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Plan</dt><dd><StatusBadge status={user.plan_type} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Teléfono</dt><dd className="text-slate-700">{user.phone || '–'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Registro</dt><dd className="text-slate-700">{fmtDate(user.created_at)}</dd></div>
            {user.trial_end && (
              <div className="flex justify-between"><dt className="text-slate-500">Trial hasta</dt><dd className="text-slate-700">{fmtDate(user.trial_end)}</dd></div>
            )}
          </dl>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">Cambiar estado</p>
              <div className="flex gap-2 flex-wrap">
                {(['active','at_risk','blocked'] as const).map((s) => (
                  <button key={s}
                    disabled={saving || user.status === s}
                    onClick={() => updateStatus(s)}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                      user.status === s
                        ? 'bg-slate-100 border-slate-200 text-slate-600 font-medium'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-500'
                    }`}>
                    {s === 'active' ? 'Activo' : s === 'at_risk' ? 'En riesgo' : 'Bloqueado'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">Cambiar plan</p>
              <div className="flex gap-2 flex-wrap">
                {(['free','plus','premium'] as const).map((p) => (
                  <button key={p}
                    disabled={saving || user.plan_type === p}
                    onClick={() => updatePlan(p)}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                      user.plan_type === p
                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-500'
                    }`}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Appointments */}
        <Card padding={false} className="lg:col-span-2">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 text-sm">
              Citas <span className="text-slate-400 font-normal">({user.appointments.length})</span>
            </h3>
          </div>
          {user.appointments.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sin citas</p>
          ) : (
            <div className="overflow-x-auto"><table className="erp-table">
              <thead><tr><th>Tipo</th><th>Taller</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                {user.appointments.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm capitalize">{a.type.replace('_', ' ')}</td>
                    <td className="text-sm text-slate-500">{a.workshop_name || '–'}</td>
                    <td className="text-sm text-slate-500">{fmtDateTime(a.scheduled_at)}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </div>

      {/* Leads / Solicitudes */}
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">
            Solicitudes <span className="text-slate-400 font-normal">({(user.leads ?? []).length})</span>
          </h3>
          <Link to={`/leads?q=${encodeURIComponent(user.email)}`} className="text-blue-600 text-xs">Ver en leads →</Link>
        </div>
        {(user.leads ?? []).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin solicitudes</p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr><th>Tipo</th><th>Vehículo</th><th>Cita</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              {(user.leads ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="text-xs capitalize text-slate-600">{l.lead_type === 'visit' ? 'Visita' : l.lead_type === 'info' ? 'Info' : 'Pregunta'}</td>
                  <td className="text-sm text-slate-700 max-w-[200px] truncate">
                    {l.vehicle_url
                      ? <a href={l.vehicle_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{l.vehicle_title || '–'}</a>
                      : (l.vehicle_title || '–')}
                  </td>
                  <td className="text-xs text-slate-500">
                    {l.appointment_date ? (
                      <span>{new Date(l.appointment_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}{l.appointment_time ? ` ${l.appointment_time}` : ''}</span>
                    ) : '–'}
                  </td>
                  <td><StatusBadge status={l.status} /></td>
                  <td className="text-xs text-slate-400">{fmtDate(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {/* Tickets */}
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">
            Tickets <span className="text-slate-400 font-normal">({user.tickets.length})</span>
          </h3>
          <Link to={`/tickets?user=${id}`} className="text-blue-600 text-xs">Ver en tickets →</Link>
        </div>
        {user.tickets.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin tickets</p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr><th>Título</th><th>Canal</th><th>Prioridad</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              {user.tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tickets/${t.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                      {t.title}
                    </Link>
                  </td>
                  <td className="text-sm text-slate-500 capitalize">{t.channel}</td>
                  <td className="text-sm text-slate-500 capitalize">{t.priority}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="text-xs text-slate-400">{fmtDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
