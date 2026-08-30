import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import ElegirProveedor from '../components/ElegirProveedor.js';

/**
 * Los transportes: cada viaje que hace un coche.
 *
 * Un coche de Alemania hace uno, y a veces tres: del vendedor al almacén, del
 * almacén al taller, del taller al cliente. Cada uno es un tramo con su
 * transportista, sus fechas y su coste.
 *
 * La pantalla se ordena por lo que hay que hacer: primero lo que está sin
 * organizar —eso es un coche que nadie ha quedado en recoger—, después lo que
 * viene de camino, con los días que lleva.
 */

const ESTADOS = ['Por organizar', 'Contratado', 'Recogido', 'En tránsito', 'Entregado'] as const;
type Estado = (typeof ESTADOS)[number];
const INCIDENCIA = 'Con incidencia';

const QUE_TOCA: Record<Estado, string> = {
  'Por organizar': 'Buscar quién lo trae y cerrar precio',
  'Contratado':    'Esperando a que lo recojan',
  'Recogido':      'Ya lo tiene el transportista',
  'En tránsito':   'De camino',
  'Entregado':     'Ha llegado',
};

const COLOR: Record<string, string> = {
  'Por organizar':  'bg-amber-50 border-amber-200 text-amber-800',
  'Contratado':     'bg-brand-50 border-brand-200 text-brand-700',
  'Recogido':       'bg-blue-50 border-blue-200 text-blue-800',
  'En tránsito':    'bg-indigo-50 border-indigo-200 text-indigo-800',
  'Entregado':      'bg-emerald-50 border-emerald-200 text-emerald-800',
  'Con incidencia': 'bg-red-50 border-red-200 text-red-800',
};

interface Transporte {
  id: string;
  pedido_id: string | null;
  tramo: number;
  estado: string;
  transportista: string;
  desde: string;
  hasta: string;
  vehiculo_titulo: string;
  matricula: string;
  coste: string | number | null;
  recogida_prevista: string | null;
  entrega_prevista: string | null;
  fecha_recogida: string | null;
  fecha_entrega: string | null;
  notas: string;
  created_at: string;
}

const enCamino = (e: string) => e === 'Recogido' || e === 'En tránsito';

function eur(v: unknown): string {
  const n = Number(v || 0);
  return n ? `${n.toLocaleString('es-ES')} €` : '—';
}

function dia(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function diasDesde(v?: string | null): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function siguienteEstado(estado: string): Estado | null {
  const i = (ESTADOS as readonly string[]).indexOf(estado);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

export default function TransportesPage() {
  const [lista, setLista] = useState<Transporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Transporte | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async (): Promise<Transporte[]> => {
    setCargando(true);
    setError('');
    const r = await api.get<Transporte[]>('/transportes');
    const datos = r.ok && Array.isArray(r.data) ? r.data : [];
    if (r.ok) setLista(datos);
    else setError(r.error || 'No se han podido cargar los transportes.');
    setCargando(false);
    return datos;
  }, []);

  useEffect(() => { void carga(); }, [carga]);

  const porOrganizar = useMemo(() => lista.filter((t) => t.estado === 'Por organizar'), [lista]);
  const viajando = useMemo(
    () => lista.filter((t) => enCamino(t.estado))
      .sort((a, b) => (diasDesde(b.fecha_recogida) ?? 0) - (diasDesde(a.fecha_recogida) ?? 0)),
    [lista]
  );
  const resto = useMemo(
    () => lista.filter((t) => t.estado !== 'Por organizar' && !enCamino(t.estado)),
    [lista]
  );

  const gastado = lista.reduce((s, t) => s + Number(t.coste || 0), 0);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<Transporte>(`/transportes/${id}`, cambios);
    setGuardando(false);
    if (!r.ok) {
      setError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido guardar.');
      return;
    }
    const datos = await carga();
    setAbierto((previo) => (previo && previo.id === id ? (datos.find((x) => x.id === id) ?? previo) : previo));
  }

  return (
    <div>
      <PageHeader
        title="Transportes"
        subtitle="Cada viaje que hace un coche, con quién lo trae y cuánto cuesta"
        actions={
          <button
            onClick={() => setNuevo(true)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            Nuevo tramo
          </button>
        }
      />

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          ['Sin organizar', String(porOrganizar.length), 'nadie ha quedado en recogerlos'],
          ['De camino', String(viajando.length), 'en manos del transportista'],
          ['Gastado en transporte', gastado ? eur(gastado) : '0 €', 'todos los tramos'],
        ].map(([titulo, valor, pie]) => (
          <div key={titulo} className="px-4 py-3 rounded-xl border border-brand-200 bg-white">
            <div className="text-2xl font-bold text-brand-600">{valor}</div>
            <div className="text-xs font-semibold text-brand-500">{titulo}</div>
            <div className="text-[11px] text-brand-400 mt-0.5">{pie}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando transportes…</div>
      ) : lista.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ningún transporte. Se abre uno solo al confirmar un pedido; los demás
          tramos se añaden aquí.
        </div>
      ) : (
        <>
          <Bloque titulo="Sin organizar" pie="Un coche que nadie ha quedado en recoger" lista={porOrganizar} onAbrir={setAbierto} />
          <Bloque titulo="De camino" pie="Lo que lleva más días, arriba" lista={viajando} onAbrir={setAbierto} conDias />
          <Bloque titulo="Lo demás" pie="Contratados, entregados o con incidencia" lista={resto} onAbrir={setAbierto} />
        </>
      )}

      {abierto && (
        <TransporteAbierto
          t={abierto}
          guardando={guardando}
          onCerrar={() => setAbierto(null)}
          onCambiar={(c) => void cambia(abierto.id, c)}
        />
      )}

      {nuevo && (
        <TramoNuevo onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); void carga(); }} onError={setError} />
      )}
    </div>
  );
}

function Bloque({ titulo, pie, lista, onAbrir, conDias = false }: {
  titulo: string; pie: string; lista: Transporte[]; onAbrir: (t: Transporte) => void; conDias?: boolean;
}) {
  if (!lista.length) return null;
  return (
    <div className="mb-5">
      <h2 className="text-sm font-bold text-brand-600">{titulo}</h2>
      <p className="text-[11px] text-brand-400 mb-2">{pie}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {lista.map((t) => {
          const dias = conDias ? diasDesde(t.fecha_recogida) : null;
          return (
            <button key={t.id} onClick={() => onAbrir(t)}
                    className="text-left px-3 py-2.5 rounded-lg bg-white border border-brand-200 hover:border-brand-400 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-brand-600 leading-tight truncate">
                    {t.vehiculo_titulo || t.matricula || 'Sin coche'}
                  </div>
                  <div className="text-[11px] text-brand-400 truncate">{t.desde} → {t.hasta}</div>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${COLOR[t.estado] ?? ''}`}>
                  {t.estado}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {t.transportista && <span className="text-[10px] text-brand-500">{t.transportista}</span>}
                {Number(t.coste || 0) > 0 && <span className="text-[10px] font-semibold text-brand-500">{eur(t.coste)}</span>}
                {dias !== null && (
                  <span className={`text-[10px] font-bold ${dias > 10 ? 'text-red-600' : 'text-brand-400'}`}>
                    {dias} días de viaje
                  </span>
                )}
                <span className="text-[10px] text-brand-300">tramo {t.tramo} · {t.id}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TransporteAbierto({ t, guardando, onCerrar, onCambiar }: {
  t: Transporte; guardando: boolean; onCerrar: () => void; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const [aEstado, setAEstado] = useState<string | null>(null);
  const [porQue, setPorQue] = useState('');
  const [datos, setDatos] = useState({
    transportista: t.transportista ?? '', coste: String(t.coste ?? ''),
    desde: t.desde ?? '', hasta: t.hasta ?? '',
    recogida_prevista: t.recogida_prevista ?? '', entrega_prevista: t.entrega_prevista ?? '',
  });
  const siguiente = siguienteEstado(t.estado);
  const dias = diasDesde(t.fecha_recogida);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600 leading-tight">
              {t.vehiculo_titulo || t.matricula || 'Sin coche'}
            </h2>
            <p className="text-xs text-brand-400 mt-0.5">{t.desde} → {t.hasta} · tramo {t.tramo}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        {enCamino(t.estado) && dias !== null && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-[12px] font-semibold ${dias > 10 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
            Recogido el {dia(t.fecha_recogida)} · lleva {dias} días de viaje
          </div>
        )}

        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Estado</div>
          <select
            value={t.estado}
            disabled={guardando || aEstado !== null}
            onChange={(e) => { setAEstado(e.target.value); setPorQue(''); }}
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
          >
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            <option value={INCIDENCIA}>{INCIDENCIA}</option>
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
                placeholder="Recogido en Múnich, sale el lunes…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { onCambiar({ estado: aEstado, nota: porQue, transportista: datos.transportista, coste: datos.coste }); setAEstado(null); setPorQue(''); }}
                  disabled={guardando || !porQue.trim()}
                  className="flex-1 px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
                >
                  Guardar y pasar
                </button>
                <button onClick={() => { setAEstado(null); setPorQue(''); }}
                        className="px-3 py-2 text-xs font-semibold text-brand-500 border border-brand-200 rounded-lg bg-white">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="col-span-2 text-[11px] text-brand-400">
            Quién lo trae
            <div className="mt-0.5">
              <ElegirProveedor tipo="transportista" valor={datos.transportista}
                               placeholder="Elegir transportista…"
                               onCambio={(v) => setDatos((d) => ({ ...d, transportista: v }))} />
            </div>
          </div>
          <label className="text-[11px] text-brand-400">
            Coste
            <input value={datos.coste} inputMode="decimal"
                   onChange={(e) => setDatos((d) => ({ ...d, coste: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Recogida prevista
            <input type="date" value={datos.recogida_prevista}
                   onChange={(e) => setDatos((d) => ({ ...d, recogida_prevista: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Desde
            <input value={datos.desde} onChange={(e) => setDatos((d) => ({ ...d, desde: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
          <label className="text-[11px] text-brand-400">
            Hasta
            <input value={datos.hasta} onChange={(e) => setDatos((d) => ({ ...d, hasta: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>
        </div>
        <button onClick={() => onCambiar(datos)} disabled={guardando}
                className="w-full px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40">
          Guardar los datos
        </button>

        {/* Las fotos van aquí, del viaje y no del coche: son lo único que
            distingue un golpe que ya venía de uno que se hizo por el camino. */}
        <Documentos ambito="transporte" id={t.id} />

        {t.notas && (
          <div className="mt-4 pt-4 border-t border-brand-100">
            <div className="text-xs font-semibold text-brand-500 mb-1.5">Notas</div>
            <p className="text-[12px] text-brand-600 whitespace-pre-wrap">{t.notas}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TramoNuevo({ onCerrar, onCreado, onError }: {
  onCerrar: () => void; onCreado: () => void; onError: (m: string) => void;
}) {
  const [datos, setDatos] = useState({
    pedido_id: '', vehiculo_titulo: '', matricula: '', desde: '', hasta: '', transportista: '', coste: '',
  });
  const [guardando, setGuardando] = useState(false);

  async function crea() {
    setGuardando(true);
    const r = await api.post<Transporte>('/transportes', datos);
    setGuardando(false);
    if (!r.ok) { onError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido crear.'); return; }
    onCreado();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-brand-600 mb-3">Nuevo tramo</h2>
        <div className="space-y-2">
          <input placeholder="Desde" value={datos.desde}
                 onChange={(e) => setDatos((d) => ({ ...d, desde: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Hasta" value={datos.hasta}
                 onChange={(e) => setDatos((d) => ({ ...d, hasta: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Coche" value={datos.vehiculo_titulo}
                 onChange={(e) => setDatos((d) => ({ ...d, vehiculo_titulo: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Pedido (si sale de uno)" value={datos.pedido_id}
                 onChange={(e) => setDatos((d) => ({ ...d, pedido_id: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <ElegirProveedor tipo="transportista" valor={datos.transportista}
                           placeholder="Quién lo trae"
                           onCambio={(v) => setDatos((d) => ({ ...d, transportista: v }))} />
          <input placeholder="Coste" value={datos.coste} inputMode="decimal"
                 onChange={(e) => setDatos((d) => ({ ...d, coste: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
        </div>
        <p className="text-[11px] text-brand-400 mt-2">
          Nace por organizar. Para darlo por contratado hace falta quién lo trae y por cuánto.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => void crea()} disabled={guardando || !datos.desde.trim() || !datos.hasta.trim()}
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
