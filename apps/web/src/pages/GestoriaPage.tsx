import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { papeleosPorCoche } from '../lib/papeleos-por-coche.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import ElegirProveedor from '../components/ElegirProveedor.js';

/**
 * Gestoría: los papeleos de los coches.
 *
 * Los lleva alguien de fuera, así que la pregunta de cada mañana no es «qué hay
 * pendiente» sino **de qué dependemos de que conteste otro, y desde cuándo**. Un
 * trámite que lleva tres semanas en una gestoría sin que nadie lo mire es lo que
 * esta pantalla tiene que hacer imposible: sale arriba, con los días delante.
 *
 * El tipo de trámite es texto libre con sugerencias. Lo que hace falta depende
 * del caso —importación, venta entre particulares, una ITV— y una lista cerrada
 * obligaría a tocar el código cada vez que aparezca un papeleo nuevo.
 */

const ESTADOS = [
  'Pendiente',
  'Documentación incompleta',
  'Enviado a gestoría',
  'En trámite',
  'Resuelto',
] as const;
type Estado = (typeof ESTADOS)[number];
const RECHAZADO = 'Rechazado';

const QUE_TOCA: Record<Estado, string> = {
  'Pendiente':                'Reunir lo que hace falta',
  'Documentación incompleta': 'Falta algo nuestro o del cliente',
  'Enviado a gestoría':       'Fuera, esperando que lo cojan',
  'En trámite':               'La gestoría lo está tramitando',
  'Resuelto':                 'Terminado',
};

const COLOR: Record<string, string> = {
  'Pendiente':                'bg-brand-50 border-brand-200 text-brand-700',
  'Documentación incompleta': 'bg-amber-50 border-amber-200 text-amber-800',
  'Enviado a gestoría':       'bg-blue-50 border-blue-200 text-blue-800',
  'En trámite':               'bg-indigo-50 border-indigo-200 text-indigo-800',
  'Resuelto':                 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'Rechazado':                'bg-red-50 border-red-200 text-red-800',
};

interface Tramite {
  id: string;
  tipo: string;
  estado: string;
  gestoria: string;
  vehiculo_titulo: string;
  matricula: string;
  bastidor: string;
  cliente_email: string;
  pedido_id: string | null;
  lead_id: string | null;
  /** Si al expediente de este coche ya se le ha mandado el encargo. */
  encargo_enviado_at?: string | null;
  coste: string | number | null;
  fecha_enviado: string | null;
  fecha_resuelto: string | null;
  notas: string;
  created_at: string;
}

const estaFuera = (e: string) => e === 'Enviado a gestoría' || e === 'En trámite';

function diasDesde(v?: string | null): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
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

export default function GestoriaPage() {
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [habituales, setHabituales] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Tramite | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);

  const carga = useCallback(async (): Promise<Tramite[]> => {
    setCargando(true);
    setError('');
    const r = await api.get<Tramite[]>('/tramites');
    const lista = r.ok && Array.isArray(r.data) ? r.data : [];
    if (r.ok) setTramites(lista);
    else setError(r.error || 'No se han podido cargar los trámites.');
    setCargando(false);
    return lista;
  }, []);

  useEffect(() => { void carga(); }, [carga]);
  useEffect(() => {
    void api.get<string[]>('/tramites/habituales').then((r) => {
      if (r.ok && Array.isArray(r.data)) setHabituales(r.data);
    });
  }, []);

  /** Lo que está fuera, lo que lleva más tiempo primero. */
  const fuera = useMemo(
    () => tramites
      .filter((t) => estaFuera(t.estado))
      .sort((a, b) => (diasDesde(b.fecha_enviado) ?? 0) - (diasDesde(a.fecha_enviado) ?? 0)),
    [tramites]
  );
  const enCasa = useMemo(
    () => tramites.filter((t) => t.estado === 'Pendiente' || t.estado === 'Documentación incompleta' || t.estado === RECHAZADO),
    [tramites]
  );
  const resueltos = useMemo(() => tramites.filter((t) => t.estado === 'Resuelto'), [tramites]);

  /**
   * Los coches con papeleos abiertos y todavía sin encargar.
   *
   * Uno por coche y no por papeleo: el correo a la gestoría lleva los tres
   * juntos, así que tres avisos del mismo coche serían el mismo aviso repetido.
   */
  const sinEncargar = useMemo(() => {
    const vistos = new Set<string>();
    return tramites.filter((t) => {
      if (t.encargo_enviado_at || !t.lead_id || t.estado === 'Resuelto') return false;
      if (vistos.has(t.lead_id)) return false;
      vistos.add(t.lead_id);
      return true;
    });
  }, [tramites]);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<Tramite>(`/tramites/${id}`, cambios);
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
        title="Gestoría"
        subtitle="Los papeleos de los coches: qué está fuera y desde cuándo"
        actions={
          <button
            onClick={() => setNuevo(true)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            Nuevo trámite
          </button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          ['Esperando fuera', String(fuera.length), 'depende de la gestoría'],
          ['En casa', String(enCasa.length), 'depende de nosotros'],
          ['Resueltos', String(resueltos.length), 'terminados'],
        ].map(([titulo, valor, pie]) => (
          <div key={titulo} className="px-4 py-3 rounded-xl border border-brand-200 bg-white">
            <div className="text-2xl font-bold text-brand-600">{valor}</div>
            <div className="text-xs font-semibold text-brand-500">{titulo}</div>
            <div className="text-[11px] text-brand-400 mt-0.5">{pie}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando trámites…</div>
      ) : tramites.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ningún trámite. Los de una importación se abren solos al pasar el
          expediente a «En trámites»; el resto se crean aquí.
        </div>
      ) : (
        <>
          {/*
            * Los que están abiertos pero todavía sin encargar.
            *
            * Los papeleos de una importación se abren solos en cuanto el coche
            * llega a Zaragoza, y aquí aparecen los tres esperando. Pero el
            * correo que se los encarga a la gestoría sale del expediente —es un
            * correo por coche, no por papeleo— y desde aquí no había forma de
            * saberlo: tres trámites «Pendiente» y ningún sitio donde empezar.
            */}
          {sinEncargar.length > 0 && (
            <div className="mb-3 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50">
              <div className="text-xs font-bold text-amber-900">
                {sinEncargar.length === 1
                  ? 'Un coche con los papeleos abiertos y todavía sin encargar'
                  : `${sinEncargar.length} coches con los papeleos abiertos y todavía sin encargar`}
              </div>
              <div className="text-[11px] text-amber-800 mt-0.5">
                {sinEncargar.map((t) => t.vehiculo_titulo).filter(Boolean).join(' · ')}
              </div>
              <a href="/importaciones"
                 className="inline-block text-[11px] font-semibold text-amber-900 underline underline-offset-2 mt-1">
                Encargárselo desde el expediente →
              </a>
              <div className="text-[11px] text-amber-700/80 mt-1">
                Es un correo por coche y no por papeleo: los tres van en el mismo,
                con el importe real del impuesto.
              </div>
            </div>
          )}

          {/* Lo que está fuera va primero, y ordenado por lo que lleva esperando:
              es lo único que no se resuelve trabajando más. */}
          <Bloque
            titulo="Esperando a la gestoría"
            pie="Lo que lleva más tiempo, arriba"
            lista={fuera}
            onAbrir={setAbierto}
            conDias
          />
          <Bloque
            titulo="En casa"
            pie="Depende de nosotros o del cliente"
            lista={enCasa}
            onAbrir={setAbierto}
          />
          {resueltos.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setVerResueltos((v) => !v)} className="text-xs font-semibold text-brand-400 hover:text-brand-600">
                {verResueltos ? '▾' : '▸'} {resueltos.length} resueltos
              </button>
              {verResueltos && <Bloque titulo="" pie="" lista={resueltos} onAbrir={setAbierto} />}
            </div>
          )}
        </>
      )}

      {abierto && (
        <TramiteAbierto
          t={abierto}
          guardando={guardando}
          habituales={habituales}
          onCerrar={() => setAbierto(null)}
          onCambiar={(c) => void cambia(abierto.id, c)}
        />
      )}

      {nuevo && (
        <TramiteNuevo
          habituales={habituales}
          onCerrar={() => setNuevo(false)}
          onCreado={() => { setNuevo(false); void carga(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function Bloque({ titulo, pie, lista, onAbrir, conDias = false }: {
  titulo: string; pie: string; lista: Tramite[]; onAbrir: (t: Tramite) => void; conDias?: boolean;
}) {
  if (!lista.length && titulo) {
    return (
      <div className="mb-5">
        <h2 className="text-sm font-bold text-brand-600">{titulo}</h2>
        <p className="text-[11px] text-brand-400 mb-2">{pie}</p>
        <div className="px-4 py-4 rounded-xl border border-brand-200 bg-white text-center text-[12px] text-brand-300">Ninguno</div>
      </div>
    );
  }
  return (
    <div className="mb-5">
      {titulo && <h2 className="text-sm font-bold text-brand-600">{titulo}</h2>}
      {pie && <p className="text-[11px] text-brand-400 mb-2">{pie}</p>}
      {/*
        * Una tarjeta por coche, con sus papeleos dentro.
        *
        * Una importación abre tres, y como tarjetas sueltas del mismo tamaño no
        * se sabe cuáles son del mismo coche sin leerlas enteras. Fundirlos en
        * uno tampoco vale: cada uno tiene su estado y su reloj, y hace falta
        * saber cuál es el que lleva tres semanas parado en la DGT.
        */}
      <div className="grid gap-2 md:grid-cols-2">
        {papeleosPorCoche(lista).map((coche) => (
          <div key={coche.clave}
               className="px-3 py-2.5 rounded-lg bg-white border border-brand-200">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-brand-600 leading-tight truncate">
                  {coche.titulo}
                </div>
                <div className="text-[11px] text-brand-400 truncate">
                  {[coche.identifica, coche.gestoria].filter(Boolean).join(' · ') || 'sin matrícula todavía'}
                </div>
              </div>
              {conDias && coche.diasFuera !== null && (
                <span className={`text-[10px] font-bold shrink-0 ${coche.diasFuera > 14 ? 'text-red-600' : 'text-brand-400'}`}>
                  {coche.diasFuera} días fuera
                </span>
              )}
            </div>

            {/* Cada papeleo con lo suyo: su estado, su reloj y su coste. */}
            <div className="mt-1.5 divide-y divide-brand-100 border-t border-brand-100">
              {coche.papeleos.map((p) => {
                const dias = conDias ? diasDesde(p.fecha_enviado) : null;
                return (
                  <button key={p.id} onClick={() => onAbrir(p)}
                          className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-brand-50">
                    <span className="text-[12px] text-brand-600 flex-1 truncate">{p.tipo}</span>
                    {dias !== null && (
                      <span className={`text-[10px] ${dias > 14 ? 'text-red-600 font-bold' : 'text-brand-300'}`}>
                        {dias} d
                      </span>
                    )}
                    {Number(p.coste) > 0 && (
                      <span className="text-[10px] text-brand-400 tabular-nums">
                        {Number(p.coste).toLocaleString('es-ES')} €
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${COLOR[p.estado] ?? ''}`}>
                      {p.estado}
                    </span>
                  </button>
                );
              })}
            </div>

            {coche.coste > 0 && (
              <div className="text-[10px] text-brand-400 mt-1.5 text-right tabular-nums">
                {coche.coste.toLocaleString('es-ES')} € en papeleos
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TramiteAbierto({ t, guardando, habituales, onCerrar, onCambiar }: {
  t: Tramite; guardando: boolean; habituales: string[];
  onCerrar: () => void; onCambiar: (c: Record<string, unknown>) => void;
}) {
  const [aEstado, setAEstado] = useState<string | null>(null);
  const [porQue, setPorQue] = useState('');
  const [datos, setDatos] = useState({
    tipo: t.tipo ?? '', gestoria: t.gestoria ?? '', matricula: t.matricula ?? '',
    bastidor: t.bastidor ?? '', coste: String(t.coste ?? ''),
  });
  const siguiente = siguienteEstado(t.estado);
  const dias = diasDesde(t.fecha_enviado);
  /**
   * Cuándo puede haber matrícula.
   *
   * En un coche de importación la da este mismo trámite, así que hasta que no
   * está en la gestoría no hay ninguna que escribir. Un hueco vacío puesto
   * antes parece una tarea pendiente y se rellena con la matrícula alemana.
   */
  const daMatricula = ['Enviado a gestoría', 'En trámite', 'Resuelto'].includes(t.estado);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600 leading-tight">{t.tipo}</h2>
            <p className="text-xs text-brand-400 mt-0.5">{t.id} · {t.matricula || t.vehiculo_titulo || '—'}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        {estaFuera(t.estado) && dias !== null && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-[12px] font-semibold ${dias > 14 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
            Enviado el {dia(t.fecha_enviado)} · lleva {dias} días fuera
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
            <option value={RECHAZADO}>{RECHAZADO}</option>
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
                placeholder="Mandado con la ficha técnica y el permiso alemán…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { onCambiar({ estado: aEstado, nota: porQue, gestoria: datos.gestoria }); setAEstado(null); setPorQue(''); }}
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
          <label className="col-span-2 text-[11px] text-brand-400">
            Qué trámite es
            <input list="tramites-habituales" value={datos.tipo}
                   onChange={(e) => setDatos((d) => ({ ...d, tipo: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <datalist id="tramites-habituales">
              {habituales.map((h) => <option key={h} value={h} />)}
            </datalist>
          </label>
          <div className="col-span-2 text-[11px] text-brand-400">
            Quién lo lleva
            <div className="mt-0.5">
              <ElegirProveedor tipo="gestoria" valor={datos.gestoria}
                               placeholder="Elegir gestoría…"
                               onCambio={(v) => setDatos((d) => ({ ...d, gestoria: v }))} />
            </div>
          </div>
          {/*
            * La matrícula no existe hasta el final.
            *
            * En un coche de importación la da este mismo trámite: puesta
            * delante desde el primer día es un hueco vacío que parece una
            * tarea pendiente, y se rellena con la matrícula alemana. Se
            * enseña cuando ya está en la gestoría, que es cuando puede
            * llegar, y siempre si ya hay algo escrito.
            */}
          {(daMatricula || String(datos.matricula ?? '').trim()) && (
            <label className="text-[11px] text-brand-400">
              Matrícula
              <input value={datos.matricula} onChange={(e) => setDatos((d) => ({ ...d, matricula: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          )}
          <label className="text-[11px] text-brand-400">
            Coste
            <input value={datos.coste} inputMode="decimal"
                   onChange={(e) => setDatos((d) => ({ ...d, coste: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <span className="text-[10px] text-brand-300">Lo que nos cobra la gestoría por este trámite.</span>
          </label>
        </div>
        <button onClick={() => onCambiar(datos)} disabled={guardando}
                className="w-full px-3 py-2 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40">
          Guardar los datos
        </button>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm border-t border-brand-100 pt-4 mt-4">
          <div>
            <dt className="text-[11px] text-brand-400">Cliente</dt>
            <dd className="font-medium text-brand-600 break-all">{t.cliente_email || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-brand-400">Abierto</dt>
            <dd className="font-medium text-brand-600">{dia(t.created_at)}</dd>
          </div>
          {t.fecha_resuelto && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Resuelto</dt>
              <dd className="font-medium text-brand-600">{dia(t.fecha_resuelto)}</dd>
            </div>
          )}
          {t.lead_id && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Expediente</dt>
              <dd><a href="/importaciones" className="text-brand-500 underline underline-offset-2 text-xs">{t.lead_id}</a></dd>
            </div>
          )}
        </dl>

        {/* Lo que se le manda a la gestoría y lo que devuelve. Sin origen: un
            trámite no compra nada, así que no hay lista que esperar. */}
        <Documentos ambito="tramite" id={t.id} />

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

function TramiteNuevo({ habituales, onCerrar, onCreado, onError }: {
  habituales: string[]; onCerrar: () => void; onCreado: () => void; onError: (m: string) => void;
}) {
  const [datos, setDatos] = useState({ tipo: '', matricula: '', vehiculo_titulo: '', gestoria: '', cliente_email: '' });
  const [guardando, setGuardando] = useState(false);

  async function crea() {
    setGuardando(true);
    const r = await api.post<Tramite>('/tramites', datos);
    setGuardando(false);
    if (!r.ok) { onError((r as unknown as { detail?: string }).detail || r.error || 'No se ha podido crear.'); return; }
    onCreado();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onCerrar}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-brand-600 mb-3">Nuevo trámite</h2>
        <div className="space-y-2">
          <input list="tramites-nuevos" placeholder="Qué trámite es" value={datos.tipo}
                 onChange={(e) => setDatos((d) => ({ ...d, tipo: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <datalist id="tramites-nuevos">
            {habituales.map((h) => <option key={h} value={h} />)}
          </datalist>
          <input placeholder="Matrícula" value={datos.matricula}
                 onChange={(e) => setDatos((d) => ({ ...d, matricula: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <input placeholder="Coche (si no hay matrícula todavía)" value={datos.vehiculo_titulo}
                 onChange={(e) => setDatos((d) => ({ ...d, vehiculo_titulo: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <ElegirProveedor tipo="gestoria" valor={datos.gestoria}
                           placeholder="Gestoría (si ya se sabe)"
                           onCambio={(v) => setDatos((d) => ({ ...d, gestoria: v }))} />
          <input placeholder="Correo del cliente" value={datos.cliente_email}
                 onChange={(e) => setDatos((d) => ({ ...d, cliente_email: e.target.value }))}
                 className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
        </div>
        <p className="text-[11px] text-brand-400 mt-2">
          Nace pendiente. Para mandarlo fuera hace falta decir a qué gestoría.
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => void crea()} disabled={guardando || !datos.tipo.trim()}
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
