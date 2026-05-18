import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge.js';
import type { Ticket, TicketStatus } from '../types/index.js';

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Abierto', in_progress: 'En curso', waiting_customer: 'Esperando cliente', resolved: 'Resuelto', closed: 'Cerrado',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket]   = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [assignee, setAssignee] = useState('');

  function load() {
    if (!id) return;
    api.get<Ticket>(`/tickets/${id}`)
      .then((r) => { if (r.ok) { setTicket(r.data); setAssignee(r.data.assigned_to ?? ''); } })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function updateStatus(status: TicketStatus) {
    if (!id) return;
    setSaving(true);
    const r = await api.patch<Ticket>(`/tickets/${id}`, { status });
    if (r.ok) setTicket(r.data);
    setSaving(false);
  }

  async function addNote() {
    if (!note.trim() || !id) return;
    setSaving(true);
    const r = await api.patch<Ticket>(`/tickets/${id}`, { note, assigned_to: assignee || undefined });
    if (r.ok) { setTicket(r.data); setNote(''); }
    setSaving(false);
  }

  if (loading) return <div className="text-slate-400 text-sm">Cargando…</div>;
  if (!ticket) return <div className="text-red-500 text-sm">Ticket no encontrado</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title={ticket.title}
        subtitle={`Ticket #${ticket.id.slice(0, 8)}`}
        actions={<Link to="/tickets" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Info */}
        <Card>
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Información</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd><StatusBadge status={ticket.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Prioridad</dt><dd><PriorityBadge priority={ticket.priority} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Canal</dt><dd className="text-slate-700 capitalize">{ticket.channel}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Creado</dt><dd className="text-slate-700">{fmtDateTime(ticket.created_at)}</dd></div>
          </dl>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-2">Cambiar estado</p>
            <div className="space-y-1">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => updateStatus(s)} disabled={saving || ticket.status === s}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${
                    ticket.status === s
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-500 hover:bg-slate-50 disabled:opacity-40'
                  }`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-1.5">Asignado a</p>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Email del agente"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </Card>

        {/* Description + Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h3 className="font-semibold text-slate-800 text-sm mb-2">Descripción</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
            {ticket.user_name && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                <span className="text-xs text-slate-400">Usuario:</span>
                <Link to={`/users/${ticket.user_id}`} className="text-xs text-blue-600 hover:underline">
                  {ticket.user_name} ({ticket.user_email})
                </Link>
              </div>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <h3 className="font-semibold text-slate-800 text-sm mb-4">
              Historial <span className="text-slate-400 font-normal">({ticket.events?.length ?? 0})</span>
            </h3>
            <div className="space-y-3 mb-5">
              {!ticket.events?.length ? (
                <p className="text-slate-400 text-xs">Sin actividad registrada</p>
              ) : ticket.events.map((ev) => (
                <div key={ev.id} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-slate-500 text-xs">✏</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">{ev.actor}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{ev.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(ev.event_at)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add note */}
            <div className="border-t border-slate-100 pt-4">
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Añadir nota o comentario…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="flex justify-end mt-2">
                <button onClick={addNote} disabled={saving || !note.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Guardando…' : 'Añadir nota'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
