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

interface FunnelEventRecord {
  id: string;
  event_type: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  offer_title: string | null;
  landing_url: string;
  created_at: string;
}

interface UserDetail extends User {
  appointments: Appointment[];
  tickets: Ticket[];
  leads: LeadRecord[];
  funnelEvents: FunnelEventRecord[];
  consent_legal_at:            string | null;
  consent_marketing_email_at:  string | null;
  consent_marketing_sms_at:    string | null;
  consent_thirdparty_email_at: string | null;
  consent_thirdparty_sms_at:   string | null;
  consents_reviewed_at:        string | null;
  registration_ip:  string;
  registration_ua:  string;
  utm_source:   string;
  utm_medium:   string;
  utm_campaign: string;
  utm_content:  string;
  affiliate_data: Record<string, string> | null;
  referer:     string;
  landing_url: string;
  language:    string;
}

const FUNNEL_EVENT_LABELS: Record<string, string> = {
  landing:          'Visita',
  marketplace_view: 'Marketplace',
  offer_view:       'Oferta vista',
  register:         'Registro',
  lead_request:     'Solicitud',
};
const FUNNEL_EVENT_COLORS: Record<string, string> = {
  landing:          'bg-slate-100 text-slate-500',
  marketplace_view: 'bg-blue-50 text-blue-700',
  offer_view:       'bg-violet-50 text-violet-700',
  register:         'bg-emerald-50 text-emerald-700',
  lead_request:     'bg-amber-50 text-amber-700',
};

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
  const [editMode, setEditMode]           = useState(false);
  const [editName, setEditName]           = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [editPhone, setEditPhone]         = useState('');
  const [editCompany, setEditCompany]     = useState('');
  const [editTaxId, setEditTaxId]         = useState('');
  const [editStreet, setEditStreet]       = useState('');
  const [editPostal, setEditPostal]       = useState('');
  const [editProvince, setEditProvince]   = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

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

  function startEdit() {
    setEditName(user?.name ?? '');
    setEditApellidos(user?.apellidos ?? '');
    setEditPhone(user?.phone ?? '');
    setEditCompany(user?.company_name ?? '');
    setEditTaxId(user?.tax_id ?? '');
    const parts = (user?.billing_address ?? '').split(', ');
    setEditStreet(parts[0] ?? '');
    setEditPostal(parts[1] ?? '');
    setEditProvince(parts[2] ?? '');
    setEditMode(true);
  }

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    const r = await api.patch(`/users/${user.id}/profile`, {
      name: editName,
      apellidos: editApellidos,
      phone: editPhone,
      company_name: editCompany,
      tax_id: editTaxId,
      billing_address: [editStreet, editPostal, editProvince].filter(Boolean).join(', '),
    });
    if (r.ok) {
      setUser(prev => prev ? {
        ...prev,
        name: editName,
        apellidos: editApellidos,
        phone: editPhone,
        company_name: editCompany,
        tax_id: editTaxId,
        billing_address: [editStreet, editPostal, editProvince].filter(Boolean).join(', '),
      } : prev);
      setEditMode(false);
    }
    setSavingProfile(false);
  }

  if (loading) return <div className="text-slate-400 text-sm">Cargando…</div>;
  if (!user)   return <div className="text-red-500 text-sm">Usuario no encontrado</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title={[user.name, user.apellidos].filter(Boolean).join(' ') || user.email}
        subtitle={user.email}
        actions={
          <Link to="/users" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Profile card */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-sm">Perfil</h3>
              {user.client_type === 'business'
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Empresa</span>
                : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Particular</span>
              }
            </div>
            {!editMode ? (
              <button onClick={startEdit} className="text-xs text-blue-600 hover:underline">Editar</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditMode(false)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
                <button onClick={saveProfile} disabled={savingProfile}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {savingProfile ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}
          </div>

          {/* DATOS PERSONALES */}
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mb-3">Datos personales</p>
          {!editMode ? (
            <dl className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><dt className="text-slate-500">Nombre</dt><dd className="font-medium">{user.name || '–'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Apellidos</dt><dd className="font-medium">{user.apellidos || '–'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="font-medium text-xs">{user.email}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Teléfono</dt><dd className="font-medium">{user.phone || '–'}</dd></div>
            </dl>
          ) : (
            <div className="space-y-2 text-sm mb-4">
              {[
                { label: 'Nombre',    val: editName,      set: setEditName },
                { label: 'Apellidos', val: editApellidos, set: setEditApellidos },
                { label: 'Teléfono', val: editPhone,      set: setEditPhone },
              ].map(({ label, val, set }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 w-24 shrink-0">{label}</span>
                  <input value={val} onChange={e => set(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 w-24 shrink-0">Email</span>
                <span className="flex-1 text-slate-400 text-sm">{user.email}</span>
              </div>
            </div>
          )}

          {/* DATOS DE FACTURACIÓN */}
          <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mt-5 mb-3">Datos de facturación</p>
          {!editMode ? (
            <dl className="space-y-2 text-sm mb-4">
              {user.company_name && (
                <div className="flex justify-between"><dt className="text-slate-500">Razón social</dt><dd className="font-medium">{user.company_name}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-slate-500">NIF / CIF</dt><dd className="font-medium">{user.tax_id || '–'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Dirección fiscal</dt><dd className="font-medium text-right max-w-[200px]">{user.billing_address || '–'}</dd></div>
            </dl>
          ) : (
            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 w-28 shrink-0">NIF / CIF</span>
                <input value={editTaxId} onChange={e => setEditTaxId(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 w-28 shrink-0 pt-1">Dirección</span>
                <input value={editStreet} onChange={e => setEditStreet(e.target.value)}
                  placeholder="Calle, número, piso"
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 w-28 shrink-0">Código postal</span>
                <input value={editPostal} onChange={e => setEditPostal(e.target.value)}
                  placeholder="28001"
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 w-28 shrink-0">Provincia</span>
                <input value={editProvince} onChange={e => setEditProvince(e.target.value)}
                  placeholder="Madrid"
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          )}

          {/* CUENTA */}
          <div className="border-t border-slate-100 pt-3 mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Cuenta</p>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd><StatusBadge status={user.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Plan</dt><dd><StatusBadge status={user.plan_type} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Registro</dt><dd className="text-slate-700">{fmtDate(user.created_at)}</dd></div>
              {user.trial_end && (
                <div className="flex justify-between"><dt className="text-slate-500">Trial hasta</dt><dd className="text-slate-700">{fmtDate(user.trial_end)}</dd></div>
              )}
            </dl>
          </div>

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

      {/* Actividad marketing / funnel */}
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">
            Actividad marketing <span className="text-slate-400 font-normal">({(user.funnelEvents ?? []).length})</span>
          </h3>
          <Link to={`/funnel`} className="text-blue-600 text-xs">Ver funnel →</Link>
        </div>
        {(user.funnelEvents ?? []).length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin actividad registrada</p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr><th>Evento</th><th>Fuente</th><th>Campaña</th><th>Oferta</th><th>Fecha</th></tr></thead>
            <tbody>
              {(user.funnelEvents ?? []).map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${FUNNEL_EVENT_COLORS[e.event_type] ?? 'bg-slate-100 text-slate-500'}`}>
                      {FUNNEL_EVENT_LABELS[e.event_type] ?? e.event_type}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{e.utm_source || '–'}</td>
                  <td className="text-xs text-slate-500 max-w-[160px] truncate">{e.utm_campaign || '–'}</td>
                  <td className="text-xs text-slate-500 max-w-[180px] truncate">{e.offer_title || '–'}</td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {/* Consentimientos */}
      <Card>
        <h3 className="font-semibold text-slate-800 text-sm mb-4">Consentimientos</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Columna izquierda: consentimientos firmados */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Aceptaciones</p>
            <dl className="space-y-3">
              {[
                { label: 'T&C y Política de Privacidad',  value: user.consent_legal_at },
                { label: 'Marketing email',               value: user.consent_marketing_email_at },
                { label: 'Marketing SMS',                 value: user.consent_marketing_sms_at },
                { label: 'Terceros email (Experian)',     value: user.consent_thirdparty_email_at },
                { label: 'Terceros SMS (Experian)',       value: user.consent_thirdparty_sms_at },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 text-xs leading-5">{label}</dt>
                  <dd className="flex items-center gap-1.5 shrink-0">
                    {value ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(value)}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                        <span className="text-xs text-slate-400">No aceptado</span>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            {user.consents_reviewed_at && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-slate-500 text-xs leading-5">Revisión de consentimientos</dt>
                  <dd className="text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(user.consents_reviewed_at)}</dd>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Origen del registro</p>
              <dl className="space-y-2.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 text-xs">IP</dt>
                  <dd className="text-slate-700 text-xs font-mono">{user.registration_ip || '–'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 text-xs">Idioma</dt>
                  <dd className="text-slate-700 text-xs">{user.language || '–'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 text-xs">UTM Source</dt>
                  <dd className="text-slate-700 text-xs">{user.utm_source || '–'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 text-xs">UTM Medium</dt>
                  <dd className="text-slate-700 text-xs">{user.utm_medium || '–'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 text-xs">UTM Campaign</dt>
                  <dd className="text-slate-700 text-xs">{user.utm_campaign || '–'}</dd>
                </div>
                {user.utm_content && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 text-xs">UTM Content</dt>
                    <dd className="text-slate-700 text-xs">{user.utm_content}</dd>
                  </div>
                )}
                {user.referer && (
                  <div className="flex flex-col gap-1 pt-1">
                    <dt className="text-slate-500 text-xs">Referer</dt>
                    <dd className="text-slate-700 text-xs break-all bg-slate-50 rounded p-2 border border-slate-100">{user.referer}</dd>
                  </div>
                )}
                {user.landing_url && (
                  <div className="flex flex-col gap-1">
                    <dt className="text-slate-500 text-xs">Landing URL</dt>
                    <dd className="text-slate-700 text-xs break-all bg-slate-50 rounded p-2 border border-slate-100">{user.landing_url}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Columna derecha: user agent + affiliate data */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dispositivo</p>
            <p className="text-xs text-slate-500 leading-relaxed break-words bg-slate-50 rounded-lg p-3 border border-slate-100">
              {user.registration_ua || '–'}
            </p>

            {user.affiliate_data && Object.keys(user.affiliate_data).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Datos de afiliación</p>
                <dl className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {Object.entries(user.affiliate_data).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-slate-500 text-xs">{k}</dt>
                      <dd className="text-slate-700 text-xs font-mono break-all">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
