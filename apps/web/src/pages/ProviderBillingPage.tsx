import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';

interface Summary {
  pending_count: number;
  paid_count: number;
  pending_amount: number;
  paid_amount: number;
  renting_count: number;
  commission_count: number;
}

interface ProviderInvoice {
  id: string;
  type: 'renting_fee' | 'portal_commission';
  provider_name: string;
  contract_id: string;
  vehicle_title: string;
  customer_name: string;
  customer_email: string;
  base_amount: number;
  invoice_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
}

interface PendingCommission {
  id: string;
  contact_name: string;
  user_email: string;
  vehicle_title: string;
  portal: string;
  sale_price: number | null;
  date: string;
}

interface ReceivedInvoice {
  id: string;
  title: string;
  seller: string;
  cost_price: number;
  customer_price: number;
  margin: number;
  sold_at: string;
  contact_name: string | null;
  actual_sale_price: number | null;
}

function fmtDate(s: string | null) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtEur(n: number | null | undefined) {
  if (n == null) return '–';
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  paid:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', paid: 'Cobrada', cancelled: 'Cancelada',
};
const TYPE_LABEL: Record<string, string> = {
  renting_fee:        'Fee renting',
  portal_commission:  'Comisión portal',
};
const TYPE_BADGE: Record<string, string> = {
  renting_fee:       'bg-violet-50 text-violet-700',
  portal_commission: 'bg-orange-50 text-orange-700',
};

const TABS = ['emitidas', 'recibidas'] as const;
type Tab = typeof TABS[number];

export default function ProviderBillingPage() {
  const [tab, setTab]               = useState<Tab>('emitidas');
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [invoices, setInvoices]     = useState<ProviderInvoice[]>([]);
  const [received, setReceived]     = useState<ReceivedInvoice[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatus]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [pending, setPending]       = useState<PendingCommission[]>([]);

  // Commission modal
  const [commModal, setCommModal]   = useState<PendingCommission | null>(null);
  const [commMode, setCommMode]     = useState<'percent' | 'fixed'>('percent');
  const [commPct, setCommPct]       = useState('');
  const [commFixed, setCommFixed]   = useState('');
  const [creatingComm, setCreatingComm] = useState(false);

  // Mark paid modal
  const [markModal, setMarkModal]   = useState<ProviderInvoice | null>(null);
  const [markStatus, setMarkStatus] = useState<'paid' | 'cancelled'>('paid');
  const [markNotes, setMarkNotes]   = useState('');
  const [marking, setMarking]       = useState(false);

  useEffect(() => {
    api.get<Summary>('/provider-billing/summary').then(r => { if (r.ok) setSummary(r.data); });
    api.get<PendingCommission[]>('/provider-billing/pending-commissions').then(r => { if (r.ok) setPending(r.data); });
  }, []);

  useEffect(() => { setPage(1); }, [tab, typeFilter, statusFilter]);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    if (tab === 'emitidas') {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      const r = await api.get<ProviderInvoice[]>(`/provider-billing/invoices?${params}`);
      if (r.ok) { setInvoices(r.data); setTotal((r.meta as { total: number })?.total ?? r.data.length); }
    } else {
      const r = await api.get<ReceivedInvoice[]>(`/provider-billing/received?page=${p}&limit=50`);
      if (r.ok) { setReceived(r.data); setTotal((r.meta as { total: number })?.total ?? r.data.length); }
    }
    setLoading(false);
  }, [tab, page, typeFilter, statusFilter]);

  useEffect(() => { load(page); }, [page, load]);

  async function createCommission() {
    if (!commModal) return;
    setCreatingComm(true);
    const body = commMode === 'percent'
      ? { lead_id: commModal.id, invoice_mode: 'percent', percent: Number(commPct) }
      : { lead_id: commModal.id, invoice_mode: 'fixed', fixed_amount: Number(commFixed) };
    const r = await api.post('/provider-billing/commissions', body);
    if (r.ok) {
      setCommModal(null); setCommPct(''); setCommFixed('');
      setPending(prev => prev.filter(p => p.id !== commModal.id));
      await load(page);
      await api.get<Summary>('/provider-billing/summary').then(res => { if (res.ok) setSummary(res.data); });
    }
    setCreatingComm(false);
  }

  async function handleMark() {
    if (!markModal) return;
    setMarking(true);
    const r = await api.patch(`/provider-billing/invoices/${markModal.id}`, { status: markStatus, notes: markNotes });
    if (r.ok) { setMarkModal(null); setMarkNotes(''); await load(page); await api.get<Summary>('/provider-billing/summary').then(res => { if (res.ok) setSummary(res.data); }); }
    setMarking(false);
  }

  return (
    <div>
      <PageHeader title="Facturación proveedores" subtitle="Facturas emitidas a proveedores por conversiones · Facturas recibidas de proveedores" />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Pendientes cobro',  value: fmtEur(summary.pending_amount),  color: 'text-yellow-600' },
            { label: 'Cobradas',          value: fmtEur(summary.paid_amount),     color: 'text-emerald-700' },
            { label: 'Nº pendientes',     value: summary.pending_count,           color: 'text-yellow-600' },
            { label: 'Nº cobradas',       value: summary.paid_count,              color: 'text-emerald-700' },
            { label: 'Fees renting',      value: summary.renting_count,           color: 'text-violet-700' },
            { label: 'Comisiones portal', value: summary.commission_count,        color: 'text-orange-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString('es-ES') : value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t === 'emitidas' ? 'Emitidas a proveedores' : 'Recibidas de proveedores'}
          </button>
        ))}
      </div>

      {/* Filters + actions */}
      {tab === 'emitidas' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none">
              <option value="all">Todos los tipos</option>
              <option value="renting_fee">Fee renting</option>
              <option value="portal_commission">Comisión portal</option>
            </select>
            <select value={statusFilter} onChange={e => setStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none">
              <option value="">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="paid">Cobradas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>

          {/* Pending portal commissions */}
          {pending.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-200">
                <p className="text-sm font-semibold text-amber-800">
                  {pending.length} venta{pending.length > 1 ? 's' : ''} de portal pendiente{pending.length > 1 ? 's' : ''} de facturar comisión
                </p>
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Vehículo</th>
                    <th>Portal</th>
                    <th>Cliente</th>
                    <th>Precio venta</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map(p => (
                    <tr key={p.id}>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="text-sm text-slate-700">{p.vehicle_title}</td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-50 text-orange-700">
                          {p.portal ? p.portal.charAt(0).toUpperCase() + p.portal.slice(1) : 'Externo'}
                        </span>
                      </td>
                      <td>
                        <p className="text-sm text-slate-700">{p.contact_name}</p>
                        <p className="text-xs text-slate-400">{p.user_email}</p>
                      </td>
                      <td className="text-sm font-semibold text-slate-700">{fmtEur(p.sale_price)}</td>
                      <td>
                        <button
                          onClick={() => { setCommModal(p); setCommMode('percent'); setCommPct(''); setCommFixed(''); }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-3 py-1 hover:bg-blue-50 whitespace-nowrap">
                          Crear factura
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : tab === 'emitidas' ? (
          invoices.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Sin facturas emitidas</div>
          ) : (
            <>
              <div className="overflow-x-auto"><table className="erp-table">
                <thead>
                  <tr>
                    <th>Nº factura</th>
                    <th>Fecha emisión</th>
                    <th>Tipo</th>
                    <th>Proveedor</th>
                    <th>Cliente / Vehículo</th>
                    <th>Base</th>
                    <th>Importe facturado</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs text-slate-500">{inv.id}</td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(inv.issued_at)}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-500'}`}>
                          {TYPE_LABEL[inv.type] ?? inv.type}
                        </span>
                      </td>
                      <td className="text-sm font-medium text-slate-700">{inv.provider_name || '–'}</td>
                      <td>
                        <p className="text-sm text-slate-700 truncate max-w-[180px]">{inv.vehicle_title}</p>
                        <p className="text-xs text-slate-400">{inv.customer_name} · {inv.customer_email}</p>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {inv.type === 'renting_fee'
                          ? <>{fmtEur(inv.base_amount)}<span className="text-slate-400">/mes</span></>
                          : fmtEur(inv.base_amount)}
                      </td>
                      <td className="text-sm font-bold text-slate-800 whitespace-nowrap">{fmtEur(inv.invoice_amount)}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[inv.status]}`}>
                          {STATUS_LABEL[inv.status]}
                          {inv.paid_at ? ` · ${fmtDate(inv.paid_at)}` : ''}
                        </span>
                      </td>
                      <td>
                        {inv.status === 'pending' && (
                          <button onClick={() => { setMarkModal(inv); setMarkStatus('paid'); setMarkNotes(''); }}
                            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50 whitespace-nowrap">
                            Marcar cobrada
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        ) : (
          /* ── Recibidas de proveedores (marketplace VO compras) ── */
          received.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Sin facturas recibidas de proveedores</div>
          ) : (
            <>
              <p className="text-xs text-amber-600 bg-amber-50 border-b border-amber-200 px-4 py-2">
                Estas facturas las emite el proveedor a CarsWise al precio de coste. CarsWise factura al cliente el precio publicado. El margen es el beneficio de CarsWise.
              </p>
              <div className="overflow-x-auto"><table className="erp-table">
                <thead>
                  <tr>
                    <th>Fecha venta</th>
                    <th>Vehículo</th>
                    <th>Proveedor</th>
                    <th>Cliente</th>
                    <th>Precio coste (proveedor nos cobra)</th>
                    <th>Precio publicado (CarsWise cobra)</th>
                    <th>Margen CarsWise</th>
                  </tr>
                </thead>
                <tbody>
                  {received.map(r => (
                    <tr key={r.id}>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.sold_at)}</td>
                      <td className="text-sm text-slate-700 max-w-[180px] truncate">{r.title}</td>
                      <td className="text-sm text-slate-600">{r.seller || '–'}</td>
                      <td className="text-sm text-slate-600">{r.contact_name || '–'}</td>
                      <td className="text-sm font-semibold text-red-600 whitespace-nowrap">{fmtEur(r.cost_price)}</td>
                      <td className="text-sm font-semibold text-slate-700 whitespace-nowrap">{fmtEur(r.actual_sale_price ?? r.customer_price)}</td>
                      <td className="text-sm font-bold text-emerald-700 whitespace-nowrap">{fmtEur(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        )}
      </div>

      {/* Commission modal */}
      <Modal open={!!commModal} onClose={() => setCommModal(null)} title="Crear factura de comisión portal">
        {commModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{commModal.vehicle_title}</strong><br />
              <span className="text-xs text-slate-400">
                {commModal.contact_name} · {commModal.portal} · Precio venta: {fmtEur(commModal.sale_price)}
              </span>
            </p>

            {/* Mode selector */}
            <div className="flex gap-2">
              {(['percent', 'fixed'] as const).map(m => (
                <button key={m} onClick={() => setCommMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm border font-medium ${
                    commMode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {m === 'percent' ? '% Porcentaje' : '€ Importe fijo'}
                </button>
              ))}
            </div>

            {commMode === 'percent' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Porcentaje sobre precio de venta</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" max="100" step="0.1"
                    value={commPct} onChange={e => setCommPct(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Ej: 1" autoFocus />
                  <span className="text-slate-500 text-sm">%</span>
                </div>
                {commPct && commModal.sale_price && (
                  <p className="text-xs text-slate-500 mt-1">
                    = <strong>{fmtEur(Math.round(commModal.sale_price * Number(commPct) / 100 * 100) / 100)}</strong>
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Importe a facturar (€)</label>
                <input type="number" min="0" step="10"
                  value={commFixed} onChange={e => setCommFixed(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ej: 200" autoFocus />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCommModal(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={createCommission} disabled={creatingComm || (commMode === 'percent' ? !commPct : !commFixed)}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
                {creatingComm ? 'Creando…' : 'Crear factura'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mark paid modal */}
      <Modal open={!!markModal} onClose={() => setMarkModal(null)} title="Actualizar estado de factura">
        {markModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{markModal.id}</strong> — {markModal.provider_name}<br />
              <span className="text-xs text-slate-400">{markModal.vehicle_title} · {fmtEur(markModal.invoice_amount)}</span>
            </p>
            <div className="flex gap-2">
              {(['paid', 'cancelled'] as const).map(s => (
                <button key={s} onClick={() => setMarkStatus(s)}
                  className={`px-4 py-2 rounded-lg text-sm border font-medium ${
                    markStatus === s
                      ? s === 'paid' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {s === 'paid' ? '✓ Cobrada' : '✗ Cancelar'}
                </button>
              ))}
            </div>
            <textarea value={markNotes} onChange={e => setMarkNotes(e.target.value)}
              rows={2} placeholder="Notas (opcional)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setMarkModal(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={handleMark} disabled={marking}
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-60 ${
                  markStatus === 'paid' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'
                }`}>
                {marking ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
