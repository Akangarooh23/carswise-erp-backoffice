import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, descargaConSesion } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import { enlaceAlAnuncio } from '../lib/enlace-al-anuncio.js';
import {
  ETAPAS, QUE_TOCA, siguienteEtapa, fianzaPagada, puedeDarFecha,
  verificadoEnAlemania, depositoLiberado, puedeLiberar, repartoDelDeposito,
  agrupaPorEtapa, fueraDelCamino, resumen, diasDesde, notaDelCambio, loQueSeEscribio,
  type Etapa, type Expediente,
} from '../lib/expedientes-importacion.js';

/**
 * Los expedientes de importación.
 *
 * Vivían dentro de Leads, y ahí no encajan. Un lead es una solicitud que hay
 * que atender: se mira, se contesta y se cierra. Una importación es un
 * expediente que dura semanas —fianza cobrada, pedido a Alemania, transporte,
 * trámites, entrega—, con dinero del cliente por medio y una factura emitida.
 * En una bandeja de solicitudes eso se pierde: no había forma de ver de un
 * vistazo cuántos coches hay en transporte ni cuáles esperan la fianza.
 *
 * La pantalla se organiza por la etapa, porque la etapa es el trabajo: cada
 * columna es «lo que hay que hacer ahora» con esos coches.
 *
 * No hay endpoints nuevos. Son los mismos que ya usaba Leads: la lista filtrada
 * por tipo, el `PATCH` del expediente y la devolución de la fianza. Lo que
 * cambia es cómo se enseña.
 */

const COLOR_ETAPA: Record<Etapa, string> = {
  'Pendiente':         'bg-amber-50 border-amber-200 text-amber-800',
  'Contactado':        'bg-amber-50 border-amber-200 text-amber-800',
  'Depósito retenido':     'bg-blue-50 border-blue-200 text-blue-800',
  'Verificado y pagado': 'bg-blue-50 border-blue-200 text-blue-800',
  'En transporte':     'bg-indigo-50 border-indigo-200 text-indigo-800',
  'En trámites':       'bg-violet-50 border-violet-200 text-violet-800',
  'Entregado':         'bg-emerald-50 border-emerald-200 text-emerald-800',
};

function eur(v: unknown): string {
  const n = Number(v || 0);
  return n ? `${n.toLocaleString('es-ES')} €` : '—';
}

function dia(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ImportacionesPage() {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Expediente | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fecha, setFecha] = useState('');
  const [verCerrados, setVerCerrados] = useState(false);

  const carga = useCallback(async (): Promise<Expediente[]> => {
    setCargando(true);
    setError('');
    // `r.data` **es** la lista.
    //
    // Cuando la respuesta ya trae `data`, el cliente la devuelve tal cual: no la
    // envuelve otra vez. Buscando `r.data.data` salía undefined y la pantalla
    // decía «no se han podido cargar» con los expedientes ahí, cargados.
    const r = await api.get<Expediente[]>('/leads?type=import&limit=100');
    const lista = r.ok && Array.isArray(r.data) ? r.data : [];
    if (r.ok && Array.isArray(r.data)) setExpedientes(lista);
    else setError(r.error || 'No se han podido cargar los expedientes.');
    setCargando(false);
    return lista;
  }, []);

  useEffect(() => { void carga(); }, [carga]);

  // Al abrir uno, su fecha en el recuadro: se edita lo que hay, no un hueco.
  useEffect(() => { setFecha(abierto?.meta?.delivery_estimate ?? ''); }, [abierto]);

  const porEtapa = useMemo(() => agrupaPorEtapa(expedientes), [expedientes]);
  const cerrados = useMemo(() => fueraDelCamino(expedientes), [expedientes]);
  const cuentas = useMemo(() => resumen(expedientes), [expedientes]);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<Expediente>(`/leads/${id}`, cambios);
    setGuardando(false);
    if (!r.ok) { setError(r.error || 'No se ha podido guardar.'); return; }
    // El panel abierto se queda con lo recién recargado.
    //
    // No con lo que devuelve el `PATCH`: eso es la fila cruda de la base, con
    // `erp_notes` suelto arriba, y la pantalla lee `meta.erp_notes`. Mezclando
    // las dos formas, una nota recién guardada seguía saliendo como sin guardar.
    const lista = await carga();
    setAbierto((previo) => (previo && previo.id === id
      ? (lista.find((x) => x.id === id) ?? previo)
      : previo));
  }

  /**
   * Escribirle y avisarle, sin salir de aquí.
   *
   * Guardar la respuesta y notificar son dos cosas seguidas siempre: nadie
   * escribe un mensaje para el cliente y luego decide no mandarlo. Van juntas.
   */
  async function notifica(id: string, respuesta: string, notas: string) {
    setGuardando(true);
    const guardado = await api.patch(`/leads/${id}`, { erp_response: respuesta, notes: notas });
    if (!guardado.ok) { setGuardando(false); setError(guardado.error || "No se ha podido guardar."); return; }
    const r = await api.post(`/leads/${id}/notify`, {});
    setGuardando(false);
    if (!r.ok) { setError(r.error || "No se ha podido avisar al cliente."); return; }
    await carga();
    setAbierto(null);
  }

  /** Solo las notas internas: esas no salen hacia el cliente. */
  async function guardaNotas(id: string, notas: string) {
    await cambia(id, { notes: notas });
  }

  async function devuelveFianza(id: string) {
    const motivo = window.prompt('¿Por qué se devuelve? Se le dice al cliente en el correo.');
    if (motivo === null) return;
    setGuardando(true);
    const r = await api.post<unknown>(`/leads/${id}/devolver-fianza`, { motivo });
    setGuardando(false);
    if (!r.ok) { setError(r.error || 'No se ha podido devolver la fianza.'); return; }
    await carga();
    setAbierto(null);
  }


  return (
    <div>
      <PageHeader
        title="Importaciones"
        subtitle="Coches pedidos a Alemania, por la etapa en la que están"
        actions={
          <button
            onClick={() => void carga()}
            className="px-3 py-1.5 text-xs font-semibold text-brand-500 border border-brand-200 rounded-lg hover:bg-brand-50"
          >
            Actualizar
          </button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Lo que importa de un vistazo: cuántos hay, cuántos esperan la fianza y
          cuánto dinero de clientes tenemos cobrado sin entregar. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ['En marcha', String(cuentas.enMarcha), 'sin contar los entregados'],
          ['Esperando fianza', String(cuentas.sinFianza), 'hasta que no está, no se pide'],
          // `eur(0)` da una raya, que en una tarjeta de dinero se lee como «no se
          // sabe». Aquí sí se sabe: son cero.
          ['Fianzas cobradas', cuentas.comprometido ? eur(cuentas.comprometido) : '0 €', 'de coches aún sin entregar'],
          ['Entregados', String(cuentas.entregados), 'expedientes cerrados'],
        ].map(([titulo, valor, pie]) => (
          <div key={titulo} className="px-4 py-3 rounded-xl border border-brand-200 bg-white">
            <div className="text-2xl font-bold text-brand-600">{valor}</div>
            <div className="text-xs font-semibold text-brand-500">{titulo}</div>
            <div className="text-[11px] text-brand-400 mt-0.5">{pie}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <div className="text-sm text-brand-400 py-8 text-center">Cargando expedientes…</div>
      ) : expedientes.length === 0 ? (
        <div className="px-4 py-8 rounded-xl border border-brand-200 bg-white text-center text-sm text-brand-400">
          Todavía no hay ninguna importación. Aparecen aquí en cuanto alguien pide un coche
          desde el marketplace de importación.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ETAPAS.map((etapa) => {
            const lista = porEtapa.get(etapa) ?? [];
            return (
              <div key={etapa} className="min-w-[240px] w-[240px] shrink-0">
                <div className={`px-3 py-2 rounded-t-xl border text-xs font-bold ${COLOR_ETAPA[etapa]}`}>
                  {etapa} <span className="opacity-70">· {lista.length}</span>
                  <div className="font-normal opacity-80 mt-0.5 text-[11px]">{QUE_TOCA[etapa]}</div>
                </div>
                <div className="border border-t-0 border-brand-200 rounded-b-xl bg-brand-50/40 p-2 min-h-[80px] flex flex-col gap-2">
                  {lista.length === 0 && (
                    <div className="text-[11px] text-brand-300 text-center py-3">Ninguno</div>
                  )}
                  {lista.map((x) => {
                    const dias = diasDesde(x.created_at);
                    const pagada = fianzaPagada(x);
                    return (
                      <button
                        key={x.id}
                        onClick={() => setAbierto(x)}
                        className="text-left w-full px-3 py-2.5 rounded-lg bg-white border border-brand-200 hover:border-brand-400 transition"
                      >
                        <div className="text-[13px] font-semibold text-brand-600 leading-tight">{x.title || 'Sin vehículo'}</div>
                        <div className="text-[11px] text-brand-400 mt-0.5">{x.meta?.name || x.user_email}</div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pagada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {pagada ? '✓ fianza' : 'sin fianza'} {eur(x.meta?.deposit_quoted)}
                          </span>
                          {x.meta?.delivery_estimate && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-600">
                              {dia(x.meta.delivery_estimate)}
                            </span>
                          )}
                        </div>
                        {dias !== null && etapa !== 'Entregado' && dias > 7 && (
                          <div className="text-[10px] text-red-600 font-semibold mt-1">
                            {dias} días desde que lo pidió
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Descartados y cancelados: existen, pero no son trabajo. */}
      {cerrados.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setVerCerrados((v) => !v)}
            className="text-xs font-semibold text-brand-400 hover:text-brand-600"
          >
            {verCerrados ? '▾' : '▸'} {cerrados.length} descartados o cancelados
          </button>
          {verCerrados && (
            <div className="mt-2 flex flex-wrap gap-2">
              {cerrados.map((x) => (
                <button key={x.id} onClick={() => setAbierto(x)}
                        className="px-3 py-2 rounded-lg border border-brand-200 bg-white text-left">
                  <div className="text-[12px] font-semibold text-brand-500">{x.title}</div>
                  <div className="text-[11px] text-brand-400">{x.status} · {x.user_email}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {abierto && (
        <ExpedienteAbierto
          x={abierto}
          guardando={guardando}
          fecha={fecha}
          setFecha={setFecha}
          siguiente={siguienteEtapa(abierto.status)}
          onCerrar={() => setAbierto(null)}
          onCambiar={(cambios) => void cambia(abierto.id, cambios)}
          onDevolver={() => void devuelveFianza(abierto.id)}
          onNotificar={(respuesta, notas) => void notifica(abierto.id, respuesta, notas)}
          onGuardarNotas={(notas) => void guardaNotas(abierto.id, notas)}
        />
      )}
    </div>
  );
}

/**
 * Cómo se lee un apunte del rastro.
 *
 * `status → «Contactado»` es el nombre de una columna, no algo que se le
 * cuente a nadie. Y una nota entera dentro del historial lo llena de texto
 * repetido: se dice que la escribió, y se lee arriba, que es donde vive.
 */
function apunteEnCristiano(a: Apunte): string {
  if (a.field === "erp_notes")         return "escribió:";
  if (a.field === "erp_response")      return "escribió al cliente";
  if (a.field === "deposit_paid_at")   return `marcó la fianza como ${a.new_value || "sin cobrar"}`;
  if (a.field === "delivery_estimate") return `puso la fecha de entrega: ${a.new_value || "sin fecha"}`;
  if (a.field === "status")            return `pasó el expediente a «${a.new_value}»`;
  return `cambió ${a.field}${a.new_value ? ` a «${a.new_value}»` : ""}`;
}

interface Entrega {
  fecha?: string;
  km_salida?: number | null;
  entregado_por?: string;
  entregado?: Record<string, boolean>;
  garantia_meses?: number | null;
  garantia_hasta?: string | null;
  firmado?: boolean;
}

/**
 * La entrega, y la garantía que empieza ese día.
 *
 * Entregar no es un estado: alguien está delante, recibe unas llaves y unos
 * papeles, y firma. Lo que no se le dé ese día se convierte en una llamada la
 * semana siguiente.
 *
 * Que falte un papel no impide cerrarla —a veces la ficha llega después— pero
 * se ve lo que falta, que es distinto de no saberlo.
 */
function LaEntrega({ leadId }: { leadId: string }) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [lista, setLista] = useState<{ clave: string; que: string }[]>([]);
  const [km, setKm] = useState("");
  const [meses, setMeses] = useState("12");
  const [fallo, setFallo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async () => {
    const r = await api.get<Entrega>(`/leads/${leadId}/entrega`);
    if (!r.ok) return;
    const e = (r.data ?? {}) as Entrega;
    setEntrega(e);
    setLista(((r as unknown as { lista?: { clave: string; que: string }[] }).lista) ?? []);
    if (e.km_salida != null) setKm(String(e.km_salida));
    if (e.garantia_meses != null) setMeses(String(e.garantia_meses));
  }, [leadId]);

  useEffect(() => { void carga(); }, [carga]);

  async function guarda(cambios: Record<string, unknown>) {
    setGuardando(true);
    setFallo("");
    const r = await api.patch<Entrega>(`/leads/${leadId}/entrega`, cambios);
    setGuardando(false);
    if (!r.ok) {
      setFallo((r as unknown as { detail?: string }).detail || "No se ha podido guardar.");
      return;
    }
    await carga();
  }

  if (!entrega || !lista.length) return null;

  const dado = entrega.entregado ?? {};
  const cerrada = Boolean(entrega.fecha && entrega.firmado);

  return (
    <div className="mt-4 pt-4 border-t border-brand-100">
      <div className="text-xs font-semibold text-brand-500 mb-1.5">La entrega</div>

      {cerrada ? (
        <div className="mb-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800">
          <span className="font-bold">Entregado el {new Date(entrega.fecha!).toLocaleDateString("es-ES")}</span>
          {entrega.entregado_por && <span> · por {entrega.entregado_por}</span>}
          {entrega.garantia_hasta && (
            <span className="block">
              Garantía de {entrega.garantia_meses} meses, hasta el{" "}
              {new Date(entrega.garantia_hasta).toLocaleDateString("es-ES")}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-brand-400 mb-2">
          Se marca delante del cliente, uno a uno.
        </p>
      )}

      <ul className="space-y-1 mb-2">
        {lista.map((x) => (
          <li key={x.clave} className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={dado[x.clave] === true} disabled={guardando || cerrada}
                   onChange={(e) => void guarda({ entregado: { [x.clave]: e.target.checked } })} />
            <span className={dado[x.clave] ? "text-brand-500" : "text-brand-700 font-semibold"}>{x.que}</span>
          </li>
        ))}
      </ul>

      {!cerrada && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-500">
              Kilómetros de salida
              <input value={km} inputMode="numeric" onChange={(e) => setKm(e.target.value)}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
            <label className="text-[11px] text-brand-500">
              Garantía (meses)
              <input value={meses} inputMode="numeric" onChange={(e) => setMeses(e.target.value)}
                     className="w-full mt-0.5 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            </label>
          </div>
          <button
            onClick={() => void guarda({
              km_salida: km === "" ? null : Number(km),
              garantia_meses: Number(meses) || 12,
              firmado: true,
              cerrar: true,
            })}
            disabled={guardando || !km.trim()}
            className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
          >
            Firmado y entregado
          </button>
          <p className="text-[10px] text-brand-400 mt-1">
            La garantía se calcula al entregar y se queda quieta.
          </p>
        </>
      )}
      {fallo && <p className="text-[11px] text-red-600 mt-1.5">{fallo}</p>}
    </div>
  );
}

/** Un apunte del rastro: quién tocó qué y cuándo. */
interface Apunte {
  id: string;
  operator: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface PanelProps {
  x: Expediente;
  guardando: boolean;
  fecha: string;
  setFecha: (v: string) => void;
  siguiente: Etapa | null;
  onCerrar: () => void;
  onCambiar: (cambios: Record<string, unknown>) => void;
  onDevolver: () => void;
  onNotificar: (respuesta: string, notas: string) => void;
  onGuardarNotas: (notas: string) => void;
}

/**
 * Un expediente abierto, con todo lo que se puede hacer con él.
 *
 * El orden no es casual: primero el dinero —es lo que bloquea todo lo demás—,
 * después la etapa, y al final la fecha, que no existe hasta que hay pedido.
 */
function ExpedienteAbierto({ x, guardando, fecha, setFecha, siguiente, onCerrar, onCambiar, onDevolver, onNotificar, onGuardarNotas }: PanelProps) {
  const pagada = fianzaPagada(x);
  const devuelta = Boolean(x.meta?.deposit_refunded_at);
  const hechoElPedido = puedeDarFecha(x.status);
  const [respuesta, setRespuesta] = useState("");
  const [notas, setNotas] = useState(x.meta?.erp_notes ?? "");
  /** La etapa a la que se va a pasar, mientras se escribe por qué. */
  const [aEtapa, setAEtapa] = useState<string | null>(null);
  const [porQue, setPorQue] = useState("");
  const [cita, setCita] = useState({
    dia: x.meta?.appointment_date ?? "",
    hora: x.meta?.appointment_time ?? "",
    donde: x.meta?.appointment_address ?? "",
    quien: x.meta?.appointment_contact ?? "",
  });
  const [historial, setHistorial] = useState<Apunte[] | null>(null);

  // El rastro se pide al abrirlo: quién tocó qué y cuándo.
  useEffect(() => {
    let vivo = true;
    void api.get<Apunte[]>(`/leads/${x.id}/history`).then((r) => {
      if (vivo && r.ok) setHistorial(Array.isArray(r.data) ? r.data : []);
    });
    return () => { vivo = false; };
  }, [x.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <div
        className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-600 leading-tight">{x.title || 'Sin vehículo'}</h2>
            <p className="text-xs text-brand-400 mt-0.5">{x.meta?.name || '—'} · {x.user_email}</p>
          </div>
          <button onClick={onCerrar} className="text-brand-400 hover:text-brand-600 text-xl leading-none">×</button>
        </div>

        {/* ── El dinero ──

            Es dinero del cliente, no nuestro, y por eso este bloque enseña
            **a quién le toca cada parte**: el coche es del vendedor alemán,
            el fee nuestro y la garantía de su proveedor. El día que se libera
            hay que soltar lo del vendedor y no lo demás, y quien lo haga
            tiene que verlo aquí y no calcularlo. */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 mb-4">
          <div className="text-xs font-semibold text-blue-700">Depositado</div>
          <div className="text-lg font-bold text-blue-800">{eur(x.meta?.deposit_quoted)}</div>
          <div className="text-[11px] text-blue-700/80 mt-0.5">
            El coche y nuestro servicio. Se le dijo al pedirlo y no se recalcula.
          </div>

          {repartoDelDeposito(x).length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200/70 space-y-0.5">
              {repartoDelDeposito(x).map((l) => (
                <div key={l.concepto} className="flex justify-between gap-3 text-[11.5px] text-blue-800/90">
                  <span>{l.concepto} <span className="text-blue-700/60">→ {l.a}</span></span>
                  <span className="font-semibold tabular-nums">{eur(l.importe)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-blue-200/70">
            {pagada ? (
              <>
                <span className="text-[13px] font-bold text-emerald-700">
                  ✓ En la cuenta desde el {dia(x.meta?.deposit_paid_at)}
                </span>
                <button onClick={() => onCambiar({ deposit_paid: false })} disabled={guardando}
                        className="text-[11px] text-brand-400 underline underline-offset-2">
                  no había llegado
                </button>
                {devuelta ? (
                  <span className="text-[13px] font-bold text-brand-500">
                    ↩ Devuelta el {dia(x.meta?.deposit_refunded_at)}
                  </span>
                ) : (
                  <button onClick={onDevolver} disabled={guardando}
                          className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                    Devolver el depósito
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => onCambiar({ deposit_paid: true })} disabled={guardando}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
                El dinero ha llegado a la cuenta
              </button>
            )}
          </div>
        </div>

        {/* ── Ver el coche, y soltar el dinero ──

            Los dos pasos que sostienen el producto, y en este orden. El cliente
            ha transferido veinte mil euros por una promesa: que nadie los toca
            hasta que uno de los nuestros ha visto el coche.

            El botón de liberar se apaga solo cuando falta la verificación, pero
            **quien decide es el servidor**: aquí se mira lo que se cargó en la
            pantalla, y entre eso y el clic caben unos minutos y otra persona. */}
        {pagada && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 mb-4">
            <div className="text-xs font-semibold text-emerald-800 mb-2">Antes de soltar el dinero</div>

            {verificadoEnAlemania(x) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-emerald-700">
                  ✓ Coche visto en Alemania el {dia(x.meta?.verificado_alemania_at)}
                </span>
                {!depositoLiberado(x) && (
                  <button onClick={() => onCambiar({ verificado_alemania: false })} disabled={guardando}
                          className="text-[11px] text-brand-400 underline underline-offset-2">
                    no se ha visto
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => onCambiar({ verificado_alemania: true })} disabled={guardando}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                Hemos visto el coche en Alemania
              </button>
            )}

            <div className="mt-3 pt-3 border-t border-emerald-200/70">
              {depositoLiberado(x) ? (
                <span className="text-[13px] font-bold text-emerald-700">
                  ✓ Pago liberado al vendedor el {dia(x.meta?.escrow_liberado_at)}
                </span>
              ) : (
                <>
                  <button onClick={() => onCambiar({ libera_deposito: true })}
                          disabled={guardando || !puedeLiberar(x)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    Liberar el pago al vendedor
                  </button>
                  {!verificadoEnAlemania(x) && (
                    <div className="text-[11px] text-emerald-800/80 mt-1.5">
                      Hasta que alguien nuestro no vea el coche, ese dinero no se mueve.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── La etapa ──

            Cambiarla pide decir qué ha pasado, y eso se guarda en las notas
            internas. El historial ya deja constancia de quién la movió y cuándo,
            pero no del motivo, que es justo lo que necesita el siguiente que coja
            el teléfono: «le he llamado, se lo piensa» no está en ningún estado. */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Etapa</div>
          <select
            value={x.status}
            disabled={guardando || aEtapa !== null}
            onChange={(e) => { setAEtapa(e.target.value); setPorQue(""); }}
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
          >
            {ETAPAS.map((e) => <option key={e} value={e}>{e}</option>)}
            {!ETAPAS.some((e) => e === x.status) && <option value={x.status}>{x.status}</option>}
          </select>
          {siguiente && aEtapa === null && (
            <button
              onClick={() => { setAEtapa(siguiente); setPorQue(""); }}
              disabled={guardando || (siguiente === 'Verificado y pagado' && !pagada)}
              className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              Pasar a «{siguiente}»
            </button>
          )}

          {aEtapa !== null && (
            <div className="mt-2 p-3 rounded-lg border border-brand-300 bg-brand-50">
              <div className="text-xs font-semibold text-brand-600 mb-1">
                Pasar a «{aEtapa}». ¿Qué ha pasado?
              </div>
              <p className="text-[11px] text-brand-400 mb-2">
                Se guarda en las notas internas. No lo ve el cliente.
              </p>
              <textarea
                value={porQue}
                onChange={(e) => setPorQue(e.target.value)}
                rows={2}
                autoFocus
                placeholder="Le he llamado, entiende el proceso y se lo piensa…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg resize-y bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    onCambiar({
                      status: aEtapa,
                      notes: notaDelCambio(notas, x.status, aEtapa, porQue),
                    });
                    setNotas(notaDelCambio(notas, x.status, aEtapa, porQue));
                    setAEtapa(null);
                    setPorQue("");
                  }}
                  disabled={guardando || !porQue.trim()}
                  className="flex-1 px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
                >
                  Guardar y pasar
                </button>
                <button
                  onClick={() => { setAEtapa(null); setPorQue(""); }}
                  className="px-3 py-2 text-xs font-semibold text-brand-500 border border-brand-200 rounded-lg bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {siguiente === 'Verificado y pagado' && !pagada && (
            <p className="text-[11px] text-amber-700 mt-1.5">
              Hasta que la fianza no esté cobrada no se hace el pedido.
            </p>
          )}
        </div>

        {/* ── La fecha, que no existe antes del pedido ── */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Cuándo le hemos dicho que lo tendrá</div>
          {hechoElPedido ? (
            <div className="flex gap-2">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-brand-200 rounded-lg"
              />
              <button
                onClick={() => onCambiar({ delivery_estimate: fecha })}
                disabled={guardando || !fecha}
                className="px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-brand-400">
              Todavía no: la fecha la dan al aceptar el pedido a Alemania. Este expediente
              está en <strong>{x.status}</strong>.
            </p>
          )}
        </div>

        {/* ── Lo que hay que saber para llamarle ── */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm border-t border-brand-100 pt-4">
          <div>
            <dt className="text-[11px] text-brand-400">Teléfono</dt>
            <dd className="font-medium text-brand-600">{x.meta?.phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-brand-400">Cuándo llamar</dt>
            <dd className="font-medium text-brand-600">{x.meta?.when || '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] text-brand-400">Lo pidió</dt>
            <dd className="font-medium text-brand-600">{dia(x.created_at)}</dd>
          </div>
          {enlaceAlAnuncio(x.meta?.vehicle_url) && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Anuncio</dt>
              <dd>
                <a href={enlaceAlAnuncio(x.meta?.vehicle_url) ?? undefined} target="_blank" rel="noreferrer"
                   className="text-brand-500 underline underline-offset-2 break-all text-xs">
                  {enlaceAlAnuncio(x.meta?.vehicle_url)}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {/* ── Escribirle ── */}
        <div className="mt-4 pt-4 border-t border-brand-100">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Mensaje para el cliente</div>
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={3}
            placeholder="Lo verá en su panel y le llegará por correo, con su fianza…"
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg resize-y"
          />
          <button
            onClick={() => onNotificar(respuesta, notas)}
            disabled={guardando || !respuesta.trim()}
            className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
          >
            Guardar y avisar al cliente
          </button>
        </div>

        {/* ── Notas internas: estas no salen ── */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Notas internas</div>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="No se envían al cliente…"
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg resize-y"
          />
          {/* Con su botón.

              Se guardaba al salir del recuadro, sin botón y sin decir nada: si
              cerrabas el panel desde el propio texto, se perdía lo escrito, y si
              se guardaba tampoco había forma de saberlo. Una nota que no sabes
              si está guardada es una nota que vas a escribir dos veces. */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onGuardarNotas(notas)}
              disabled={guardando || notas === (x.meta?.erp_notes ?? "")}
              className="px-3 py-1.5 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-40"
            >
              Guardar nota
            </button>
            {/* Sale siempre que lo de la pantalla y lo de la base coincidan, no
                solo justo después de pulsar. Abrir un expediente y ver una nota
                con el botón apagado y ninguna señal se lee como «no se ha
                guardado», que es exactamente lo contrario de lo que pasa. */}
            {notas.trim() !== "" && notas === (x.meta?.erp_notes ?? "") && (
              <span className="text-[11px] font-semibold text-emerald-700">Guardada</span>
            )}
          </div>
        </div>

        {/* ── El día de la entrega ──

            Es una cita como cualquier otra: el cliente recibe el aviso de la
            víspera y el del mismo día. Lo que no hace es mover el expediente
            de etapa — sigue donde estaba hasta que se entrega. */}
        <div className="mt-4 pt-4 border-t border-brand-100">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Día de la entrega</div>
          <p className="text-[11px] text-brand-400 mb-2">
            Si quedas con él, se lo recordamos la víspera y el mismo día.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={cita.dia}
                   onChange={(e) => setCita((c) => ({ ...c, dia: e.target.value }))}
                   className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <input type="time" value={cita.hora}
                   onChange={(e) => setCita((c) => ({ ...c, hora: e.target.value }))}
                   className="px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <input type="text" value={cita.donde} placeholder="Dónde"
                   onChange={(e) => setCita((c) => ({ ...c, donde: e.target.value }))}
                   className="col-span-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
            <input type="text" value={cita.quien} placeholder="Pregunta por"
                   onChange={(e) => setCita((c) => ({ ...c, quien: e.target.value }))}
                   className="col-span-2 px-3 py-2 text-sm border border-brand-200 rounded-lg" />
          </div>
          <button
            onClick={() => onCambiar({
              appointment_date: cita.dia || null,
              appointment_time: cita.hora,
              appointment_address: cita.donde,
              appointment_contact: cita.quien,
            })}
            disabled={guardando || !cita.dia}
            className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg disabled:opacity-40"
          >
            Guardar el día de la entrega
          </button>
        </div>

        <LaEntrega leadId={x.id} />

        <Documentos ambito="lead" id={x.id} origen="importacion" />

        {/* ── El rastro ── */}
        <div className="mt-4 pt-4 border-t border-brand-100">
          <div className="text-xs font-semibold text-brand-500 mb-2">Historial</div>
          {historial === null ? (
            <p className="text-[11px] text-brand-300">Cargando…</p>
          ) : historial.length === 0 ? (
            <p className="text-[11px] text-brand-300">Todavía no ha tocado nadie este expediente.</p>
          ) : (
            <ul className="space-y-1.5">
              {historial.map((a) => (
                <li key={a.id} className="text-[11px] text-brand-500 leading-snug">
                  <span className="text-brand-400">{dia(a.created_at)}</span>{" · "}
                  <strong className="font-semibold">{a.operator}</strong>{" "}
                  {apunteEnCristiano(a)}
                  {/* La nota entera, aquí mismo. Un rastro que dice «escribió una
                      nota» y te obliga a subir a buscarla no sirve de nada: lo
                      que se quiere saber es qué se escribió aquel día. */}
                  {a.field === "erp_notes" && loQueSeEscribio(a.old_value, a.new_value) && (
                    <span className="block mt-0.5 pl-2 border-l-2 border-brand-200 text-brand-600 whitespace-pre-wrap">
                      {loQueSeEscribio(a.old_value, a.new_value)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
