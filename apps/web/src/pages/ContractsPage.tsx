import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';

interface Contract {
  id: string;
  type: 'compra' | 'renting';
  date: string;
  user_email: string;
  contact_name: string;
  vehicle_title: string;
  status: string;
  idcar_id: string | null;
  amount: number | null;
  monthly_price: number | null;
  duration_months: number | null;
  km_year: number | null;
  color: string | null;
  quantity: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface Stats {
  total_compras: number;
  total_rentings: number;
  rentings_activos: number;
  rentings_completados: number;
  mrr: number;
}

function fmtDate(s: string | null) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n == null) return '–';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

const TYPE_FILTER = ['all', 'compra', 'renting'] as const;
type TypeFilter = typeof TYPE_FILTER[number];

const STATUS_BADGE: Record<string, string> = {
  completada:  'bg-emerald-100 text-emerald-700',
  active:      'bg-blue-100 text-blue-700',
  completed:   'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  completada: 'Vendido', active: 'Activo', completed: 'Finalizado', cancelled: 'Cancelado',
};

export default function ContractsPage() {
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [loading, setLoading]       = useState(true);

  // Close renting contract modal
  const [closeModal, setCloseModal]           = useState<Contract | null>(null);
  const [closeStatus, setCloseStatus]         = useState<'completed' | 'cancelled'>('completed');
  const [closeNotes, setCloseNotes]           = useState('');
  const [closing, setClosing]                 = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    const res = await api.get<Contract[]>(`/contracts?${params}`);
    if (res.ok) {
      setContracts(res.data);
      setTotal(res.meta?.total ?? 0);
      if (res.meta?.stats) setStats(res.meta.stats as Stats);
    }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { setPage(1); }, [typeFilter]);
  useEffect(() => { load(page); }, [page, load]);

  async function handleCloseContract() {
    if (!closeModal) return;
    setClosing(true);
    const res = await api.patch(`/contracts/renting/${closeModal.id}`, { status: closeStatus, notes: closeNotes });
    if (res.ok) { setCloseModal(null); setCloseNotes(''); await load(page); }
    setClosing(false);
  }

  return (
    <div>
      <PageHeader title="Contratos" subtitle="Compras y rentings gestionados a través de CarsWise" />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Compras totales',      value: stats.total_compras,         color: 'text-emerald-700' },
            { label: 'Contratos renting',    value: stats.total_rentings,        color: 'text-blue-700' },
            { label: 'Rentings activos',     value: stats.rentings_activos,      color: 'text-blue-600' },
            { label: 'Rentings finalizados', value: stats.rentings_completados,  color: 'text-slate-500' },
            { label: 'MRR renting',          value: fmtEur(stats.mrr),          color: 'text-violet-700', isStr: true },
          ].map(({ label, value, color, isStr }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{isStr ? value : value.toLocaleString('es-ES')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {([['all', 'Todos'], ['compra', 'Compras'], ['renting', 'Rentings']] as [TypeFilter, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              typeFilter === val
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Sin contratos registrados aún</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Nº / ID</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Vehículo</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-xs text-slate-500">{c.id}</td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.date)}</td>
                      <td>
                        <p className="text-sm font-medium text-slate-800">{c.contact_name || '–'}</p>
                        <p className="text-xs text-slate-400">{c.user_email}</p>
                      </td>
                      <td className="text-sm text-slate-700 max-w-[180px] truncate">{c.vehicle_title || '–'}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          c.type === 'compra' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {c.type === 'compra' ? 'Compra' : 'Renting'}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {c.type === 'renting' ? (
                          <span>
                            {c.color}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''} · {c.duration_months}m
                            {c.km_year ? ` · ${(c.km_year / 1000).toFixed(0)}k km/año` : ''}
                            {c.end_date ? <><br />hasta {fmtDate(c.end_date)}</> : ''}
                          </span>
                        ) : '–'}
                      </td>
                      <td className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                        {c.type === 'renting' && c.monthly_price
                          ? <>{fmtEur(c.monthly_price)}<span className="text-xs font-normal text-slate-400">/mes</span></>
                          : '–'}
                      </td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[c.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </td>
                      <td>
                        {c.type === 'renting' && c.status === 'active' && (
                          <button onClick={() => setCloseModal(c)}
                            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50">
                            Cerrar contrato
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={50} onChange={setPage} />
          </>
        )}
      </div>

      {/* Close contract modal */}
      <Modal isOpen={!!closeModal} onClose={() => setCloseModal(null)} title="Cerrar contrato de renting">
        {closeModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{closeModal.vehicle_title}</strong> — {closeModal.contact_name}
              <br />
              <span className="text-xs text-slate-400">Contrato {closeModal.id} · Fin previsto {fmtDate(closeModal.end_date)}</span>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado final</label>
              <div className="flex gap-2">
                {(['completed', 'cancelled'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setCloseStatus(s)}
                    className={`px-4 py-2 rounded-lg text-sm border font-medium ${
                      closeStatus === s
                        ? s === 'completed' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}>
                    {s === 'completed' ? '✓ Finalizado (devuelto)' : '✗ Cancelado'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas (opcional)</label>
              <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
                rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ej: devolución sin incidencias, km finales 32.450…" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCloseModal(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={handleCloseContract} disabled={closing}
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-60 ${
                  closeStatus === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-500 hover:bg-red-600'
                }`}>
                {closing ? 'Guardando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
