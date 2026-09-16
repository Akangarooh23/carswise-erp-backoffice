/**
 * La revisión del taller, dentro del encargo de venta.
 *
 * Es la sexta puerta y la única que no depende del cliente. Las otras cinco se
 * ven en el semáforo de arriba y se resuelven llamándole; esta se resuelve aquí
 * —dándole cita y apuntando lo que dijeron—, y hasta que no está, el anuncio no
 * puede prometer que el coche está comprobado.
 *
 * Por eso vive en esta pantalla y no en una suya: quien mira el encargo tiene
 * que poder pasar de «lo ha traído todo» a «ya está en el taller» sin cambiar
 * de sitio, que es cuando se hace de verdad.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import Icono from '../../components/ui/Icono.js';
import { partirLaCita, juntarLaCita, cuando, cuandoConHora } from '../../lib/la-cita-del-taller.js';

export interface Revision {
  id: string;
  estado: string;
  taller: string;
  /** Dónde está el taller. Es lo que el cliente necesita para llegar. */
  direccion: string;
  cita_at: string | null;
  hecha_at: string | null;
  resultado: string | null;
  notas: string;
  coste: string | null;
  /** Cuándo se le mandó la cita al cliente por última vez. */
  avisado_at: string | null;
}

export interface LoDelTaller {
  revision: Revision | null;
  estados: string[];
  resultados: { clave: string; nombre: string }[];
  que_toca: string;
  comprobado: boolean;
  por_que_no: string;
  /** Por qué todavía no se le puede mandar la cita. Vacío cuando sí. */
  falta_para_avisar: string;
  lo_que_cuesta: number;
}





/**
 * El color de cada resultado.
 *
 * «Con reparos» va en ámbar y no en rojo a propósito: no es un no, es un coche
 * que se vende contando lo que tiene, y la mayoría de los de diez años caen
 * ahí. Pintarlo de rojo haría que se tratara como un problema.
 */
const COLOR: Record<string, string> = {
  bien: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  con_reparos: 'bg-amber-50 text-amber-700 border-amber-200',
  no_se_puede_vender: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function RevisionDelTaller({
  vehicleId,
  encargoId,
  alCambiar,
  alGuardar,
}: {
  vehicleId: string;
  encargoId: string | null;
  /** Para que el encargo sepa si ya se puede publicar. */
  alCambiar?: (r: LoDelTaller | null) => void;
  /**
   * Y para que se relea el encargo cuando esto cambia.
   *
   * `se_puede_publicar` lo calcula el servidor con las seis puertas, y es lo
   * que apaga el botón de publicar. Sin volver a pedirlo, el taller diría que
   * ya está y el botón seguiría apagado hasta recargar la página.
   */
  alGuardar?: () => void;
}) {
  const [datos, setDatos] = useState<LoDelTaller | null>(null);
  const [fallo, setFallo] = useState('');
  const [taller, setTaller] = useState('');
  const [direccion, setDireccion] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState('');
  const [enviado, setEnviado] = useState('');

  const carga = useCallback(async () => {
    try {
      const r = await api.get<LoDelTaller>(`/revisiones-taller/coche/${vehicleId}`);
      if (!r.ok) { setFallo('No se ha podido leer la revisión.'); return; }
      setDatos(r.data);
      const rev = r.data.revision;
      setNotas(rev?.notas ?? '');
      /*
       * Los campos salen con lo que ya hay.
       *
       * La dirección casi nunca se sabe al dar la cita —la dan por teléfono al
       * confirmarla— y la hora cambia en cuanto el taller propone otra. Si los
       * campos salieran vacíos, guardar de nuevo borraría el taller que ya
       * estaba apuntado.
       */
      setTaller(rev?.taller ?? '');
      setDireccion(rev?.direccion ?? '');
      const p = partirLaCita(rev?.cita_at ?? null);
      setDia(p.dia);
      setHora(p.hora);
      alCambiar?.(r.data);
    } catch (err) {
      setFallo((err as Error).message);
    }
  }, [vehicleId, alCambiar]);

  useEffect(() => { void carga(); }, [carga]);

  async function daCita() {
    if (!taller.trim()) { setFallo('Falta a qué taller se lleva.'); return; }
    setGuardando('cita');
    setFallo('');
    try {
      const r = await api.post<Revision>('/revisiones-taller', {
        vehicle_id: vehicleId,
        encargo_id: encargoId,
        taller: taller.trim(),
        direccion: direccion.trim(),
        cita_at: juntarLaCita(dia, hora),
      });
      if (!r.ok) {
        // El índice de «una revisión viva por coche»: dos personas atendiendo
        // el mismo encargo a la vez.
        setFallo(r.error ?? 'No se ha podido dar la cita.');
        return;
      }
      await carga();
      alGuardar?.();
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setGuardando('');
    }
  }

  /** Corregir lo apuntado: la dirección que faltaba, la hora que cambiaron. */
  async function guardaLaCita() {
    if (!datos?.revision) return;
    if (!taller.trim()) { setFallo('Falta a qué taller se lleva.'); return; }
    setGuardando('cita');
    setFallo('');
    setEnviado('');
    try {
      const r = await api.patch<unknown>(`/revisiones-taller/${datos.revision.id}`, {
        taller: taller.trim(),
        direccion: direccion.trim(),
        cita_at: juntarLaCita(dia, hora),
      });
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido guardar la cita.'); return; }
      await carga();
      alGuardar?.();
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setGuardando('');
    }
  }

  /**
   * Se le manda la cita al dueño del coche.
   *
   * Lo pulsa una persona y no sale solo al dar la cita: se apunta una cita
   * muchas veces antes de tenerla cerrada con el taller, y un correo por cada
   * intento es lo que hace que dejen de leerse los que importan.
   */
  async function avisaAlCliente() {
    if (!datos?.revision) return;
    setGuardando('avisar');
    setFallo('');
    setEnviado('');
    try {
      const r = await api.post<{ revision: Revision; enviado_a: string }>(
        `/revisiones-taller/${datos.revision.id}/avisar`, {}
      );
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido enviar.'); return; }
      setEnviado(`Enviado a ${r.data.enviado_a}`);
      await carga();
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setGuardando('');
    }
  }

  /**
   * Los cuatro campos de la cita, que son los mismos al darla y al corregirla.
   *
   * Escritos una vez: con dos copias, la dirección habría acabado estando solo
   * en una de las dos pantallas, que es lo que pasaba antes con la hora.
   */
  function camposDeLaCita() {
    return (
      <>
        <div>
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="taller-nombre">
            Taller
          </label>
          <input
            id="taller-nombre"
            value={taller}
            onChange={(ev) => setTaller(ev.target.value)}
            placeholder="Norauto Villaverde"
            className="w-52 px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
        </div>
        <div>
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="taller-direccion">
            Dirección
          </label>
          <input
            id="taller-direccion"
            value={direccion}
            onChange={(ev) => setDireccion(ev.target.value)}
            placeholder="C/ Alcalá 120, Madrid"
            className="w-64 px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
        </div>
        <div>
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="taller-cita">
            Día
          </label>
          <input
            id="taller-cita"
            type="date"
            value={dia}
            onChange={(ev) => setDia(ev.target.value)}
            className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
        </div>
        <div>
          <label className="block text-[11px] text-brand-300 mb-1" htmlFor="taller-hora">
            Hora
          </label>
          <input
            id="taller-hora"
            type="time"
            value={hora}
            onChange={(ev) => setHora(ev.target.value)}
            className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
        </div>
      </>
    );
  }

  /**
   * Se apunta cómo salió, y con eso la revisión queda hecha.
   *
   * Los tres resultados son tres botones y no un desplegable con un «Guardar»:
   * es una decisión de una sola cosa, y el paso de más es donde se queda a
   * medias —revisión hecha, resultado en blanco— que en el portero de publicar
   * cuenta como no revisada.
   */
  async function apunta(resultado: string) {
    if (!datos?.revision) return;
    setGuardando(resultado);
    setFallo('');
    try {
      const r = await api.patch<unknown>(`/revisiones-taller/${datos.revision.id}`, {
        estado: 'Hecha', resultado, notas,
      });
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido guardar.'); return; }
      await carga();
      alGuardar?.();
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setGuardando('');
    }
  }

  if (!datos) return null;
  const rev = datos.revision;

  return (
    <div className="mt-4 rounded-xl border border-brand-200 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h4 className="text-[13px] font-semibold text-brand-600 flex items-center gap-1.5">
          <span className={datos.comprobado ? 'text-emerald-600' : 'text-brand-300'}>
            <Icono nombre={datos.comprobado ? 'comprobado' : 'taller'} tam={15} />
          </span>
          Revisión del taller
        </h4>
        {rev && (
          <span className="text-[11.5px] text-brand-400">
            {rev.taller}{rev.cita_at ? ` · ${cuandoConHora(rev.cita_at)}` : ''}
          </span>
        )}
      </div>

      {/*
        * Lo que promete el anuncio.
        *
        * Se dice aquí y no solo en el manual porque es la razón de que esta
        * caja exista: sin ella se publica un coche diciendo que está
        * comprobado sin que lo haya mirado ningún mecánico.
        */}
      {!rev && (
        <>
          <p className="text-[12px] text-brand-400 mb-2.5">
            Sin esto, el anuncio no puede decir que el coche está comprobado.
            Cuesta {datos.lo_que_cuesta} € y se le hace a todos, vendan o no.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            {camposDeLaCita()}
            <button
              type="button"
              onClick={() => void daCita()}
              disabled={guardando === 'cita'}
              className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                         text-brand-500 hover:bg-brand-50 disabled:opacity-50"
            >
              {guardando === 'cita' ? 'Guardando…' : 'Darle cita'}
            </button>
          </div>
        </>
      )}

      {rev && rev.estado !== 'Hecha' && (
        <>
          {/*
            * La cita sigue editable, y se le puede mandar al cliente.
            *
            * La dirección se sabe casi siempre después —la dan por teléfono al
            * confirmar— y la hora cambia en cuanto el taller propone otra. Sin
            * esto, la única forma de corregirla era cerrar la revisión y abrir
            * otra, y eso apunta una factura de 60 € que no existe.
            */}
          <div className="flex items-end gap-2 flex-wrap mb-3">
            {camposDeLaCita()}
            <button
              type="button"
              onClick={() => void guardaLaCita()}
              disabled={guardando !== ''}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                         text-brand-500 hover:bg-brand-50 disabled:opacity-50"
            >
              {guardando === 'cita' ? 'Guardando…' : 'Guardar cita'}
            </button>
            <div className="ml-auto text-right">
              <button
                type="button"
                onClick={() => void avisaAlCliente()}
                disabled={guardando !== '' || datos.falta_para_avisar !== ''}
                title={datos.falta_para_avisar || 'Se le manda el taller, la dirección y la hora'}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-acento
                           text-acento hover:bg-amber-50 disabled:opacity-50"
              >
                {guardando === 'avisar' ? 'Enviando…' : 'Enviársela al cliente'}
              </button>
              {/*
                * Qué se sabe del aviso, debajo del botón.
                *
                * «Avisado el…» es lo único que separa una cita contada de una
                * cita que solo está en la ficha, y es lo primero que se mira
                * cuando el cliente no aparece.
                */}
              <p className="text-[11px] text-brand-300 mt-1">
                {enviado
                  || (rev.avisado_at ? `Avisado el ${cuandoConHora(rev.avisado_at)}` : 'Todavía no se le ha dicho')}
              </p>
            </div>
          </div>

          <p className="text-[12px] text-brand-400 mb-2.5">{datos.que_toca}. Cuando contesten, apúntalo aquí.</p>
          <textarea
            value={notas}
            onChange={(ev) => setNotas(ev.target.value)}
            rows={2}
            placeholder="Lo que dijeron: distribución, embrague, lo que sea"
            className="w-full px-2.5 py-1.5 text-[13px] border border-brand-200 rounded-lg mb-2
                       focus:outline-none focus:ring-2 focus:ring-acento"
          />
          <div className="flex gap-2 flex-wrap">
            {datos.resultados.map((r) => (
              <button
                key={r.clave}
                type="button"
                onClick={() => void apunta(r.clave)}
                disabled={guardando !== ''}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border disabled:opacity-50
                            ${COLOR[r.clave] ?? 'bg-brand-50 text-brand-600 border-brand-200'}`}
              >
                {guardando === r.clave ? 'Guardando…' : r.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      {rev && rev.estado === 'Hecha' && (
        <div className={`rounded-lg border px-3 py-2 text-[13px] ${
          COLOR[rev.resultado ?? ''] ?? 'bg-brand-50 text-brand-500 border-brand-200'
        }`}>
          <p className="font-medium">
            {datos.resultados.find((x) => x.clave === rev.resultado)?.nombre ?? datos.por_que_no}
          </p>
          {rev.notas && <p className="mt-1 opacity-90">{rev.notas}</p>}
          {/*
            * El tumbado necesita una llamada, no un botón.
            *
            * Su dueño tiene un encargo firmado y está esperando a ver su
            * anuncio, y ese anuncio no va a salir. Dejarlo dicho aquí es lo
            * único que separa ese caso de un coche olvidado.
            */}
          {rev.resultado === 'no_se_puede_vender' && (
            <p className="mt-1.5 font-medium">
              Hay que llamar al cliente: su coche no se va a publicar así.
            </p>
          )}
          <p className="mt-1.5 text-[11.5px] opacity-75">Revisada el {cuando(rev.hecha_at)}</p>
        </div>
      )}

      {fallo && <p className="text-[12px] text-rose-600 mt-2">{fallo}</p>}
    </div>
  );
}
