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
  /**
   * Cuál de los talleres del directorio es.
   *
   * Vacío si el nombre se escribió a mano. Con él, la cita le ocupa la hora
   * en la agenda del taller, que es la misma que ve el cliente en PopCar.
   */
  taller_id: string;
  /** Dónde está el taller. Es lo que el cliente necesita para llegar. */
  direccion: string;
  cita_at: string | null;
  hecha_at: string | null;
  resultado: string | null;
  notas: string;
  coste: string | null;
  /** Cuándo se le mandó la cita al cliente por última vez. */
  avisado_at: string | null;
  /** Qué ha pedido el cliente desde su panel: 'cambio', 'cancelar' o nada. */
  cliente_pidio: string | null;
  cliente_pidio_at: string | null;
  /** Y por qué, con sus palabras. Puede venir vacío. */
  cliente_motivo: string;
}

/** Un taller del directorio, tal y como lo devuelve la búsqueda. */
interface DelDirectorio {
  id: number | string;
  name: string;
  address: string | null;
  city: string | null;
}

/** Lo que ese taller tiene ese mes. */
interface Agenda {
  dias: { dia: string; horas: string[] }[];
  cierres: { dia: string; hora: string }[];
  citas: { dia: string; hora: string }[];
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
  /*
   * Cuál de los talleres del directorio es, y la búsqueda para elegirlo.
   *
   * Antes esto era un `datalist` sobre Proveedores, donde no había ni un
   * taller dado de alta: un desplegable vacío se ve igual que un campo de
   * texto, así que se seguía tecleando el nombre a mano.
   *
   * Ahora se busca en el directorio —el mismo del que el cliente elige
   * taller en PopCar—, y al elegir uno pasan las dos cosas que faltaban: se
   * da de alta como proveedor, que es a quien se le pagan los 60 €, y la
   * cita le ocupa la hora en su agenda.
   */
  const [tallerId, setTallerId] = useState('');
  const [busca, setBusca] = useState<DelDirectorio[]>([]);
  const [buscando, setBuscando] = useState(false);
  /*
   * Si ya se ha buscado, aunque no haya salido nada.
   *
   * Sin esto, una búsqueda sin resultados no pintaba absolutamente nada: la
   * pantalla se quedaba igual que antes de escribir, así que no había forma de
   * distinguir «ese taller no está» de «esto no funciona». Y pasa con el
   * primer nombre que a uno se le ocurre: en el directorio los Norauto se
   * llaman «NORAUTO» a secas, sin la ciudad.
   */
  const [seHaBuscado, setSeHaBuscado] = useState(false);
  /*
   * Si el desplegable está a la vista.
   *
   * Se cierra al salir del campo, con un respiro: sin él, el `blur` de pulsar
   * una opción lo cerraría antes de que el clic llegara a registrarse, y la
   * lista no serviría para nada.
   */
  const [seVeLaLista, setSeVeLaLista] = useState(false);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
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
      setTallerId(rev?.taller_id ?? '');
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

  /*
   * Se busca mientras se escribe, con medio segundo de espera.
   *
   * El directorio tiene 55.718 talleres, así que una consulta por tecla
   * serían veinte para escribir «Norauto».
   */
  useEffect(() => {
    const loQueSeBusca = taller.trim();
    if (loQueSeBusca.length < 2 || tallerId) { setSeHaBuscado(false); setBusca([]); return; }

    let vivo = true;
    setBuscando(true);
    const t = setTimeout(() => {
      void api.get<DelDirectorio[]>(`/workshop-locations?name=${encodeURIComponent(loQueSeBusca)}&limit=10`)
        .then((r) => {
          if (!vivo) return;
          setBusca(r.ok ? (r.data ?? []) : []);
          setSeHaBuscado(true);
        })
        // Sin búsqueda, el campo sigue siendo de texto: es peor no poder
        // apuntar la revisión que apuntarla con el nombre escrito a mano.
        .catch(() => { if (vivo) setSeHaBuscado(true); })
        .finally(() => { if (vivo) setBuscando(false); });
    }, 300);

    return () => { vivo = false; clearTimeout(t); };
  }, [taller, tallerId]);

  /*
   * Y la agenda del taller elegido, para ofrecer solo sus horas libres.
   *
   * Sin esto se podía poner cualquier hora, incluidas las que el taller no
   * da —las 10:30 no existen en su horario— y las que ya tiene cogidas.
   */
  useEffect(() => {
    if (!tallerId || !dia) { setAgenda(null); return; }
    let vivo = true;
    void api.get<Agenda>(`/workshop-locations/${tallerId}/agenda?mes=${dia.slice(0, 7)}`)
      .then((r) => { if (vivo && r.ok) setAgenda(r.data ?? null); })
      .catch(() => { if (vivo) setAgenda(null); });
    return () => { vivo = false; };
  }, [tallerId, dia]);

  /** Qué se puede elegir ese día: sus horas, sin las cerradas ni las cogidas. */
  const horasDelDia = (): { hora: string; libre: boolean }[] => {
    const delDia = agenda?.dias.find((d) => d.dia === dia);
    if (!delDia) return [];
    const cerrado = agenda?.cierres.some((c) => c.dia === dia && !c.hora);
    if (cerrado) return [];
    return delDia.horas.map((h) => ({
      hora: h,
      libre:
        !agenda?.citas.some((c) => c.dia === dia && c.hora === h) &&
        !agenda?.cierres.some((c) => c.dia === dia && c.hora === h),
    }));
  };

  async function daCita() {
    if (!taller.trim()) { setFallo('Falta a qué taller se lleva.'); return; }
    setGuardando('cita');
    setFallo('');
    try {
      const r = await api.post<Revision>('/revisiones-taller', {
        vehicle_id: vehicleId,
        encargo_id: encargoId,
        taller: taller.trim(),
        taller_id: tallerId,
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
        taller_id: tallerId,
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
   * Se le quita la cita: vuelve a estar sin fecha, pero sigue haciendo falta.
   *
   * Es la respuesta a «no voy a poder llevarlo». La ficha se queda —el coche
   * necesita la revisión para poder publicarse— y lo que desaparece es el día.
   * Cerrarla y abrir otra apuntaría una segunda factura de 60 € que nadie ha
   * pedido.
   */
  async function anulaLaCita() {
    if (!datos?.revision) return;
    setGuardando('anular');
    setFallo('');
    setEnviado('');
    try {
      const r = await api.post<unknown>(`/revisiones-taller/${datos.revision.id}/anular-cita`, {});
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido anular.'); return; }
      await carga();
      alGuardar?.();
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
          {/*
            * Se busca en el directorio, pero sin cerrar la puerta.
            *
            * Se puede escribir un taller que no esté: el coche puede acabar en
            * uno de fuera, y obligar a darlo de alta antes de apuntar la
            * revisión sería parar el trabajo por el papeleo. Lo que sí se dice
            * es lo que se pierde por no elegirlo de la lista.
            */}
          <div className="relative w-52">
            <input
              id="taller-nombre"
              value={taller}
              onChange={(ev) => { setTaller(ev.target.value); setTallerId(''); setSeVeLaLista(true); }}
              onFocus={() => setSeVeLaLista(true)}
              onBlur={() => setTimeout(() => setSeVeLaLista(false), 150)}
              /*
               * El texto dice que aquí se busca.
               *
               * Con «Norauto Villaverde» de ejemplo, el campo se lee como uno
               * de escribir el nombre, que es justo lo que era antes: nadie
               * prueba a teclear para ver si sale una lista.
               */
              placeholder="Busca: Norauto, Midas…"
              autoComplete="off"
              className="w-full px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-acento"
            />
            {/*
              * El desplegable sale desde que se escribe, tenga o no resultados.
              *
              * Es más ancho que el campo porque los nombres del directorio son
              * largos —«ALONSO NUÑO, SL (MIDAS)»— y cortados no se distingue
              * uno de otro.
              */}
            {seVeLaLista && !tallerId && taller.trim().length >= 2 && (buscando || seHaBuscado) && (
              <div className="absolute z-20 left-0 w-80 mt-1 bg-white border border-brand-200
                              rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {buscando && busca.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-brand-300">Buscando…</p>
                ) : busca.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-brand-400">
                    Ningún taller se llama así. En el directorio salen con el nombre corto:
                    prueba «Norauto» o «Midas», sin la ciudad.
                  </p>
                ) : null}
                <ul>
                  {busca.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTaller(t.name);
                        setTallerId(String(t.id));
                        setDireccion([t.address, t.city].filter(Boolean).join(', '));
                        setBusca([]);
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-brand-50"
                    >
                      <span className="block text-xs font-semibold text-brand-600">{t.name}</span>
                      <span className="block text-[11px] text-brand-300">
                        {[t.address, t.city].filter(Boolean).join(', ') || 'sin dirección'}
                      </span>
                    </button>
                  </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {/* El «buscando» ya sale dentro del desplegable; aquí sobraba. */}
          {taller.trim() && !tallerId && !buscando && (
            <p className="text-[11px] text-amber-700 mt-1 w-52">
              Escrito a mano. Elígelo de la lista y se le ocupa la hora en su agenda.
            </p>
          )}
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
          {/*
            * Con el taller elegido, sus horas; si no, la hora a mano.
            *
            * Un campo de hora libre deja poner las 10:30, que ese taller no da,
            * o una que ya tiene cogida: la cita saldría del ERP y el coche se
            * presentaría cuando no le esperan.
            */}
          {tallerId && dia && agenda ? (
            horasDelDia().length === 0 ? (
              <p className="text-[11px] text-amber-700 w-40 py-1.5">
                Ese día no da citas.
              </p>
            ) : (
              <select
                id="taller-hora"
                value={hora}
                onChange={(ev) => setHora(ev.target.value)}
                className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-acento"
              >
                <option value="">Elige la hora…</option>
                {horasDelDia().map(({ hora: h, libre }) => (
                  // La cogida se ve, pero no se puede elegir: así se entiende
                  // por qué no está, en vez de desaparecer sin más.
                  <option key={h} value={h} disabled={!libre && h !== hora}>
                    {h}{libre || h === hora ? '' : ' · ocupada'}
                  </option>
                ))}
              </select>
            )
          ) : (
            <input
              id="taller-hora"
              type="time"
              value={hora}
              onChange={(ev) => setHora(ev.target.value)}
              className="px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-acento"
            />
          )}
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

      {/*
        * Lo que ha pedido el cliente, encima de todo lo demás.
        *
        * Es lo único de esta caja que llega de fuera y tiene a alguien
        * esperando. Si estuviera debajo de los campos, se vería después de
        * haberlos tocado — y lo que hay que hacer depende de lo que pidió.
        */}
      {rev && rev.estado !== 'Hecha' && (rev.cliente_pidio === 'cambio' || rev.cliente_pidio === 'cancelar') && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-[13px] font-semibold text-red-700">
            {rev.cliente_pidio === 'cambio'
              ? 'El cliente pide que le cambiemos la cita'
              : 'El cliente pide que le anulemos la cita'}
            {rev.cliente_pidio_at ? ` · ${cuandoConHora(rev.cliente_pidio_at)}` : ''}
          </p>
          {rev.cliente_motivo && (
            <p className="text-[12.5px] text-red-700/90 mt-1">«{rev.cliente_motivo}»</p>
          )}
          <p className="text-[11.5px] text-red-700/75 mt-1">
            {rev.cliente_pidio === 'cambio'
              ? 'Ponle otro día aquí abajo y vuelve a enviárselo: con eso se da por resuelto.'
              : 'Anula la cita aquí abajo y llámale para buscar otro momento. El coche sigue necesitando la revisión.'}
          </p>
        </div>
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
            {/* Quitar el día sin cerrar la revisión: el coche la sigue
                necesitando para poder publicarse. */}
            {rev.cita_at && (
              <button
                type="button"
                onClick={() => void anulaLaCita()}
                disabled={guardando !== ''}
                title="Quita el día y la hora. La revisión sigue pendiente."
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200
                           text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {guardando === 'anular' ? 'Anulando…' : 'Anular la cita'}
              </button>
            )}
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
