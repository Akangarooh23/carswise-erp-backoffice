/**
 * Las visitas de un vehículo, desplegadas bajo su fila.
 *
 * Huecos que ofrece el equipo y citas que ha pedido un cliente.
 */

import { V_TIMES, fmtVDate, fmtVTime, todayStr } from './formato.js';
import type { VisitEntry, SlotFormState } from './tipos.js';

export default function VisitsPanel({
  offerId, data, slotForm, onFormChange, onAdd, adding, msg, onRemoveSlot, onCancelBooking,
}: {
  offerId: string; data: VisitEntry;
  slotForm: SlotFormState; onFormChange: (f: SlotFormState) => void;
  onAdd: () => void; adding: boolean; msg: string | null;
  onRemoveSlot: (id: string) => void; onCancelBooking: (b: any) => void;
}) {
  if (data.loading) return <div className="p-4 text-xs text-brand-300">Cargando…</div>;
  return (
    <div className="p-4 bg-brand-50 border-t border-brand-100">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-bold text-brand-400 uppercase tracking-wide">Disponibilidad y citas</span>
        <span className="text-[10px] font-mono text-brand-300 bg-brand-200 rounded px-1.5 py-0.5">{offerId}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Slots ── */}
        <div>
          <p className="text-xs font-semibold text-brand-400 mb-2">Franjas horarias</p>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div>
              <label className="block text-[10px] text-brand-300 font-medium mb-0.5">Fecha</label>
              <input type="date" min={todayStr()} value={slotForm.date}
                onChange={(e) => onFormChange({ ...slotForm, date: e.target.value })}
                className="px-2 py-1 text-xs border border-brand-200 rounded-md focus:outline-none focus:ring-1 focus:ring-acento" />
            </div>
            <div>
              <label className="block text-[10px] text-brand-300 font-medium mb-0.5">Desde</label>
              <select value={slotForm.timeStart} onChange={(e) => onFormChange({ ...slotForm, timeStart: e.target.value })}
                className="px-2 py-1 text-xs border border-brand-200 rounded-md focus:outline-none">
                {V_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-brand-300 font-medium mb-0.5">Hasta</label>
              <select value={slotForm.timeEnd} onChange={(e) => onFormChange({ ...slotForm, timeEnd: e.target.value })}
                className="px-2 py-1 text-xs border border-brand-200 rounded-md focus:outline-none">
                {V_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={onAdd} disabled={adding}
              className="px-3 py-1 text-xs font-semibold bg-brand-600 text-white rounded-md hover:bg-brand-500 disabled:opacity-50 whitespace-nowrap">
              {adding ? 'Añadiendo…' : '+ Añadir'}
            </button>
          </div>
          {msg && (
            <div className={`text-xs mb-2 px-2 py-1 rounded ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg}</div>
          )}
          <div className="space-y-1">
            {data.slots.length === 0 && <p className="text-xs text-brand-300">Sin franjas configuradas.</p>}
            {data.slots.map((s: any) => (
              <div key={s.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${s.status === 'booked' ? 'bg-acento-tenue border border-acento-tenue' : 'bg-white border border-brand-100'}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${s.status === 'booked' ? 'bg-brand-400' : 'bg-emerald-500'}`} />
                <span className="flex-1 font-medium text-brand-500">{fmtVDate(s.starts_at)} · {fmtVTime(s.starts_at)}–{fmtVTime(s.ends_at)}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'booked' ? 'bg-acento-tenue text-acento-texto' : 'bg-emerald-100 text-emerald-700'}`}>
                  {s.status === 'booked' ? 'Reservada' : 'Libre'}
                </span>
                {s.status === 'available' && (
                  <button onClick={() => onRemoveSlot(s.id)} className="text-brand-300 hover:text-red-500 font-bold text-sm leading-none">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bookings ── */}
        <div>
          {/* Decía «Citas confirmadas» y lista todas las vivas, pendientes
              incluidas. Una pendiente es una solicitud que nadie ha aprobado
              todavía, y llamarla confirmada aquí hace creer que está cerrada. */}
          <p className="text-xs font-semibold text-brand-400 mb-2">Citas ({data.bookings.length})</p>
          {data.bookings.length === 0 ? (
            <p className="text-xs text-brand-300">Sin citas.</p>
          ) : (
            <div className="space-y-1.5">
              {data.bookings.map((b: any) => (
                <div key={b.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-white border border-brand-100 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-brand-600">{fmtVDate(b.starts_at)} · {fmtVTime(b.starts_at)}</span>
                      {b.status === 'pending' ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-acento-tenue text-acento-texto border border-acento">por confirmar</span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">confirmada</span>
                      )}
                    </div>
                    <div className="text-brand-400 truncate">{b.buyer_name || '–'}{b.buyer_phone ? ` · ${b.buyer_phone}` : ''}</div>
                    <div className="text-brand-300 text-[10px] truncate">{b.buyer_email}</div>
                    {b.notes && <div className="text-brand-300 truncate italic">{b.notes}</div>}
                  </div>
                  <button onClick={() => onCancelBooking(b)}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium shrink-0 px-1.5 py-0.5 rounded hover:bg-red-50">
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
