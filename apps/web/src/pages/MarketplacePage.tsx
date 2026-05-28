import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Badge } from '../components/ui/Badge.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { VoOffer, VoUnit, UnitStatus } from '../types/index.js';

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

const EXCEL_HEADERS = ['title','brand','model','year','price','fuel','power','location','seller','seller_type','image_urls','source_url','description','available_for_purchase','renting_available','renting_km_year','renting_12m','renting_24m','renting_36m','renting_48m','renting_60m','unit_color','unit_mileage'];

const EMPTY_FORM: Partial<VoOffer> = {
  title: '', brand: '', model: '', version: '', transmission: '', year: new Date().getFullYear(),
  price: 0, sale_price: null, mileage: 0, fuel: '', power: '', displacement: 0,
  color: '', location: '', internal_location: '', seller: '', seller_type: null, description: '',
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
  // Three units of the same Golf (same offer, different colors/mileage)
  const example = [
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'CarsWise', seller_type: 'professional',
      image_urls: 'https://example.com/foto1.jpg|https://example.com/foto2.jpg',
      source_url: '', description: 'Vehículo en excelente estado.',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Blanco', unit_mileage: 9000,
    },
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'CarsWise', seller_type: 'professional',
      image_urls: '', source_url: '', description: '',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Negro', unit_mileage: 15000,
    },
    {
      title: 'Volkswagen Golf 1.6 TDI Comfortline', brand: 'Volkswagen', model: 'Golf',
      year: 2020, price: 14500, fuel: 'Diésel', power: '85 CV',
      location: 'Madrid', seller: 'CarsWise', seller_type: 'professional',
      image_urls: '', source_url: '', description: '',
      available_for_purchase: 0, renting_available: 1,
      renting_km_year: 15000, renting_12m: '', renting_24m: '', renting_36m: 350, renting_48m: 299, renting_60m: 269,
      unit_color: 'Blanco', unit_mileage: 18500,
    },
  ];
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Marca *</label>
          <input className={INPUT_CLS} value={form.brand ?? ''} onChange={onText('brand')} placeholder="Volkswagen" />
        </div>
        <div>
          <label className={LABEL_CLS}>Modelo *</label>
          <input className={INPUT_CLS} value={form.model ?? ''} onChange={onText('model')} placeholder="Golf" />
        </div>
        <div>
          <label className={LABEL_CLS}>Versión</label>
          <input className={INPUT_CLS} value={form.version ?? ''} onChange={onText('version')} placeholder="1.6 TDI Comfortline" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={LABEL_CLS}>Año *</label>
          <input type="number" className={INPUT_CLS} value={form.year ?? ''} onChange={onNum('year')} />
        </div>
        <div>
          <label className={LABEL_CLS}>P. Compra (€) *</label>
          <input type="number" className={INPUT_CLS} value={form.price ?? ''} onChange={onNum('price')} />
        </div>
        <div>
          <label className={LABEL_CLS}>P. Venta (€)</label>
          <input type="number" className={INPUT_CLS} value={(form.sale_price as number | null | undefined) ?? ''} onChange={onNum('sale_price')} placeholder={form.price ? String(Math.round((Number(form.price) + 1250) * 100) / 100) : '—'} />
        </div>
        <div>
          <label className={LABEL_CLS}>Kilómetros</label>
          <input type="number" className={INPUT_CLS} value={form.mileage ?? ''} onChange={onNum('mileage')} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className={LABEL_CLS}>Combustible</label>
          <select className={INPUT_CLS} value={form.fuel ?? ''} onChange={onText('fuel')}>
            <option value="">—</option>
            {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Transmisión</label>
          <select className={INPUT_CLS} value={form.transmission ?? ''} onChange={onText('transmission')}>
            <option value="">—</option>
            <option value="Manual">Manual</option>
            <option value="Automático">Automático</option>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={LABEL_CLS}>Color</label>
          <input className={INPUT_CLS} value={form.color ?? ''} onChange={onText('color')} placeholder="Blanco" />
        </div>
        <div>
          <label className={LABEL_CLS}>Ubicación (display)</label>
          <input className={INPUT_CLS} value={form.location ?? ''} onChange={onText('location')} placeholder="Madrid" />
        </div>
        <div>
          <label className={LABEL_CLS}>Campa / Código interno</label>
          <input className={INPUT_CLS} value={form.internal_location ?? ''} onChange={onText('internal_location')} placeholder="CARPIO" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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

  const [sortCol, setSortCol]   = useState<string>('');
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('asc');
  const [colF, setColF] = useState({ brand: '', model: '', fuel: '', transmission: '', modality: '', year: '', priceMax: '', color: '', seller: '', units: '', noImage: '' });

  function toggleSort(col: string) {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir('asc'); return col;
    });
  }
  function setCol(key: keyof typeof colF, val: string) { setColF((f) => ({ ...f, [key]: val })); }

  const displayItems = useMemo(() => {
    let r = [...items];
    if (colF.brand)     r = r.filter(i => (i.brand || '').toLowerCase() === colF.brand.toLowerCase());
    if (colF.model)     r = r.filter(i => (i.model || '').toLowerCase().includes(colF.model.toLowerCase()));
    if (colF.fuel)         r = r.filter(i => (i.fuel || '') === colF.fuel);
    if (colF.transmission) r = r.filter(i => (i.transmission || '').toLowerCase().includes(colF.transmission.toLowerCase()));
    if (colF.year)      r = r.filter(i => String(i.year) === colF.year);
    if (colF.priceMax)  r = r.filter(i => i.price <= Number(colF.priceMax));
    if (colF.color)     r = r.filter(i => i.available_colors?.includes(colF.color) || (i.color || '') === colF.color);
    if (colF.seller)    r = r.filter(i => (i.seller || '') === colF.seller);
    if (colF.units === 'stock') r = r.filter(i => (i.units_available ?? 0) > 0);
    if (colF.modality === 'compra')   r = r.filter(i => i.available_for_purchase !== false);
    if (colF.modality === 'renting')  r = r.filter(i => i.renting_available);
    if (colF.modality === 'both')     r = r.filter(i => i.available_for_purchase !== false && i.renting_available);
    if (colF.noImage) r = r.filter(i => !i.image_url && !(i.image_urls?.length));
    if (sortCol) {
      r.sort((a, b) => {
        const av = (a as unknown as Record<string,unknown>)[sortCol] ?? '';
        const bv = (b as unknown as Record<string,unknown>)[sortCol] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'es');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [items, colF, sortCol, sortDir]);

  const brandOptions  = useMemo(() => [...new Set(items.map(i => i.brand).filter(Boolean))].sort(), [items]);
  const fuelOptions   = useMemo(() => [...new Set(items.map(i => i.fuel).filter(Boolean))].sort(), [items]);
  const yearOptions   = useMemo(() => [...new Set(items.map(i => i.year).filter(Boolean))].sort((a,b) => (b??0)-(a??0)), [items]);
  const colorOptions  = useMemo(() => [...new Set(items.flatMap(i => i.available_colors ?? []).filter(Boolean))].sort(), [items]);
  const sellerOptions = useMemo(() => [...new Set(items.map(i => i.seller).filter(Boolean))].sort(), [items]);

  const [editOffer, setEditOffer] = useState<VoOffer | null>(null);
  const [editForm, setEditForm]   = useState<Partial<VoOffer>>({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [units, setUnits]           = useState<VoUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [newUnit, setNewUnit]       = useState({ color: '', mileage: '' });
  const [addingUnit, setAddingUnit] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<VoOffer>>(EMPTY_FORM);
  const [creating, setCreating]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<VoOffer | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const [imageEditOffer, setImageEditOffer] = useState<VoOffer | null>(null);
  const [imageUrls, setImageUrls]           = useState<string[]>(['']);
  const [savingImages, setSavingImages]     = useState(false);

  const [showImport, setShowImport]         = useState(false);
  const [importRows, setImportRows]         = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting]           = useState(false);
  const [importResult, setImportResult]     = useState<{ offers_created?: number; offers_updated?: number; units_added?: number; inserted?: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<string[]>('/marketplace/brands').then((r) => { if (r.ok) setBrands(r.data); });
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    if (tab === 'vo') {
      const params = new URLSearchParams({ page: String(p), limit: '500' });
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

  async function openEdit(offer: VoOffer) {
    setEditOffer(offer);
    setEditForm({ ...offer });
    setUnits([]);
    setNewUnit({ color: '', mileage: '' });
    setLoadingUnits(true);
    const res = await api.get<VoUnit[]>(`/marketplace/vo/${offer.id}/units`);
    if (res.ok) setUnits(res.data);
    setLoadingUnits(false);
  }

  async function addUnit() {
    if (!editOffer || !newUnit.color || !newUnit.mileage) return;
    setAddingUnit(true);
    const res = await api.post<VoUnit>(`/marketplace/vo/${editOffer.id}/units`, {
      color: newUnit.color, mileage: Number(newUnit.mileage),
    });
    if (res.ok) { setUnits((u) => [...u, res.data]); setNewUnit({ color: '', mileage: '' }); }
    setAddingUnit(false);
  }

  async function changeUnitStatus(unitId: string, status: UnitStatus) {
    const res = await api.patch<VoUnit>(`/marketplace/vo/units/${unitId}`, { status });
    if (res.ok) setUnits((u) => u.map((x) => x.id === unitId ? res.data : x));
  }

  async function deleteUnit(unitId: string) {
    const res = await api.delete(`/marketplace/vo/units/${unitId}`);
    if (res.ok) setUnits((u) => u.filter((x) => x.id !== unitId));
  }

  async function saveEdit() {
    if (!editOffer) return;
    setSaving(true);
    setSaveError('');
    const ALLOWED = new Set(['title','brand','model','version','transmission','year','price','sale_price','mileage','fuel','power',
      'displacement','color','location','internal_location','seller','description','image_url','source_url',
      'warranty_months','has_guarantee_seal','portal_score','is_active','seller_type',
      'available_for_purchase','renting_available','renting_km_year',
      'renting_12m','renting_24m','renting_36m','renting_48m','renting_60m','image_urls']);
    const NUMERIC = new Set(['year','price','sale_price','mileage','displacement','warranty_months','portal_score',
      'renting_km_year','renting_12m','renting_24m','renting_36m','renting_48m','renting_60m']);
    const payload = Object.fromEntries(
      Object.entries(editForm)
        .filter(([k]) => ALLOWED.has(k))
        .map(([k, v]) => {
          if (NUMERIC.has(k)) {
            // null/empty numeric = send null (clears the field); NaN values are dropped
            if (v === null || v === undefined || v === '') return [k, null];
            const n = Number(v);
            return [k, Number.isNaN(n) ? undefined : n];
          }
          return [k, v ?? null]; // undefined → null for string/bool fields
        })
        .filter(([, v]) => v !== undefined)
    );
    const res = await api.patch<{ detail?: unknown }>(`/marketplace/vo/${editOffer.id}`, payload);
    if (res.ok) { setEditOffer(null); load(page); }
    else setSaveError(JSON.stringify((res as { detail?: unknown }).detail ?? res, null, 2));
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

  async function saveImages() {
    if (!imageEditOffer) return;
    setSavingImages(true);
    const cleanUrls = imageUrls.filter(u => u.trim());
    const res = await api.patch(`/marketplace/vo/${imageEditOffer.id}`, { image_urls: cleanUrls });
    if (res.ok) { setImageEditOffer(null); load(page); }
    setSavingImages(false);
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
    const res = await api.post<{ offers_created: number; offers_updated: number; units_added: number; errors: number }>(
      '/marketplace/vo/bulk-with-units', { rows: importRows }
    );
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
              {/* Active column filters summary */}
              {Object.values(colF).some(Boolean) && (
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap bg-blue-50">
                  <span className="text-xs text-blue-600 font-medium">{displayItems.length} de {items.length} resultados</span>
                  <button onClick={() => setColF({ brand:'', model:'', fuel:'', transmission:'', modality:'', year:'', priceMax:'', color:'', seller:'', units:'', noImage:'' })}
                    className="text-xs text-blue-500 hover:text-blue-700 underline">Limpiar filtros de columna</button>
                </div>
              )}
              <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead>
                  {/* ── Row 1: sortable labels ── */}
                  <tr>
                    {([
                      { key: 'title',   label: 'Vehículo'    },
                      { key: 'brand',   label: 'Marca'       },
                      { key: 'model',   label: 'Modelo'      },
                      { key: 'price',   label: 'P. Compra'   },
                      { key: 'sale_price', label: 'P. Venta' },
                      { key: 'mileage', label: 'Km'          },
                      { key: 'year',    label: 'Año'         },
                      { key: 'fuel',         label: 'Combustible'  },
                      { key: 'transmission', label: 'Cambio'       },
                      { key: 'modalidad',    label: 'Modalidad'    },
                      { key: 'units_available', label: 'Unidades' },
                      { key: 'seller',  label: 'Vendedor'    },
                      { key: 'is_active', label: 'Estado'    },
                    ] as const).map(({ key, label }) => (
                      <th key={key} onClick={() => toggleSort(key)}
                        className="cursor-pointer select-none whitespace-nowrap group">
                        <span className="flex items-center gap-1">
                          {label}
                          <span className={`text-xs transition-colors ${sortCol === key ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`}>
                            {sortCol === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th></th>
                  </tr>
                  {/* ── Row 2: column filters ── */}
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {/* Vehículo */}
                    <td className="px-3 py-1.5">
                      <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={!!colF.noImage}
                          onChange={e => setCol('noImage', e.target.checked ? 'yes' : '')} />
                        Sin imagen
                      </label>
                    </td>
                    {/* Marca */}
                    <td className="px-3 py-1.5">
                      <select value={colF.brand} onChange={e => setCol('brand', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todas</option>
                        {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </td>
                    {/* Modelo */}
                    <td className="px-3 py-1.5">
                      <input value={colF.model} onChange={e => setCol('model', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
                        placeholder="Modelo…" />
                    </td>
                    {/* P. Compra */}
                    <td className="px-3 py-1.5">
                      <select value={colF.priceMax} onChange={e => setCol('priceMax', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Cualquier precio</option>
                        {[15000,20000,25000,30000,40000,60000].map(p =>
                          <option key={p} value={p}>≤ {p.toLocaleString('es-ES')} €</option>)}
                      </select>
                    </td>
                    {/* P. Venta */}
                    <td className="px-3 py-1.5"></td>
                    {/* Km */}
                    <td className="px-3 py-1.5"></td>
                    {/* Año */}
                    <td className="px-3 py-1.5">
                      <select value={colF.year} onChange={e => setCol('year', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </td>
                    {/* Combustible */}
                    <td className="px-3 py-1.5">
                      <select value={colF.fuel} onChange={e => setCol('fuel', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        {fuelOptions.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    {/* Cambio */}
                    <td className="px-3 py-1.5">
                      <select value={colF.transmission} onChange={e => setCol('transmission', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="manual">Manual</option>
                        <option value="auto">Automático</option>
                      </select>
                    </td>
                    {/* Modalidad */}
                    <td className="px-3 py-1.5">
                      <select value={colF.modality} onChange={e => setCol('modality', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        <option value="compra">Solo compra</option>
                        <option value="renting">Solo renting</option>
                        <option value="both">Compra + Renting</option>
                      </select>
                    </td>
                    {/* Unidades */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <select value={colF.color} onChange={e => setCol('color', e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                          <option value="">Todos colores</option>
                          {colorOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
                          <input type="checkbox" checked={colF.units === 'stock'}
                            onChange={e => setCol('units', e.target.checked ? 'stock' : '')} />
                          Stock
                        </label>
                      </div>
                    </td>
                    {/* Vendedor */}
                    <td className="px-3 py-1.5">
                      <select value={colF.seller} onChange={e => setCol('seller', e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white">
                        <option value="">Todos</option>
                        {sellerOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {/* Estado */}
                    <td className="px-3 py-1.5"></td>
                    <td></td>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {(item.image_url || item.image_urls?.[0]) ? (
                            <img src={item.image_url || item.image_urls?.[0]} alt="" referrerPolicy="no-referrer" className="w-14 h-10 object-cover rounded-md bg-slate-100 shrink-0" />
                          ) : (
                            <div className="w-14 h-10 bg-slate-100 rounded-md shrink-0 flex items-center justify-center text-slate-300 text-lg">🚗</div>
                          )}
                          <div>
                            <p className="font-medium text-slate-800 text-sm leading-snug">{item.title}</p>
                            <p className="text-xs text-slate-400">{item.location || '–'}</p>
                            {item.internal_location && (
                              <p className="text-[10px] font-mono text-slate-300 leading-tight">{item.internal_location}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm font-medium text-slate-700 whitespace-nowrap">{item.brand}</td>
                      <td>
                        <p className="text-sm text-slate-500">{item.model}</p>
                        {item.version && <p className="text-[11px] text-slate-400 leading-tight">{item.version}</p>}
                      </td>
                      <td className="font-semibold text-slate-800 text-sm">{fmtPrice(item.price)}</td>
                      <td className="font-semibold text-emerald-700 text-sm">{item.sale_price != null ? fmtPrice(item.sale_price) : '—'}</td>
                      <td className="text-sm text-slate-500">{fmtKm(item.mileage)}</td>
                      <td className="text-sm text-slate-500">{item.year}</td>
                      <td className="text-sm text-slate-500">{item.fuel || '–'}</td>
                      <td className="text-sm text-slate-500">{item.transmission || '–'}</td>
                      {/* Modalidad — columna separada */}
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {item.available_for_purchase !== false && <Badge variant="blue">Compra</Badge>}
                          {item.renting_available && <Badge variant="purple">Renting</Badge>}
                        </div>
                      </td>
                      {/* Unidades */}
                      <td>
                        {item.has_stock_management ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-xs font-semibold ${(item.units_available ?? 0) > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                              {item.units_available ?? 0} disp. / {item.total_units ?? 0}
                            </span>
                            {item.available_colors?.length ? (
                              <span className="text-[10px] text-slate-400 leading-tight">{item.available_colors.join(', ')}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">1</span>
                        )}
                      </td>
                      {/* Vendedor */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-slate-600">{item.seller || '–'}</span>
                          {item.seller_type && (
                            <Badge variant={item.seller_type === 'professional' ? 'blue' : 'slate'}>
                              {item.seller_type === 'professional' ? 'Profesional' : 'Particular'}
                            </Badge>
                          )}
                          {item.id.startsWith('idcar-') && (
                            <Badge variant="orange">IDCar cliente</Badge>
                          )}
                        </div>
                      </td>
                      {/* Estado */}
                      <td>
                        <Badge variant={item.is_active ? 'green' : 'slate'}>
                          {item.is_active ? 'Publicado' : 'Despublicado'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1 items-center">
                          <button onClick={() => openEdit(item)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50">
                            Editar
                          </button>
                          <button
                            onClick={() => { setImageEditOffer(item); setImageUrls(item.image_urls?.length ? item.image_urls : ['']); }}
                            title="Editar imágenes"
                            className={`text-xs font-medium px-2 py-1 rounded ${!item.image_url && !(item.image_urls?.length) ? 'text-orange-500 hover:bg-orange-50' : 'text-violet-500 hover:bg-violet-50'}`}>
                            🖼️
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
              </div>
              {displayItems.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">Sin resultados con los filtros actuales</div>
              )}
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

            {/* Units panel */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Unidades en stock
                {units.length > 0 && (
                  <span className="ml-2 font-normal normal-case text-slate-400">
                    {units.filter(u => u.status === 'available').length} disponibles · {units.length} total
                  </span>
                )}
              </p>

              {loadingUnits ? (
                <p className="text-sm text-slate-400">Cargando unidades…</p>
              ) : (
                <>
                  {units.length > 0 && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="text-left p-2 font-medium text-slate-500">Color</th>
                            <th className="text-left p-2 font-medium text-slate-500">Km</th>
                            <th className="text-left p-2 font-medium text-slate-500">Estado</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {units.map((u) => {
                            const statusMap: Record<UnitStatus, { label: string; variant: 'green'|'blue'|'purple'|'slate' }> = {
                              available: { label: 'Disponible', variant: 'green' },
                              reserved:  { label: 'Reservada',  variant: 'blue'  },
                              rented:    { label: 'Rentada',    variant: 'purple'},
                              returned:  { label: 'Devuelta',   variant: 'slate' },
                            };
                            const s = statusMap[u.status] ?? statusMap.available;
                            return (
                              <tr key={u.id} className="border-t border-slate-100">
                                <td className="p-2 font-medium text-slate-700">{u.color || '—'}</td>
                                <td className="p-2 text-slate-500">{u.mileage.toLocaleString('es-ES')} km</td>
                                <td className="p-2"><Badge variant={s.variant}>{s.label}</Badge></td>
                                <td className="p-2">
                                  <div className="flex gap-1 flex-wrap justify-end">
                                    {u.status !== 'available' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'available')}
                                        className="text-xs text-emerald-600 hover:bg-emerald-50 px-1.5 py-0.5 rounded">Liberar</button>
                                    )}
                                    {u.status === 'available' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'reserved')}
                                        className="text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded">Reservar</button>
                                    )}
                                    {u.status === 'reserved' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'rented')}
                                        className="text-xs text-purple-600 hover:bg-purple-50 px-1.5 py-0.5 rounded">Rentar</button>
                                    )}
                                    {u.status === 'rented' && (
                                      <button onClick={() => changeUnitStatus(u.id, 'returned')}
                                        className="text-xs text-slate-600 hover:bg-slate-50 px-1.5 py-0.5 rounded">Devolver</button>
                                    )}
                                    <button onClick={() => deleteUnit(u.id)}
                                      className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">✕</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add unit row */}
                  <div className="flex gap-2 items-end">
                    <div>
                      <label className={LABEL_CLS}>Color</label>
                      <input className={INPUT_CLS} style={{ width: 120 }} value={newUnit.color}
                        onChange={(e) => setNewUnit((n) => ({ ...n, color: e.target.value }))}
                        placeholder="Blanco" />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Kilómetros</label>
                      <input type="number" className={INPUT_CLS} style={{ width: 110 }} value={newUnit.mileage}
                        onChange={(e) => setNewUnit((n) => ({ ...n, mileage: e.target.value }))}
                        placeholder="15000" min={0} />
                    </div>
                    <button onClick={addUnit} disabled={addingUnit || !newUnit.color || !newUnit.mileage}
                      className="px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 shrink-0">
                      {addingUnit ? '…' : '+ Añadir unidad'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {saveError && (
              <pre className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-40">{saveError}</pre>
            )}
            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-100">
              <button onClick={() => setEditOffer(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cerrar
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

      {/* ── Image edit modal ────────────────────────────────────────────────── */}
      <Modal open={!!imageEditOffer} onClose={() => setImageEditOffer(null)} title="Editar imágenes" size="md">
        {imageEditOffer && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">{imageEditOffer.title}</p>
            <div className="space-y-2">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    className={INPUT_CLS}
                    value={url}
                    onChange={(e) => { const next = [...imageUrls]; next[idx] = e.target.value; setImageUrls(next); }}
                    placeholder={idx === 0 ? 'https://... (foto principal)' : `https://... (foto ${idx + 1})`}
                  />
                  {imageUrls.length > 1 && (
                    <button type="button" onClick={() => setImageUrls(imageUrls.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0">✕</button>
                  )}
                  {url && (
                    <img src={url} alt="" referrerPolicy="no-referrer"
                      className="w-14 h-10 object-cover rounded border border-slate-200 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                </div>
              ))}
            </div>
            {imageUrls.length < 10 && (
              <button type="button" onClick={() => setImageUrls([...imageUrls, ''])}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                + Añadir foto
              </button>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => setImageEditOffer(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveImages} disabled={savingImages}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {savingImages ? 'Guardando…' : 'Guardar imágenes'}
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
                {importResult.offers_created !== undefined ? (
                  <>
                    {importResult.offers_created} ofertas creadas · {importResult.offers_updated} actualizadas · {importResult.units_added} unidades añadidas
                    {importResult.errors > 0 ? ` · ${importResult.errors} errores` : ''}
                  </>
                ) : (
                  <>{importResult.inserted} importados{importResult.errors > 0 ? ` · ${importResult.errors} errores` : ''}</>
                )}
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
