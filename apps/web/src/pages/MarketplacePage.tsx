import { useEffect, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Badge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { VoOffer } from '../types/index.js';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '–';
}
function fmtKm(n: number) { return n ? `${n.toLocaleString('es-ES')} km` : '–'; }

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'vo',     label: 'Marketplace CarsWise' },
  { key: 'offers', label: 'Ofertas de portales'   },
] as const;
type Tab = typeof TABS[number]['key'];

const STATUS_FILTERS = [
  { value: '',      label: 'Todos'         },
  { value: 'true',  label: 'Publicados'    },
  { value: 'false', label: 'Despublicados' },
];

const EXCEL_HEADERS = ['title','brand','model','year','price','mileage','fuel','power','color','location','seller','seller_type','image_urls','source_url','description','available_for_purchase','renting_available','renting_km_year','renting_12m','renting_24m','renting_36m','renting_48m','renting_60m'];

const EMPTY_FORM: Partial<VoOffer> = {
  title: '', brand: '', model: '', year: new Date().getFullYear(),
  price: 0, mileage: 0, fuel: '', power: '', displacement: 0,
  color: '', location: '', seller: '', seller_type: null, description: '',
  image_url: '', image_urls: [], source_url: '',
  warranty_months: 0, has_guarantee_seal: false, portal_score: 80, is_active: true,
  available_for_purchase: true, renting_available: false,
  renting_km_year: 15000,
  renting_12m: null, renting_24m: null, renting_36m: null, renting_48m: null, renting_60m: null,
};

const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
const LABEL_CLS = 'block text-xs font-medium text-slate-600 mb-1';
const FUELS = ['Gasolina','Diésel','Híbrido','Híbrido enchufable','Eléctrico','GLP','Gas Natural','Otros'];

// ── Excel helpers (xlsx) ──────────────────────────────────────────────────────

function xlsxDownload(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseXlsx(buffer: ArrayBuffer): Record<string, string>[] {
  const wb    = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
}

function exportXlsx(items: VoOffer[]) {
  const data = items.map((o) => ({
    title: o.title, brand: o.brand, model: o.model, year: o.year,
    price: o.price, mileage: o.mileage, fuel: o.fuel ?? '', power: o.power ?? '',
    color: o.color ?? '', location: o.location ?? '', seller: o.seller ?? '',
    seller_type: o.seller_type ?? '',
    image_urls: Array.isArray(o.image_urls) ? o.image_urls.join('|') : (o.image_url ?? ''),
    source_url: o.source_url ?? '', description: o.description ?? '',
    available_for_purchase: o.available_for_purchase !== false ? 1 : 0,
    renting_available: o.renting_available ? 1 : 0,
    renting_km_year: o.renting_km_year ?? 15000,
    renting_12m: o.renting_12m ?? '',
    renting_24m: o.renting_24m ?? '',
    renting_36m: o.renting_36m ?? '',
    renting_48m: o.renting_48m ?? '',
    renting_60m: o.renting_60m ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: EXCEL_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Marketplace VO');
  xlsxDownload(wb, `marketplace-vo-${Date.now()}.xlsx`);
}

function downloadTemplate() {
  const example = [{
    title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
    year: 2020, price: 14500, mileage: 85000, fuel: 'Diésel', power: '85 CV',
    color: 'Blanco', location: 'Madrid', seller: 'CarsWise', seller_type: 'professional',
    image_urls: 'https://example.com/foto1.jpg|https://example.com/foto2.jpg',
    source_url: '', description: 'Vehículo en excelente estado. Único propietario.',
    available_for_purchase: 1, renting_available: 1,
    renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
  }];
  const ws = XLSX.utils.json_to_sheet(example, { header: EXCEL_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  xlsxDownload(wb, 'plantilla-importacion-marketplace.xlsx');
}

// ── VehicleFormFields (standalone component) ──────────────────────────────────

interface FormFieldsProps {
  form: Partial<VoOffer>;
  setForm: React.Dispatch<React.SetStateAction<Partial<VoOffer>>>;
  idPrefix: string;
}

function VehicleFormFields({ form, setForm, idPrefix }: FormFieldsProps) {
  function onText(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }
  function onNum(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  }
  function onBool(key: keyof VoOffer) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.checked }));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Título *</label>
        <input className={INPUT_CLS} value={form.title ?? ''} onChange={onText('title')} placeholder="Volkswagen Golf 1.6 TDI Comfortline" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Marca *</label>
          <input className={INPUT_CLS} value={form.brand ?? ''} onChange={onText('brand')} placeholder="Volkswagen" />
        </div>
        <div>
          <label className={LABEL_CLS}>Modelo *</label>
          <input className={INPUT_CLS} value={form.model ?? ''} onChange={onText('model')} placeholder="Golf" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Año *</label>
          <input type="number" className={INPUT_CLS} value={form.year ?? ''} onChange={onNum('year')} />
        </div>
        <div>
          <label className={LABEL_CLS}>Precio (€) *</label>
          <input type="number" className={INPUT_CLS} value={form.price ?? ''} onChange={onNum('price')} />
        </div>
        <div>
          <label className={LABEL_CLS}>Kilómetros</label>
          <input type="number" className={INPUT_CLS} value={form.mileage ?? ''} onChange={onNum('mileage')} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Combustible</label>
          <select className={INPUT_CLS} value={form.fuel ?? ''} onChange={onText('fuel')}>
            <option value="">—</option>
            {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Potencia</label>
          <input className={INPUT_CLS} value={form.power ?? ''} onChange={onText('power')} placeholder="90 CV" />
        </div>
        <div>
          <label className={LABEL_CLS}>Cilindrada (cc)</label>
          <input type="number" className={INPUT_CLS} value={form.displacement ?? ''} onChange={onNum('displacement')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Color</label>
          <input className={INPUT_CLS} value={form.color ?? ''} onChange={onText('color')} placeholder="Blanco" />
        </div>
        <div>
          <label className={LABEL_CLS}>Ubicación</label>
          <input className={INPUT_CLS} value={form.location ?? ''} onChange={onText('location')} placeholder="Madrid" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Vendedor</label>
          <input className={INPUT_CLS} value={form.seller ?? ''} onChange={onText('seller')} placeholder="CarsWise" />
        </div>
        <div>
          <label className={LABEL_CLS}>Tipo de vendedor</label>
          <select className={INPUT_CLS} value={form.seller_type ?? ''} onChange={onText('seller_type')}>
            <option value="">Sin especificar</option>
            <option value="professional">Profesional</option>
            <option value="particular">Particular</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Fotos (hasta 10 URLs)</label>
        {(form.image_urls?.length ? form.image_urls : ['']).map((url, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-center">
            <input
              className={INPUT_CLS}
              value={url}
              onChange={(e) => {
                const next = [...(form.image_urls ?? [''])];
                next[idx] = e.target.value;
                setForm((f) => ({ ...f, image_urls: next, image_url: next[0] ?? '' }));
              }}
              placeholder={idx === 0 ? 'https://... (foto principal)' : `https://... (foto ${idx + 1})`}
            />
            {(form.image_urls?.length ?? 0) > 1 && (
              <button type="button" onClick={() => {
                const next = (form.image_urls ?? []).filter((_, i) => i !== idx);
                setForm((f) => ({ ...f, image_urls: next, image_url: next[0] ?? '' }));
              }} className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0">✕</button>
            )}
            {url && (
              <img src={url} alt="" className="w-14 h-10 object-cover rounded border border-slate-200 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
          </div>
        ))}
        {(form.image_urls?.length ?? 0) < 10 && (
          <button type="button"
            onClick={() => setForm((f) => ({ ...f, image_urls: [...(f.image_urls ?? ['']), ''] }))}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            + Añadir foto
          </button>
        )}
      </div>
      <div>
        <label className={LABEL_CLS}>URL del anuncio original</label>
        <input className={INPUT_CLS} value={form.source_url ?? ''} onChange={onText('source_url')} placeholder="https://..." />
      </div>
      <div>
        <label className={LABEL_CLS}>Descripción</label>
        <textarea className={`${INPUT_CLS} resize-none`} rows={3} value={form.description ?? ''} onChange={onText('description')} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Garantía (meses)</label>
          <input type="number" className={INPUT_CLS} value={form.warranty_months ?? 0} onChange={onNum('warranty_months')} min={0} />
        </div>
        <div>
          <label className={LABEL_CLS}>Puntuación portal</label>
          <input type="number" className={INPUT_CLS} value={form.portal_score ?? 80} onChange={onNum('portal_score')} min={0} max={100} />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" id={`${idPrefix}-gs`} checked={form.has_guarantee_seal ?? false} onChange={onBool('has_guarantee_seal')} className="rounded" />
          <label htmlFor={`${idPrefix}-gs`} className="text-sm text-slate-700">Sello garantía</label>
        </div>
      </div>
      {/* Modalidad */}
      <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Modalidad de venta</p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`${idPrefix}-purchase`} checked={form.available_for_purchase ?? true} onChange={onBool('available_for_purchase')} className="rounded" />
            <label htmlFor={`${idPrefix}-purchase`} className="text-sm font-medium text-slate-700">Disponible para compra</label>
          </div>
          {(form.available_for_purchase ?? true) && (
            <p className="ml-6 text-xs text-slate-400">El precio de compra se indica en el campo "Precio (€)" de arriba.</p>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`${idPrefix}-renting`} checked={form.renting_available ?? false} onChange={onBool('renting_available')} className="rounded" />
            <label htmlFor={`${idPrefix}-renting`} className="text-sm font-medium text-slate-700">Disponible para renting</label>
          </div>
          {form.renting_available && (
            <div className="ml-6 space-y-3">
              <div>
                <label className={LABEL_CLS}>Km/año incluidos</label>
                <input type="number" className={INPUT_CLS} value={form.renting_km_year ?? 15000} onChange={onNum('renting_km_year')} min={0} />
              </div>
              <p className="text-xs text-slate-400">Cuota mensual por plazo (dejar en blanco los plazos no disponibles)</p>
              <div className="grid grid-cols-5 gap-2">
                {([12,24,36,48,60] as const).map((m) => {
                  const key = `renting_${m}m` as keyof VoOffer;
                  return (
                    <div key={m}>
                      <label className={LABEL_CLS}>{m} meses (€/mes)</label>
                      <input type="number" className={INPUT_CLS} value={(form[key] as number | null | undefined) ?? ''}
                        onChange={onNum(key)} placeholder="—" min={0} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id={`${idPrefix}-active`} checked={form.is_active ?? true} onChange={onBool('is_active')} className="rounded" />
        <label htmlFor={`${idPrefix}-active`} className="text-sm font-medium text-slate-700">Publicado en marketplace</label>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PortalOffer = {
  id: string; portal: string; title: string; brand: string; model: string;
  year: number; price: number; mileage: number; fuel: string; image_url?: string; url?: string;
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [tab, setTab]             = useState<Tab>('vo');
  const [items, setItems]         = useState<VoOffer[]>([]);
  const [portalItems, setPortalItems] = useState<PortalOffer[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState('');
  const [brands, setBrands]       = useState<string[]>([]);
  const [brand, setBrand]         = useState('');
  const [statusFilter, setStatus] = useState('');
  const [loading, setLoading]     = useState(true);

  const [editOffer, setEditOffer] = useState<VoOffer | null>(null);
  const [editForm, setEditForm]   = useState<Partial<VoOffer>>({});
  const [saving, setSaving]       = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<VoOffer>>(EMPTY_FORM);
  const [creating, setCreating]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<VoOffer | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const [showImport, setShowImport]         = useState(false);
  const [importRows, setImportRows]         = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting]           = useState(false);
  const [importResult, setImportResult]     = useState<{ inserted: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<string[]>('/marketplace/brands').then((r) => { if (r.ok) setBrands(r.data); });
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    if (tab === 'vo') {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q)            params.set('q', q);
      if (brand)        params.set('brand', brand);
      if (statusFilter) params.set('is_active', statusFilter);
      const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
      if (res.ok) { setItems(res.data); setTotal(res.meta?.total ?? 0); }
    } else {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (q) params.set('q', q);
      const res = await api.get<PortalOffer[]>(`/marketplace/offers?${params}`);
      if (res.ok) { setPortalItems(res.data); setTotal(res.meta?.total ?? 0); }
    }
    setLoading(false);
  }, [tab, q, brand, statusFilter]);

  useEffect(() => { setPage(1); load(1); }, [tab, q, brand, statusFilter, load]);
  useEffect(() => { load(page); }, [page, load]);

  function openEdit(offer: VoOffer) { setEditOffer(offer); setEditForm({ ...offer }); }

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

  async function saveCreate() {
    setCreating(true);
    const res = await api.post('/marketplace/vo', createForm);
    if (res.ok) { setShowCreate(false); setCreateForm(EMPTY_FORM); setPage(1); load(1); }
    setCreating(false);
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await api.delete(`/marketplace/vo/${deleteTarget.id}`);
    if (res.ok) { setDeleteTarget(null); load(page); }
    setDeleting(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImportRows(parseXlsx(ev.target?.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  }

  async function doImport() {
    if (!importRows.length) return;
    setImporting(true);
    const res = await api.post<{ inserted: number; errors: number }>('/marketplace/vo/bulk', { rows: importRows });
    if (res.ok) {
      setImportResult(res.data);
      setImportRows([]); setImportFileName('');
      if (fileRef.current) fileRef.current.value = '';
      setPage(1); load(1);
    }
    setImporting(false);
  }

  async function doExport() {
    const params = new URLSearchParams({ limit: '2500', page: '1' });
    if (q)            params.set('q', q);
    if (brand)        params.set('brand', brand);
    if (statusFilter) params.set('is_active', statusFilter);
    const res = await api.get<VoOffer[]>(`/marketplace/vo?${params}`);
    if (res.ok) exportXlsx(res.data);
  }

  return (
    <div>
      <PageHeader
        title="Marketplace"
        subtitle={`${total.toLocaleString('es-ES')} vehículos`}
        actions={tab === 'vo' ? (
          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadTemplate}
              className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              📄 Plantilla Excel
            </button>
            <button onClick={() => { setShowImport(true); setImportResult(null); setImportRows([]); setImportFileName(''); }}
              className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              📥 Importar Excel
            </button>
            <button onClick={doExport}
              className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              📤 Exportar Excel
            </button>
            <button onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); }}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + Añadir vehículo
            </button>
          </div>
        ) : undefined}
      />

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
          <>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas las marcas</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : tab === 'vo' ? (
          items.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Sin resultados</div>
          ) : (
            <>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Vehículo</th><th>Precio</th><th>Km</th><th>Año</th><th>Combustible</th><th>Vendedor</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-14 h-10 object-cover rounded-md bg-slate-100 shrink-0" />
                          ) : (
                            <div className="w-14 h-10 bg-slate-100 rounded-md shrink-0 flex items-center justify-center text-slate-300 text-lg">🚗</div>
                          )}
                          <div>
                            <p className="font-medium text-slate-800 text-sm leading-snug">{item.title}</p>
                            <p className="text-xs text-slate-400">{item.brand} · {item.location || '–'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="font-semibold text-slate-800 text-sm">{fmtPrice(item.price)}</td>
                      <td className="text-sm text-slate-500">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-slate-500">{item.year}</td>
                      <td className="text-sm text-slate-500">{item.fuel || '–'}</td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-slate-600">{item.seller || '–'}</span>
                          {item.seller_type && (
                            <Badge variant={item.seller_type === 'professional' ? 'blue' : 'slate'}>
                              {item.seller_type === 'professional' ? 'Profesional' : 'Particular'}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <Badge variant={item.is_active ? 'green' : 'slate'}>
                            {item.is_active ? 'Publicado' : 'Despublicado'}
                          </Badge>
                          <div className="flex gap-1 flex-wrap">
                            {item.available_for_purchase !== false && <Badge variant="blue">Compra</Badge>}
                            {item.renting_available && <Badge variant="purple">Renting</Badge>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50">
                            Editar
                          </button>
                          <button onClick={() => toggleActive(item)}
                            className={`text-xs font-medium px-2 py-1 rounded ${item.is_active
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {item.is_active ? 'Despublicar' : 'Publicar'}
                          </button>
                          <button onClick={() => setDeleteTarget(item)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        ) : (
          portalItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Sin resultados</div>
          ) : (
            <>
              <table className="erp-table">
                <thead><tr><th>Vehículo</th><th>Portal</th><th>Precio</th><th>Km</th><th>Año</th><th>Combustible</th></tr></thead>
                <tbody>
                  {portalItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {item.image_url && <img src={item.image_url} alt="" className="w-12 h-9 object-cover rounded-md bg-slate-100 shrink-0" />}
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{item.title}</p>
                            <p className="text-xs text-slate-400">{item.brand} {item.model}</p>
                          </div>
                        </div>
                      </td>
                      <td><Badge variant="blue">{item.portal}</Badge></td>
                      <td className="font-semibold text-slate-800 text-sm">{fmtPrice(item.price)}</td>
                      <td className="text-sm text-slate-500">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-slate-500">{item.year}</td>
                      <td className="text-sm text-slate-500 capitalize">{item.fuel || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} total={total} limit={50} onChange={setPage} />
            </>
          )
        )}
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      <Modal open={!!editOffer} onClose={() => setEditOffer(null)} title="Editar vehículo" size="lg">
        {editOffer && (
          <>
            <VehicleFormFields form={editForm} setForm={setEditForm} idPrefix="edit" />
            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
              <button onClick={() => setEditOffer(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Create modal ────────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Añadir vehículo" size="lg">
        <VehicleFormFields form={createForm} setForm={setCreateForm} idPrefix="create" />
        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={saveCreate} disabled={creating || !createForm.title || !createForm.brand || !createForm.model}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {creating ? 'Creando…' : 'Crear vehículo'}
          </button>
        </div>
      </Modal>

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar vehículo" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ¿Seguro que quieres eliminar <strong>{deleteTarget.title}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={doDelete} disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Import CSV modal ────────────────────────────────────────────────── */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar vehículos desde Excel" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Descarga la plantilla, rellena los datos en Excel y sube el fichero .xlsx. Máximo 500 filas.
          </p>
          <button onClick={downloadTemplate}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            📄 Descargar plantilla Excel
          </button>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" id="xlsx-upload" />
            <label htmlFor="xlsx-upload" className="cursor-pointer block">
              <div className="text-3xl mb-2">📥</div>
              <p className="text-sm font-medium text-slate-700">
                {importFileName || 'Haz clic para seleccionar el fichero Excel'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Archivos .xlsx o .xls</p>
            </label>
          </div>

          {importRows.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-700 mb-2">{importRows.length} filas detectadas — vista previa:</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-slate-500">
                      {Object.keys(importRows[0]).slice(0, 6).map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {Object.values(row).slice(0, 6).map((v, j) => (
                          <td key={j} className="px-2 py-1 text-slate-600 max-w-[120px] truncate">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 3 && <p className="text-xs text-slate-400 mt-1">…y {importRows.length - 3} filas más</p>}
            </div>
          )}

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
              <p className="font-medium text-emerald-700">Importación completada</p>
              <p className="text-emerald-600">
                {importResult.inserted} vehículos importados
                {importResult.errors > 0 ? `, ${importResult.errors} errores` : ''}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cerrar
            </button>
            <button onClick={doImport} disabled={importing || importRows.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {importing ? 'Importando…' : `Importar ${importRows.length} vehículos`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
