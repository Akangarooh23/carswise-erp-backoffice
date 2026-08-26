import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Boton from '../components/ui/Boton.js';
import Icono from '../components/ui/Icono.js';

/**
 * El explorador de datos.
 *
 * Las secciones del ERP son los caminos rápidos de lo que se usa a diario. En
 * la base hay 66 tablas, y la mayoría no merecen pantalla propia: el catálogo
 * maestro, los duplicados de ofertas, las tiradas del rastreador.
 *
 * Aquí se elige una, se filtra por columna y se exporta. Sin escribir SQL y sin
 * pedírselo a nadie, que era el objetivo: que cada área pueda sacar sus datos.
 */

interface Tabla { tabla: string; filas: number }
type Fila = Record<string, unknown>;

const PAGINA = 50;

function pinta(v: unknown): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Las fechas largas en una rejilla no aportan nada: cortan la vista.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return s;
}

export default function DatosPage() {
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [busca, setBusca] = useState('');
  const [elegida, setElegida] = useState('');

  const [filas, setFilas] = useState<Fila[]>([]);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [salto, setSalto] = useState(0);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Tabla[]>('/datos/tablas').then((r) => { if (r.ok) setTablas(r.data); });
  }, []);

  useEffect(() => {
    if (!elegida) return;
    setCargando(true);
    setError('');
    const q = new URLSearchParams({ limit: String(PAGINA), offset: String(salto) });
    for (const [c, v] of Object.entries(filtros)) if (v) q.set('f_' + c, v);
    const t = setTimeout(() => {
      api.get<Fila[]>(`/datos/${elegida}?${q}`)
        .then((r) => {
          if (!r.ok) { setError(r.error || 'No se ha podido cargar'); return; }
          setFilas(r.data);
          const extra = r as unknown as { columnas?: string[]; total?: number };
          setColumnas(extra.columnas ?? []);
          setTotal(extra.total ?? 0);
        })
        .catch(() => setError('Error de conexión'))
        .finally(() => setCargando(false));
    }, 280);
    return () => clearTimeout(t);
  }, [elegida, salto, filtros]);

  const abrir = (t: string) => { setElegida(t); setSalto(0); setFiltros({}); setFilas([]); setColumnas([]); };

  const exportar = () => {
    const token = localStorage.getItem('cw_erp_token') ?? '';
    // Se pide con la sesión puesta y se descarga como fichero.
    fetch(`/api/datos/${elegida}/csv`, { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.blob())
      .then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url; a.download = elegida + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('No se ha podido exportar'));
  };

  const visibles = tablas.filter((t) => t.tabla.includes(busca.toLowerCase().trim()));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Datos"
        subtitle="Cualquier tabla, filtrada y exportable, sin pedírsela a nadie"
        actions={elegida ? <Boton variante="secundario" icono="tabla" onClick={exportar}>Exportar CSV</Boton> : undefined}
      />

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700" role="alert">
          <Icono nombre="aviso" tam={16} /> {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Las tablas */}
        <div className="rounded-xl border border-brand-200 bg-white overflow-hidden">
          <div className="p-3 border-b border-brand-100">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar tablas…"
              aria-label="Filtrar tablas"
              className="h-9 w-full rounded-lg border border-brand-200 px-3 text-[13px]
                         placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-acento"
            />
          </div>
          <ul className="max-h-[62vh] overflow-y-auto">
            {visibles.map((t) => (
              <li key={t.tabla}>
                <button
                  type="button"
                  onClick={() => abrir(t.tabla)}
                  className={
                    'w-full text-left px-3 py-2 flex items-baseline justify-between gap-2 transition-colors ' +
                    (elegida === t.tabla ? 'bg-acento-tenue' : 'hover:bg-brand-50')
                  }
                >
                  <span className="font-mono text-[11.5px] text-brand-600 truncate">{t.tabla}</span>
                  <span className="text-[10.5px] text-brand-300 tabular-nums shrink-0">
                    {t.filas.toLocaleString('es-ES')}
                  </span>
                </button>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="px-3 py-6 text-center text-[12px] text-brand-300">Ninguna con «{busca}».</li>
            )}
          </ul>
        </div>

        {/* El contenido */}
        <div className="min-w-0">
          {!elegida ? (
            <div className="rounded-xl border border-brand-200 bg-white px-6 py-12 text-center">
              <p className="text-brand-500 font-semibold mb-1">Elige una tabla</p>
              <p className="text-[13px] text-brand-300 max-w-md mx-auto">
                {tablas.length} tablas. Las llaves —contraseñas, sesiones y tokens—
                no aparecen aquí ni en la exportación.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[13px] text-brand-600">{elegida}</span>
                <span className="text-[12.5px] text-brand-300 tabular-nums">
                  {total.toLocaleString('es-ES')} filas
                  {Object.values(filtros).some(Boolean) && ' con el filtro puesto'}
                </span>
              </div>

              <div className="rounded-xl border border-brand-200 bg-white overflow-x-auto">
                <table className="erp-table">
                  <thead>
                    <tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr>
                    <tr>
                      {columnas.map((c) => (
                        <th key={c} className="!py-1.5">
                          <input
                            value={filtros[c] ?? ''}
                            onChange={(e) => { setSalto(0); setFiltros({ ...filtros, [c]: e.target.value }); }}
                            placeholder="…"
                            aria-label={'Filtrar por ' + c}
                            className="h-7 w-full min-w-[70px] rounded border border-brand-200 px-1.5
                                       text-[11.5px] font-normal normal-case tracking-normal
                                       focus:outline-none focus:ring-1 focus:ring-acento"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cargando ? (
                      <tr><td colSpan={columnas.length || 1} className="text-center text-brand-300 py-6">Cargando…</td></tr>
                    ) : filas.length === 0 ? (
                      <tr><td colSpan={columnas.length || 1} className="text-center text-brand-300 py-6">Nada con esos filtros.</td></tr>
                    ) : filas.map((f, i) => (
                      <tr key={i}>
                        {columnas.map((c) => (
                          <td key={c} title={pinta(f[c])}>{pinta(f[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > PAGINA && (
                <div className="flex items-center justify-between text-[13px] text-brand-400">
                  <span className="tabular-nums">
                    {salto + 1}–{Math.min(salto + PAGINA, total)} de {total.toLocaleString('es-ES')}
                  </span>
                  <div className="flex gap-2">
                    <Boton tam="sm" variante="secundario" disabled={salto === 0}
                           onClick={() => setSalto(Math.max(0, salto - PAGINA))}>Anterior</Boton>
                    <Boton tam="sm" variante="secundario" disabled={salto + PAGINA >= total}
                           onClick={() => setSalto(salto + PAGINA)}>Siguiente</Boton>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
