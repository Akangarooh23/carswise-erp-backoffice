/**
 * El encargo de venta de un particular, en la ficha de su coche.
 *
 * Enseña **las cuatro puertas siempre**, abiertas o no, y no solo si se puede
 * publicar. La pregunta que se hace quien mira esta pantalla casi nunca es
 * «¿puedo publicar ya?» —eso lo dice el botón— sino «¿qué le pido cuando le
 * llame?», y para eso hace falta ver la lista entera con su semáforo.
 *
 * El mandato **no caduca**: se extiende hasta que el cliente lo cancela o hasta
 * que vendemos. Lo que sí corre es la penalización, y eso es lo que se enseña
 * arriba a la derecha — no para despedirse, sino para saber cuándo llamarle.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import { Card } from '../../components/ui/Card.js';
import Icono from '../../components/ui/Icono.js';

export interface Puerta {
  clave: string;
  nombre: string;
  abierta: boolean;
  falta: string;
}

export interface Encargo {
  id: string;
  cliente_email: string;
  cliente_nombre: string;
  estado: string;
  firmado_at: string | null;
  libre_desde: string | null;
  acepto_el_precio: boolean;
  precio_referencia: string | null;
  precio_acordado: string | null;
  fee_gestion: string | null;
  fee_cancelacion: string | null;
}

export interface Cierre {
  motivo: string;
  como_acabo: string;
  importe: number;
}

export interface Cerrado {
  id: string;
  motivo_cierre: string;
  cerrado_at: string;
  cliente_nombre: string;
}

export interface ElEncargo {
  encargo: Encargo | null;
  ultimo_cerrado: Cerrado | null;
  cierres: Cierre[];
  puertas: Puerta[];
  se_puede_publicar: boolean;
  le_falta: string[];
  penalizacion: number | null;
  ya_se_puede_ir_gratis: boolean;
  dias_hasta_irse_gratis: number | null;
}

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';

const euros = (v: string | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '–';
};

/**
 * Qué pasa si el cliente se va hoy.
 *
 * El mandato **no caduca**: se extiende hasta que él lo cancela o hasta que
 * vendemos. Lo único que corre es la penalización, y por eso lo que se enseña
 * no es una cuenta atrás para despedirse sino un aviso para llamarle.
 *
 * Los últimos días van en ámbar y no en rojo: todavía se puede hacer algo —un
 * ajuste de precio, contarle quién ha preguntado—. El rojo se guarda para
 * cuando ya no hay nada que le retenga.
 */
function ComoVaElPlazo({
  dias, aceptoElPrecio, penalizacion,
}: { dias: number | null; aceptoElPrecio: boolean; penalizacion: number | null }) {
  // El que no firmó la cláusula del precio no llega nunca a poder irse gratis.
  if (!aceptoElPrecio) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 text-brand-500 px-2.5 py-1 text-xs font-semibold">
        {/*
          * El importe lo dice el servidor o no se dice.
          *
          * Aquí había un «150» escrito a mano como respaldo, y eso es una cifra
          * inventada esperando su turno: el día que la tarifa cambie o el
          * servidor conteste otra cosa, la pantalla seguiría diciendo 150.
          */}
        No aceptó el precio · siempre paga la penalización
        {penalizacion !== null && ` de ${penalizacion} €`}
      </span>
    );
  }
  if (dias === null) return <span className="text-xs text-brand-300">Sin fecha de firma</span>;

  const tono = dias < 0 ? 'bg-red-50 text-red-700'
    : dias <= 5 ? 'bg-amber-50 text-amber-700'
    : 'bg-emerald-50 text-emerald-700';

  const texto = dias < 0 ? 'Ya puede irse sin pagar'
    : dias === 0 ? 'Desde hoy puede irse sin pagar'
    : `${dias} día${dias === 1 ? '' : 's'} para que pueda irse sin pagar`;

  return <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold ${tono}`}>{texto}</span>;
}

function Semaforo({ puerta }: { puerta: Puerta }) {
  return (
    <li className="flex items-start gap-2.5 py-2 border-b border-brand-100 last:border-0">
      <span className={`mt-0.5 shrink-0 ${puerta.abierta ? 'text-emerald-600' : 'text-brand-300'}`}>
        <Icono nombre={puerta.abierta ? 'comprobado' : 'reloj'} tam={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] ${puerta.abierta ? 'text-brand-500' : 'text-brand-600 font-medium'}`}>
          {puerta.nombre}
        </span>
        {!puerta.abierta && puerta.falta && (
          <span className="block text-[12px] text-brand-400 mt-0.5">{puerta.falta}</span>
        )}
      </span>
    </li>
  );
}

export default function EncargoDeVenta({
  vehicleId,
  alCambiar,
}: {
  vehicleId: string;
  /** Para que la ficha sepa si puede dejar publicar. */
  alCambiar?: (e: ElEncargo | null) => void;
}) {
  const [datos, setDatos] = useState<ElEncargo | null>(null);
  const [fallo, setFallo] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [enviando, setEnviando] = useState('');
  const [precio, setPrecio] = useState('');
  const [firmoElPrecio, setFirmoElPrecio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const carga = useCallback(async () => {
    try {
      const r = await api.get<ElEncargo>(`/encargos/coche/${vehicleId}`);
      if (!r.ok) { setFallo(r.error ?? 'no_se_ha_podido_leer'); return; }
      setDatos(r.data);
      // Los campos arrancan con lo que hay guardado, para que al abrir la ficha
      // se vea lo acordado y no dos casillas en blanco.
      setPrecio(r.data.encargo?.precio_referencia ?? '');
      setFirmoElPrecio(Boolean(r.data.encargo?.acepto_el_precio));
      alCambiar?.(r.data);
    } catch (e) {
      setFallo((e as Error).message);
    }
  }, [vehicleId, alCambiar]);

  useEffect(() => { void carga(); }, [carga]);

  async function abre() {
    setAbriendo(true);
    setFallo('');
    try {
      const r = await api.post<Encargo>(`/encargos`, { vehicle_id: vehicleId });
      if (!r.ok) {
        // El índice de «un encargo vivo por coche». Pasa cuando dos personas
        // atienden al mismo cliente a la vez.
        setFallo(r.error === 'ya_tiene_un_encargo_vivo'
          ? 'Este coche ya tiene un encargo abierto. Recarga la página.'
          : 'No se ha podido abrir el encargo.');
        return;
      }
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setAbriendo(false);
    }
  }

  async function guardaElPrecio() {
    setGuardando(true);
    setFallo('');
    try {
      const r = await api.patch(`/encargos/${datos?.encargo?.id}/precio`, {
        precio_referencia: precio === '' ? null : Number(precio),
        acepto_el_precio: firmoElPrecio,
      });
      if (!r.ok) { setFallo('No se ha podido guardar el precio.'); return; }
      // Se recarga entero: cambiar la cláusula cambia la penalización y los
      // días, y eso lo calcula el servidor.
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function cierra(motivo: string) {
    setEnviando(motivo);
    setFallo('');
    try {
      const r = await api.post<{ factura: string | null; importe: number }>(
        `/encargos/${datos?.encargo?.id}/cerrar`, { motivo },
      );
      if (!r.ok) {
        setFallo(r.error === 'ya_estaba_cerrado'
          ? 'Alguien lo ha cerrado ya. Recarga la página.'
          : 'No se ha podido cerrar el encargo.');
        return;
      }
      setCerrando(false);
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setEnviando('');
    }
  }

  if (fallo && !datos) {
    return <Card><p className="text-sm text-red-600">No se ha podido leer el encargo: {fallo}</p></Card>;
  }
  if (!datos) return null;

  // Sin encargo, este coche no lo vendemos nosotros: lo publicó su dueño. Se
  // ofrece abrirlo, sin ocupar media pantalla contando algo que no existe.
  if (!datos.encargo) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-brand-600 text-sm">Encargo de venta</h3>
            {/*
              * Si hubo uno y se cerró, se dice. Sin esto, en cuanto se cierra la
              * ficha vuelve a decir «no lo gestionamos nosotros» —que es verdad—
              * y se lee como si no se hubiera guardado nada.
              */}
            <p className="text-xs text-brand-400 mt-1">
              {datos.ultimo_cerrado
                ? `Se cerró el ${fecha(datos.ultimo_cerrado.cerrado_at)} · ${datos.ultimo_cerrado.motivo_cierre}`
                : 'Este coche no lo gestionamos nosotros. Su dueño lo publica por su cuenta.'}
            </p>
          </div>
          <button
            type="button"
            onClick={abre}
            disabled={abriendo}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                       text-brand-500 hover:bg-brand-50 disabled:opacity-50"
          >
            {abriendo ? 'Abriendo…' : 'Abrir encargo de venta'}
          </button>
        </div>
        {fallo && <p className="text-xs text-red-600 mt-2">{fallo}</p>}
      </Card>
    );
  }

  const e = datos.encargo;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-brand-600 text-sm">Encargo de venta</h3>
          <p className="text-xs text-brand-400 mt-1">
            {e.cliente_nombre || e.cliente_email || 'Sin cliente'} · firmado el {fecha(e.firmado_at)}
          </p>
        </div>
        <ComoVaElPlazo
          dias={datos.dias_hasta_irse_gratis}
          aceptoElPrecio={e.acepto_el_precio}
          penalizacion={datos.penalizacion}
        />
      </div>

      <ul className="mb-3">
        {datos.puertas.map((p) => <Semaforo key={p.clave} puerta={p} />)}
      </ul>

      <div className={`rounded-lg px-3 py-2 text-[13px] ${
        datos.se_puede_publicar ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-500'
      }`}>
        {datos.se_puede_publicar
          ? 'Lo ha traído todo. Falta la revisión del taller antes de publicar.'
          : `Le falta: ${datos.le_falta.join('; ')}`}
      </div>

      {/*
        * El precio y si lo ha aceptado.
        *
        * Va aquí y no en el alta porque se acuerda en una llamada, que puede
        * ser tres semanas después de firmar. Y es lo que decide la
        * penalización: sin poder marcarlo, todos los encargos se quedarían en
        * «no aceptó», que es donde nacen, y a todo el mundo le saldría que
        * siempre paga.
        */}
      <div className="mt-4 rounded-xl border border-brand-200 p-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[11px] text-brand-300 mb-1" htmlFor="precio-ref">
              Precio que le proponemos
            </label>
            <input
              id="precio-ref"
              type="number"
              min="0"
              step="100"
              value={precio}
              onChange={(ev) => setPrecio(ev.target.value)}
              placeholder="13500"
              className="w-32 px-2.5 py-1.5 text-sm border border-brand-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-acento"
            />
          </div>
          <label className="flex items-center gap-2 pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={firmoElPrecio}
              onChange={(ev) => setFirmoElPrecio(ev.target.checked)}
              className="w-4 h-4 accent-acento"
            />
            <span className="text-[13px] text-brand-600">Ha firmado la cláusula del precio</span>
          </label>
          <button
            type="button"
            onClick={() => void guardaElPrecio()}
            disabled={guardando}
            className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                       text-brand-500 hover:bg-brand-50 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        <p className="text-[11.5px] text-brand-400 mt-2 leading-snug">
          Si no la firma, se le puede cobrar la cancelación desde el primer día y siempre.
          Si la firma, solo durante los 30 días siguientes a la firma del encargo.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <span className="block text-brand-300">Precio acordado</span>
          <span className="font-semibold text-brand-600">{euros(e.precio_acordado)}</span>
        </div>
        <div>
          <span className="block text-brand-300">Gestión, si vende</span>
          <span className="font-semibold text-brand-600">{euros(e.fee_gestion)}</span>
        </div>
        <div>
          <span className="block text-brand-300">Si se va sin vender</span>
          <span className="font-semibold text-brand-600">{euros(e.fee_cancelacion)}</span>
        </div>
      </div>

      {/*
        * Cerrar va detrás de un clic, no como tres botones siempre a la vista.
        *
        * Cerrar emite una factura a un cliente: no es algo que deba estar a un
        * toque accidental de distancia mientras se mira si le faltan fotos.
        */}
      {!cerrando ? (
        <button
          type="button"
          onClick={() => { setCerrando(true); setFallo(''); }}
          className="mt-4 text-[12px] font-semibold text-brand-400 hover:text-brand-600 underline underline-offset-2"
        >
          Cerrar el encargo
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-brand-200 p-3">
          <p className="text-[13px] font-semibold text-brand-600 mb-1">¿Cómo ha acabado?</p>
          <p className="text-[12px] text-brand-400 mb-3">
            Se emite la factura y el encargo queda cerrado. No se deshace.
          </p>
          <div className="space-y-2">
            {datos.cierres.map((c) => (
              <button
                key={c.motivo}
                type="button"
                disabled={enviando !== ''}
                onClick={() => void cierra(c.motivo)}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-brand-200
                           px-3 py-2 text-left hover:bg-brand-50 disabled:opacity-50"
              >
                <span className="text-[13px] text-brand-600">{c.como_acabo}</span>
                {/*
                  * El importe, antes de pulsar. Lo calcula el servidor con la
                  * misma regla que cobra: si lo repitiera la pantalla, un día
                  * enseñaría una cifra y el botón cobraría otra.
                  */}
                <span className={`shrink-0 text-[12px] font-semibold ${
                  c.importe > 0 ? 'text-brand-600' : 'text-brand-300'
                }`}>
                  {enviando === c.motivo ? 'Cerrando…' : c.importe > 0 ? `Se le facturan ${euros(String(c.importe))}` : 'Sin cobrar'}
                </span>
              </button>
            ))}
          </div>
          {fallo && <p className="text-xs text-red-600 mt-2">{fallo}</p>}
          <button
            type="button"
            onClick={() => setCerrando(false)}
            className="mt-2 text-[12px] text-brand-400 hover:text-brand-600"
          >
            Dejarlo abierto
          </button>
        </div>
      )}
    </Card>
  );
}
