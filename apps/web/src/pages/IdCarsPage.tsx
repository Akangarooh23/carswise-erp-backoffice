import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Pagination } from '../components/ui/Pagination.js';
import type { IdCar } from '../types/index.js';
import Icono, { type NombreIcono } from '../components/ui/Icono.js';
import { StatCard } from '../components/ui/Card.js';

/** El resumen de arriba. La antigüedad sale del mismo año que enseña la tabla. */
interface Resumen {
  total: number; propietarios: number; electricos: number; hibridos: number;
  antiguedadMedia: number | null;
}

/**
 * Que icono le toca a un combustible.
 *
 * El dato viene escrito a mano y de Excel de proveedores: «Gasolina»,
 * «Diésel», «Electrico» sin tilde, «Hybrid Gasoline». Se normaliza y se busca
 * por trozo, no por igualdad, porque la lista de formas no se acaba nunca.
 */
function iconoCombustible(fuel: string): NombreIcono {
  const t = fuel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.includes('electr')) return 'rayo';
  if (t.includes('hibrid') || t.includes('hybrid') || t.includes('phev')) return 'bateria';
  if (t.includes('gasolin') || t.includes('gasoline')) return 'surtidor';
  if (t.includes('diesel')) return 'bidon';
  if (t.includes('gas') || t.includes('glp') || t.includes('gnc')) return 'surtidor';
  return 'llave-inglesa';
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

export default function IdCarsPage() {
  const [idcars, setIdcars]   = useState<IdCar[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: '50' });
    if (q) params.set('q', q);
    const res = await api.get<IdCar[]>(`/idcars?${params}`);
    if (res.ok) { setIdcars(res.data); setTotal(res.meta?.total ?? 0); }
    setLoading(false);
  }, [q, page]);

  // El resumen no depende del filtro ni de la página: se pide una vez.
  useEffect(() => {
    api.get<Resumen>('/idcars/stats/summary').then((r) => { if (r.ok) setResumen(r.data); });
  }, []);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { load(page); }, [page, load]);

  return (
    <div>
      <PageHeader title="IDCars" subtitle={`${total.toLocaleString('es-ES')} vehículos registrados`} />

      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatCard label="Vehículos" value={resumen.total} icon="coche" />
          <StatCard label="Propietarios" value={resumen.propietarios} icon="usuarios"
            sub={resumen.propietarios === resumen.total ? 'uno por vehículo' : 'algunos tienen más de uno'} />
          <StatCard label="Electrificados" value={resumen.electricos + resumen.hibridos} icon="rayo"
            sub={`${resumen.electricos} eléctricos · ${resumen.hibridos} híbridos`} />
          <StatCard label="Antigüedad media" icon="reloj"
            value={resumen.antiguedadMedia == null ? '–' : `${resumen.antiguedadMedia.toLocaleString('es-ES')} años`} />
        </div>
      )}

      <div className="mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar marca, modelo, matrícula…" className="w-72" />
      </div>

      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-brand-300 text-sm">Cargando…</div>
        ) : idcars.length === 0 ? (
          <div className="text-center py-12 text-brand-300 text-sm">
            Sin IDCars registrados
            {!q && <p className="text-xs mt-1 text-brand-300">La tabla moveadvisor_user_vehicles puede no existir aún</p>}
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
                      <Link to={`/idcars/${v.id}`} className="font-medium text-acento-texto hover:underline text-sm">
                        {[v.brand, v.model].filter(Boolean).join(' ') || '(sin datos)'}
                      </Link>
                    </td>
                    <td>
                      {v.owner_name ? (
                        <Link to={`/users/${v.user_id}`} className="text-acento-texto hover:underline text-sm">
                          {v.owner_name}
                        </Link>
                      ) : (
                        <span className="text-sm text-brand-400">{v.user_id}</span>
                      )}
                      {v.owner_email && <p className="text-xs text-brand-300">{v.owner_email}</p>}
                    </td>
                    <td className="text-sm text-brand-400 font-mono">{v.plate || '–'}</td>
                    <td className="text-sm">
                      {v.fuel
                        ? <span className="inline-flex items-center gap-1"><Icono nombre={iconoCombustible(v.fuel)} tam={14} /> {v.fuel}</span>
                        : <span className="text-brand-300">–</span>}
                    </td>
                    <td className="text-sm text-brand-400">{v.mileage_km ? `${Number(v.mileage_km).toLocaleString('es-ES')} km` : '–'}</td>
                    <td className="text-sm text-brand-400">{v.year ?? '–'}</td>
                    <td className="text-xs text-brand-300">{fmtDate(v.created_at)}</td>
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
