import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card } from '../components/ui/Card.js';
import type { IdCar, IdCarFile } from '../types/index.js';

const MIME_ICONS: Record<string, string> = {
  'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/webp': '🖼️', 'image/gif': '🖼️',
  'application/pdf': '📄',
};
const DOC_TYPE_LABELS: Record<string, string> = {
  photo: 'Foto', document: 'Documento', technical_sheet: 'Ficha Técnica',
  circulation_permit: 'Permiso Circulación', itv: 'ITV',
  insurance: 'Seguro', maintenance_invoices: 'Factura Mantenimiento',
};

const UPLOAD_SECTIONS = [
  { key: 'photo',                label: 'Fotos',                 accept: 'image/*',        maxMB: 10, multiple: true  },
  { key: 'document',             label: 'Documentación general', accept: '.pdf,image/*',   maxMB: 5,  multiple: true  },
  { key: 'technical_sheet',      label: 'Ficha técnica',         accept: '.pdf,image/*',   maxMB: 5,  multiple: false },
  { key: 'circulation_permit',   label: 'Permiso de circulación',accept: '.pdf,image/*',   maxMB: 5,  multiple: false },
  { key: 'itv',                  label: 'ITV',                   accept: '.pdf,image/*',   maxMB: 5,  multiple: false },
  { key: 'insurance',            label: 'Seguro',                accept: '.pdf,image/*',   maxMB: 5,  multiple: false },
  { key: 'maintenance_invoices', label: 'Facturas mantenimiento',accept: '.pdf,image/*',   maxMB: 5,  multiple: true  },
] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileIcon(f: IdCarFile) {
  return MIME_ICONS[f.file_mime_type] ?? (f.file_mime_type.startsWith('image/') ? '🖼️' : '📎');
}
function fmtBytes(n: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

interface IdCarDetail extends IdCar {
  user_email?: string;
  fuel?: string;
  price?: string;
  notes?: string;
  transmission_type?: string;
  cv?: string;
  color?: string;
  body_type?: string;
  version?: string;
}

export default function IdCarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vehicle, setVehicle]   = useState<IdCarDetail | null>(null);
  const [files, setFiles]       = useState<IdCarFile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [publishPrice, setPublishPrice] = useState('');
  const [primaryPhotoUrl, setPrimaryPhotoUrl] = useState<string | null>(null);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [primaryMsg, setPrimaryMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Edit vehicle data state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Upload state
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, { ok: boolean; text: string } | null>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadFiles = useCallback(async () => {
    if (!id) return;
    const fRes = await api.get<IdCarFile[]>(`/idcars/${id}/files`);
    if (fRes.ok) {
      setFiles(fRes.data);
      const firstPhoto = fRes.data.find((f: IdCarFile) => f.file_type === 'photo' && f.file_url);
      if (firstPhoto) setPrimaryPhotoUrl(firstPhoto.file_url ?? null);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<IdCarDetail>(`/idcars/${id}`),
      api.get<IdCarFile[]>(`/idcars/${id}/files`),
    ]).then(([vRes, fRes]) => {
      if (vRes.ok) { setVehicle(vRes.data); setPublishPrice(vRes.data.price ?? ''); }
      if (fRes.ok) {
        setFiles(fRes.data);
        const firstPhoto = fRes.data.find((f: IdCarFile) => f.file_type === 'photo' && f.file_url);
        if (firstPhoto) setPrimaryPhotoUrl(firstPhoto.file_url ?? null);
      }
    }).finally(() => setLoading(false));
  }, [id]);

  function startEditing() {
    if (!vehicle) return;
    setEditForm({
      brand:              vehicle.brand               ?? '',
      model:              vehicle.model               ?? '',
      version:            vehicle.version             ?? '',
      year:               String(vehicle.year         ?? ''),
      plate:              vehicle.plate               ?? '',
      fuel:               vehicle.fuel                ?? '',
      mileage:            String(vehicle.km           ?? ''),
      color:              vehicle.color               ?? '',
      body_type:          vehicle.body_type           ?? '',
      transmission_type:  vehicle.transmission_type   ?? '',
      cv:                 vehicle.cv                  ?? '',
      price:              vehicle.price               ?? '',
      notes:              vehicle.notes               ?? '',
    });
    setEditing(true);
    setSaveMsg(null);
  }

  async function saveVehicle() {
    setSaving(true);
    setSaveMsg(null);
    const r = await api.patch(`/idcars/${id}`, editForm).catch(() => ({ ok: false } as { ok: false }));
    if (r.ok) {
      setVehicle((v) => v ? { ...v, ...editForm, km: Number(editForm.mileage) || v.km, year: Number(editForm.year) || v.year } : v);
      setSaveMsg({ ok: true, text: 'Datos guardados correctamente' });
      setEditing(false);
    } else {
      setSaveMsg({ ok: false, text: 'Error al guardar. Inténtalo de nuevo.' });
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 4000);
  }

  async function handleUpload(fileType: string) {
    const files = pendingFiles[fileType];
    if (!files?.length || uploadingType) return;
    setUploadingType(fileType);
    setUploadStatus((s) => ({ ...s, [fileType]: null }));
    let errors = 0;
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const r = await api.post(`/idcars/${id}/files`, {
          file_type: fileType, file_name: file.name,
          file_mime_type: file.type || 'application/octet-stream',
          file_content_base64: base64, file_size: file.size,
        });
        if (!r.ok) errors++;
      } catch { errors++; }
    }
    const count = files.length;
    setUploadStatus((s) => ({
      ...s,
      [fileType]: errors === 0
        ? { ok: true,  text: `${count} archivo${count > 1 ? 's' : ''} subido${count > 1 ? 's' : ''} correctamente` }
        : { ok: false, text: `${errors} de ${count} archivos fallaron` },
    }));
    setPendingFiles((p) => ({ ...p, [fileType]: [] }));
    if (inputRefs.current[fileType]) inputRefs.current[fileType]!.value = '';
    await loadFiles();
    setUploadingType(null);
    setTimeout(() => setUploadStatus((s) => ({ ...s, [fileType]: null })), 4000);
  }

  async function handleDeleteFile(file: IdCarFile) {
    if (!window.confirm(`¿Eliminar "${file.file_name}"?`)) return;
    setDeletingId(file.id);
    await api.delete(`/idcars/${id}/files/${file.id}?file_type=${file.file_type}`).catch(() => {});
    await loadFiles();
    setDeletingId(null);
  }

  async function handleSetPrimary(url: string) {
    if (settingPrimary || url === primaryPhotoUrl) return;
    setSettingPrimary(true);
    setPrimaryMsg(null);
    const r = await api.patch(`/idcars/${id}/primary-photo`, { photo_url: url });
    if (r.ok) {
      setPrimaryPhotoUrl(url);
      setPrimaryMsg({ ok: true, text: 'Foto principal actualizada' });
    } else {
      setPrimaryMsg({ ok: false, text: 'Error al actualizar la foto principal' });
    }
    setSettingPrimary(false);
    setTimeout(() => setPrimaryMsg(null), 3000);
  }

  async function handlePublish() {
    if (!id) return;
    setPublishing(true);
    setPublishMsg(null);
    const r = await api.post<{ offer_id: string }>(`/idcars/${id}/publish`, { price: publishPrice });
    setPublishMsg(r.ok
      ? { ok: true,  text: `Publicado en Marketplace (ID: ${r.data.offer_id})` }
      : { ok: false, text: (r as { error?: string }).error ?? 'Error al publicar' }
    );
    setPublishing(false);
  }

  if (loading) return <div className="text-slate-400 text-sm p-6">Cargando…</div>;
  if (!vehicle) return <div className="text-red-500 text-sm p-6">Vehículo no encontrado</div>;

  const photos    = files.filter((f) => f.file_type === 'photo' && f.file_url);
  const documents = files.filter((f) => f.file_type !== 'photo');
  const vehicleTitle = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'Vehículo';

  return (
    <div className="space-y-5">
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
          <button
            className="absolute top-4 right-4 text-white text-2xl font-bold leading-none"
            onClick={() => setLightbox(null)}
          >×</button>
        </div>
      )}

      <PageHeader
        title={vehicleTitle}
        subtitle={vehicle.owner_email ?? vehicle.user_id}
        actions={<Link to="/idcars" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Vehicle info */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">Datos del Vehículo</h3>
            {!editing ? (
              <button type="button" onClick={startEditing}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditing(false); setSaveMsg(null); }}
                  className="text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
                <button type="button" onClick={saveVehicle} disabled={saving}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}
          </div>
          {saveMsg && (
            <div className={`mb-3 text-xs font-medium px-3 py-2 rounded-md ${saveMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {saveMsg.text}
            </div>
          )}
          {!editing ? (
            <>
              <dl className="space-y-2 text-sm">
                {[
                  ['Marca',        vehicle.brand],
                  ['Modelo',       vehicle.model],
                  ['Versión',      vehicle.version],
                  ['Año',          vehicle.year],
                  ['Matrícula',    vehicle.plate],
                  ['Combustible',  vehicle.fuel],
                  ['Kilometraje',  vehicle.km ? `${vehicle.km.toLocaleString('es-ES')} km` : undefined],
                  ['Color',        vehicle.color],
                  ['Carrocería',   vehicle.body_type],
                  ['Transmisión',  vehicle.transmission_type],
                  ['CV',           vehicle.cv],
                  ['Precio',       vehicle.price ? `${Number(vehicle.price).toLocaleString('es-ES')} €` : undefined],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between gap-2">
                    <dt className="text-slate-500 shrink-0">{label}</dt>
                    <dd className="text-slate-700 text-right">{String(val)}</dd>
                  </div>
                ))}
              </dl>
              {vehicle.notes && (
                <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 whitespace-pre-wrap">{vehicle.notes}</p>
              )}
            </>
          ) : (
            <div className="space-y-3 text-sm">
              {([
                ['Marca',        'brand',             'text'],
                ['Modelo',       'model',             'text'],
                ['Versión',      'version',           'text'],
                ['Año',          'year',              'number'],
                ['Matrícula',    'plate',             'text'],
                ['Combustible',  'fuel',              'text'],
                ['Kilometraje',  'mileage',           'number'],
                ['Color',        'color',             'text'],
                ['Carrocería',   'body_type',         'text'],
                ['Transmisión',  'transmission_type', 'text'],
                ['CV',           'cv',                'number'],
                ['Precio (€)',   'price',             'number'],
              ] as [string, string, string][]).map(([label, key, type]) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-slate-500 w-28 shrink-0 text-xs">{label}</label>
                  <input
                    type={type}
                    value={editForm[key] ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
              <div>
                <label className="text-slate-500 text-xs block mb-1">Notas</label>
                <textarea
                  rows={3}
                  value={editForm['notes'] ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                />
              </div>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Propietario: <Link to={`/users/${vehicle.user_id}`} className="text-blue-600 hover:underline">{vehicle.owner_name ?? vehicle.user_id}</Link>
          </div>
        </Card>

        {/* Photos */}
        <Card className="lg:col-span-2" padding={false}>
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Fotos <span className="text-slate-400 font-normal">({photos.length})</span></h3>
            {primaryMsg && (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${primaryMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {primaryMsg.text}
              </span>
            )}
          </div>
          {photos.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">Sin fotos</p>
          ) : (
            <>
              <p className="px-4 pt-3 text-xs text-slate-400">Haz clic en una foto para ampliarla. Pulsa «Hacer principal» para que sea la foto principal del marketplace.</p>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((f) => (
                  <div key={f.id} className="relative group rounded-lg overflow-hidden border aspect-square bg-slate-50 transition-colors"
                    style={{ borderColor: f.file_url === primaryPhotoUrl ? '#f59e0b' : undefined }}
                  >
                    <button
                      onClick={() => setLightbox(f.file_url)}
                      className="absolute inset-0 w-full h-full"
                    >
                      <img
                        src={f.file_url}
                        alt={f.file_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>

                    {f.file_url === primaryPhotoUrl ? (
                      <div className="absolute top-1.5 left-1.5 z-10 bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none">
                        ⭐ Principal
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSetPrimary(f.file_url); }}
                        disabled={settingPrimary}
                        className="absolute top-1.5 left-1.5 z-10 bg-white/90 text-slate-600 text-[9px] font-medium px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        ⭐ Hacer principal
                      </button>
                    )}

                    <p className="absolute bottom-0 left-0 right-0 z-10 text-[10px] text-white bg-black/50 px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {f.file_name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteFile(f); }}
                      disabled={deletingId === f.id}
                      className="absolute top-1.5 right-1.5 z-10 bg-red-500/80 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-40"
                      title="Eliminar foto"
                    >×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Documents */}
      <Card padding={false}>
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Documentos <span className="text-slate-400 font-normal">({documents.length})</span></h3>
        </div>
        {documents.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Sin documentos</p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr><th>Tipo</th><th>Archivo</th><th>Tamaño</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              {documents.map((f) => (
                <tr key={f.id}>
                  <td><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{DOC_TYPE_LABELS[f.file_type] ?? f.file_type}</span></td>
                  <td className="text-sm text-slate-700">{fileIcon(f)} {f.file_name}</td>
                  <td className="text-xs text-slate-400">{fmtBytes(f.file_size)}</td>
                  <td className="text-xs text-slate-400">{fmtDate(f.created_at)}</td>
                  <td className="flex items-center gap-3">
                    {f.file_url ? (
                      <a href={f.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Ver →</a>
                    ) : (
                      <span className="text-xs text-slate-300">Sin URL</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(f)}
                      disabled={deletingId === f.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {/* Upload files */}
      <Card>
        <h3 className="font-semibold text-slate-800 text-sm mb-4">Adjuntar archivos</h3>
        <div className="divide-y divide-slate-100">
          {UPLOAD_SECTIONS.map(({ key, label, accept, maxMB, multiple }) => {
            const pending = pendingFiles[key] ?? [];
            const status  = uploadStatus[key];
            const isUploading = uploadingType === key;
            return (
              <div key={key} className="py-3 flex flex-wrap items-center gap-3">
                <span className="w-44 text-sm text-slate-600 shrink-0">{label}</span>
                <input
                  ref={(el) => { inputRefs.current[key] = el; }}
                  type="file"
                  accept={accept}
                  multiple={multiple}
                  className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-600 hover:file:bg-slate-200 cursor-pointer"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const tooBig = files.filter((f) => f.size > maxMB * 1024 * 1024);
                    const valid  = files.filter((f) => f.size <= maxMB * 1024 * 1024);
                    if (tooBig.length)
                      setUploadStatus((s) => ({ ...s, [key]: { ok: false, text: `${tooBig.map((f) => f.name).join(', ')} supera ${maxMB} MB` } }));
                    setPendingFiles((p) => ({ ...p, [key]: valid }));
                  }}
                />
                <span className="text-xs text-slate-400">máx. {maxMB} MB</span>
                {pending.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleUpload(key)}
                    disabled={!!uploadingType}
                    className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isUploading ? 'Subiendo…' : `↑ Subir ${pending.length} archivo${pending.length > 1 ? 's' : ''}`}
                  </button>
                )}
                {status && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {status.ok ? '✓' : '✕'} {status.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Publish to Marketplace */}
      <Card>
        <h3 className="font-semibold text-slate-800 text-sm mb-4">Publicar en Marketplace</h3>
        <p className="text-xs text-slate-500 mb-3">
          Esto crea o actualiza la oferta en el marketplace de vehículos de ocasión con los datos de este IDCar.
          El tipo de vendedor se marcará como <strong>particular</strong>.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Precio de venta (€)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={publishPrice}
              onChange={(e) => setPublishPrice(e.target.value)}
              placeholder="Ej: 12500"
              className="w-40 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {publishing ? 'Publicando…' : '🚀 Publicar en Marketplace'}
          </button>
        </div>

        {publishMsg && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${publishMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {publishMsg.text}
            {publishMsg.ok && (
              <Link to="/marketplace" className="ml-2 underline text-xs">Ver en Marketplace →</Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
