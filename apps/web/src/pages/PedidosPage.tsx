import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';

/**
 * Los pedidos: coches encargados a un proveedor.
 *
 * Vivían dentro de Importaciones porque hasta ahora el único coche que se
 * encargaba venía de Alemania. Encargar es lo mismo se lo pidas a un vendedor
 * alemán, a un concesionario o a una empresa de renting — y también se encarga
 * sin cliente detrás, para stock.
 *
 * Por columnas, como los expedientes, porque el estado es el trabajo: cada
 * columna es lo que hay que hacer ahora con esos coches.
 */

const ESTADOS = ['Borrador', 'Pedido', 'Confirmado', 'En camino', 'Recibido'] as const;
type Estado = (typeof ESTADOS)[number];
const CANCELADO = 'Cancelado';

const QUE_TOCA: Record<Estado, string> = {
  'Borrador':   'Prepararlo y encargarlo',
  'Pedido':     'Esperando que lo acepten',
  'Confirmado': 'Organizar la recogida',
  'En camino':  'Viene de camino',
  'Recibido':   'Está en nuestras manos',
};

const COLOR: Record<Estado, string> = {
  'Borrador':   'bg-brand-50 border-brand-200 text-brand-700',
  'Pedido':     'bg-amber-50 border-amber-200 text-amber-800',
  'Confirmado': 'bg-blue-50 border-blue-200 text-blue-800',
  'En camino':  'bg-indigo-50 border-indigo-200 text-indigo-800',
  'Recibido':   'bg-emerald-50 border-emerald-200 text-emerald-800',
};

const ORIGENES = [
  ['importacion', 'Importación'],
  ['concesionario', 'Concesionario'],
  ['ex-renting', 'Ex-renting'],
  ['particular', 'Particular'],
  ['stock', 'Para stock'],
] as const;

interface Comprobacion {
  clave: string;
  que: string;
  siNo: string;
}

interface Marcada { ok?: boolean; por?: string; el?: string }

interface Recepcion {
  km?: number | null;
  llaves?: number | null;
  documentacion?: string;
  danos?: string;
  observaciones?: string;
  conforme?: boolean;
  reclamacion?: string;
  revisado_por?: string;
  revisado_el?: string;
}

interface Pedido {
  id: string;
  origen: string;
  estado: string;
  proveedor: string;
  vehiculo_titulo: string;
  vehiculo_id: string;
  matricula: string;
  bastidor: string;
  importe: string | number | null;
  cliente_email: string;
  lead_id: string | null;
  fecha_estimada: string | null;
  notas: string;
  comprobaciones: Record<string, Marcada> | null;
  recepcion: Recepcion | null;
  created_at: string;
}

const etiquetaOrigen = (v: string) => ORIGENES.find(([k]) => k === v)?.[1] ?? v;

function eur(v: unknown): string {
  const n = Number(v || 0);
  return n ? `${n.toLocaleString('es-ES')} €` : '—';
}

function dia(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function siguienteEstado(estado: string): Estado | null {
  const i = (ESTADOS as readonly string[]).indexOf(estado);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Pedido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [filtroOrigen, setFiltroOrigen] = useState('');

  const carga = useCallback(async (): Promise<Pedido[]> => {
    setCargando(true);
    setError('');
    const qs = filtroOrigen ? `?origen=${encodeURIComponent(filtroOrigen)}` : '';
    const r = await api.get<Pedido[]>(`/pedidos${qs}`);
    const lista = r.ok && Array.isArray(r.data) ? r.data : [];
    if (r.ok) setPedidos(lista);
    else setError(r.error || 'No se han podido cargar los pedidos.');
    setCargando(false);
    return lista;
  }, [filtroOrigen]);

  useEffect(() => { void carga(); }, [carga]);

  const porEstado = useMemo(() => {
    const mapa = new Map<Estado, Pedido[]>(ESTADOS.map((e) => [e, [] as Pedido[]]));
    for (const p of pedidos) if ((ESTADOS as readonly string[]).includes(p.estado)) mapa.get(p.estado as Estado)!.push(p);
    return mapa;
  }, [pedidos]);

  const cancelados = useMemo(() => pedidos.filter((p) => p.estado === CANCELADO), [pedidos]);

  const enMarcha = pedidos.filter((p) => p.estado !== 'Recibido' && p.estado !== CANCELADO);
  const comprometido = enMarcha.reduce((s, p) => s + Number(p.importe || 0), 0);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<Pedido>(`/pedidos/${id}`, cambios);
    setGuardando(false);
    if (!r.ok) {
      setError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido guardar.');
      return;
    }
    const lista = await carga();
    setAbierto((previo) => (previo && previo.id === id ? (lista.find((x) => x.id === id) ?? previo) : previo));
  }

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Coches encargados a un proveedor, por el estado en el que están"
        actions={
          <>
            <select
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              className="px-3 py-1.5 text-xs border border-brand-200 rounded-lg bg-white"
            >
              <option value="">Todos los orígenes</option>
              {ORIGENES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button
              onClick={() => setNuevo(true)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
            >
              Nuevo pedido
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          ['En marcha', String(enMarcha.length), 'sin contar los recibidos'],
          ['Comprometido', comprometido ? eur(comprometido) : '0 €', 'de coches aún sin recibir'],
          ['Recibidos', String(porEstado.get('Recibido')?.length ?? 0), 'ya están aquí'],
        ].map(([titulo, valor, pie]) => (
          <div key={titulo} className="px-4 py-3 rounded-xl border border-brand-200 bg-white">
            <div className="text-2xl font-bold text-brand-600">{valor}</div>
            <div className="text-xs font-semibold text-brand-500">{titulo}</div>
            <div className="text-[11px] text-brand-400 mt-0.5">{pie}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando pedidos…</div>
      ) : pedidos.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ningún pedido. Los de importación aparecen solos al pasar un expediente
          a «Pedido a Alemania»; el resto se crean aquí.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ESTADOS.map((estado) => {
            const lista = porEstado.get(estado) ?? [];
            return (
              <div key={estado} className="min-w-[240px] w-[240px] shrink-0">
                <div className={`px-3 py-2 rounded-t-xl border text-xs font-bold ${COLOR[estado]}`}>
                  {estado} <span className="opacity-70">· {lista.length}</span>
                  <div className="font-normal opacity-80 mt-0.5 text-[11px]">{QUE_TOCA[estado]}</div>
                </div>
                <div className="border border-t-0 border-brand-200 rounded-b-xl bg-brand-50/40 p-2 min-h-[80px] flex flex-col gap-2">
                  {lista.length === 0 && <div className="text-[11px] text-brand-300 text-center py-3">Ninguno</div>}
                  {lista.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setAbierto(p)}
                      className="text-left w-full px-3 py-2.5 rounded-lg bg-white border border-brand-200 hover:border-brand-400 transition"
                    >
                      <div className="text-[13px] font-semibold text-brand-600 leading-tight">{p.vehiculo_titulo || 'Sin vehículo'}</div>
                      <div className="text-[11px] text-brand-400 mt-0.5">{p.proveedor || 'sin proveedor'}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-600">
                          {etiquetaOrigen(p.origen)}
                        </span>
                        {Number(p.importe || 0) > 0 && (
                          <span className="text-[10px] font-semibold text-brand-500">{eur(p.importe)}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-brand-300 mt-1">{p.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelados.length > 0 && (
        <div className="mt-4 text-xs text-brand-400">{cancelados.length} cancelados</div>
      )}

      {abierto && (
        <PedidoAbierto
          p={abierto}
          guardando={guardando}
          onCerrar={() => setAbierto(null)}
          onCambiar={(cambios) => void cambia(abierto.id, cambios)}
        />
      )}

      {nuevo && (
        <PedidoNuevo
          onCerrar={() => setNuevo(false)}
          onCreado={() => { setNuevo(false); void carga(); }}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  );
}

/**
 * Lo que hay que mirar antes de comprarle a una persona.
 *
 * Solo sale cuando el origen es «particular», porque es el único caso que puede
 * salir mal sin arreglo: un embargo no se quita pagando, una deuda del
 * ayuntamiento bloquea la transferencia, y si quien firma no es el titular la
 * venta no vale. Todo eso se ve antes de pagar y no se ve después.
 *
 * Va arriba del todo y antes del estado a propósito: es lo primero que hay que
 * hacer, y hasta que no esté el botón de encargar no funciona.
 */
function Comprobaciones({ p, guardando, onCambiar }: {
  p: Pedido; guardando: boolean; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const [lista, setLista] = useState<Comprobacion[]>([]);

  useEffect(() => {
    void api.get<Comprobacion[]>(`/pedidos/comprobaciones/${p.origen}`).then((r) => {
      setLista(r.ok && Array.isArray(r.data) ? r.data : []);
    });
  }, [p.origen]);

  if (!lista.length) return null;

  const hechas = p.comprobaciones ?? {};
  const faltan = lista.filter((c) => hechas[c.clave]?.ok !== true).length;

  return (
    <div className={`mb-4 p-3 rounded-xl border ${faltan ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
      <div className={`text-xs font-bold mb-1 ${faltan ? "text-red-800" : "text-emerald-800"}`}>
        {faltan ? `Antes de encargarlo: faltan ${faltan}` : "Comprobado: se puede encargar"}
      </div>
      <p className={`text-[11px] mb-2 ${faltan ? "text-red-700/80" : "text-emerald-700/80"}`}>
        Comprarle a una persona es lo único que puede salir mal sin arreglo.
      </p>
      <ul className="space-y-1.5">
        {lista.map((c) => {
          const m = hechas[c.clave];
          const puesta = m?.ok === true;
          return (
            <li key={c.clave} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={puesta}
                disabled={guardando}
                onChange={(e) => onCambiar({ comprobacion: c.clave, ok: e.target.checked })}
                className="mt-0.5 shrink-0"
              />
              <span className="text-[11px] leading-snug">
                <span className={puesta ? "text-brand-600" : "font-semibold text-brand-700"}>{c.que}</span>
                {!puesta && <span className="block text-red-700/80">{c.siNo}</span>}
                {puesta && m?.por && (
                  <span className="block text-brand-400">
                    {m.por}{m.el ? ` · ${new Date(m.el).toLocaleDateString("es-ES")}` : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Lo que se ve del coche al llegar.
 *
 * Kilómetros y llaves antes que nada: son los dos datos que pierden valor con
 * el tiempo. Los kilómetros hay que leerlos antes de moverlo y las llaves hay
 * que contarlas delante de quien lo trae — descubrir que falta una el día que
 * se entrega al cliente es descubrirlo tarde, y cuesta cientos de euros.
 *
 * Y si no es lo que se compró, hay que poder decirlo aquí y ahora: pasada una
 * semana ya no hay forma de sostener que el golpe venía de fábrica.
 */
function AlLlegar({ p, guardando, onCambiar }: {
  p: Pedido; guardando: boolean; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const r = p.recepcion ?? {};
  const [datos, setDatos] = useState({
    km: r.km != null ? String(r.km) : "",
    llaves: r.llaves != null ? String(r.llaves) : "",
    danos: r.danos ?? "",
    observaciones: r.observaciones ?? "",
    conforme: r.conforme !== false,
    reclamacion: r.reclamacion ?? "",
  });

  const mirado = r.km != null && r.llaves != null;

  return (
    <div className={`mb-4 p-3 rounded-xl border ${mirado ? "bg-brand-50 border-brand-200" : "bg-amber-50 border-amber-200"}`}>
      <div className={`text-xs font-bold mb-1 ${mirado ? "text-brand-700" : "text-amber-800"}`}>
        {mirado ? "Al llegar" : "Al llegar: hay que mirarlo"}
      </div>
      <p className={`text-[11px] mb-2 ${mirado ? "text-brand-500" : "text-amber-700/80"}`}>
        Los kilómetros se leen antes de moverlo y las llaves se cuentan delante de quien lo trae.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-brand-500">
          Kilómetros que marca
          <input value={datos.km} inputMode="numeric"
                 onChange={(e) => setDatos((d) => ({ ...d, km: e.target.value }))}
                 className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white" />
        </label>
        <label className="text-[11px] text-brand-500">
          Llaves
          <input value={datos.llaves} inputMode="numeric"
                 onChange={(e) => setDatos((d) => ({ ...d, llaves: e.target.value }))}
                 className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white" />
        </label>
        <label className="col-span-2 text-[11px] text-brand-500">
          Daños
          <textarea value={datos.danos} rows={2}
                    placeholder="Golpes, arañazos, ruedas…"
                    onChange={(e) => setDatos((d) => ({ ...d, danos: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white" />
        </label>
        <label className="col-span-2 text-[11px] text-brand-500">
          Otras observaciones
          <textarea value={datos.observaciones} rows={2}
                    placeholder="Libro de mantenimiento, ITV, documentación que traía…"
                    onChange={(e) => setDatos((d) => ({ ...d, observaciones: e.target.value }))}
                    className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white" />
        </label>
      </div>

      <label className="flex items-center gap-2 mt-2 text-[12px] text-brand-600">
        <input type="checkbox" checked={!datos.conforme}
               onChange={(e) => setDatos((d) => ({ ...d, conforme: !e.target.checked }))} />
        No es lo que se compró
      </label>
      {!datos.conforme && (
        <textarea value={datos.reclamacion} rows={2}
                  placeholder="Qué se le reclama al proveedor…"
                  onChange={(e) => setDatos((d) => ({ ...d, reclamacion: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-red-200 rounded-lg bg-white" />
      )}

      <button
        onClick={() => onCambiar({ recepcion: {
          km: datos.km === "" ? null : Number(datos.km),
          llaves: datos.llaves === "" ? null : Number(datos.llaves),
          danos: datos.danos, observaciones: datos.observaciones,
          conforme: datos.conforme, reclamacion: datos.reclamacion,
        } })}
        disabled={guardando || (!datos.conforme && !datos.reclamacion.trim())}
        className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
      >
        Guardar lo que se ha visto
      </button>

      {r.revisado_por && (
        <p className="text-[10px] text-brand-400 mt-1.5">
          Lo miró {r.revisado_por}{r.revisado_el ? ` · ${new Date(r.revisado_el).toLocaleDateString("es-ES")}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Un pedido abierto.
 *
 * Cambiar de estado pide decir qué ha pasado, igual que en un expediente: el
 * rastro guarda quién lo movió, pero «el proveedor no confirma hasta el lunes»
 * solo lo sabe quien lo escriba.
 */
function PedidoAbierto({ p, guardando, onCerrar, onCambiar }: {
  p: Pedido; guardando: boolean; onCerrar: () => void; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const [aEstado, setAEstado] = useState<string | null>(null);
  const [porQue, setPorQue] = useState('');
  const [datos, setDatos] = useState({
    proveedor: p.proveedor ?? '', importe: String(p.importe ?? ''),
    matricula: p.matricula ?? '', bastidor: p.bastidor ?? '',
    fecha_estimada: p.fecha_estimada ?? '',
  });
  const siguiente = siguienteEstado(p.estado);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600 leading-tight">{p.vehiculo_titulo || 'Sin vehículo'}</h2>
            <p className="text-xs text-brand-400 mt-0.5">{p.id} · {etiquetaOrigen(p.origen)}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        <Comprobaciones p={p} guardando={guardando} onCambiar={onCambiar} />
        <AlLlegar p={p} guardando={guardando} onCambiar={onCambiar} />

        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Estado</div>
          <select
            value={p.estado}
            disabled={guardando || aEstado !== null}
            onChange={(e) => { setAEstado(e.target.value); setPorQue(''); }}
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
          >
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            <option value={CANCELADO}>{CANCELADO}</option>
          </select>
          {siguiente && aEstado === null && (
            <button
              onClick={() => { setAEstado(siguiente); setPorQue(''); }}
              disabled={guardando}
              className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
            >
              Pasar a «{siguiente}»
            </button>
          )}

          {aEstado !== null && (
            <div className="mt-2 p-3 rounded-lg border border-brand-300 bg-brand-50">
              <div className="text-xs font-semibold text-brand-600 mb-1">Pasar a «{aEstado}». ¿Qué ha pasado?</div>
              <textarea
                value={porQue} onChange={(e) => setPorQue(e.target.value)} rows={2} autoFocus
                placeholder="Confirman para el 12, salen el lunes…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { onCambiar({ estado: aEstado, nota: porQue, proveedor: datos.proveedor }); setAEstado(null); setPorQue(''); }}
                  disabled={guardando || !porQue.trim()}
                  className="flex-1 px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
                >
                  Guardar y pasar
                </button>
                <button
                  onClick={() => { setAEstado(null); setPorQue(''); }}
                  className="px-3 py-2 text-xs font-semibold text-brand-500 border border-brand-200 rounded-lg bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="col-span-2 text-[11px] text-brand-400">
            Proveedor
            <input value={datos.proveedor} onChange={(e) => setDatos((d) => ({ ...d, proveedor: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Importe
            <input value={datos.importe} inputMode="decimal"
                   onChange={(e) => setDatos((d) => ({ ...d, importe: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Lo esperamos para
            <input type="date" value={datos.fecha_estimada}
                   onChange={(e) => setDatos((d) => ({ ...d, fecha_estimada: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Matrícula
            <input value={datos.matricula} onChange={(e) => setDatos((d) => ({ ...d, matricula: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Bastidor
            <input value={datos.bastidor} onChange={(e) => setDatos((d) => ({ ...d, bastidor: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
        </div>
        <button
          onClick={() => onCambiar(datos)}
          disabled={guardando}
          className="w-full px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40"
        >
          Guardar los datos
        </button>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm border-t border-brand-100 pt-4 mt-4">
          <div>
            <dt className="text-[11px] text-brand-400">Cliente</dt>
            <dd className="font-medium text-brand-600 break-all">{p.cliente_email || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-brand-400">Creado</dt>
            <dd className="font-medium text-brand-600">{dia(p.created_at)}</dd>
          </div>
          {p.lead_id && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Expediente</dt>
              <dd><a href="/importaciones" className="text-brand-500 underline underline-offset-2 text-xs">{p.lead_id}</a></dd>
            </div>
          )}
        </dl>

        <Documentos ambito="pedido" id={p.id} origen={p.origen} />

        {p.notas && (
          <div className="mt-4 pt-4 border-t border-brand-100">
            <div className="text-xs font-semibold text-brand-500 mb-1.5">Notas</div>
            <p className="text-[12px] text-brand-600 whitespace-pre-wrap">{p.notas}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Un pedido nuevo, para lo que no nace de una solicitud. */
function PedidoNuevo({ onCerrar, onCreado, onError }: {
  onCerrar: () => void; onCreado: () => void; onError: (m: string) => void;
}) {
  const [datos, setDatos] = useState({ origen: 'concesionario', vehiculo_titulo: '', proveedor: '', importe: '', cliente_email: '' });
  const [guardando, setGuardando] = useState(false);

  async function crea() {
    setGuardando(true);
    const r = await api.post<Pedido>('/pedidos', datos);
    setGuardando(false);
    if (!r.ok) { onError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido crear.'); return; }
    onCreado();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-brand-600 mb-3">Nuevo pedido</h2>
        <div className="space-y-2">
          <select value={datos.origen} onChange={(e) => setDatos((d) => ({ ...d, origen: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white">
            {ORIGENES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Qué coche" value={datos.vehiculo_titulo}
                 onChange={(e) => setDatos((d) => ({ ...d, vehiculo_titulo: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="A quién se le pide" value={datos.proveedor}
                 onChange={(e) => setDatos((d) => ({ ...d, proveedor: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Importe" value={datos.importe} inputMode="decimal"
                 onChange={(e) => setDatos((d) => ({ ...d, importe: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Correo del cliente (si lo hay)" value={datos.cliente_email}
                 onChange={(e) => setDatos((d) => ({ ...d, cliente_email: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
        </div>
        <p className="text-[11px] text-brand-400 mt-2">
          Nace en borrador. Para encargarlo hace falta decir a quién.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => void crea()} disabled={guardando || !datos.vehiculo_titulo.trim()}
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
