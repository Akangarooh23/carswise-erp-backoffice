/**
 * Las peritaciones: quién va a ver el coche a Alemania y qué vio.
 *
 * «No se le paga al vendedor hasta que uno de los nuestros ve el coche» es la
 * única promesa que hace este negocio. Era una casilla en el expediente; aquí
 * tiene nombre, fecha y veredicto, que es lo que hay que poder contestar el día
 * que un cliente pregunte quién vio su coche.
 *
 * La peritación nace sola cuando el dinero entra. Lo que hace falta después es
 * elegir perito, mandarle el encargo y anotar lo que dijo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import ElegirProveedor from '../components/ElegirProveedor.js';
import RevisarCorreo, { type VistaDelCorreo } from '../components/RevisarCorreo.js';

const ESTADOS = ['Por encargar', 'Encargada', 'Hecha'] as const;

const QUE_TOCA: Record<string, string> = {
  'Por encargar': 'Elegir perito y mandarle el encargo',
  Encargada: 'Esperando a que vaya',
  Hecha: 'Ya se sabe lo que hay',
};

const VEREDICTOS = [
  ['es_el_que_se_anuncio', 'Es el coche que se anunció'],
  ['no_es_el_que_se_anuncio', 'No es el que se anunció'],
] as const;

interface Peritacion {
  id: string;
  lead_id: string | null;
  vehiculo_titulo: string;
  estado: string;
  perito: string;
  donde: string;
  contacto: string;
  fecha_prevista: string | null;
  fecha_hecha: string | null;
  veredicto: string | null;
  notas: string;
  coste: string | number | null;
  cita_avisada_at: string | null;
  cita_avisada_a: string | null;
  factura_numero: string;
  factura_fecha: string | null;
  encargo_enviado_at: string | null;
  encargo_enviado_a: string | null;
  created_at: string;
}

const eur = (n: unknown) =>
  (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const dia = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('es-ES') : '');

export default function PeritacionesPage() {
  const [lista, setLista] = useState<Peritacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<Peritacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState<{ vista: VistaDelCorreo; id: string; que: string } | null>(null);

  const carga = useCallback(async (): Promise<Peritacion[]> => {
    const r = await api.get<Peritacion[]>('/peritaciones');
    const datos = r.ok && Array.isArray(r.data) ? r.data : [];
    setLista(datos);
    setCargando(false);
    return datos;
  }, []);

  useEffect(() => { void carga(); }, [carga]);

  const porEstado = useMemo(() => {
    const m: Record<string, Peritacion[]> = {};
    for (const e of ESTADOS) m[e] = [];
    for (const p of lista) (m[p.estado] ?? (m[p.estado] = [])).push(p);
    return m;
  }, [lista]);

  const gastado = lista.reduce((s, p) => s + (Number(p.coste) || 0), 0);
  const sinEncargar = lista.filter((p) => p.estado === 'Por encargar').length;
  const noPasaron = lista.filter((p) => p.veredicto === 'no_es_el_que_se_anuncio').length;

  async function guarda(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    try {
      const r = await api.patch<Peritacion>(`/peritaciones/${id}`, cambios);
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido guardar.'); return; }
      const datos = await carga();
      setAbierta((previo) => (previo && previo.id === id ? (datos.find((x) => x.id === id) ?? previo) : previo));
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  }

  /** Ninguno se manda de un clic: se abre para revisarlo. */
  async function preparaElCorreo(id: string, que: string) {
    setGuardando(true);
    try {
      const r = await api.post<VistaDelCorreo>(`/peritaciones/${id}/${que}`, { soloVista: true });
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido preparar.'); return; }
      const d = r.data as unknown as VistaDelCorreo;
      setRevisando({ vista: { para: d.para, subject: d.subject, html: d.html, papeles: d.papeles }, id, que });
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido preparar.');
    } finally {
      setGuardando(false);
    }
  }

  async function mandaElCorreo(cambios: { para: string; asunto: string; nota: string; adjuntos: string[] }) {
    if (!revisando) return;
    const { id, que } = revisando;
    setGuardando(true);
    try {
      const r = await api.post(`/peritaciones/${id}/${que}`, cambios);
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido mandar.'); return; }
      setRevisando(null);
      const datos = await carga();
      setAbierta((previo) => (previo && previo.id === id ? (datos.find((x) => x.id === id) ?? previo) : previo));
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido mandar.');
    } finally {
      setGuardando(false);
    }
  }

  /** Su factura, que además se apunta como coste del coche. */
  async function anotaLaFactura(id: string, datos: Record<string, string>) {
    setGuardando(true);
    try {
      const r = await api.post(`/peritaciones/${id}/factura`, datos);
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido apuntar.'); return; }
      const datosNuevos = await carga();
      setAbierta((previo) => (previo && previo.id === id ? (datosNuevos.find((x) => x.id === id) ?? previo) : previo));
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido apuntar.');
    } finally {
      setGuardando(false);
    }
  }

  async function anotaElResultado(id: string, veredicto: string, notas: string) {
    setGuardando(true);
    try {
      const r = await api.post(`/peritaciones/${id}/resultado`, { veredicto, notas });
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido anotar.'); return; }
      const datos = await carga();
      setAbierta((previo) => (previo && previo.id === id ? (datos.find((x) => x.id === id) ?? previo) : previo));
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido anotar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Peritaciones"
        subtitle="Quién va a ver cada coche a Alemania, y qué vio"
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          ['Sin encargar', String(sinEncargar), 'hay un coche esperando a que alguien vaya'],
          ['Gastado en peritajes', gastado ? eur(gastado) : '0 €', 'todas las revisiones'],
          // Se enseña aparte porque es la cifra que justifica todo esto: cada una
          // es un cliente al que se le devolvió su dinero en vez de perderlo.
          ['No eran el que se anunció', String(noPasaron), 'y el dinero volvió al cliente'],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded-xl border border-brand-200 bg-white px-4 py-3">
            <div className="text-xl font-bold text-brand-600">{v}</div>
            <div className="text-sm font-semibold text-brand-500">{t}</div>
            <div className="text-[11px] text-brand-300">{s}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-brand-400">Cargando…</p>
      ) : !lista.length ? (
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center text-sm text-brand-400">
          Todavía no hay ninguna peritación. Se abre sola en cuanto un cliente deposita el dinero.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ESTADOS.map((e) => (
            <div key={e} className="rounded-xl border border-brand-200 bg-white">
              <div className="px-4 py-3 border-b border-brand-100">
                <div className="text-sm font-bold text-brand-600">{e} · {porEstado[e]?.length ?? 0}</div>
                <div className="text-[11px] text-brand-300">{QUE_TOCA[e]}</div>
              </div>
              <div className="p-3 space-y-2">
                {(porEstado[e] ?? []).length === 0 && (
                  <p className="text-center text-xs text-brand-300 py-6">Ninguna</p>
                )}
                {(porEstado[e] ?? []).map((p) => (
                  <button key={p.id} onClick={() => setAbierta(p)}
                          className="w-full text-left rounded-lg border border-brand-200 px-3 py-2 hover:bg-brand-50">
                    <div className="text-sm font-semibold text-brand-600 leading-tight">{p.vehiculo_titulo}</div>
                    <div className="text-[11px] text-brand-400 mt-0.5">{p.perito || 'sin perito'}</div>
                    {p.veredicto && (
                      <div className={`text-[11px] font-bold mt-1 ${p.veredicto === 'es_el_que_se_anuncio' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {VEREDICTOS.find(([k]) => k === p.veredicto)?.[1]}
                      </div>
                    )}
                    <div className="text-[10px] text-brand-300 mt-1">{p.id}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {abierta && (
        <PeritacionAbierta
          p={abierta}
          guardando={guardando}
          onCerrar={() => setAbierta(null)}
          onGuardar={(c) => void guarda(abierta.id, c)}
          onEncargar={() => void preparaElCorreo(abierta.id, 'encargo')}
          onAvisarCita={() => void preparaElCorreo(abierta.id, 'cita')}
          onResultado={(v, n) => void anotaElResultado(abierta.id, v, n)}
          onFactura={(d) => void anotaLaFactura(abierta.id, d)}
        />
      )}

      {/* Ningún correo sale sin que alguien lo haya visto. */}
      <RevisarCorreo
        vista={revisando?.vista ?? null}
        enviando={guardando}
        error={error}
        onEnviar={(cambios) => void mandaElCorreo(cambios)}
        onCerrar={() => setRevisando(null)}
      />
    </div>
  );
}

function PeritacionAbierta({ p, guardando, onCerrar, onGuardar, onEncargar, onResultado, onFactura, onAvisarCita }: {
  p: Peritacion;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (c: Record<string, unknown>) => void;
  onEncargar: () => void;
  onResultado: (veredicto: string, notas: string) => void;
  onFactura: (datos: Record<string, string>) => void;
  onAvisarCita: () => void;
}) {
  const [datos, setDatos] = useState({
    perito: p.perito ?? '', donde: p.donde ?? '', contacto: p.contacto ?? '',
    fecha_prevista: p.fecha_prevista ?? '', coste: String(p.coste ?? ''),
  });
  const [veredicto, setVeredicto] = useState(p.veredicto ?? '');
  const [factura, setFactura] = useState({
    numero: p.factura_numero ?? '', fecha: p.factura_fecha ?? '', importe: String(p.coste ?? ''),
  });
  const [notas, setNotas] = useState(p.notas ?? '');

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600 leading-tight">{p.vehiculo_titulo}</h2>
            <p className="text-xs text-brand-400 mt-0.5">{p.id} · {p.estado}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <label className="block text-[11px] text-brand-400">
            Quién va a verlo
            <div className="mt-0.5">
              <ElegirProveedor tipo="perito" valor={datos.perito}
                               placeholder="Elegir perito…"
                               onCambio={(v) => setDatos((d) => ({ ...d, perito: v }))} />
            </div>
          </label>

          <label className="block text-[11px] text-brand-400">
            Dónde está el coche
            <span className="text-brand-300"> · lo dice el vendedor</span>
            <input value={datos.donde} onChange={(e) => setDatos((d) => ({ ...d, donde: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-400">
              Preguntar por
              <input value={datos.contacto} onChange={(e) => setDatos((d) => ({ ...d, contacto: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
            <label className="text-[11px] text-brand-400">
              Cuándo va
              <input type="date" value={datos.fecha_prevista}
                     onChange={(e) => setDatos((d) => ({ ...d, fecha_prevista: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          </div>

          <label className="block text-[11px] text-brand-400">
            Lo que cuesta
            <span className="text-brand-300"> · sale de nuestro margen, no del cliente</span>
            <input value={datos.coste} inputMode="decimal"
                   onChange={(e) => setDatos((d) => ({ ...d, coste: e.target.value }))}
                   className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </label>

          <button onClick={() => onGuardar(datos)} disabled={guardando}
                  className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            Guardar los datos
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-brand-200">
          <div className="text-xs font-semibold text-brand-600 mb-1.5">El encargo</div>
          {p.encargo_enviado_at ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-emerald-700">
                ✓ Mandado el {dia(p.encargo_enviado_at)}{p.encargo_enviado_a ? ` a ${p.encargo_enviado_a}` : ''}
              </span>
              <button onClick={onEncargar} disabled={guardando}
                      className="text-[11px] text-brand-400 underline underline-offset-2">
                mandarlo otra vez
              </button>
            </div>
          ) : (
            <>
              <button onClick={onEncargar} disabled={guardando}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                Encargarle la revisión
              </button>
              <div className="text-[11px] text-brand-300 mt-1.5">
                Guarda antes los cambios: el correo sale con lo que hay grabado.
              </div>
            </>
          )}
        </div>

        {/*
          * Y avisar al vendedor del día.
          *
          * Va desde aquí para que quede apuntado: quién dijo qué día y a quién
          * se le avisó. Dos que se llaman por su cuenta no dejan rastro, y el
          * día que el coche no esté preparado no hay dónde mirar.
          */}
        <div className="mt-4 pt-3 border-t border-brand-200">
          <div className="text-xs font-semibold text-brand-600 mb-1.5">Avisar al vendedor</div>
          {p.cita_avisada_at ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-emerald-700">
                ✓ Avisado el {dia(p.cita_avisada_at)}{p.cita_avisada_a ? ` a ${p.cita_avisada_a}` : ''}
              </span>
              <button onClick={onAvisarCita} disabled={guardando}
                      className="text-[11px] text-brand-400 underline underline-offset-2">
                avisar otra vez
              </button>
            </div>
          ) : (
            <>
              <button onClick={onAvisarCita} disabled={guardando}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                Decirle qué día va
              </button>
              <div className="text-[11px] text-brand-300 mt-1.5">
                Pon antes la fecha en «Cuándo va» y guarda. Le pide que el coche esté
                accesible y que estén los papeles y las dos llaves.
              </div>
            </>
          )}
        </div>

        {/*
          * Lo que vio.
          *
          * Esto es lo que marca el coche como visto en el expediente, y solo el
          * veredicto bueno abre la puerta a soltar el dinero. Si dice que no es
          * el que se anunció, no hay nada que interpretar: vuelve al cliente.
          */}
        <div className="mt-4 pt-3 border-t border-brand-200">
          <div className="text-xs font-semibold text-brand-600 mb-1.5">Lo que vio</div>
          {p.fecha_hecha && (
            <div className={`text-[13px] font-bold mb-2 ${p.veredicto === 'es_el_que_se_anuncio' ? 'text-emerald-700' : 'text-red-700'}`}>
              {VEREDICTOS.find(([k]) => k === p.veredicto)?.[1]} · {dia(p.fecha_hecha)}
            </div>
          )}
          <div className="flex gap-2 mb-2">
            {VEREDICTOS.map(([k, etiqueta]) => (
              <button key={k} onClick={() => setVeredicto(k)}
                      className={`flex-1 px-2 py-2 text-[11px] font-semibold rounded-lg border ${
                        veredicto === k
                          ? (k === 'es_el_que_se_anuncio'
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-red-700 text-white border-red-700')
                          : 'border-brand-200 text-brand-500'}`}>
                {etiqueta}
              </button>
            ))}
          </div>
          <textarea value={notas} rows={3} placeholder="Lo que encontró: kilómetros, golpes, papeles que faltan…"
                    onChange={(e) => setNotas(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <button onClick={() => onResultado(veredicto, notas)} disabled={guardando || !veredicto}
                  className="w-full mt-2 px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40">
            Anotar lo que vio
          </button>
        </div>

        {/*
          * Su factura.
          *
          * No se queda aquí: se apunta como gasto del pedido, que es de donde
          * salen «Lo que cuesta este coche» y el margen. Un coste que solo vive
          * en la pantalla donde se generó no aparece en ninguna cuenta.
          */}
        <div className="mt-4 pt-3 border-t border-brand-200">
          <div className="text-xs font-semibold text-brand-600 mb-1.5">Su factura</div>
          {p.factura_numero && (
            <div className="text-[13px] font-bold text-emerald-700 mb-2">
              ✓ {p.factura_numero}{p.factura_fecha ? ` · ${dia(p.factura_fecha)}` : ''}
              {Number(p.coste) ? ` · ${eur(p.coste)}` : ''}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={factura.numero} placeholder="Nº de factura"
                   onChange={(e) => setFactura((d) => ({ ...d, numero: e.target.value }))}
                   className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <input type="date" value={factura.fecha}
                   onChange={(e) => setFactura((d) => ({ ...d, fecha: e.target.value }))}
                   className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </div>
          <input value={factura.importe} inputMode="decimal" placeholder="Importe"
                 onChange={(e) => setFactura((d) => ({ ...d, importe: e.target.value }))}
                 className="w-full mb-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <button onClick={() => onFactura(factura)} disabled={guardando || !factura.numero.trim()}
                  className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40">
            Apuntar su factura
          </button>
          <div className="text-[11px] text-brand-300 mt-1.5">
            Se apunta también como coste de este coche, en el pedido.
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-brand-200">
          <div className="text-xs font-semibold text-brand-600 mb-1.5">Su informe y las fotos</div>
          <Documentos ambito="peritacion" id={p.id} />
        </div>
      </div>
    </div>
  );
}
