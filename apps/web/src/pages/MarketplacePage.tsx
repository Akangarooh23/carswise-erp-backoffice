import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { StatusBadge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { VoOffer } from '../types/index.js';

function fmtPrice(n: number) {
  return n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '–';
}
function fmtKm(n: number) { return n ? `${n.toLocaleString('es-ES')} km` : '–'; }

const TABS = [
  { key: 'vo',     label: 'Marketplace CarsWise' },
  { key: 'offers', label: 'Ofertas de portales'   },
] as const;
type Tab = typeof TABS[number]['key'];

export default function MarketplacePage() {
  const [tab, setTab]         = useState<Tab>('vo');
  const [items, setItems]     = useState<VoOffer[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [brands, setBrands]   = useState<string[]>([]);
  const [brand, setBrand]     = useState('');
  const [loading, setLoading] = useState(true);
  const [editOffer, setEditOffer]   = useState<VoOffer | null>(null);
  const [editForm, setEditForm]     = useState<Partial<VoOffer>>({});
  const [saving, setSaving]         = useState(false);

  // Load brands once
  useEffect(() => {
    api.get<string[]>('/marketplace/brands').then((r) => { if (r.ok) setBrands(r.data); });
  }, []);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q)     params.set('q', q);
    if (brand) params.set('brand', brand);
    const endpoint = tab === 'vo' ? `/marketplace/vo?${params}` : `/marketplace/offers?${params}`;
    const res = await api.get<VoOffer[]>(endpoint);
    if (res.ok) { setItems(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [tab, q, brand, page]);

  useEffect(() => { setPage(1); }, [tab, q, brand]);
  useEffect(() => { load(page); }, [page, load]);

  function openEdit(offer: VoOffer) {
    setEditOffer(offer);
    setEditForm({ price: offer.price, km: offer.km, color: offer.color, is_active: offer.is_active });
  }

  async function saveEdit() {
    if (!editOffer) return;
    setSaving(true);
    const res = await api.patch(`/marketplace/vo/${editOffer.id}`, editForm);
    if (res.ok) { setEditOffer(null); load(page); }
    setSaving(false);
  }

  async function toggleActive(offer: VoOffer) {
    await api.patch(`/marketplace/vo/${offer.id}`, { is_active: !offer.is_active });
    load(page);
  }

  return (
    <div>
      <PageHeader title="Marketplace" subtitle={`${total.toLocaleString('es-ES')} vehículos`} />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar marca, modelo…" className="w-72" />
        {tab === 'vo' && (
          <select value={brand} onChange={(e) => setBrand(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las marcas</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Sin resultados</div>
        ) : (
          <>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Vehículo</th>
                  <th>Precio</th>
                  <th>Km</th>
                  <th>Año</th>
                  <th>Combustible</th>
                  <th>Estado</th>
                  {tab === 'vo' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {item.image_url && (
                          <img src={item.image_url} alt="" className="w-12 h-9 object-cover rounded-md bg-slate-100 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{item.title}</p>
                          <p className="text-xs text-slate-400">{item.brand} {item.model}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-semibold text-slate-800 text-sm">{fmtPrice(item.price)}</td>
                    <td className="text-sm text-slate-500">{fmtKm(item.km)}</td>
                    <td className="text-sm text-slate-500">{item.year}</td>
                    <td className="text-sm text-slate-500 capitalize">{item.fuel_type || '–'}</td>
                    <td><StatusBadge status={item.is_active ? 'active' : 'blocked'} /></td>
                    {tab === 'vo' && (
                      <td>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                            Editar
                          </button>
                          <button onClick={() => toggleActive(item)}
                            className="text-xs text-slate-400 hover:text-slate-600">
                            {item.is_active ? 'Retirar' : 'Publicar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} total={total} limit={50} onChange={setPage} />
          </>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={!!editOffer} onClose={() => setEditOffer(null)} title="Editar oferta">
        {editOffer && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">{editOffer.title}</p>
              <p className="text-xs text-slate-400">{editOffer.brand} {editOffer.model} · {editOffer.year}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Precio (€)</label>
                <input type="number" value={editForm.price ?? ''} onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kilometraje</label>
                <input type="number" value={editForm.km ?? ''} onChange={(e) => setEditForm({ ...editForm, km: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                <input type="text" value={editForm.color ?? ''} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="is_active" checked={editForm.is_active ?? true} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded" />
                <label htmlFor="is_active" className="text-sm text-slate-700">Publicado</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditOffer(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
