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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import ElegirProveedor from '../components/ElegirProveedor.js';
import RevisarCorreo, { type VistaDelCorreo } from '../components/RevisarCorreo.js';
import DanosDelCoche from '../components/DanosDelCoche.js';
import { type Dano, resumenDeDanos, comoSeCuenta } from '../lib/danos.js';
import { faseDeLaPeritacion, QUE_TOCA_AHORA } from '../lib/fases-peritacion.js';

const ESTADOS = ['Por encargar', 'Encargada', 'Hecha'] as const;

const QUE_TOCA: Record<string, string> = {
  'Por encargar': 'Elegir perito y mandarle el encargo',
  Encargada: 'Esperando que confirme, diga el precio y vaya',
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
  /** La hora que dio el vendedor, tal cual: «10:00». */
  hora_prevista: string;
  /** El teléfono de la persona por la que hay que preguntar. */
  telefono: string;
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
  /** Lo que vio roto, con lo que estima que cuesta cada partida. */
  danos?: Dano[];
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

  /**
   * Los daños: apuntar, corregir, quitar y pegar de una hoja.
   *
   * Todos recargan la lista entera en vez de tocar el estado a mano. Es una
   * llamada de más y a cambio el total de la pantalla es siempre el de la
   * base: un total que se calcula en dos sitios acaba diciendo dos cosas.
   */
  async function conLosDanos(id: string, hazlo: () => Promise<{ ok: boolean; error?: string }>) {
    setGuardando(true);
    try {
      const r = await hazlo();
      if (!r.ok) { setError((r as { detail?: string }).detail || r.error || 'No se ha podido guardar.'); return; }
      const datos = await carga();
      setAbierta((previo) => (previo && previo.id === id ? (datos.find((x) => x.id === id) ?? previo) : previo));
    } catch (e) {
      setError((e as Error)?.message || 'No se ha podido guardar.');
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
                    {(p.danos?.length ?? 0) > 0 && (
                      <div className="text-[11px] text-brand-500 mt-1">
                        Daños: {comoSeCuenta(resumenDeDanos(p.danos ?? []))}
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
          onApuntarDano={(d) => void conLosDanos(abierta.id, () =>
            api.post(`/peritaciones/${abierta.id}/danos`, d))}
          onCorregirDano={(danoId, d) => void conLosDanos(abierta.id, () =>
            api.patch(`/peritaciones/${abierta.id}/danos/${danoId}`, d))}
          onQuitarDano={(danoId) => void conLosDanos(abierta.id, () =>
            api.delete(`/peritaciones/${abierta.id}/danos/${danoId}`))}
          onPegar={(texto) => api.post<{ danos: Dano[]; malas: string[] }>(
            `/peritaciones/${abierta.id}/danos/pegadas`, { texto, soloVista: true })}
          onGuardarPegado={(texto) => void conLosDanos(abierta.id, () =>
            api.post(`/peritaciones/${abierta.id}/danos/pegadas`, { texto }))}
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

function PeritacionAbierta({
  p, guardando, onCerrar, onGuardar, onEncargar, onResultado, onFactura, onAvisarCita,
  onApuntarDano, onCorregirDano, onQuitarDano, onPegar, onGuardarPegado,
}: {
  p: Peritacion;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (c: Record<string, unknown>) => void;
  onEncargar: () => void;
  onResultado: (veredicto: string, notas: string) => void;
  onFactura: (datos: Record<string, string>) => void;
  onAvisarCita: () => void;
  onApuntarDano: (d: { pieza: string; coste: string; notas: string }) => void;
  onCorregirDano: (danoId: string, d: Record<string, string>) => void;
  onQuitarDano: (danoId: string) => void;
  onPegar: (texto: string) => Promise<unknown>;
  onGuardarPegado: (texto: string) => void;
}) {
  const [datos, setDatos] = useState({
    perito: p.perito ?? '', donde: p.donde ?? '', contacto: p.contacto ?? '',
    telefono: p.telefono ?? '', fecha_prevista: p.fecha_prevista ?? '',
    hora_prevista: p.hora_prevista ?? '', coste: String(p.coste ?? ''),
  });
  const [veredicto, setVeredicto] = useState(p.veredicto ?? '');
  const [factura, setFactura] = useState({
    numero: p.factura_numero ?? '', fecha: p.factura_fecha ?? '', importe: String(p.coste ?? ''),
  });
  const [notas, setNotas] = useState(p.notas ?? '');

  /**
   * En qué fase va esto, que es lo que decide qué se ve.
   *
   * 0 · **Por encargar** — hay que elegir perito y mandarle el encargo.
   * 1 · **Encargada** — se le ha mandado y toca esperar: si puede ir, cuánto
   *     cobra, y luego la visita.
   * 2 · **Hecha** — ha ido y ha dicho lo que vio.
   *
   * Enseñar los doce campos a la vez desde el primer momento no es enseñar más
   * información, es enseñar menos: entre «lo que vio» vacío y «su factura»
   * vacía se pierde el único botón que se puede pulsar hoy. Lo que no toca no
   * desaparece —se pliega abajo, por si alguien quiere mirarlo—, pero no
   * compite con lo que sí.
   */
  const fase = faseDeLaPeritacion(p);

  const queToca = QUE_TOCA_AHORA[fase];

  const seccion = (titulo: string, dentro: ReactNode, pista?: string) => (
    <div className="mt-4 pt-3 border-t border-brand-200">
      <div className="text-xs font-semibold text-brand-600 mb-1.5">{titulo}</div>
      {dentro}
      {pista ? <div className="text-[11px] text-brand-300 mt-1.5">{pista}</div> : null}
    </div>
  );

  /** Cada trozo, con la fase a partir de la cual tiene sentido. */
  const bloques: { clave: string; desde: number; nodo: ReactNode }[] = [
    {
      clave: 'visita',
      desde: 0,
      nodo: (
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

          {/*
            * Por quién preguntar y su teléfono, separados.
            *
            * Iban juntos en un campo y el perito los recibía pegados en una
            * línea. Es el dato que usa cuando llega a la nave y no encuentra a
            * nadie: tiene que poder marcarlo, no leerlo.
            */}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-400">
              Preguntar por
              <input value={datos.contacto} onChange={(e) => setDatos((d) => ({ ...d, contacto: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
            <label className="text-[11px] text-brand-400">
              Su teléfono
              <input value={datos.telefono} inputMode="tel"
                     onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-400">
              Qué día va
              <input type="date" value={datos.fecha_prevista}
                     onChange={(e) => setDatos((d) => ({ ...d, fecha_prevista: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
            <label className="text-[11px] text-brand-400">
              A qué hora
              <input value={datos.hora_prevista} placeholder="10:00"
                     onChange={(e) => setDatos((d) => ({ ...d, hora_prevista: e.target.value }))}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          </div>

          <button onClick={() => onGuardar(datos)} disabled={guardando}
                  className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            Guardar los datos
          </button>
          <div className="text-[11px] text-brand-300">
            Los cinco los da el vendedor al contestar al primer correo.
          </div>
        </div>
      ),
    },
    {
      clave: 'encargo',
      desde: 0,
      nodo: seccion(
        'El encargo',
        p.encargo_enviado_at ? (
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
          <button onClick={onEncargar} disabled={guardando || !datos.perito.trim()}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40">
            Encargarle la revisión
          </button>
        ),
        p.encargo_enviado_at
          ? 'Le pedimos que confirme la cita y que nos diga lo que cuesta.'
          : datos.perito.trim()
            ? 'Guarda antes los cambios: el correo sale con lo que hay grabado.'
            : 'Elige primero quién va a verlo.'
      ),
    },
    {
      /*
       * Lo que nos cobra: hasta que no contesta, no se sabe.
       *
       * Tenerlo abierto desde el primer momento invita a escribir la tarifa de
       * catálogo, y entonces el gasto del coche sale de lo que suponíamos y no
       * de lo que nos han dicho.
       */
      clave: 'coste',
      desde: 1,
      nodo: seccion(
        'Lo que nos cobra',
        <>
          <input value={datos.coste} inputMode="decimal" placeholder="Lo que nos ha dicho"
                 onChange={(e) => setDatos((d) => ({ ...d, coste: e.target.value }))}
                 className="w-full mb-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          <button onClick={() => onGuardar(datos)} disabled={guardando}
                  className="w-full px-4 py-2 text-sm font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            Guardar lo que nos cobra
          </button>
        </>,
        'Lo dice al confirmar la cita. Sale de nuestro margen, no del cliente.'
      ),
    },
    {
      /*
       * Avisar al vendedor: solo cuando hay algo que avisarle.
       *
       * Antes de que el perito confirme, no hay cita que confirmar. El botón
       * estaba encendido y lo único que podía hacer era mandar un correo con
       * una fecha que todavía no sostenía nadie.
       */
      clave: 'avisar',
      desde: 1,
      nodo: seccion(
        'Avisar al vendedor',
        p.cita_avisada_at ? (
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
          <button onClick={onAvisarCita} disabled={guardando}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
            Confirmarle el día y la hora
          </button>
        ),
        'Cuando el perito haya confirmado. Le pide que el coche esté accesible y que estén los papeles y las dos llaves.'
      ),
    },
    {
      clave: 'resultado',
      desde: 1,
      nodo: seccion(
        'Lo que vio',
        <>
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
        </>,
        'Esto es lo que marca el coche como visto. Solo el veredicto bueno abre la puerta a soltar el dinero.'
      ),
    },
    {
      clave: 'danos',
      desde: 2,
      nodo: (
        <DanosDelCoche
          danos={p.danos ?? []}
          guardando={guardando}
          onApuntar={onApuntarDano}
          onCorregir={onCorregirDano}
          onQuitar={onQuitarDano}
          onPegar={onPegar}
          onGuardarPegado={onGuardarPegado}
        />
      ),
    },
    {
      clave: 'factura',
      desde: 2,
      nodo: seccion(
        'Su factura',
        <>
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
        </>,
        'Va a facturas de proveedor, pendiente de pagar, y al pedido como coste de este coche.'
      ),
    },
    {
      clave: 'papeles',
      desde: 2,
      nodo: seccion('Su informe y las fotos', <Documentos ambito="peritacion" id={p.id} />),
    },
  ];

  const ahora = bloques.filter((b) => b.desde <= fase);
  const luego = bloques.filter((b) => b.desde > fase);

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

        {/* Lo que toca hoy, dicho antes de que empiecen los campos. */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-brand-50 border border-brand-200 text-[12px] text-brand-600">
          {queToca}
        </div>

        {ahora.map((b) => <div key={b.clave}>{b.nodo}</div>)}

        {/*
          * Y lo que todavía no toca, plegado.
          *
          * Plegado y no escondido: alguien querrá mirar el informe de una que
          * aún no ha ido, o corregir algo de una fase pasada. Lo que no puede
          * es competir con lo que hay que hacer hoy.
          */}
        {luego.length > 0 && (
          <details className="mt-5 pt-3 border-t border-brand-200">
            <summary className="text-[12px] text-brand-400 cursor-pointer select-none">
              Lo que todavía no toca ({luego.length})
            </summary>
            <div className="opacity-70">
              {luego.map((b) => <div key={b.clave}>{b.nodo}</div>)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
