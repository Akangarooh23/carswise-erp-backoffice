import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { Modal } from '../components/ui/Modal.js';
import type { WorkshopLocation } from '../types/index.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PARTNER_OPTIONS = ['independent', 'norauto', 'midas', 'carglass', 'euromaster', 'kwik_fit'];
const PARTNER_LABELS: Record<string, string> = {
  independent: 'Independiente', norauto: 'Norauto', midas: 'Midas',
  carglass: 'Carglass', euromaster: 'Euromaster', kwik_fit: 'Kwik-Fit',
};
const PARTNER_COLORS: Record<string, string> = {
  norauto: 'bg-orange-100 text-orange-700', midas: 'bg-yellow-100 text-yellow-700',
  carglass: 'bg-blue-100 text-blue-700', euromaster: 'bg-green-100 text-green-700',
  kwik_fit: 'bg-purple-100 text-purple-700', independent: 'bg-slate-100 text-slate-600',
};
const SOURCE_OPTIONS = ['osm', 'google', 'gencat', 'xunta', 'jcyl', 'here'];

// ── Business hours helpers ─────────────────────────────────────────────────────

interface HoursDay { closed: boolean; morning: string; afternoon: string; }
interface StructuredHours { lv: HoursDay; sab: HoursDay; dom: HoursDay; }

const DEFAULT_HOURS: StructuredHours = {
  lv:  { closed: false, morning: '09:00-14:00', afternoon: '16:00-20:00' },
  sab: { closed: false, morning: '09:00-14:00', afternoon: '' },
  dom: { closed: true,  morning: '', afternoon: '' },
};

function formatStructuredHours(h: StructuredHours): string {
  const fmtDay = (d: HoursDay) => {
    if (d.closed) return 'Cerrado';
    const parts = [d.morning, d.afternoon].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Cerrado';
  };
  return `L-V: ${fmtDay(h.lv)} | Sáb: ${fmtDay(h.sab)} | Dom: ${fmtDay(h.dom)}`;
}

function tryParseStructuredHours(text: string | null | undefined): StructuredHours | null {
  if (!text) return null;
  const lvMatch  = text.match(/L-V:\s*([^|]+)/i);
  const sabMatch = text.match(/Sáb[^:]*:\s*([^|]+)/i);
  const domMatch = text.match(/Dom[^:]*:\s*([^|]+)/i);
  if (!lvMatch && !sabMatch && !domMatch) return null;
  function parseSegment(raw: string): HoursDay {
    const t = raw.trim();
    if (/cerrado/i.test(t)) return { closed: true, morning: '', afternoon: '' };
    const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
    return { closed: false, morning: parts[0] ?? '', afternoon: parts[1] ?? '' };
  }
  return {
    lv:  lvMatch  ? parseSegment(lvMatch[1])  : { ...DEFAULT_HOURS.lv },
    sab: sabMatch ? parseSegment(sabMatch[1]) : { ...DEFAULT_HOURS.sab },
    dom: domMatch ? parseSegment(domMatch[1]) : { ...DEFAULT_HOURS.dom },
  };
}

// ── Edit form ─────────────────────────────────────────────────────────────────

interface EditForm {
  name: string; address: string; city: string; postcode: string; province: string;
  lat: string; lon: string; phone: string; website: string; partner: string;
  is_active: boolean; service_types: string;
  hours: StructuredHours; hoursFreeMode: boolean; hoursFreeText: string;
}

function workshopToForm(w: WorkshopLocation): EditForm {
  const structured = tryParseStructuredHours(w.business_hours);
  return {
    name: w.name ?? '', address: w.address ?? '', city: w.city ?? '',
    postcode: w.postcode ?? '', province: w.province ?? '',
    lat: w.lat != null ? String(w.lat) : '', lon: w.lon != null ? String(w.lon) : '',
    phone: w.phone ?? '', website: w.website ?? '', partner: w.partner ?? 'independent',
    is_active: w.is_active,
    service_types: Array.isArray(w.service_types) ? w.service_types.join(', ') : '',
    hours: structured ?? { ...DEFAULT_HOURS },
    hoursFreeMode: !structured && Boolean(w.business_hours),
    hoursFreeText: !structured ? (w.business_hours ?? '') : '',
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const fi = 'w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0';
const sel = fi + ' cursor-pointer';

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkshopsPage() {
  // List state
  const [items, setItems]   = useState<WorkshopLocation[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);

  // Per-column filters
  const [filterId,       setFilterId]       = useState('');
  const [filterSource,   setFilterSource]   = useState('');
  const [filterPartner,  setFilterPartner]  = useState('');
  const [filterName,     setFilterName]     = useState('');
  const [filterAddress,  setFilterAddress]  = useState('');
  const [filterCity,     setFilterCity]     = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterPostcode, setFilterPostcode] = useState('');
  const [filterPhone,    setFilterPhone]    = useState(''); // '' | 'yes' | 'no'
  const [filterWeb,      setFilterWeb]      = useState(''); // '' | 'yes' | 'no'
  const [filterHours,    setFilterHours]    = useState(''); // '' | 'yes' | 'no'
  const [filterActive,   setFilterActive]   = useState('');

  // Edit modal
  const [selected,   setSelected]   = useState<WorkshopLocation | null>(null);
  const [form,       setForm]       = useState<EditForm | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState('');

  const hasAnyFilter = filterId || filterSource || filterPartner || filterName ||
    filterAddress || filterCity || filterProvince || filterPostcode ||
    filterPhone || filterWeb || filterHours || filterActive;

  function clearFilters() {
    setFilterId(''); setFilterSource(''); setFilterPartner(''); setFilterName('');
    setFilterAddress(''); setFilterCity(''); setFilterProvince(''); setFilterPostcode('');
    setFilterPhone(''); setFilterWeb(''); setFilterHours(''); setFilterActive('');
  }

  // Data loading
  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (filterId)       params.set('id',        filterId);
    if (filterSource)   params.set('source',    filterSource);
    if (filterPartner)  params.set('partner',   filterPartner);
    if (filterName)     params.set('name',      filterName);
    if (filterAddress)  params.set('address',   filterAddress);
    if (filterCity)     params.set('city',      filterCity);
    if (filterProvince) params.set('province',  filterProvince);
    if (filterPostcode) params.set('postcode',  filterPostcode);
    if (filterPhone)    params.set('has_phone', filterPhone);
    if (filterWeb)      params.set('has_web',   filterWeb);
    if (filterHours)    params.set('has_hours', filterHours);
    if (filterActive)   params.set('active',    filterActive);
    const res = await api.get<WorkshopLocation[]>(`/workshop-locations?${params}`);
    if (res.ok) { setItems(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [filterId, filterSource, filterPartner, filterName, filterAddress, filterCity,
      filterProvince, filterPostcode, filterPhone, filterWeb, filterHours, filterActive, page]);

  useEffect(() => { setPage(1); }, [filterId, filterSource, filterPartner, filterName,
    filterAddress, filterCity, filterProvince, filterPostcode, filterPhone, filterWeb,
    filterHours, filterActive]);
  useEffect(() => { load(page); }, [page, load]);

  // Edit modal
  function openEdit(w: WorkshopLocation) { setSelected(w); setForm(workshopToForm(w)); setSaveError(''); }
  function closeModal() { setSelected(null); setForm(null); setSaveError(''); }

  async function save() {
    if (!selected || !form) return;
    setSaving(true); setSaveError('');
    const businessHours = form.hoursFreeMode
      ? form.hoursFreeText.trim() || null
      : formatStructuredHours(form.hours);
    const payload: Record<string, unknown> = {
      name: form.name.trim() || undefined,
      address: form.address || null, city: form.city || null,
      postcode: form.postcode || null, province: form.province || null,
      lat: form.lat !== '' ? Number(form.lat) : null,
      lon: form.lon !== '' ? Number(form.lon) : null,
      phone: form.phone || null, website: form.website || null,
      partner: form.partner || null, is_active: form.is_active,
      business_hours: businessHours,
      service_types: form.service_types
        ? form.service_types.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
    };
    const res = await api.patch(`/workshop-locations/${selected.id}`, payload);
    setSaving(false);
    if (res.ok) { closeModal(); load(page); }
    else setSaveError('Error al guardar. Comprueba los datos.');
  }

  function setHoursDay(day: 'lv' | 'sab' | 'dom', key: keyof HoursDay, value: string | boolean) {
    if (!form) return;
    setForm({ ...form, hours: { ...form.hours, [day]: { ...form.hours[day], [key]: value } } });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Talleres"
        subtitle={`${total.toLocaleString('es-ES')} talleres en el directorio${hasAnyFilter ? ' · filtrado' : ''}`}
        actions={
          hasAnyFilter ? (
            <button onClick={clearFilters}
              className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
              ✕ Limpiar filtros
            </button>
          ) : undefined
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : !loading && items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Sin resultados. <button onClick={clearFilters} className="text-blue-500 underline">Limpiar filtros</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  {/* Column labels */}
                  <tr>
                    <th>ID</th>
                    <th>Fuente</th>
                    <th>Partner</th>
                    <th>Nombre</th>
                    <th>Dirección</th>
                    <th>Ciudad</th>
                    <th>Provincia</th>
                    <th>CP</th>
                    <th>Teléfono</th>
                    <th>Web</th>
                    <th>Horario</th>
                    <th>Activo</th>
                    <th></th>
                  </tr>
                  {/* Per-column filter row */}
                  <tr style={{ background: '#f8fafc' }}>
                    {/* ID */}
                    <th className="py-1.5 px-2">
                      <input type="number" value={filterId} onChange={(e) => setFilterId(e.target.value)}
                        placeholder="ID…" className={fi} style={{ width: 70 }} />
                    </th>
                    {/* Fuente */}
                    <th className="py-1.5 px-2">
                      <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className={sel}>
                        <option value="">Todas</option>
                        {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </th>
                    {/* Partner */}
                    <th className="py-1.5 px-2">
                      <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)} className={sel}>
                        <option value="">Todos</option>
                        {PARTNER_OPTIONS.map((p) => <option key={p} value={p}>{PARTNER_LABELS[p]}</option>)}
                      </select>
                    </th>
                    {/* Nombre */}
                    <th className="py-1.5 px-2">
                      <input value={filterName} onChange={(e) => setFilterName(e.target.value)}
                        placeholder="Nombre…" className={fi} />
                    </th>
                    {/* Dirección */}
                    <th className="py-1.5 px-2">
                      <input value={filterAddress} onChange={(e) => setFilterAddress(e.target.value)}
                        placeholder="Dirección…" className={fi} />
                    </th>
                    {/* Ciudad */}
                    <th className="py-1.5 px-2">
                      <input value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                        placeholder="Ciudad…" className={fi} />
                    </th>
                    {/* Provincia */}
                    <th className="py-1.5 px-2">
                      <input value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}
                        placeholder="Provincia…" className={fi} />
                    </th>
                    {/* CP */}
                    <th className="py-1.5 px-2">
                      <input value={filterPostcode} onChange={(e) => setFilterPostcode(e.target.value)}
                        placeholder="CP…" className={fi} style={{ width: 60 }} />
                    </th>
                    {/* Teléfono */}
                    <th className="py-1.5 px-2">
                      <select value={filterPhone} onChange={(e) => setFilterPhone(e.target.value)} className={sel}>
                        <option value="">Todos</option>
                        <option value="yes">Con tlf.</option>
                        <option value="no">Sin tlf.</option>
                      </select>
                    </th>
                    {/* Web */}
                    <th className="py-1.5 px-2">
                      <select value={filterWeb} onChange={(e) => setFilterWeb(e.target.value)} className={sel}>
                        <option value="">Todos</option>
                        <option value="yes">Con web</option>
                        <option value="no">Sin web</option>
                      </select>
                    </th>
                    {/* Horario */}
                    <th className="py-1.5 px-2">
                      <select value={filterHours} onChange={(e) => setFilterHours(e.target.value)} className={sel}>
                        <option value="">Todos</option>
                        <option value="yes">Con horario</option>
                        <option value="no">Sin horario</option>
                      </select>
                    </th>
                    {/* Activo */}
                    <th className="py-1.5 px-2">
                      <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className={sel}>
                        <option value="">Todos</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((w) => (
                    <tr key={w.id} className={loading ? 'opacity-50' : ''}>
                      <td className="text-xs text-slate-400 font-mono">{w.id}</td>
                      <td className="text-xs text-slate-400">{w.source ?? '–'}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PARTNER_COLORS[w.partner ?? 'independent'] ?? 'bg-slate-100 text-slate-600'}`}>
                          {PARTNER_LABELS[w.partner ?? ''] ?? (w.partner ?? '–')}
                        </span>
                      </td>
                      <td className="font-medium text-slate-700 max-w-[180px] truncate">{w.name}</td>
                      <td className="text-sm text-slate-500 max-w-[160px] truncate">{w.address ?? '–'}</td>
                      <td className="text-sm text-slate-500">{w.city ?? '–'}</td>
                      <td className="text-sm text-slate-500">{w.province ?? '–'}</td>
                      <td className="text-sm text-slate-400">{w.postcode ?? '–'}</td>
                      <td className="text-sm text-slate-500">{w.phone ?? '–'}</td>
                      <td className="text-sm text-slate-400">
                        {w.website ? (
                          <a href={w.website} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                            Web ↗
                          </a>
                        ) : '–'}
                      </td>
                      <td className="text-center">
                        {w.business_hours
                          ? <span title={w.business_hours} className="text-green-600 text-xs font-semibold cursor-help">✓</span>
                          : <span className="text-slate-300 text-xs">–</span>}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {w.is_active ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => openEdit(w)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
                          Editar
                        </button>
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

      {/* Edit modal */}
      <Modal open={!!selected && !!form} onClose={closeModal} title={selected?.name ?? 'Editar taller'} size="lg">
        {form && (
          <div className="space-y-5">
            {/* Info strip */}
            <div className="flex gap-4 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
              <span>ID: <strong className="text-slate-600">{selected?.id}</strong></span>
              <span>Fuente: <strong className="text-slate-600">{selected?.source ?? '–'}</strong></span>
              {selected?.rating != null && (
                <span>⭐ {selected.rating.toFixed(1)} ({selected.rating_count?.toLocaleString('es-ES') ?? 0} reseñas)</span>
              )}
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {([['city','Ciudad'],['postcode','Código postal'],['province','Provincia'],['phone','Teléfono']] as [keyof EditForm, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input value={form[key] as string} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Web</label>
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Latitud</label>
                <input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Longitud</label>
                <input type="number" step="any" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Partner</label>
                <select value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PARTNER_OPTIONS.map((p) => <option key={p} value={p}>{PARTNER_LABELS[p]}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input type="checkbox" id="is_active" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300" />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-600">Taller activo</label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipos de servicio (separados por coma)</label>
                <input value={form.service_types} onChange={(e) => setForm({ ...form, service_types: e.target.value })}
                  placeholder="car_repair, tyres, vehicle_inspection…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Business hours */}
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700">🕐 Horario comercial</span>
                <button type="button" onClick={() => setForm({ ...form, hoursFreeMode: !form.hoursFreeMode })}
                  className="text-xs text-blue-500 hover:text-blue-700">
                  {form.hoursFreeMode ? 'Usar editor visual' : 'Edición libre'}
                </button>
              </div>
              {form.hoursFreeMode ? (
                <textarea rows={3} value={form.hoursFreeText}
                  onChange={(e) => setForm({ ...form, hoursFreeText: e.target.value })}
                  placeholder="Ej: L-V: 09:00-14:00, 16:00-20:00 | Sáb: 09:00-14:00 | Dom: Cerrado"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
              ) : (
                <div className="space-y-3">
                  {([['lv','Lunes a Viernes'],['sab','Sábado'],['dom','Domingo']] as [keyof StructuredHours, string][]).map(([day, label]) => (
                    <div key={day} className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-slate-600 w-28 shrink-0">{label}</span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input type="checkbox" checked={form.hours[day].closed}
                          onChange={(e) => setHoursDay(day, 'closed', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300" />
                        Cerrado
                      </label>
                      {!form.hours[day].closed && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Mañana</span>
                            <input value={form.hours[day].morning}
                              onChange={(e) => setHoursDay(day, 'morning', e.target.value)}
                              placeholder="09:00-14:00"
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-28" />
                          </div>
                          {day !== 'dom' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-400">Tarde</span>
                              <input value={form.hours[day].afternoon}
                                onChange={(e) => setHoursDay(day, 'afternoon', e.target.value)}
                                placeholder="16:00-20:00"
                                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-28" />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  <div className="mt-2 px-2 py-1.5 bg-slate-50 rounded text-xs text-slate-400 font-mono">
                    {formatStructuredHours(form.hours)}
                  </div>
                </div>
              )}
            </div>

            {saveError && <p className="text-red-600 text-xs">{saveError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={closeModal}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
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
