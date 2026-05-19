import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Card } from '../components/ui/Card.js';
import { Modal } from '../components/ui/Modal.js';
import type { Workshop } from '../types/index.js';

const EMPTY_FORM = { name: '', address: '', city: '', province: '', postal_code: '', phone: '', email: '', notes: '', is_active: true };

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [q, setQ]                 = useState('');
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editWs, setEditWs]       = useState<Workshop | null>(null);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ active: 'true' });
    if (q) params.set('q', q);
    const res = await api.get<Workshop[]>(`/workshops?${params}`);
    if (res.ok) setWorkshops(res.data);
    setLoading(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm({ ...EMPTY_FORM }); setEditWs(null); setShowCreate(true); setFormError(''); }
  function openEdit(w: Workshop) {
    setForm({ name: w.name, address: w.address ?? '', city: w.city ?? '', province: w.province ?? '',
              postal_code: w.postal_code ?? '', phone: w.phone ?? '', email: w.email ?? '', notes: w.notes ?? '', is_active: w.is_active });
    setEditWs(w); setShowCreate(true); setFormError('');
  }

  async function save() {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return; }
    setSaving(true);
    setFormError('');
    const res = editWs
      ? await api.patch(`/workshops/${editWs.id}`, form)
      : await api.post('/workshops', form);
    setSaving(false);
    if (res.ok) { setShowCreate(false); load(); }
    else setFormError('Error al guardar el taller');
  }

  async function deactivate(id: string) {
    await api.delete(`/workshops/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Talleres partner"
        subtitle={`${workshops.length} talleres activos`}
        actions={
          <button onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            + Añadir taller
          </button>
        }
      />

      <div className="mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar taller, ciudad…" className="w-72" />
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Cargando…</div>
      ) : workshops.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">Sin talleres. Añade el primero.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workshops.map((w) => (
            <Card key={w.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-base shrink-0">
                  🔧
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(w)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Editar</button>
                  <button onClick={() => deactivate(w.id)} className="text-xs text-slate-400 hover:text-red-500">Desactivar</button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 text-sm">{w.name}</h3>
              {(w.city || w.province) && (
                <p className="text-xs text-slate-500 mt-0.5">{[w.city, w.province].filter(Boolean).join(', ')}</p>
              )}
              {w.address && <p className="text-xs text-slate-400 mt-1">{w.address}</p>}
              {w.phone && <p className="text-xs text-slate-500 mt-2">📞 {w.phone}</p>}
              {w.email && <p className="text-xs text-slate-500">{w.email}</p>}
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-3 text-xs text-slate-400">
                <span>🗓 {w.appointment_count ?? 0} citas</span>
                <span>⏳ {w.pending_count ?? 0} pendientes</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editWs ? 'Editar taller' : 'Nuevo taller'} size="lg">
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
          {[
            { key: 'city', label: 'Ciudad' }, { key: 'province', label: 'Provincia' },
            { key: 'postal_code', label: 'Código postal' }, { key: 'phone', label: 'Teléfono' },
            { key: 'email', label: 'Email' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input value={(form as Record<string, string | boolean>)[key] as string}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        {formError && <p className="text-red-600 text-xs mt-2">{formError}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Guardando…' : editWs ? 'Guardar cambios' : 'Crear taller'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
