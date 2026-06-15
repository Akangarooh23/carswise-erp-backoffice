import { useEffect, useState } from 'react';
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
};

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
        if (firstPhoto) setPrimaryPhotoUrl(firstPhoto.file_url);
      }
    }).finally(() => setLoading(false));
  }, [id]);

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
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Datos del Vehículo</h3>
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
                  <td>
                    {f.file_url ? (
                      <a href={f.file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Ver →</a>
                    ) : (
                      <span className="text-xs text-slate-300">Sin URL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
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
