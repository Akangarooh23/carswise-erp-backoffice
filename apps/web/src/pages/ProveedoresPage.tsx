import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import {
  COLUMNAS, COLUMNAS_TABLA, escapaCsv, nombreDelFichero, filtraFilas,
} from '../lib/proveedores-tabla.js';

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
  ['perito', 'Peritos'],
  ['vendedor', 'Vendedores'],
  ['garantia', 'Garantías'],
  ['otro', 'Otros'],
] as const;

interface Proveedor {
  id: string;
  nombre: string;
  matriz_id: string | null;
  matriz: string | null;
  tipos: string[];
  nif: string;
  telefono: string;
  email: string;
  direccion: string;
  // Dónde se le paga. De este dato depende que salga dinero: a un vendedor
  // alemán se le transfieren 16.890 € de un cliente.
  iban: string;
  notas: string;
  activo: boolean;
}

interface Cuentas {
  /** Cuántas sociedades se han sumado. Más de una es que es un grupo. */
  sociedades?: number;
  transportes: { cuantos: number; total: number };
  tramites: { cuantos: number; total: number };
  gastos: { cuantos: number; total: number };
  total: number;
}

function eur(v: unknown): string {
  const n = Number(v || 0);
  return n ? `${n.toLocaleString('es-ES')} €` : '0 €';
}

const VISTA_GUARDADA = 'cw_erp_proveedores_vista';

/**
 * La vista que se dejó puesta la última vez.
 *
 * En cajas si no hay nada guardado o si el navegador no deja leerlo: es la de
 * siempre, y ninguna pantalla puede caerse porque no se pueda guardar un gusto.
 */
function leeVista(): 'cajas' | 'tabla' {
  try {
    return localStorage.getItem(VISTA_GUARDADA) === 'tabla' ? 'tabla' : 'cajas';
  } catch {
    return 'cajas';
  }
}

export default function ProveedoresPage() {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState(false);

  /**
   * Cajas o tabla, y se recuerda.
   *
   * Quien mira proveedores mira siempre igual: uno los busca de un vistazo y
   * otro los repasa en filas. Volver a la vista que no es cada vez que se entra
   * es de las cosas que más cansan de una herramienta interna.
   *
   * Si el navegador no deja guardar —modo privado, cookies capadas—, se queda en
   * cajas y no pasa nada.
   */
  const [vista, setVista] = useState<'cajas' | 'tabla'>(() => leeVista());

  /**
   * Un filtro por columna, además del de tipo.
   *
   * El de arriba lo resuelve el servidor y trae menos filas; estos afinan sobre
   * lo que ya está en pantalla. Se aplican **todos a la vez**: escribir en dos
   * columnas es acotar más, no cambiar de búsqueda.
   */
  const [porColumna, setPorColumna] = useState<Record<string, string>>({});
  const visibles = filtraFilas(lista, porColumna);
  const hayFiltroDeColumna = Object.values(porColumna).some((v) => v.trim());

  useEffect(() => {
    try { localStorage.setItem(VISTA_GUARDADA, vista); } catch { /* da igual */ }
  }, [vista]);

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

  /**
   * Se exporta **lo que se está viendo**, no todo.
   *
   * Si el fichero trajera siempre el catálogo entero, filtrar por gestorías y
   * exportar daría una lista con transportistas dentro, y nadie lo miraría dos
   * veces. El nombre del fichero lleva el filtro por lo mismo.
   */
  function exporta() {
    const hoy = new Date().toISOString().slice(0, 10);
    descargaCsv(
      nombreDelFichero(filtro, hoy),
      COLUMNAS.map((c) => c.titulo),
      visibles.map((p) => COLUMNAS.map((c) => escapaCsv(c.valor(p)))),
    );
  }

  /** Lo único que no vive en `lib`: esto toca el navegador. */
  function descargaCsv(nombre: string, cabeceras: string[], filas: string[][]) {
    // La marca de orden de bytes: sin ella, Excel se come las tildes.
    const bom = '\ufeff';
    const texto = [cabeceras.join(';'), ...filas.map((f) => f.join(';'))].join('\r\n');
    const blob = new Blob([bom + texto], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Con quién trabajamos, y cuánto llevamos con cada uno"
        actions={
          <button onClick={() => setNuevo(true)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700">
            Nuevo proveedor
          </button>
        }
      />

      {/*
        * El filtro, arriba y con su sitio.
        *
        * Estaba metido entre los botones de la cabecera, donde parece un ajuste
        * más que algo que cambia lo que estás mirando. Aquí se ve que manda sobre
        * las dos cosas de abajo: las cajas y la tabla enseñan lo mismo.
        */}
      <div className="mb-4 p-3 rounded-xl border border-brand-200 bg-white flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-brand-400">
          Tipo de proveedor
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                  className="block mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white min-w-[200px]">
            <option value="">Todos</option>
            {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div className="text-[11px] text-brand-400 pb-2">
          {cargando ? "Cargando…" : `${visibles.length} ${visibles.length === 1 ? "proveedor" : "proveedores"}`}
          {filtro ? ` · ${TIPOS.find(([k]) => k === filtro)?.[1] ?? filtro}` : " · todos los tipos"}
          {hayFiltroDeColumna && ` · de ${lista.length}`}
          <span className="block text-brand-300">El fichero lleva además las notas</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-brand-200 overflow-hidden">
            {([['cajas', 'Cajas'], ['tabla', 'Tabla']] as const).map(([modo, texto]) => (
              <button
                key={modo}
                onClick={() => setVista(modo)}
                aria-pressed={vista === modo}
                className={`px-3 py-2 text-xs font-bold transition ${
                  vista === modo ? 'bg-brand-600 text-white' : 'bg-white text-brand-500 hover:bg-brand-50'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          <button onClick={exporta} disabled={!visibles.length}
                  className="px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40">
            Exportar a CSV
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ninguno. Se añaden aquí, o desde el propio tramo o trámite al elegirlos.
        </div>
      ) : vista === 'cajas' ? (
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
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-200 text-[11px] text-brand-400 text-left">
                  {COLUMNAS_TABLA.map((c) => (
                    <th key={c.titulo} className="px-3 py-2 font-semibold whitespace-nowrap">{c.titulo}</th>
                  ))}
                </tr>
                <tr className="border-b border-brand-200">
                  {COLUMNAS_TABLA.map((c) => (
                    <th key={c.titulo} className="px-2 py-1.5">
                      <input
                        value={porColumna[c.titulo] ?? ''}
                        onChange={(e) => setPorColumna((f) => ({ ...f, [c.titulo]: e.target.value }))}
                        placeholder="Filtrar…"
                        aria-label={`Filtrar por ${c.titulo}`}
                        className="w-full px-2 py-1 text-[11px] font-normal border border-brand-200 rounded bg-white"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} onClick={() => setAbierto(p)}
                      className="border-b border-brand-100 last:border-0 hover:bg-brand-50 cursor-pointer">
                    {COLUMNAS_TABLA.map((c) => (
                      <td key={c.titulo} className="px-3 py-2 text-[12.5px] text-brand-600 align-top">
                        {c.valor(p) || <span className="text-brand-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS_TABLA.length}
                        className="px-3 py-6 text-center text-[12px] text-brand-400">
                      Ninguno cuadra con lo que has escrito.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierto && (
        <ProveedorAbierto p={abierto} todos={lista} onCerrar={() => setAbierto(null)}
                          onGuardado={() => { setAbierto(null); void carga(); }}
                          onError={setError} />
      )}
      {nuevo && (
        <ProveedorNuevo onCerrar={() => setNuevo(false)}
                        onCreado={() => { setNuevo(false); void carga(); }} onError={setError} />
      )}
    </div>
  );
}

/**
 * Los que pueden ser matriz de éste.
 *
 * Fuera él mismo, fuera los que ya cuelgan de otro y fuera si él ya tiene
 * filiales: solo hay dos niveles. Se filtra aquí además de en el servidor para
 * no ofrecer una opción que se va a rechazar.
 */
function posiblesMatrices(p: Proveedor, todos: Proveedor[]): Proveedor[] {
  if (todos.some((x) => x.matriz_id === p.id)) return [];
  return todos.filter((x) => x.id !== p.id && !x.matriz_id && x.activo);
}

function ProveedorAbierto({ p, todos, onCerrar, onGuardado, onError }: {
  p: Proveedor; todos: Proveedor[];
  onCerrar: () => void; onGuardado: () => void; onError: (m: string) => void;
}) {
  const [datos, setDatos] = useState({
    nombre: p.nombre, nif: p.nif ?? '', telefono: p.telefono ?? '',
    email: p.email ?? '', direccion: p.direccion ?? '', iban: p.iban ?? '',
    notas: p.notas ?? '',
    matriz_id: p.matriz_id ?? '',
  });
  const matricesPosibles = posiblesMatrices(p, todos);
  const filiales = todos.filter((x) => x.matriz_id === p.id);
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
    const r = await api.patch(`/proveedores/${p.id}`, { ...datos, tipos });
    if (!r.ok) {
      onError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido guardar.');
      setGuardando(false);
      return;
    }
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
          {/*
            * El IBAN, con su aviso de para qué es.
            *
            * Vivía en «notas» cuando vivía en algún sitio, y ahí no se puede ni
            * exigir ni comparar el día que llegue un correo con un dígito
            * cambiado. Sin él, el ERP no deja soltar el pago al vendedor.
            */}
          <label className="col-span-2 text-[11px] text-brand-400">
            IBAN
            <span className="text-brand-300"> · adónde se le transfiere</span>
            <input value={datos.iban} placeholder="DE89 3704 0044 0532 0130 00"
                   onChange={(e) => setDatos((d) => ({ ...d, iban: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm font-mono border border-brand-200 rounded-lg" />
            {/*
              * El aviso va aquí y no en un manual.
              *
              * Este IBAN llega por correo, y el fraude más común de este negocio
              * es exactamente ese: alguien se mete en medio del hilo y contesta
              * con otra cuenta. Una transferencia salida no vuelve.
              *
              * Se lee justo cuando se está pegando el número, que es el único
              * momento en que sirve de algo.
              */}
            <span className="block mt-1 text-[10.5px] text-brand-400 leading-snug">
              Si te ha llegado por correo, <strong>confírmalo por teléfono</strong> antes de
              transferir. Una cuenta cambiada en mitad de un hilo es el fraude más común
              de esto, y el dinero no vuelve.
            </span>
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

        <div className="mt-3">
          <label className="block text-[11px] text-brand-400">
            Grupo del que forma parte
            <select value={datos.matriz_id}
                    disabled={filiales.length > 0}
                    onChange={(e) => setDatos((d) => ({ ...d, matriz_id: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white disabled:bg-brand-50">
              <option value="">Ninguno, es independiente</option>
              {matricesPosibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </label>
          {filiales.length > 0 && (
            <p className="text-[10px] text-brand-400 mt-1">
              Es un grupo: cuelgan de él {filiales.map((f) => f.nombre).join(', ')}.
              Por eso no puede colgar de otro — solo hay dos niveles.
            </p>
          )}
          {!filiales.length && !matricesPosibles.length && (
            <p className="text-[10px] text-brand-400 mt-1">
              No hay ningún proveedor que pueda ser su grupo todavía.
            </p>
          )}
        </div>

        {tipos.includes('transportista') && <Tarifas proveedorId={p.id} />}
        {tipos.includes('gestoria') && <TarifasGestoria proveedorId={p.id} />}
        {tipos.includes('garantia') && <GarantiasDelProveedor proveedorId={p.id} />}
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

/**
 * Lo que cobra este transportista, por corredor.
 *
 * Antes el coste de traer un coche era un número fijo igual para Múnich que
 * para Hamburgo, y ese número se le suma al precio que ve el cliente. Aquí se
 * guarda lo que cada uno ha dicho que cobra, para que deje de ser una
 * suposición.
 *
 * Sin zona, la tarifa vale para todo el país. Con zona, solo para esa ciudad —y
 * gana a la general, porque alguien se molestó en cerrar ese corredor.
 */
function Tarifas({ proveedorId }: { proveedorId: string }) {
  const [lista, setLista] = useState<TarifaFila[] | null>(null);
  const [nueva, setNueva] = useState(TARIFA_VACIA);
  const [fallo, setFallo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async () => {
    const r = await api.get<TarifaFila[]>(`/proveedores/${proveedorId}/tarifas`);
    setLista(r.ok && Array.isArray(r.data) ? r.data : []);
  }, [proveedorId]);

  useEffect(() => { void carga(); }, [carga]);

  async function anade() {
    setFallo('');
    setGuardando(true);
    const r = await api.post(`/proveedores/${proveedorId}/tarifas`, nueva);
    setGuardando(false);
    if (!r.ok) {
      setFallo((r as unknown as { detail?: string }).detail || 'No se ha podido guardar.');
      return;
    }
    setNueva(TARIFA_VACIA);
    await carga();
  }

  async function quita(id: string) {
    if (!window.confirm(`¿Quitar la tarifa ${id}?`)) return;
    await api.delete(`/proveedores/${proveedorId}/tarifas/${id}`);
    await carga();
  }

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1">Tarifas de transporte</div>
      <p className="text-[11px] text-brand-400 mb-2">
        Precio <strong>por coche</strong>. Sin ciudad, la tarifa vale para todo el país.
      </p>

      {lista === null && <p className="text-[11px] text-brand-300">Cargando…</p>}
      {lista?.length === 0 && (
        <p className="text-[11px] text-brand-400">
          Todavía ninguna. Mientras no las haya, el coste de traer un coche se sigue
          estimando con un número fijo igual para todas las ciudades.
        </p>
      )}

      <div className="space-y-1.5">
        {(lista ?? []).map((t) => (
          <div key={t.id} className="px-3 py-2 rounded-lg border border-brand-200 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-brand-600">
                  {corredor(t)}
                </div>
                <div className="text-[11px] text-brand-500 mt-0.5">
                  {[[t.precio_1, '1 coche'], [t.precio_2_3, '2-3'], [t.precio_4_8, '4-8']]
                    .filter(([v]) => v != null)
                    .map(([v, cuantos]) => `${eur(v)} · ${cuantos}`)
                    .join('   ')}
                </div>
                {(t.dias_transito || t.vigente_hasta) && (
                  <div className="text-[10px] text-brand-400 mt-0.5">
                    {t.dias_transito ? `${t.dias_transito} días de tránsito` : ''}
                    {t.dias_transito && t.vigente_hasta ? ' · ' : ''}
                    {t.vigente_hasta ? `vale hasta el ${t.vigente_hasta}` : ''}
                  </div>
                )}
                {t.notas && <div className="text-[10px] text-brand-400 mt-0.5 whitespace-pre-wrap">{t.notas}</div>}
              </div>
              <button onClick={() => void quita(t.id)}
                      className="text-[11px] text-red-700 hover:underline shrink-0">Quitar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 p-3 rounded-lg border border-brand-200 bg-brand-50">
        <div className="text-[11px] font-semibold text-brand-600 mb-1.5">Añadir una</div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['origen_pais', 'País de origen', 'DE'],
            ['origen_zona', 'Ciudad de origen (opcional)', 'Múnich'],
            ['destino_pais', 'País de destino', 'ES'],
            ['destino_zona', 'Ciudad de destino (opcional)', 'Madrid'],
            ['precio_1', '€ por 1 coche', '900'],
            ['precio_2_3', '€ por coche, 2-3', '750'],
            ['precio_4_8', '€ por coche, 4-8', '620'],
            ['dias_transito', 'Días de tránsito', '7'],
          ] as const).map(([campo, etiqueta, ejemplo]) => (
            <label key={campo} className="text-[10px] text-brand-400">
              {etiqueta}
              <input value={nueva[campo]} placeholder={ejemplo}
                     onChange={(e) => setNueva((n) => ({ ...n, [campo]: e.target.value }))}
                     className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white" />
            </label>
          ))}
          <label className="text-[10px] text-brand-400">
            Vale hasta (opcional)
            <input type="date" value={nueva.vigente_hasta}
                   onChange={(e) => setNueva((n) => ({ ...n, vigente_hasta: e.target.value }))}
                   className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white" />
          </label>
          <label className="col-span-2 text-[10px] text-brand-400">
            Notas
            <input value={nueva.notas} placeholder="Grupaje, sale los lunes, seguro hasta 50.000 €…"
                   onChange={(e) => setNueva((n) => ({ ...n, notas: e.target.value }))}
                   className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white" />
          </label>
        </div>
        {fallo && <p className="text-[11px] text-red-700 mt-1.5">{fallo}</p>}
        <button onClick={() => void anade()} disabled={guardando}
                className="mt-2 w-full px-3 py-1.5 text-[11px] font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40">
          Añadir tarifa
        </button>
      </div>
    </div>
  );
}

interface TarifaFila {
  id: string;
  origen_pais: string; origen_zona: string;
  destino_pais: string; destino_zona: string;
  precio_1: number | null; precio_2_3: number | null; precio_4_8: number | null;
  dias_transito: number | null; vigente_hasta: string | null; notas: string;
}

const TARIFA_VACIA = {
  origen_pais: 'DE', origen_zona: '', destino_pais: 'ES', destino_zona: '',
  precio_1: '', precio_2_3: '', precio_4_8: '', dias_transito: '',
  vigente_hasta: '', notas: '',
};

/** «Alemania → Madrid», o «Múnich → Madrid» si la tarifa es de una ciudad. */
function corredor(t: TarifaFila): string {
  const de = t.origen_zona || nombrePais(t.origen_pais);
  const a = t.destino_zona || nombrePais(t.destino_pais);
  return `${de} → ${a}`;
}

const PAISES: Record<string, string> = {
  DE: 'Alemania', ES: 'España', FR: 'Francia', IT: 'Italia', BE: 'Bélgica',
  NL: 'Países Bajos', AT: 'Austria', PT: 'Portugal', CH: 'Suiza', PL: 'Polonia',
};

function nombrePais(codigo: string): string {
  return PAISES[(codigo ?? '').toUpperCase()] ?? codigo;
}

/**
 * Lo que cobra esta gestoría, trámite a trámite.
 *
 * Va por trámite y no por corredor: un papeleo no se parece a un viaje. Y se
 * guardan por separado los honorarios y las tasas de la DGT, porque **el IVA
 * solo va sobre los honorarios**: las tasas son dinero público que la gestoría
 * adelanta. Aplicar el 21 % al total infla el coste del coche, y ese coste va
 * sumado al precio que ve el cliente.
 */
function TarifasGestoria({ proveedorId }: { proveedorId: string }) {
  const [lista, setLista] = useState<TarifaGestoriaFila[] | null>(null);
  const [nueva, setNueva] = useState(GESTORIA_VACIA);
  const [fallo, setFallo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async () => {
    const r = await api.get<TarifaGestoriaFila[]>(`/proveedores/${proveedorId}/tarifas-gestoria`);
    setLista(r.ok && Array.isArray(r.data) ? r.data : []);
  }, [proveedorId]);

  useEffect(() => { void carga(); }, [carga]);

  async function anade() {
    setFallo('');
    setGuardando(true);
    const r = await api.post(`/proveedores/${proveedorId}/tarifas-gestoria`, nueva);
    setGuardando(false);
    if (!r.ok) {
      setFallo((r as unknown as { detail?: string }).detail || 'No se ha podido guardar.');
      return;
    }
    setNueva(GESTORIA_VACIA);
    await carga();
  }

  async function quita(id: string) {
    if (!window.confirm(`¿Quitar la tarifa ${id}?`)) return;
    await api.delete(`/proveedores/${proveedorId}/tarifas-gestoria/${id}`);
    await carga();
  }

  const faltan = TRAMITES_DE_COCHE.filter(
    (t) => !(lista ?? []).some((x) => x.tramite === t)
  );

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1">Tarifas de gestoría</div>
      <p className="text-[11px] text-brand-400 mb-2">
        El IVA va sobre los honorarios. Las tasas de la DGT no lo llevan: son un suplido.
      </p>

      {lista === null && <p className="text-[11px] text-brand-300">Cargando…</p>}

      <div className="space-y-1.5">
        {(lista ?? []).map((t) => (
          <div key={t.id} className="px-3 py-2 rounded-lg border border-brand-200 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-brand-600">{t.tramite}</div>
                <div className="text-[11px] text-brand-500 mt-0.5">
                  <span className="font-semibold">{eur(t.desglose?.total)}</span>
                  {' · '}{eur(t.honorarios)} honorarios + {eur(t.desglose?.iva)} IVA
                  {Number(t.tasas) > 0 ? ` + ${eur(t.tasas)} tasas` : ''}
                  {Number(t.tasa_colegio) > 0 ? ` + ${eur(t.tasa_colegio)} colegio` : ''}
                </div>
                {t.notas && <div className="text-[10px] text-brand-400 mt-0.5 whitespace-pre-wrap">{t.notas}</div>}
              </div>
              <button onClick={() => void quita(t.id)}
                      className="text-[11px] text-red-700 hover:underline shrink-0">Quitar</button>
            </div>
          </div>
        ))}
      </div>

      {lista !== null && faltan.length > 0 && (
        <div className="mt-2 p-2.5 rounded-lg border border-amber-300 bg-amber-50">
          <div className="text-[11px] font-bold text-amber-900 mb-0.5">Sin precio suyo</div>
          <ul className="text-[11px] text-amber-800 list-disc pl-4">
            {faltan.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="text-[10px] text-amber-700/80 mt-1">
            Mientras falte alguno, el papeleo de un coche que lo necesite no se puede calcular entero.
          </p>
        </div>
      )}

      <div className="mt-3 p-3 rounded-lg border border-brand-200 bg-brand-50">
        <div className="text-[11px] font-semibold text-brand-600 mb-1.5">Añadir un trámite</div>
        <label className="block text-[10px] text-brand-400">
          Trámite
          <select value={nueva.tramite}
                  onChange={(e) => setNueva((n) => ({ ...n, tramite: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white">
            <option value="">Elegir…</option>
            {TRAMITES_DE_COCHE.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {([
            ['honorarios', 'Honorarios €', '20'],
            ['tasas', 'Tasas DGT €', '55,70'],
            ['tasa_colegio', 'Colegio €', '7,90'],
          ] as const).map(([campo, etiqueta, ejemplo]) => (
            <label key={campo} className="text-[10px] text-brand-400">
              {etiqueta}
              <input value={nueva[campo]} placeholder={ejemplo}
                     onChange={(e) => setNueva((n) => ({ ...n, [campo]: e.target.value }))}
                     className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white" />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5 mt-2 text-[10px] text-brand-400">
          <input type="checkbox" checked={nueva.colegio_con_iva}
                 onChange={(e) => setNueva((n) => ({ ...n, colegio_con_iva: e.target.checked }))} />
          La tasa del colegio lleva IVA
        </label>
        <label className="block text-[10px] text-brand-400 mt-1.5">
          Notas
          <input value={nueva.notas} placeholder="Cómo lo llaman ellos en su tarifa…"
                 onChange={(e) => setNueva((n) => ({ ...n, notas: e.target.value }))}
                 className="w-full mt-0.5 px-2 py-1.5 text-xs border border-brand-200 rounded-lg bg-white" />
        </label>
        {fallo && <p className="text-[11px] text-red-700 mt-1.5">{fallo}</p>}
        <button onClick={() => void anade()} disabled={guardando || !nueva.tramite}
                className="mt-2 w-full px-3 py-1.5 text-[11px] font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40">
          Añadir tarifa
        </button>
      </div>
    </div>
  );
}

interface TarifaGestoriaFila {
  id: string;
  tramite: string;
  honorarios: number | null; tasas: number | null; tasa_colegio: number | null;
  colegio_con_iva: boolean; notas: string;
  desglose?: { honorarios: number; iva: number; tasas: number; colegio: number; total: number };
}

const GESTORIA_VACIA = {
  tramite: '', honorarios: '', tasas: '', tasa_colegio: '',
  colegio_con_iva: false, notas: '',
};

/**
 * Los trámites que puede necesitar un coche.
 *
 * Son los mismos nombres con los que el ERP abre un expediente: si no coinciden,
 * el precio no se casa con el trámite y la tarifa no sirve para calcular nada.
 */
const TRAMITES_DE_COCHE = [
  'Transferencia de titularidad',
  'Impuesto de transmisiones',
  'Impuesto de matriculación',
  'ITV de homologación',
  'Matriculación de importación',
  'Baja por exportación o tránsito comunitario',
  'Informe de la DGT',
  'Duplicado del permiso de circulación',
  'Duplicado de la ficha técnica',
  'Cambio de domicilio',
  'Cambio de servicio en la ficha técnica',
  'Baja temporal por entrega a compraventa',
];

/**
 * Los productos de garantía que da este proveedor.
 *
 * Se enseñan aquí porque es donde se busca: cuando hay que reclamar una, lo
 * primero es el proveedor. Y porque hasta ahora **no había dónde verlos** — se
 * cargaban en la base y solo se veían desde la oferta del cliente.
 *
 * Lo que se enseña y en la oferta no: **lo que nos cuesta** y lo que deja. Esos
 * dos números no salen nunca en público, y son los que dicen si el producto
 * tiene sentido.
 */
function GarantiasDelProveedor({ proveedorId }: { proveedorId: string }) {
  const [lista, setLista] = useState<GarantiaFila[] | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const r = await api.get<GarantiaFila[]>('/garantias');
      if (!vigente) return;
      const todas = r.ok && Array.isArray(r.data) ? r.data : [];
      setLista(todas.filter((g) => g.proveedor_id === proveedorId));
    })();
    return () => { vigente = false; };
  }, [proveedorId]);

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1">Garantías que da</div>

      {lista === null && <p className="text-[11px] text-brand-300">Cargando…</p>}
      {lista?.length === 0 && (
        <p className="text-[11px] text-brand-400">
          Ninguna todavía. Los productos se cargan desde un guion mientras no haya
          bastantes como para montar una pantalla de gestión.
        </p>
      )}

      <div className="space-y-1.5">
        {(lista ?? []).map((g) => {
          const precio = Number(g.precio) || 0;
          const coste = g.coste == null ? null : Number(g.coste);
          return (
            <div key={g.id}
                 className={`px-3 py-2 rounded-lg border bg-white ${g.activo ? "border-brand-200" : "border-brand-100 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-brand-600">
                    {g.nombre}
                    {g.es_base && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-600">
                        base
                      </span>
                    )}
                    {!g.activo && <span className="ml-1.5 text-[10px] text-brand-400">de baja</span>}
                  </div>
                  <div className="text-[11px] text-brand-500 mt-0.5">
                    {g.meses ? `${g.meses} meses` : 'sin plazo'}
                    {g.km_cubiertos ? ` · hasta ${Number(g.km_cubiertos).toLocaleString('es-ES')} km` : ''}
                    {g.renunciable ? '' : ' · no se puede renunciar'}
                  </div>
                  <div className="text-[10px] text-brand-400 mt-0.5">
                    Se ofrece a coches de hasta {g.antiguedad_max_anios ?? '—'} años
                    {g.km_max_vehiculo ? ` y ${Number(g.km_max_vehiculo).toLocaleString('es-ES')} km` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-brand-600">{eur(precio)}</div>
                  {coste != null && (
                    <div className="text-[10px] text-brand-400">
                      nos cuesta {eur(coste)} · deja {eur(precio - coste)}
                    </div>
                  )}
                </div>
              </div>

              {(g.coberturas ?? []).length > 0 && (
                <ul className="mt-1.5 pl-4 list-disc text-[10.5px] text-brand-500 space-y-0.5">
                  {(g.coberturas ?? []).map((c) => (
                    <li key={c.texto} className={c.incluida === false ? "line-through text-brand-300" : ""}>
                      {c.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-brand-400 mt-2">
        Lo que nos cuesta y lo que deja <strong>no salen</strong> en la oferta del cliente.
      </p>
    </div>
  );
}

interface GarantiaFila {
  id: string;
  nombre: string;
  proveedor_id: string | null;
  es_base: boolean;
  renunciable: boolean;
  meses: number | null;
  km_cubiertos: number | null;
  precio: number | string;
  coste: number | string | null;
  antiguedad_max_anios: number | null;
  km_max_vehiculo: number | null;
  activo: boolean;
  coberturas?: { texto: string; incluida: boolean }[];
}
