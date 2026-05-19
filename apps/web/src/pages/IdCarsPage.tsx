import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Pagination } from '../components/ui/Pagination.js';
import type { IdCar } from '../types/index.js';

const FUEL_ICONS: Record<string, string> = {
  electric: '⚡', hybrid: '🔋', gasoline: '⛽', diesel: '🛢️', other: '🔧',
};

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

export default function IdCarsPage() {
  const [idcars, setIdcars]   = useState<IdCar[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q) params.set('q', q);
    const res = await api.get<IdCar[]>(`/idcars?${params}`);
    if (res.ok) { setIdcars(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [q, page]);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { load(page); }, [page, load]);

  return (
    <div>
      <PageHeader title="IDCars" subtitle={`${total.toLocaleString('es-ES')} vehículos registrados`} />

      <div className="mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar marca, modelo, matrícula…" className="w-72" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
        ) : idcars.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Sin IDCars registrados
            {!q && <p className="text-xs mt-1 text-slate-300">La tabla moveadvisor_user_vehicles puede no existir aún</p>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto"><table className="erp-table">
              <thead>
                <tr><th>Vehículo</th><th>Propietario</th><th>Matrícula</th><th>Combustible</th><th>Km</th><th>Año</th><th>Registro</th></tr>
              </thead>
              <tbody>
                {idcars.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/idcars/${v.id}`} className="font-medium text-blue-600 hover:underline text-sm">
                        {[v.brand, v.model].filter(Boolean).join(' ') || '(sin datos)'}
                      </Link>
                    </td>
                    <td>
                      {v.owner_name ? (
                        <Link to={`/users/${v.user_id}`} className="text-blue-600 hover:underline text-sm">
                          {v.owner_name}
                        </Link>
                      ) : (
                        <span className="text-sm text-slate-500">{v.user_id}</span>
                      )}
                      {v.owner_email && <p className="text-xs text-slate-400">{v.owner_email}</p>}
                    </td>
                    <td className="text-sm text-slate-600 font-mono">{v.plate || '–'}</td>
                    <td className="text-sm">
                      {v.fuel_type
                        ? <span>{FUEL_ICONS[v.fuel_type] ?? '🔧'} {v.fuel_type}</span>
                        : <span className="text-slate-400">–</span>}
                    </td>
                    <td className="text-sm text-slate-500">{v.km ? `${v.km.toLocaleString('es-ES')} km` : '–'}</td>
                    <td className="text-sm text-slate-500">{v.year ?? '–'}</td>
                    <td className="text-xs text-slate-400">{fmtDate(v.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination page={page} total={total} limit={50} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
