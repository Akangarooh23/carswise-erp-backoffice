import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import ElegirProveedor from '../components/ElegirProveedor.js';
import {
  toca as tocaEnFase, camposDe, queTocaEnElPedido,
  type Bloque, type Campo, type CampoDePedido,
} from '../lib/fases-pedido.js';

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

/**
 * Qué significa cada columna, dicho como lo entiende quien mira el tablero.
 *
 * «Recibido» se leía como que lo había recibido **el cliente**, y no es eso:
 * el pedido es la compra al proveedor, y termina cuando el coche es nuestro y
 * está en Zaragoza. Al cliente le quedan por delante los trámites, el segundo
 * transporte y la entrega, y eso vive en el expediente.
 */
const QUE_TOCA: Record<Estado, string> = {
  'Borrador':   'Prepararlo y encargarlo',
  'Pedido':     'Esperando que lo acepten',
  'Confirmado': 'Organizar la recogida',
  'En camino':  'Viene de camino',
  'Recibido':   'Ya es nuestro, en Zaragoza',
};

/** Y el título de la columna, que es lo primero que se lee. */
const COMO_SE_LLAMA: Record<Estado, string> = {
  'Borrador':   'Borrador',
  'Pedido':     'Pedido',
  'Confirmado': 'Confirmado',
  'En camino':  'En camino',
  // No «Recibido» a secas: la compra la recibimos nosotros, no el cliente.
  'Recibido':   'Recibido por nosotros',
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
  /** Cuándo lo descargó el camión en Zaragoza, si ya lo hizo. */
  llegada_at?: string | null;
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
  titularidad: string;
  revender_antes_de: string | null;
  recepcion: Recepcion | null;
  factura_proveedor: string;
  factura_pagada_el: string | null;
  created_at: string;
  /** Lo que falta para cada estado. Lo calcula el servidor con sus mismas reglas. */
  falta_por_estado?: Record<string, string[]>;
  /** Los papeles imprescindibles del origen que aún no están subidos. */
  papeles_faltan?: string[];
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

  /** Vuelve a leer el pedido abierto: lo que le falta lo dice el servidor. */
  async function refresca(id: string) {
    const lista = await carga();
    setAbierto((previo) => (previo && previo.id === id ? (lista.find((x) => x.id === id) ?? previo) : previo));
  }

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<Pedido>(`/pedidos/${id}`, cambios);
    setGuardando(false);
    if (!r.ok) {
      setError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido guardar.');
      return;
    }
    await refresca(id);
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

      <DondeSeGana />

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando pedidos…</div>
      ) : pedidos.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ningún pedido. Los de importación aparecen solos al pasar un expediente
          a «Verificado y pagado»; el resto se crean aquí.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ESTADOS.map((estado) => {
            const lista = porEstado.get(estado) ?? [];
            return (
              <div key={estado} className="min-w-[240px] w-[240px] shrink-0">
                <div className={`px-3 py-2 rounded-t-xl border text-xs font-bold ${COLOR[estado]}`}>
                  {COMO_SE_LLAMA[estado]} <span className="opacity-70">· {lista.length}</span>
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
          onPapeles={() => void refresca(abierto.id)}
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

/** Cuántos días quedan, contados por días enteros: el último cuenta. */
function diasHasta(limite?: string | null): number | null {
  if (!limite) return null;
  const d = new Date(limite);
  if (Number.isNaN(d.getTime())) return null;
  const soloDia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.round((soloDia(d) - soloDia(new Date())) / 86_400_000);
}

/**
 * A nombre de quién va el coche.
 *
 * No es lo mismo que quién lo vende. PopCar vende siempre —su factura, su
 * garantía— pero no tiene por qué ser el titular, y ahí está la diferencia entre
 * pagar un cambio de nombre o dos.
 *
 * Si va a nuestro nombre, empieza a correr el plazo para revenderlo sin que el
 * impuesto de la compra se quede. Pasado, aparece de golpe meses después sobre
 * un coche que ya no interesa a nadie: por eso avisa dos meses antes, que da
 * margen para bajarlo de precio.
 */
function ANombreDeQuien({ p, guardando, onCambiar }: {
  p: Pedido; guardando: boolean; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const aNuestroNombre = p.titularidad === "popcar";
  const dias = diasHasta(p.revender_antes_de);
  const apremia = dias != null && dias <= 60;
  const pasado = dias != null && dias < 0;

  return (
    <div className="mb-4 p-3 rounded-xl border border-brand-200 bg-white">
      <div className="text-xs font-semibold text-brand-500 mb-1">A nombre de</div>
      <div className="flex gap-2">
        {[["cliente", "El cliente"], ["popcar", "PopCar"]].map(([valor, texto]) => (
          <button
            key={valor}
            onClick={() => onCambiar({ titularidad: valor })}
            disabled={guardando || p.titularidad === valor}
            className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border ${
              p.titularidad === valor
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-brand-600 border-brand-200 hover:bg-brand-50"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-brand-400 mt-1.5">
        {aNuestroNombre
          ? "Se pone a nuestro nombre al comprarlo y al del cliente al venderlo: dos cambios de nombre."
          : "Va del vendedor al cliente: un solo cambio de nombre, al venderlo."}
      </p>

      {p.revender_antes_de && (
        <div className={`mt-2 px-3 py-2 rounded-lg text-[12px] ${
          pasado ? "bg-red-50 text-red-800 border border-red-200"
                 : apremia ? "bg-amber-50 text-amber-800 border border-amber-200"
                           : "bg-brand-50 text-brand-600"
        }`}>
          <span className="font-bold">
            {pasado ? "Plazo de reventa pasado" : "Revender antes del"}{" "}
            {new Date(p.revender_antes_de).toLocaleDateString("es-ES")}
          </span>
          {dias != null && !pasado && <span> · quedan {dias} días</span>}
          <span className="block opacity-80">
            {pasado
              ? "El impuesto de la compra ya no se recupera."
              : "Vender ese mismo día está en plazo."}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Dónde se gana dinero.
 *
 * La pregunta de negocio que hay detrás de todo lo demás: de los cuatro caminos
 * de compra, cuál deja margen. Alemania parece barato hasta que se suman el
 * transporte y el impuesto; un particular parece caro hasta que se ve que no
 * lleva ninguna de las dos cosas.
 *
 * Solo cuenta lo vendido. Y no sale hasta que hay algo que contar: un cuadro
 * vacío con cuatro ceros dice menos que no estar.
 */
function DondeSeGana() {
  const [datos, setDatos] = useState<Record<string, { coches: number; margen: number; medio: number }> | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    void api.get<Record<string, { coches: number; margen: number; medio: number }>>('/pedidos/margen-por-origen')
      .then((r) => { if (r.ok && r.data) setDatos(r.data); });
  }, []);

  const filas = Object.entries(datos ?? {});
  if (!filas.length) return null;

  const total = filas.reduce((s, [, v]) => s + v.margen, 0);
  const coches = filas.reduce((s, [, v]) => s + v.coches, 0);

  return (
    <div className="mb-6 rounded-xl border border-brand-200 bg-white">
      <button onClick={() => setAbierto((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left">
        <div>
          <div className="text-xs font-semibold text-brand-500">Dónde se gana</div>
          <div className="text-[11px] text-brand-400">
            {coches} {coches === 1 ? 'coche vendido' : 'coches vendidos'} · {eur(total)} de margen
          </div>
        </div>
        <span className="text-brand-400 text-xs">{abierto ? '▾' : '▸'}</span>
      </button>
      {abierto && (
        <table className="w-full text-[12px] px-4 pb-3">
          <thead>
            <tr className="text-brand-400 text-[10px] uppercase">
              <th className="text-left font-semibold pl-4 pb-1">Origen</th>
              <th className="text-right font-semibold pb-1">Coches</th>
              <th className="text-right font-semibold pb-1">Margen</th>
              <th className="text-right font-semibold pr-4 pb-1">Por coche</th>
            </tr>
          </thead>
          <tbody>
            {filas
              .sort((a, b) => b[1].medio - a[1].medio)
              .map(([origen, v]) => (
                <tr key={origen} className="border-t border-brand-100">
                  <td className="py-1 pl-4 text-brand-600">{etiquetaOrigen(origen)}</td>
                  <td className="py-1 text-right tabular-nums text-brand-500">{v.coches}</td>
                  <td className="py-1 text-right tabular-nums text-brand-600">{eur(v.margen)}</td>
                  <td className={`py-1 pr-4 text-right tabular-nums font-bold ${v.medio >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {eur(v.medio)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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
/**
 * Lo que falta para pasar de fase, dicho antes de intentarlo.
 *
 * El servidor lo bloquea igual. Pero enterarse después de haber escrito la
 * nota, y con un mensaje de error, es enterarse tarde y mal: aquí se ve qué
 * falta y por qué se pide en este punto y no en otro.
 */
function LoQueFalta({ estado, falta }: { estado: string | null; falta: string[] }) {
  if (!estado || !falta.length) return null;
  return (
    <div className="mt-2 p-3 rounded-lg border border-amber-300 bg-amber-50">
      <div className="text-xs font-bold text-amber-900 mb-1">
        Para pasar a «{estado}», falta esto
      </div>
      <ul className="text-[11px] text-amber-800 list-disc pl-4 space-y-0.5">
        {falta.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <p className="text-[11px] text-amber-700/80 mt-1.5">
        {POR_QUE_SE_PIDE[estado] ?? ''}
      </p>
    </div>
  );
}

/** Por qué cada fase pide lo que pide. Sin esto, una puerta cerrada es solo un estorbo. */
const POR_QUE_SE_PIDE: Record<string, string> = {
  'Pedido': 'Encargarlo es comprometerse: hay que saber a quién se le reclama, y con un particular mirar antes lo que no se arregla después.',
  'Confirmado': 'Confirmado quiere decir que hay precio cerrado. Sin importe, el coste y el margen de este coche salen mal.',
  'En camino': 'Ponerlo en camino es contratar un transporte y pagarlo. Sin los papeles que lo hacen nuestro, lo que se mueve es un coche de otro.',
  'Recibido': 'Los kilómetros se leen antes de moverlo y las llaves se cuentan delante de quien lo trae. Eso no se puede hacer después.',
};

/**
 * El nombre de un campo, con si hace falta o no.
 *
 * Un hueco vacío puesto delante parece una tarea pendiente. Casi ninguno de
 * estos lo es: solo el proveedor y el importe cierran el paso, y cada uno a una
 * fase distinta. Decirlo aquí ahorra rellenar a ojo lo que todavía no se sabe.
 */
function Etiqueta({ campo, campos }: { campo: Campo; campos: CampoDePedido[] }) {
  const c = campos.find((x) => x.campo === campo);
  if (!c) return null;
  return (
    <span className="block text-[11px] text-brand-400">
      {c.etiqueta}
      {c.haceFaltaPara
        ? <span className="ml-1 font-semibold text-amber-700">· hace falta para «{c.haceFaltaPara}»</span>
        : <span className="ml-1 text-brand-300">· opcional</span>}
      {c.pista && <span className="block text-[10px] text-brand-300 leading-tight">{c.pista}</span>}
    </span>
  );
}

function PedidoAbierto({ p, guardando, onCerrar, onCambiar, onPapeles }: {
  p: Pedido; guardando: boolean; onCerrar: () => void; onCambiar: (c: Record<string, unknown>) => void;
  /** Subir o quitar un papel cambia lo que falta para moverlo. */
  onPapeles: () => void;
}) {
  const [aEstado, setAEstado] = useState<string | null>(null);
  const [porQue, setPorQue] = useState('');
  const [datos, setDatos] = useState({
    proveedor: p.proveedor ?? '', importe: String(p.importe ?? ''),
    matricula: p.matricula ?? '', bastidor: p.bastidor ?? '',
    fecha_estimada: p.fecha_estimada ?? '',
    factura_proveedor: p.factura_proveedor ?? '',
    factura_pagada_el: p.factura_pagada_el ?? '',
  });
  const siguiente = siguienteEstado(p.estado);
  const [verTodo, setVerTodo] = useState(false);
  const toca = (b: Bloque) => tocaEnFase(b, p.estado, verTodo, p.origen);
  const campos = camposDe(p.estado, verTodo, p.origen);

  /**
   * Subir la factura del vendedor sin salir de donde se pide su número.
   *
   * Va al cajón del pedido y con su papel puesto —«Factura del vendedor
   * alemán»—, que es lo que hace que cuente para la lista de lo que falta
   * por reunir en vez de quedarse como un adjunto suelto.
   */
  const [subiendo, setSubiendo] = useState(false);
  const [falloAlSubir, setFalloAlSubir] = useState('');

  async function subeLaFactura(fichero: File) {
    setFalloAlSubir('');
    setSubiendo(true);
    try {
      const base64 = await new Promise<string>((listo, falla) => {
        const lector = new FileReader();
        lector.onload = () => listo(String(lector.result).split(',')[1] ?? '');
        lector.onerror = () => falla(new Error('no se ha podido leer'));
        lector.readAsDataURL(fichero);
      });
      const r = await api.post(`/documentos/pedido/${p.id}`, {
        nombre: fichero.name, tipo: fichero.type,
        papel: 'Factura del vendedor alemán', contenido_base64: base64,
      });
      if (!r.ok) {
        setFalloAlSubir(r.error === 'fichero_no_valido'
          ? 'Ese fichero no vale: PDF o imagen, hasta 3 MB.'
          : 'No se ha podido guardar.');
        return;
      }
      onPapeles();
    } catch {
      setFalloAlSubir('No se ha podido leer el fichero.');
    } finally {
      setSubiendo(false);
    }
  }
  const sale = (c: Campo) => campos.some((x) => x.campo === c);

  /**
   * Lo que falta para poder pasar a un estado.
   *
   * Lo dice el servidor, que es quien lo bloquea: aquí solo se enseña. Así no
   * hay dos versiones de la regla, y lo que se lee en pantalla es exactamente
   * lo que va a permitir o no la próxima llamada.
   */
  const faltaPara = (estado: string | null): string[] =>
    estado ? (p.falta_por_estado?.[estado] ?? []) : [];

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

        {/*
          * Qué toca en este pedido, antes de nada.
          *
          * Es la misma pregunta con la que se abre un expediente, y la
          * respuesta depende del origen: un pedido de importación nace
          * comprado y pagado, así que «esperando que lo acepten» —que es lo
          * que decía— no solo se entiende mal, es falso.
          */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <div className="text-[10px] uppercase tracking-wide text-amber-700/80">Ahora toca</div>
          <div className="text-[13px] font-bold text-amber-800">
            {queTocaEnElPedido(p.estado, p.origen, QUE_TOCA[p.estado as Estado] ?? p.estado, {
              ...datos, llegada_at: p.llegada_at,
            })}
          </div>
        </div>

        {toca('titular') && <ANombreDeQuien p={p} guardando={guardando} onCambiar={onCambiar} />}
        {toca('comprobaciones') && <Comprobaciones p={p} guardando={guardando} onCambiar={onCambiar} />}
        {toca('alLlegar') && <AlLlegar p={p} guardando={guardando} onCambiar={onCambiar} />}

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
              disabled={guardando || faltaPara(siguiente).length > 0}
              className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
            >
              Pasar a «{siguiente}»
            </button>
          )}

          <LoQueFalta estado={aEstado ?? siguiente} falta={faltaPara(aEstado ?? siguiente)} />

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
                  disabled={guardando || !porQue.trim() || faltaPara(aEstado).length > 0}
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

        {campos.length > 0 && (<>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {sale('proveedor') && (
            <div className="col-span-2">
              <Etiqueta campo="proveedor" campos={campos} />
              <div className="mt-0.5">
                <ElegirProveedor tipo="vendedor" valor={datos.proveedor}
                                 placeholder="A quién se le compra…"
                                 onCambio={(v) => setDatos((d) => ({ ...d, proveedor: v }))} />
              </div>
            </div>
          )}
          {sale('importe') && (
            <label className="block">
              <Etiqueta campo="importe" campos={campos} />
              <input value={datos.importe} inputMode="decimal"
                     onChange={(e) => setDatos((d) => ({ ...d, importe: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          {sale('fecha_estimada') && (
            <label className="block">
              <Etiqueta campo="fecha_estimada" campos={campos} />
              <input type="date" value={datos.fecha_estimada}
                     onChange={(e) => setDatos((d) => ({ ...d, fecha_estimada: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          {sale('factura_proveedor') && (
            <label className="block">
              <Etiqueta campo="factura_proveedor" campos={campos} />
              <input value={datos.factura_proveedor} placeholder="RE-2026-4471"
                     onChange={(e) => setDatos((d) => ({ ...d, factura_proveedor: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          {/*
            * El papel, donde se pide el dato.
            *
            * Estaba abajo, en Documentos, y aquí solo una línea diciéndolo.
            * Quien acaba de teclear el número de la factura tiene el PDF en la
            * mano: hacerle bajar a otro bloque es donde el papel se queda en
            * el correo de quien lo recibió.
            *
            * Se sube al cajón del pedido con su papel puesto, así que cuenta
            * de una vez para la lista de lo que falta y se ve desde el
            * expediente.
            */}
          {sale('factura_proveedor') && (
            <div className="col-span-2 flex flex-wrap items-center gap-2 -mt-1">
              <label className="inline-block px-3 py-1.5 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg cursor-pointer hover:bg-brand-50">
                {subiendo ? 'Subiendo…' : 'Adjuntar la factura del vendedor'}
                <input type="file" className="hidden" disabled={subiendo}
                       accept="application/pdf,image/*"
                       onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void subeLaFactura(f); }} />
              </label>
              <span className="text-[10px] text-brand-300">
                Se guarda con los papeles del coche, en el expediente.
              </span>
              {falloAlSubir && (
                <span className="text-[11px] text-red-700 font-medium">{falloAlSubir}</span>
              )}
            </div>
          )}

          {sale('factura_pagada_el') && (
            <label className="block">
              <Etiqueta campo="factura_pagada_el" campos={campos} />
              <input type="date" value={datos.factura_pagada_el}
                     onChange={(e) => setDatos((d) => ({ ...d, factura_pagada_el: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          {sale('bastidor') && (
            <label className="block">
              <Etiqueta campo="bastidor" campos={campos} />
              <input value={datos.bastidor} onChange={(e) => setDatos((d) => ({ ...d, bastidor: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          {sale('matricula') && (
            <label className="block">
              <Etiqueta campo="matricula" campos={campos} />
              <input value={datos.matricula} onChange={(e) => setDatos((d) => ({ ...d, matricula: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
        </div>
        <button
          onClick={() => onCambiar(datos)}
          disabled={guardando}
          className="w-full px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40"
        >
          Guardar los datos
        </button>

        {/*
          * Cuándo estará listo no se decide aquí: lo dice el vendedor.
          *
          * Se le pregunta desde Transportes, en el mismo correo que la
          * dirección exacta, la hora, por quién preguntar y si entra un
          * portacoches. Un campo de fecha suelto aquí invita a poner una a
          * ojo, y de ahí sale una orden de recogida para un día en el que el
          * coche no está listo.
          */}
        {p.origen === 'importacion' && (
          <p className="mt-2 text-[11px] text-brand-300">
            Cuándo estará listo para recoger lo dice el vendedor.{' '}
            <a href="/transportes" className="underline underline-offset-2">Se le pregunta en Transportes</a>,
            junto con la dirección exacta, la hora, por quién preguntar y si entra un portacoches.
          </p>
        )}
        </>)}

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

        {toca('gastos') && <><Reacondicionado id={p.id} /><LoQueCuesta id={p.id} /></>}

        {toca('papeles') && (
          <Documentos ambito="pedido" id={p.id} origen={p.origen} coche={p.lead_id}
                      onCambio={onPapeles} />
        )}

        <button
          onClick={() => setVerTodo((v) => !v)}
          className="mt-4 w-full px-3 py-2 text-[11px] font-semibold text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50"
        >
          {verTodo ? 'Ver solo lo de esta fase' : 'Ver todos los datos del pedido'}
        </button>

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

/**
 * Lo que se gasta en dejarlo listo.
 *
 * Taller, ruedas, ITV, chapa, limpieza. Era la partida que faltaba en el coste,
 * y sin ella el margen que se enseñaba era optimista: un coche que llega con las
 * ruedas gastadas y una revisión pendiente lleva mil euros encima antes de
 * ponerse a la venta.
 */
function Reacondicionado({ id }: { id: string }) {
  const [gastos, setGastos] = useState<{ id: string; concepto: string; importe: number; proveedor: string }[]>([]);
  const [habituales, setHabituales] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState({ concepto: "", importe: "", proveedor: "" });
  const [fallo, setFallo] = useState("");

  const carga = useCallback(async () => {
    const r = await api.get<typeof gastos>(`/pedidos/${id}/gastos`);
    if (r.ok && Array.isArray(r.data)) setGastos(r.data as never);
  }, [id]);

  useEffect(() => { void carga(); }, [carga]);
  useEffect(() => {
    void api.get<string[]>('/gastos/habituales').then((r) => {
      if (r.ok && Array.isArray(r.data)) setHabituales(r.data);
    });
  }, []);

  async function anade() {
    setFallo("");
    const r = await api.post(`/pedidos/${id}/gastos`, nuevo);
    if (!r.ok) {
      setFallo((r as unknown as { detail?: string }).detail || "No se ha podido guardar.");
      return;
    }
    setNuevo({ concepto: "", importe: "", proveedor: "" });
    await carga();
  }

  async function quita(gastoId: string) {
    await api.delete(`/pedidos/${id}/gastos/${gastoId}`);
    await carga();
  }

  const total = gastos.reduce((s, g) => s + Number(g.importe || 0), 0);

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1.5">
        Reacondicionado {total > 0 && <span className="text-brand-400">· {eur(total)}</span>}
      </div>

      {gastos.length > 0 && (
        <ul className="space-y-1 mb-2">
          {gastos.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-[12px]">
              <span className="flex-1 text-brand-600 truncate">
                {g.concepto}{g.proveedor ? ` · ${g.proveedor}` : ""}
              </span>
              <span className="tabular-nums text-brand-600">{eur(g.importe)}</span>
              <button onClick={() => void quita(g.id)} className="text-[10px] text-red-600 hover:underline">quitar</button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2">
        <input list="gastos-habituales" placeholder="En qué" value={nuevo.concepto}
               onChange={(e) => setNuevo((d) => ({ ...d, concepto: e.target.value }))}
               className="col-span-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
        <datalist id="gastos-habituales">
          {habituales.map((h) => <option key={h} value={h} />)}
        </datalist>
        <input placeholder="€" value={nuevo.importe} inputMode="decimal"
               onChange={(e) => setNuevo((d) => ({ ...d, importe: e.target.value }))}
               className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
      </div>
      <button onClick={() => void anade()}
              disabled={!nuevo.concepto.trim() || !Number(nuevo.importe)}
              className="mt-2 w-full px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40">
        Añadir gasto
      </button>
      {fallo && <p className="text-[11px] text-red-600 mt-1.5">{fallo}</p>}
    </div>
  );
}

/**
 * Lo que ha costado el coche.
 *
 * Las piezas viven en sitios distintos —el precio en el pedido, el transporte en
 * sus tramos, la gestoría en sus trámites— y nadie tenía la suma. Sin ella no se
 * sabe si un camino de compra deja dinero: Alemania parece barato hasta que se
 * suman el transporte y el impuesto.
 */
function LoQueCuesta({ id }: { id: string }) {
  const [coste, setCoste] = useState<{
    partidas: { concepto: string; importe: number }[];
    total: number;
    margen: { coste: number; venta: number; margen: number; porcentaje: number | null } | null;
  } | null>(null);

  useEffect(() => {
    void api.get<typeof coste>(`/pedidos/${id}/coste`).then((r) => {
      if (r.ok && r.data) setCoste(r.data as never);
    });
  }, [id]);

  if (!coste) return null;

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-2">Lo que cuesta</div>
      <table className="w-full text-[12px]">
        <tbody>
          {coste.partidas.map((x) => (
            <tr key={x.concepto}>
              <td className="py-0.5 text-brand-500">{x.concepto}</td>
              <td className="py-0.5 text-right tabular-nums text-brand-600">{eur(x.importe)}</td>
            </tr>
          ))}
          <tr className="border-t border-brand-200">
            <td className="pt-1 font-bold text-brand-600">Total</td>
            <td className="pt-1 text-right tabular-nums font-bold text-brand-600">{eur(coste.total)}</td>
          </tr>
        </tbody>
      </table>

      {coste.margen ? (
        <div className={`mt-2 px-3 py-2 rounded-lg text-[12px] ${coste.margen.margen >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          <span className="font-bold">
            {coste.margen.margen >= 0 ? "Margen" : "Pérdida"}: {eur(Math.abs(coste.margen.margen))}
          </span>
          {coste.margen.porcentaje != null && <span> · {coste.margen.porcentaje} % sobre la venta</span>}
          <span className="block opacity-80">Vendido por {eur(coste.margen.venta)}</span>
        </div>
      ) : (
        <p className="text-[11px] text-brand-400 mt-1.5">
          Todavía sin vender: esto es lo que llevamos puesto, no una pérdida.
        </p>
      )}
    </div>
  );
}

/** Un pedido nuevo, para lo que no nace de una solicitud. */
function PedidoNuevo({ onCerrar, onCreado, onError }: {
  onCerrar: () => void; onCreado: () => void; onError: (m: string) => void;
}) {
  const [datos, setDatos] = useState({
    origen: 'concesionario', vehiculo_titulo: '', proveedor: '', importe: '', cliente_email: '',
    titularidad: '',
  });
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
          <ElegirProveedor tipo="vendedor" valor={datos.proveedor}
                           placeholder="A quién se le pide"
                           onCambio={(v) => setDatos((d) => ({ ...d, proveedor: v }))} />
          <input placeholder="Importe" value={datos.importe} inputMode="decimal"
                 onChange={(e) => setDatos((d) => ({ ...d, importe: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Correo del cliente (si lo hay)" value={datos.cliente_email}
                 onChange={(e) => setDatos((d) => ({ ...d, cliente_email: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <select value={datos.titularidad}
                  onChange={(e) => setDatos((d) => ({ ...d, titularidad: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white">
            <option value="">A nombre de… (con cliente, el suyo)</option>
            <option value="cliente">El cliente</option>
            <option value="popcar">PopCar</option>
          </select>
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
