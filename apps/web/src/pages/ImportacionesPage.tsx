import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import {
  ETAPAS, QUE_TOCA, siguienteEtapa, fianzaPagada, puedeDarFecha,
  agrupaPorEtapa, fueraDelCamino, resumen, diasDesde,
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
  'Fianza pagada':     'bg-blue-50 border-blue-200 text-blue-800',
  'Pedido a Alemania': 'bg-blue-50 border-blue-200 text-blue-800',
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

  const carga = useCallback(async () => {
    setCargando(true);
    setError('');
    const r = await api.get<{ data: Expediente[] }>('/leads?type=import&limit=100');
    if (r.ok && Array.isArray(r.data?.data)) setExpedientes(r.data.data);
    else setError(r.error || 'No se han podido cargar los expedientes.');
    setCargando(false);
  }, []);

  useEffect(() => { void carga(); }, [carga]);

  // Al abrir uno, su fecha en el recuadro: se edita lo que hay, no un hueco.
  useEffect(() => { setFecha(abierto?.meta?.delivery_estimate ?? ''); }, [abierto]);

  const porEtapa = useMemo(() => agrupaPorEtapa(expedientes), [expedientes]);
  const cerrados = useMemo(() => fueraDelCamino(expedientes), [expedientes]);
  const cuentas = useMemo(() => resumen(expedientes), [expedientes]);

  async function cambia(id: string, cambios: Record<string, unknown>) {
    setGuardando(true);
    const r = await api.patch<{ data: Expediente }>(`/leads/${id}`, cambios);
    setGuardando(false);
    if (!r.ok) { setError(r.error || 'No se ha podido guardar.'); return; }
    await carga();
    // El panel abierto se queda con lo recién guardado.
    setAbierto((previo) => (previo && previo.id === id
      ? { ...previo, ...(r.data?.data ?? {}) }
      : previo));
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
          ['Fianzas cobradas', eur(cuentas.comprometido), 'de coches aún sin entregar'],
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
        />
      )}
    </div>
  );
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
}

/**
 * Un expediente abierto, con todo lo que se puede hacer con él.
 *
 * El orden no es casual: primero el dinero —es lo que bloquea todo lo demás—,
 * después la etapa, y al final la fecha, que no existe hasta que hay pedido.
 */
function ExpedienteAbierto({ x, guardando, fecha, setFecha, siguiente, onCerrar, onCambiar, onDevolver }: PanelProps) {
  const pagada = fianzaPagada(x);
  const devuelta = Boolean(x.meta?.deposit_refunded_at);
  const hechoElPedido = puedeDarFecha(x.status);

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

        {/* ── El dinero ── */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 mb-4">
          <div className="text-xs font-semibold text-blue-700">Fianza que se le dijo</div>
          <div className="text-lg font-bold text-blue-800">{eur(x.meta?.deposit_quoted)}</div>
          <div className="text-[11px] text-blue-700/80 mt-0.5">
            El 30 % del precio con el coste de traerlo, al pedirlo. No se recalcula.
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-blue-200/70">
            {pagada ? (
              <>
                <span className="text-[13px] font-bold text-emerald-700">
                  ✓ Cobrada el {dia(x.meta?.deposit_paid_at)}
                </span>
                <button onClick={() => onCambiar({ deposit_paid: false })} disabled={guardando}
                        className="text-[11px] text-brand-400 underline underline-offset-2">
                  no estaba cobrada
                </button>
                {devuelta ? (
                  <span className="text-[13px] font-bold text-brand-500">
                    ↩ Devuelta el {dia(x.meta?.deposit_refunded_at)}
                  </span>
                ) : (
                  <button onClick={onDevolver} disabled={guardando}
                          className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                    Devolver la fianza
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => onCambiar({ deposit_paid: true })} disabled={guardando}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50">
                Marcar fianza como cobrada
              </button>
            )}
          </div>
        </div>

        {/* ── La etapa ── */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-brand-500 mb-1.5">Etapa</div>
          <select
            value={x.status}
            disabled={guardando}
            onChange={(e) => onCambiar({ status: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg bg-white"
          >
            {ETAPAS.map((e) => <option key={e} value={e}>{e}</option>)}
            {!ETAPAS.some((e) => e === x.status) && <option value={x.status}>{x.status}</option>}
          </select>
          {siguiente && (
            <button
              onClick={() => onCambiar({ status: siguiente })}
              disabled={guardando || (siguiente === 'Pedido a Alemania' && !pagada)}
              className="mt-2 w-full px-3 py-2 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              Pasar a «{siguiente}»
            </button>
          )}
          {siguiente === 'Pedido a Alemania' && !pagada && (
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
          {x.meta?.vehicle_url && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Anuncio</dt>
              <dd>
                <a href={x.meta.vehicle_url} target="_blank" rel="noreferrer"
                   className="text-brand-500 underline underline-offset-2 break-all text-xs">
                  {x.meta.vehicle_url}
                </a>
              </dd>
            </div>
          )}
          {x.meta?.erp_notes && (
            <div className="col-span-2">
              <dt className="text-[11px] text-brand-400">Notas internas</dt>
              <dd className="text-xs text-brand-500 whitespace-pre-wrap">{x.meta.erp_notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
