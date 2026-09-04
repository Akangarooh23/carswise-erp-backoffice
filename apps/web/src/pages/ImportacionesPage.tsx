import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, descargaConSesion } from '../api/client.js';
import RevisarCorreo, { type VistaDelCorreo } from '../components/RevisarCorreo.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Documentos from '../components/Documentos.js';
import { enlaceAlAnuncio } from '../lib/enlace-al-anuncio.js';
import { comoSeCuenta } from '../lib/danos.js';
import CaminoDelCoche from '../components/CaminoDelCoche.js';
import Plegable from '../components/Plegable.js';
import {
  ETAPAS, COLUMNAS, QUE_TOCA, QUE_TOCA_COLUMNA, COLUMNA_SEGUNDO_VIAJE,
  siguienteEtapa, fianzaPagada, puedeDarFecha, bloquesDelExpediente,
  verificadoEnAlemania, depositoLiberado, puedeLiberar, repartoDelDeposito,
  facturaDelVendedorPedida, encargoALaGestoriaEnviado, reservaPreguntada,
  liquidacionDelImpuesto,
  agrupaPorEtapa, fueraDelCamino, resumen, diasDesde, notaDelCambio, loQueSeEscribio,
  type Etapa, type Columna, type Expediente,
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

const COLOR_ETAPA: Record<Columna, string> = {
  'Pendiente':         'bg-amber-50 border-amber-200 text-amber-800',
  'Contactado':        'bg-amber-50 border-amber-200 text-amber-800',
  'Depósito retenido':     'bg-blue-50 border-blue-200 text-blue-800',
  'Verificado y pagado': 'bg-blue-50 border-blue-200 text-blue-800',
  'En transporte':     'bg-indigo-50 border-indigo-200 text-indigo-800',
  'En trámites':       'bg-violet-50 border-violet-200 text-violet-800',
  // Del mismo color que el primero, que es lo que pidió Ana: los dos son un
  // camión con el coche dentro. Lo que los distingue es dónde están en la fila
  // y qué dicen, no el color; pintarlos distintos sugería que son dos cosas
  // diferentes, y lo diferente es el destino.
  [COLUMNA_SEGUNDO_VIAJE]: 'bg-indigo-50 border-indigo-200 text-indigo-800',
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
  // Lo que se le dice a quien acaba de pulsar, donde está mirando.
  const [errorDelPanel, setErrorDelPanel] = useState('');

  /**
   * El correo que se está revisando, antes de mandarlo.
   *
   * Se guarda también a qué ruta va: los dos correos de esta pantalla —la
   * factura al vendedor y el encargo a la gestoría— se revisan igual y solo
   * cambia el sitio al que se manda.
   */
  const [revisando, setRevisando] = useState<{ vista: VistaDelCorreo; ruta: string } | null>(null);

  /**
   * Pide el correo sin mandarlo y lo abre para revisar.
   *
   * Con `finally`: si la llamada revienta —la red, un despliegue a medias— sin
   * él se queda «guardando» para siempre y **todos los botones del panel se
   * apagan sin decir nada**. Pulsar y que se apague todo es peor que un error.
   */
  async function preparaCorreo(ruta: string) {
    setGuardando(true);
    try {
      const r = await api.post<VistaDelCorreo>(ruta, { soloVista: true });
      if (!r.ok) {
        const dice = (r as { detail?: string }).detail || r.error || 'No se ha podido preparar.';
        setError(dice);
        setErrorDelPanel(dice);
        return;
      }
      setErrorDelPanel('');
      const d = r.data as unknown as VistaDelCorreo;
      setRevisando({ vista: { para: d.para, subject: d.subject, html: d.html, papeles: d.papeles, idioma: d.idioma }, ruta });
    } catch (e) {
      const dice = (e as Error)?.message || 'No se ha podido preparar.';
      setError(dice);
      setErrorDelPanel(dice);
    } finally {
      setGuardando(false);
    }
  }

  /** Y ya revisado, se manda con lo que haya cambiado. */
  async function mandaElCorreo(cambios: { para: string; asunto: string; nota: string; adjuntos: string[] }) {
    if (!revisando) return;
    const id = abierto?.id;
    setGuardando(true);
    try {
      const r = await api.post(revisando.ruta, cambios);
      if (!r.ok) {
        setErrorDelPanel((r as { detail?: string }).detail || r.error || 'No se ha podido mandar.');
        return;
      }
      setRevisando(null);
      const lista = await carga();
      if (id) setAbierto((previo) => (previo && previo.id === id ? (lista.find((y) => y.id === id) ?? previo) : previo));
    } catch (e) {
      setErrorDelPanel((e as Error)?.message || 'No se ha podido mandar.');
    } finally {
      setGuardando(false);
    }
  }
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

  /**
   * Pedirle al vendedor la factura del coche.
   *
   * El aviso va donde está mirando, igual que el de liberar: si el vendedor no
   * tiene correo o al cliente le falta el NIF, hay que enterarse aquí.
   */
  /**
   * Mandarle a la gestoría el encargo de matricular.
   *
   * Comparte forma con la petición de factura al vendedor: pulsa, se manda, y
   * si no se puede se dice qué falta donde está mirando.
   */
  /**
   * Lo que contestó el vendedor, apuntado una vez y repartido solo.
   *
   * La dirección y el contacto van a la peritación —es quien tiene que ir— y el
   * IBAN a la ficha del vendedor, que es de donde lo lee el portero del pago.
   * Copiarlo a mano de un correo a tres pantallas es donde se cuelan los
   * errores, y uno de esos datos es un número de cuenta.
   */
  async function guardaLaRespuesta(id: string, datos: Record<string, string>) {
    setGuardando(true);
    try {
      const r = await api.post(`/leads/${id}/respuesta-vendedor`, datos);
      if (!r.ok) {
        const dice = (r as { detail?: string }).detail || r.error || 'No se ha podido guardar.';
        setError(dice);
        setErrorDelPanel(dice);
        return;
      }
      setErrorDelPanel('');
      const lista = await carga();
      setAbierto((previo) => (previo && previo.id === id ? (lista.find((y) => y.id === id) ?? previo) : previo));
    } catch (e) {
      setErrorDelPanel((e as Error)?.message || 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  }

  // Los dos no mandan nada: preparan el correo y lo abren para revisarlo.
  const encargaALaGestoria = (id: string) => preparaCorreo(`/leads/${id}/encargo-gestoria`);
  const pideLaFactura = (id: string) => preparaCorreo(`/leads/${id}/factura-vendedor`);
  const preguntaAlVendedor = (id: string) => preparaCorreo(`/leads/${id}/reserva-vendedor`);
  /**
   * El correo vive en el tramo, pero se manda desde aquí.
   *
   * Es el mismo de siempre —no hay una segunda copia—: se le pide al tramo
   * que sale de la nave del vendedor, que es el que guarda la respuesta.
   */
  const preguntaLaRecogida = (x: Expediente) =>
    preparaCorreo(`/transportes/${x.meta?.tramo_del_vendedor}/datos-recogida`);
  /** Y decirle quién va y qué día, con lo que ya hay apuntado en el tramo. */
  const avisaDeLaRecogida = (x: Expediente) =>
    preparaCorreo(`/transportes/${x.meta?.tramo_del_vendedor}/aviso-recogida`);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    let r;
    try {
      r = await api.patch<Expediente>(`/leads/${id}`, cambios);
    } catch (e) {
      const dice = (e as Error)?.message || 'No se ha podido guardar.';
      setError(dice);
      setErrorDelPanel(dice);
      return;
    } finally {
      setGuardando(false);
    }
    if (!r.ok) {
      /**
       * El motivo, con palabras y **dentro del panel**.
       *
       * El aviso salía arriba de la pantalla, o sea detrás del expediente
       * abierto: pulsar «Liberar el pago al vendedor» y que el servidor lo
       * rechazara se veía exactamente igual que si no pasara nada.
       *
       * Y con la frase que manda el servidor, no con su código: «sin_pagar» no
       * le dice a nadie que lo que falta es que el cliente transfiera.
       */
      const conDetalle = r as { detail?: string };
      const dice = conDetalle.detail || r.error || 'No se ha podido guardar.';
      setError(dice);
      setErrorDelPanel(dice);
      return;
    }
    setErrorDelPanel('');
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
          ['Esperando depósito', String(cuentas.sinFianza), 'hasta que no está, nadie va a verlo'],
          // `eur(0)` da una raya, que en una tarjeta de dinero se lee como «no se
          // sabe». Aquí sí se sabe: son cero.
          ['Depósitos retenidos', cuentas.comprometido ? eur(cuentas.comprometido) : '0 €', 'de coches aún sin entregar'],
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
          {COLUMNAS.map((etapa) => {
            const lista = porEtapa.get(etapa) ?? [];
            return (
              <div key={etapa} className="min-w-[240px] w-[240px] shrink-0">
                <div className={`px-3 py-2 rounded-t-xl border text-xs font-bold ${COLOR_ETAPA[etapa]}`}>
                  {etapa} <span className="opacity-70">· {lista.length}</span>
                  <div className="font-normal opacity-80 mt-0.5 text-[11px]">{QUE_TOCA_COLUMNA[etapa]}</div>
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
                            {pagada ? '✓ depósito' : 'sin depósito'} {eur(x.meta?.deposit_quoted)}
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
          onPreguntarAlVendedor={() => void preguntaAlVendedor(abierto.id)}
          onPreguntarRecogida={() => void preguntaLaRecogida(abierto)}
          onAvisarDeLaRecogida={() => void avisaDeLaRecogida(abierto)}
          onGuardarRespuesta={(datos) => void guardaLaRespuesta(abierto.id, datos)}
          onPedirFactura={() => void pideLaFactura(abierto.id)}
          onEncargarALaGestoria={() => void encargaALaGestoria(abierto.id)}
          aviso={errorDelPanel}
          onDevolver={() => void devuelveFianza(abierto.id)}
          onNotificar={(respuesta, notas) => void notifica(abierto.id, respuesta, notas)}
          onGuardarNotas={(notas) => void guardaNotas(abierto.id, notas)}
        />
      )}

      {/* Ningún correo a un proveedor sale sin que alguien lo haya visto. */}
      <RevisarCorreo
        vista={revisando?.vista ?? null}
        enviando={guardando}
        error={errorDelPanel}
        onEnviar={(cambios) => void mandaElCorreo(cambios)}
        onCerrar={() => setRevisando(null)}
      />
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
  onPreguntarAlVendedor: () => void;
  onPreguntarRecogida: () => void;
  onAvisarDeLaRecogida: () => void;
  onGuardarRespuesta: (datos: Record<string, string>) => void;
  onPedirFactura: () => void;
  onEncargarALaGestoria: () => void;
  aviso: string;
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
function ExpedienteAbierto({ x, guardando, fecha, setFecha, siguiente, onCerrar, onCambiar, onDevolver, onNotificar, onGuardarNotas, onPreguntarAlVendedor, onPreguntarRecogida, onAvisarDeLaRecogida, onGuardarRespuesta, onPedirFactura,
onEncargarALaGestoria, aviso }: PanelProps) {
  /**
   * Lo que trae su respuesta al primer correo, en el mismo orden en que lo
   * escribe él: Besichtigung, Uhrzeit, Adresse, Ansprechpartner, Telefon.
   *
   * Copiar de un correo a un formulario que ordena las cosas de otra manera
   * es donde se cambian dos campos de sitio. Si la pantalla va en el orden de
   * la carta, se copia de arriba abajo sin pensar.
   *
   * **Y se rellena con lo que ya hay apuntado.** Empezaba siempre en blanco,
   * así que al volver al expediente parecía que no se había guardado nada —y
   * lo siguiente es teclearlo otra vez encima de lo que ya estaba bien—. Los
   * datos viven en la peritación; esto es la misma ficha vista desde aquí.
   */
  const dePeritacion = x.meta?.peritacion;
  const [delVendedor, setDelVendedor] = useState({
    fecha: dePeritacion?.fecha_prevista ?? '',
    hora: dePeritacion?.hora_prevista ?? '',
    donde: dePeritacion?.donde ?? '',
    contacto: dePeritacion?.contacto ?? '',
    telefono: dePeritacion?.telefono ?? '',
  });
  const pagada = fianzaPagada(x);
  const devuelta = Boolean(x.meta?.deposit_refunded_at);
  const hechoElPedido = puedeDarFecha(x.status);

  /**
   * Qué partes de este expediente tienen sentido hoy.
   *
   * Con el coche sin ver en Alemania no hay día de entrega que dar, ni
   * papeles que reunir, ni kilómetros de salida. Un hueco vacío puesto
   * delante en la etapa que no toca parece una tarea pendiente y se rellena
   * con lo primero que sirva.
   */
  const [verTodo, setVerTodo] = useState(false);
  const bloques = bloquesDelExpediente(x.status);
  const toca = (b: string) => verTodo || bloques.includes(b as never);
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

        {/*
          * Lo primero de todo: en qué punto está y qué toca.
          *
          * Es la pregunta con la que se abre un expediente, y hasta ahora la
          * contestaba uno mirando cinco pantallas y acordándose.
          */}
        <CaminoDelCoche x={x} />

        {/*
          * Lo que no se ha podido hacer, arriba del todo.
          *
          * Estaba metido dentro del bloque de «Antes de soltar el dinero», que
          * desaparece en cuanto el pago se libera. A partir de ahí, cualquier
          * cosa que fallara —pedir la factura, el encargo a la gestoría— se
          * quedaba sin sitio donde salir: pulsabas y no pasaba nada, que es
          * exactamente lo que este aviso existe para que no ocurra.
          */}
        {aviso && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-800">
            {aviso}
          </div>
        )}

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

        {/* ── La liquidación del impuesto ──

            El cliente pagó una provisión, porque el impuesto se estima. Al
            matricular, la gestoría escribe el coste real en su trámite y la
            diferencia es suya, en los dos sentidos.

            No sale hasta que hay coste en el trámite: un bloque diciendo
            «pendiente» durante seis semanas es ruido. Y el botón no mueve
            dinero, deja constancia: cobrar o devolver se hace por el mismo
            sitio que el depósito. */}
        {(() => {
          const liq = liquidacionDelImpuesto(x);
          if (!liq) return null;
          const hayQueMover = liq.quien !== 'cuadra';
          return (
            <div className={`rounded-xl border p-3 mb-4 ${liq.hecha ? 'border-brand-200 bg-brand-50/50' : hayQueMover ? 'border-amber-300 bg-amber-50/70' : 'border-brand-200 bg-brand-50/50'}`}>
              <div className="text-xs font-semibold text-brand-600 mb-2">Liquidación del impuesto</div>
              <div className="space-y-0.5 text-[12px]">
                <div className="flex justify-between gap-3 text-brand-500">
                  <span>Puso a cuenta</span>
                  <span className="tabular-nums">{eur(liq.provision)}</span>
                </div>
                <div className="flex justify-between gap-3 text-brand-500">
                  <span>Ha salido</span>
                  <span className="tabular-nums">{eur(liq.real)}</span>
                </div>
                <div className="flex justify-between gap-3 pt-1.5 mt-1.5 border-t border-brand-200/70 font-bold text-brand-600">
                  <span>
                    {liq.quien === 'cobrar' ? 'Hay que cobrarle'
                      : liq.quien === 'devolver' ? 'Hay que devolverle'
                      : 'Cuadra: no hay que mover nada'}
                  </span>
                  {hayQueMover && <span className="tabular-nums">{eur(Math.abs(liq.diferencia))}</span>}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-brand-200/70">
                {liq.hecha ? (
                  <span className="text-[13px] font-bold text-emerald-700">✓ Liquidado</span>
                ) : (
                  <button onClick={() => onCambiar({ liquidacion_hecha: true })} disabled={guardando}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {hayQueMover ? 'Ya lo he liquidado' : 'Dar por liquidado'}
                  </button>
                )}
              </div>
            </div>
          );
        })()}

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

            {/*
              * Lo primero con el dinero ya dentro: preguntarle si el coche está.
              *
              * Un anuncio de AutoScout24 sigue publicado días después de que el
              * coche se venda —454 de 484 de los nuestros estaban vendidos desde
              * julio y seguían en pie—, así que que el anuncio esté vivo no dice
              * nada. Y el cliente ya ha transferido veintiún mil euros.
              *
              * Va antes de «Hemos visto el coche» porque es lo que decide si hay
              * algo que ir a ver.
              */}
            <div className="mb-3 pb-3 border-b border-emerald-200/70">
              {reservaPreguntada(x) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-emerald-700">
                    ✓ Preguntado al vendedor el {dia(x.meta?.reserva_preguntada_at)}
                  </span>
                  <button onClick={() => onPreguntarAlVendedor()} disabled={guardando}
                          className="text-[11px] text-brand-400 underline underline-offset-2">
                    preguntar otra vez
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => onPreguntarAlVendedor()} disabled={guardando}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                    Preguntarle si sigue disponible
                  </button>
                  <div className="text-[11px] text-emerald-800/80 mt-1.5">
                    Un anuncio sigue publicado días después de venderse el coche.
                  </div>
                </>
              )}

              {/*
                * Y lo que conteste, apuntado aquí una sola vez.
                *
                * Su respuesta trae cinco datos y los cinco son de la visita: qué
                * día, a qué hora, dónde está el coche, por quién preguntar y en
                * qué teléfono. Van los cinco a la peritación, que es quien va a
                * ir, y se teclean una vez.
                *
                * El IBAN no está aquí: el primer correo no lo pide —un número de
                * cuenta pedido antes de saber si el coche existe es el hilo por el
                * que entra el fraude— y se apunta en Proveedores al ir a pagar,
                * confirmado por teléfono.
                */}
              {reservaPreguntada(x) && (
                <div className="mt-3 pt-3 border-t border-emerald-200/70">
                  <div className="text-[11px] font-semibold text-emerald-800 mb-1.5">
                    Lo que ha contestado
                  </div>
                  {/*
                    * Que se vea que está guardado, y dónde ha ido.
                    *
                    * Sin esto, un formulario relleno no se distingue de uno a
                    * medio escribir que nadie ha mandado.
                    */}
                  {(dePeritacion?.donde || dePeritacion?.contacto) && (
                    <div className="text-[12px] font-bold text-emerald-700 mb-1.5">
                      ✓ Apuntado en la peritación {dePeritacion.id}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <label className="text-[11px] text-emerald-800/80">
                      Qué día va
                      <input type="date" value={delVendedor.fecha}
                             onChange={(e) => setDelVendedor((d) => ({ ...d, fecha: e.target.value }))}
                             className="w-full mt-0.5 px-3 py-2 text-sm border border-emerald-200 rounded-lg" />
                    </label>
                    <label className="text-[11px] text-emerald-800/80">
                      A qué hora
                      <input value={delVendedor.hora} placeholder="10:00"
                             onChange={(e) => setDelVendedor((d) => ({ ...d, hora: e.target.value }))}
                             className="w-full mt-0.5 px-3 py-2 text-sm border border-emerald-200 rounded-lg" />
                    </label>
                  </div>
                  <input value={delVendedor.donde} placeholder="Dónde está el coche: calle, número, CP y ciudad"
                         onChange={(e) => setDelVendedor((d) => ({ ...d, donde: e.target.value }))}
                         className="w-full mb-1.5 px-3 py-2 text-sm border border-emerald-200 rounded-lg" />
                  <input value={delVendedor.contacto} placeholder="Preguntar por…"
                         onChange={(e) => setDelVendedor((d) => ({ ...d, contacto: e.target.value }))}
                         className="w-full mb-1.5 px-3 py-2 text-sm border border-emerald-200 rounded-lg" />
                  <input value={delVendedor.telefono} placeholder="Su teléfono" inputMode="tel"
                         onChange={(e) => setDelVendedor((d) => ({ ...d, telefono: e.target.value }))}
                         className="w-full mb-1.5 px-3 py-2 text-sm border border-emerald-200 rounded-lg" />
                  <button onClick={() => onGuardarRespuesta(delVendedor)} disabled={guardando}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                    Guardar lo que ha contestado
                  </button>
                  <div className="text-[11px] text-emerald-800/80 mt-1.5">
                    Los cinco caen en la <strong>peritación</strong>: es lo que necesita
                    el perito para ir. El <strong>IBAN no se pide aquí</strong> —tampoco
                    lo pide el correo—: se apunta en su ficha de Proveedores al ir a
                    pagar, y <strong>se confirma por teléfono</strong>.
                  </div>
                </div>
              )}
            </div>

            {/*
              * Quién dice que el coche está visto.
              *
              * Si hay peritación, **ella**: aquí no se pulsa nada, se enseña lo
              * que dijo el perito y se manda a su pantalla. Dos puertas al mismo
              * hecho acaban diciendo cosas distintas, y la que vale es la suya.
              *
              * El botón se queda para los expedientes viejos, los de antes de que
              * las peritaciones existieran. Quitarlo del todo dejaría uno de esos
              * sin forma de avanzar.
              */}
            {x.meta?.peritacion ? (
              <div>
                {verificadoEnAlemania(x) ? (
                  <span className="text-[13px] font-bold text-emerald-700">
                    ✓ Coche visto en Alemania el {dia(x.meta?.verificado_alemania_at)}
                    {x.meta.peritacion.perito ? ` · ${x.meta.peritacion.perito}` : ''}
                  </span>
                ) : x.meta.peritacion.veredicto === 'no_es_el_que_se_anuncio' ? (
                  <span className="text-[13px] font-bold text-red-700">
                    El perito dice que <strong>no es el que se anunció</strong>. El dinero vuelve al cliente.
                  </span>
                ) : (
                  <span className="text-[13px] font-semibold text-emerald-800/80">
                    Peritación {x.meta.peritacion.estado.toLowerCase()}
                    {x.meta.peritacion.perito ? ` · ${x.meta.peritacion.perito}` : ' · sin perito todavía'}
                  </span>
                )}
                {/*
                  * Lo que costaría dejarlo bien.
                  *
                  * Es el dato con el que se le da al cliente un precio de
                  * reacondicionamiento, y hasta ahora no estaba en ningún
                  * sitio: salía de la memoria de quien cogía el teléfono.
                  *
                  * Con partidas sin valorar se pinta en ámbar y se dice
                  * cuántas son. Un total que va corto y no lo avisa es peor
                  * que no tener total.
                  */}
                {(x.meta.peritacion.danos?.cuantas ?? 0) > 0 && (
                  <div className={`text-[12px] mt-1 font-semibold ${
                    x.meta.peritacion.danos?.sinValorar ? 'text-amber-700' : 'text-emerald-800/80'}`}>
                    Daños: {comoSeCuenta({
                      cuantas: x.meta.peritacion.danos?.cuantas ?? 0,
                      total: Number(x.meta.peritacion.danos?.total ?? 0),
                      sinValorar: x.meta.peritacion.danos?.sinValorar ?? 0,
                    })}
                  </div>
                )}
                <div className="mt-1">
                  <a href="/peritaciones" className="text-[11px] text-brand-400 underline underline-offset-2">
                    ver la peritación {x.meta.peritacion.id} →
                  </a>
                </div>
              </div>
            ) : verificadoEnAlemania(x) ? (
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

            {/*
              * Y el papel que hay que pedirle.
              *
              * Sale una vez liberado el pago porque es cuando la compra existe
              * de verdad. Sin esa factura a nombre del cliente, los 16.890 € del
              * coche no son un suplido: son ingreso nuestro con unos 3.500 € de
              * IVA sobre dinero que no es nuestro.
              *
              * El correo hace dos cosas de una: le dice que la transferencia ya
              * ha salido, con su importe y su fecha, y le pide la factura. Una
              * petición a secas se lee como un trámite que puede esperar.
              *
              * Es un botón y no un envío automático a propósito: con cuatro
              * coches al mes, un correo revisado vale lo mismo y no se arriesga
              * a salir con un dato mal puesto. Un correo no se desenvía.
              */}
            {depositoLiberado(x) && (
              <div className="mt-3 pt-3 border-t border-emerald-200/70">
                <div className="text-xs font-semibold text-emerald-800 mb-1.5">
                  Avisarle del pago y pedirle la factura
                </div>
                {facturaDelVendedorPedida(x) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-emerald-700">
                      ✓ Avisado y pedida el {dia(x.meta?.factura_vendedor_pedida_at)}
                      {x.meta?.factura_vendedor_pedida_a ? ` a ${String(x.meta.factura_vendedor_pedida_a)}` : ''}
                    </span>
                    <button onClick={() => onPedirFactura()} disabled={guardando}
                            className="text-[11px] text-brand-400 underline underline-offset-2">
                      pedirla otra vez
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onPedirFactura()} disabled={guardando}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                      Avisarle del pago y pedirle la factura
                    </button>
                    <div className="text-[11px] text-emerald-800/80 mt-1.5">
                      Le dice que la transferencia ha salido y con qué datos emitirla.
                      Sin esa factura, el precio del coche deja de ser un suplido y lleva IVA.
                    </div>
                  </>
                )}
              </div>
            )}

            {/*
              * Y el tercer correo al vendedor: dónde y cuándo se recoge.
              *
              * Estaba en Transportes, dentro del tramo, y es el único de los
              * tres que le escribimos desde otra pantalla. Cada pantalla manda
              * los correos de su interlocutor —el perito en Peritaciones, el
              * transportista en Transportes— y el vendedor es de aquí.
              *
              * La respuesta se sigue guardando en el tramo, que es quien la
              * usa: la dirección exacta va a «Desde» y el día a «Recogida
              * prevista». Preguntar y guardar no tienen por qué pasar en la
              * misma pantalla.
              */}
            {depositoLiberado(x) && x.meta?.tramo_del_vendedor && (
              <div className="mt-3 pt-3 border-t border-emerald-200/70">
                <div className="text-xs font-semibold text-emerald-800 mb-1.5">
                  Dónde y cuándo se recoge
                </div>
                {x.meta?.recogida_preguntada_at ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-emerald-700">
                      ✓ Preguntado el {dia(x.meta.recogida_preguntada_at)}
                    </span>
                    <button onClick={() => onPreguntarRecogida()} disabled={guardando}
                            className="text-[11px] text-brand-400 underline underline-offset-2">
                      preguntar otra vez
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onPreguntarRecogida()} disabled={guardando}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                      Preguntarle dónde y cuándo se recoge
                    </button>
                    <div className="text-[11px] text-emerald-800/80 mt-1.5">
                      La dirección exacta, el día y la hora, por quién preguntar, qué se
                      lleva el conductor y si entra un camión portacoches. Su respuesta
                      se apunta en el tramo, en Transportes.
                    </div>
                  </>
                )}
              </div>
            )}

            {/*
              * Y el cuarto correo al vendedor: quién va a por el coche y qué día.
              *
              * Va antes de confirmarle nada al transportista, y no es un
              * detalle de orden: quien tiene que preparar el coche y sacar los
              * papeles del cajón es el vendedor. Un conductor que llega a una
              * nave donde nadie le espera se va vacío, y ese viaje se paga
              * igual.
              *
              * Los datos salen del tramo —el transportista y el día están
              * allí— pero el correo es al vendedor, y los suyos viven aquí.
              */}
            {x.meta?.tramo_del_vendedor && x.meta?.recogida_preguntada_at && (
              <div className="mt-3 pt-3 border-t border-emerald-200/70">
                <div className="text-xs font-semibold text-emerald-800 mb-1.5">
                  Avisarle de quién va y qué día
                </div>
                {x.meta?.aviso_recogida_at ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-emerald-700">
                      ✓ Avisado el {dia(x.meta.aviso_recogida_at)}
                    </span>
                    <button onClick={() => onAvisarDeLaRecogida()} disabled={guardando}
                            className="text-[11px] text-brand-400 underline underline-offset-2">
                      volver a avisarle
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onAvisarDeLaRecogida()} disabled={guardando}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50">
                      Decirle quién va a por el coche y qué día
                    </button>
                    <div className="text-[11px] text-emerald-800/80 mt-1.5">
                      El día, la empresa, quién le va a llamar y qué tiene que darle al
                      conductor. Sale del tramo: si todavía no hay transportista o día,
                      lo dirá al abrirlo.
                    </div>
                  </>
                )}
              </div>
            )}

            {/*
              * Y el encargo a la gestoría.
              *
              * Sale cuando ya hay trámites abiertos, que es al entrar en «En
              * trámites». Un correo por coche y no por trámite: son tres
              * papeleos pero la misma carpeta y la misma persona.
              */}
            {x.status === 'En trámites' && (
              <div className="mt-3 pt-3 border-t border-emerald-200/70">
                <div className="text-xs font-semibold text-emerald-800 mb-1.5">
                  El encargo a la gestoría
                </div>
                {encargoALaGestoriaEnviado(x) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-emerald-700">
                      ✓ Mandado el {dia(x.meta?.encargo_gestoria_enviado_at)}
                      {x.meta?.encargo_gestoria_enviado_a ? ` a ${String(x.meta.encargo_gestoria_enviado_a)}` : ''}
                    </span>
                    <button onClick={() => onEncargarALaGestoria()} disabled={guardando}
                            className="text-[11px] text-brand-400 underline underline-offset-2">
                      mandarlo otra vez
                    </button>
                  </div>
                ) : (
                  <>
                    {/*
                      * Este correo se manda desde Gestoría.
                      *
                      * Va dirigido a ella, lleva dentro los tres papeleos y
                      * necesita saber quién los lleva, un dato que se pone allí.
                      * Con el botón aquí se pulsaba, decía que falta elegir la
                      * gestoría, había que ir, elegirla y volver.
                      *
                      * Cada pantalla manda los correos de su interlocutor.
                      */}
                    <div className="text-[11px] text-emerald-800/80">
                      Los tres trámites en un correo, y les pide el importe real del
                      impuesto. Se le encarga desde{' '}
                      <a href="/gestoria" className="underline underline-offset-2 font-semibold">Gestoría</a>,
                      en la tarjeta de este coche, que es donde se elige quién los lleva.
                    </div>
                    {/*
                      * Y el motivo, aquí y no arriba del todo.
                      *
                      * El aviso del panel vive a media pantalla de distancia:
                      * quien pulsa este botón ve que no pasa nada y da el botón
                      * por roto, cuando lo que hay es una respuesta que no está
                      * mirando. Un error que no se ve es un error que no existe.
                      */}
                    {aviso && (
                      <div className="text-[11px] text-red-700 font-medium mt-1.5">{aviso}</div>
                    )}
                  </>
                )}
              </div>
            )}
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
        <Plegable titulo="Mensaje para el cliente"
                  resumen="lo verá en su panel y le llegará por correo">
        <div>
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
        </Plegable>

        {/* ── Notas internas: estas no salen ── */}
        <Plegable titulo="Notas internas" resumen="no se envían al cliente">
        <div>
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
        </Plegable>

        {/* ── El día de la entrega ──

            Es una cita como cualquier otra: el cliente recibe el aviso de la
            víspera y el del mismo día. Lo que no hace es mover el expediente
            de etapa — sigue donde estaba hasta que se entrega. */}
        {toca('entregaCita') && (
        <Plegable titulo="Día de la entrega"
                  resumen={x.meta?.appointment_date ? dia(x.meta.appointment_date) : 'sin fecha'}>
        <div>
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
        </Plegable>
        )}

        {/* Lo que se le da al firmar. Antes de que el coche esté aquí no hay
            nada que marcar, y las casillas vacías parecen deberes. */}
        {toca('entregaFirma') && <LaEntrega leadId={x.id} />}

        {/* Los papeles empiezan a llegar cuando el coche ya se ha comprado:
            antes, la lista de «faltan por reunir» es la lista entera. */}
        {toca('papeles') && (
          <Plegable titulo="Documentos" resumen="los papeles del coche">
            <Documentos ambito="lead" id={x.id} origen="importacion" coche={x.id} />
          </Plegable>
        )}

        <button onClick={() => setVerTodo((v) => !v)}
                className="mt-4 w-full px-3 py-2 text-[11px] font-semibold text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50">
          {verTodo ? 'Ver solo lo de esta etapa' : 'Ver todo el expediente'}
        </button>

        {/* ── El rastro ── */}
        <Plegable titulo="Historial" resumen="quién tocó qué y cuándo">
        <div>
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
        </Plegable>
      </div>
    </div>
  );
}

