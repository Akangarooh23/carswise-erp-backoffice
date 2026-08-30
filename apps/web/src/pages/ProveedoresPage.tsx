import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';

/**
 * Con quién trabajamos.
 *
 * Transportistas, gestorías, talleres y vendedores. Antes se escribían a mano en
 * cada tramo, en cada trámite y en cada gasto, así que el mismo proveedor
 * acababa con tres nombres y no había forma de contestar **cuánto llevamos
 * gastado con cada uno**. Esa pregunta es la que justifica esta pantalla.
 *
 * Los que ya estaban escritos se trajeron solos al arrancar: los nombres se
 * agruparon —«Transportes Gómez» y «transportes gomez» son uno— y se quedó la
 * primera forma en que alguien lo tecleó.
 */

const TIPOS = [
  ['transportista', 'Transportistas'],
  ['gestoria', 'Gestorías'],
  ['taller', 'Talleres'],
  ['vendedor', 'Vendedores'],
  ['otro', 'Otros'],
] as const;

interface Proveedor {
  id: string;
  nombre: string;
  tipos: string[];
  nif: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  activo: boolean;
}

interface Cuentas {
  transportes: { cuantos: number; total: number };
  tramites: { cuantos: number; total: number };
  gastos: { cuantos: number; total: number };
  total: number;
}

function eur(v: unknown): string {
  const n = Number(v || 0);
  return n ? `${n.toLocaleString('es-ES')} €` : '0 €';
}

export default function ProveedoresPage() {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const carga = useCallback(async () => {
    setCargando(true);
    setError('');
    const qs = filtro ? `?tipo=${filtro}` : '';
    const r = await api.get<Proveedor[]>(`/proveedores${qs}`);
    if (r.ok && Array.isArray(r.data)) setLista(r.data);
    else setError(r.error || 'No se han podido cargar los proveedores.');
    setCargando(false);
  }, [filtro]);

  useEffect(() => { void carga(); }, [carga]);

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Con quién trabajamos, y cuánto llevamos con cada uno"
        actions={
          <>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-brand-200 rounded-lg bg-white">
              <option value="">Todos</option>
              {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => setNuevo(true)}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
              Nuevo proveedor
            </button>
          </>
        }
      />

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ninguno. Se añaden aquí, o desde el propio tramo o trámite al elegirlos.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {lista.map((p) => (
            <button key={p.id} onClick={() => setAbierto(p)}
                    className="text-left px-3 py-2.5 rounded-lg bg-white border border-brand-200 hover:border-brand-400 transition">
              <div className="text-[13px] font-semibold text-brand-600">{p.nombre}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {p.tipos.map((t) => (
                  <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-600">
                    {TIPOS.find(([k]) => k === t)?.[1] ?? t}
                  </span>
                ))}
                {p.telefono && <span className="text-[10px] text-brand-400">{p.telefono}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <ProveedorAbierto p={abierto} onCerrar={() => setAbierto(null)}
                          onGuardado={() => { setAbierto(null); void carga(); }} />
      )}
      {nuevo && (
        <ProveedorNuevo onCerrar={() => setNuevo(false)}
                        onCreado={() => { setNuevo(false); void carga(); }} onError={setError} />
      )}
    </div>
  );
}

function ProveedorAbierto({ p, onCerrar, onGuardado }: {
  p: Proveedor; onCerrar: () => void; onGuardado: () => void;
}) {
  const [datos, setDatos] = useState({
    nombre: p.nombre, nif: p.nif ?? '', telefono: p.telefono ?? '',
    email: p.email ?? '', direccion: p.direccion ?? '', notas: p.notas ?? '',
  });
  const [tipos, setTipos] = useState<string[]>(p.tipos ?? []);
  const [cuentas, setCuentas] = useState<Cuentas | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void api.get<Cuentas>(`/proveedores/${p.id}/cuentas`).then((r) => {
      if (r.ok && r.data) setCuentas(r.data as Cuentas);
    });
  }, [p.id]);

  async function guarda() {
    setGuardando(true);
    await api.patch(`/proveedores/${p.id}`, { ...datos, tipos });
    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600">{p.nombre}</h2>
            <p className="text-xs text-brand-400">{p.id}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        {/* Lo que justifica tener esta lista. */}
        {cuentas && (
          <div className="mb-4 p-3 rounded-xl border border-brand-200 bg-brand-50">
            <div className="text-xs font-semibold text-brand-600 mb-1">Lo que llevamos con él</div>
            <table className="w-full text-[12px]">
              <tbody>
                <tr><td className="text-brand-500">Transportes</td>
                    <td className="text-right text-brand-400">{cuentas.transportes.cuantos}</td>
                    <td className="text-right tabular-nums text-brand-600">{eur(cuentas.transportes.total)}</td></tr>
                <tr><td className="text-brand-500">Trámites</td>
                    <td className="text-right text-brand-400">{cuentas.tramites.cuantos}</td>
                    <td className="text-right tabular-nums text-brand-600">{eur(cuentas.tramites.total)}</td></tr>
                <tr><td className="text-brand-500">Reacondicionado</td>
                    <td className="text-right text-brand-400">{cuentas.gastos.cuantos}</td>
                    <td className="text-right tabular-nums text-brand-600">{eur(cuentas.gastos.total)}</td></tr>
                <tr className="border-t border-brand-200">
                  <td className="pt-1 font-bold text-brand-600" colSpan={2}>Total</td>
                  <td className="pt-1 text-right tabular-nums font-bold text-brand-600">{eur(cuentas.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs font-semibold text-brand-500 mb-1">Qué hace</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TIPOS.map(([k, v]) => (
            <button key={k}
                    onClick={() => setTipos((t) => t.includes(k) ? t.filter((x) => x !== k) : [...t, k])}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${
                      tipos.includes(k) ? 'bg-brand-600 text-white border-brand-600'
                                        : 'bg-white text-brand-500 border-brand-200'
                    }`}>
              {v}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([['nombre', 'Nombre'], ['nif', 'NIF'], ['telefono', 'Teléfono'], ['email', 'Correo']] as const).map(([campo, etiqueta]) => (
            <label key={campo} className={`text-[11px] text-brand-400 ${campo === 'nombre' ? 'col-span-2' : ''}`}>
              {etiqueta}
              <input value={datos[campo]} onChange={(e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          ))}
          <label className="col-span-2 text-[11px] text-brand-400">
            Dirección
            <input value={datos.direccion} onChange={(e) => setDatos((d) => ({ ...d, direccion: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="col-span-2 text-[11px] text-brand-400">
            Notas
            <textarea value={datos.notas} rows={2}
                      onChange={(e) => setDatos((d) => ({ ...d, notas: e.target.value }))}
                      className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
        </div>

        <button onClick={() => void guarda()} disabled={guardando || !datos.nombre.trim() || !tipos.length}
                className="mt-3 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40">
          Guardar
        </button>
        <button onClick={() => { void api.patch(`/proveedores/${p.id}`, { activo: false }).then(onGuardado); }}
                className="mt-2 w-full px-3 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg">
          Dar de baja
        </button>
        <p className="text-[10px] text-brand-400 mt-1">
          Darlo de baja lo quita de las listas. Lo que se le compró sigue siendo suyo.
        </p>
      </div>
    </div>
  );
}

function ProveedorNuevo({ onCerrar, onCreado, onError }: {
  onCerrar: () => void; onCreado: () => void; onError: (m: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipos, setTipos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function crea() {
    setGuardando(true);
    const r = await api.post('/proveedores', { nombre, tipos });
    setGuardando(false);
    if (!r.ok) { onError((r as unknown as { detail?: string }).detail || 'No se ha podido crear.'); return; }
    onCreado();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-brand-600 mb-3">Nuevo proveedor</h2>
        <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
               className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
        <div className="text-[11px] text-brand-400 mt-2 mb-1">Qué hace</div>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map(([k, v]) => (
            <button key={k}
                    onClick={() => setTipos((t) => t.includes(k) ? t.filter((x) => x !== k) : [...t, k])}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${
                      tipos.includes(k) ? 'bg-brand-600 text-white border-brand-600'
                                        : 'bg-white text-brand-500 border-brand-200'
                    }`}>
              {v}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-brand-400 mt-2">
          Puede ser varias cosas: hay talleres que también traen coches.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => void crea()} disabled={guardando || !nombre.trim() || !tipos.length}
                  className="flex-1 px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40">
            Crear
          </button>
          <button onClick={onCerrar} className="px-3 py-2 text-xs font-semibold text-brand-500 border border-brand-200 rounded-lg">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
