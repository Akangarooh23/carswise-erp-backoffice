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
import { api, descargaConSesion } from '../../api/client.js';
import { loQueFaltaEnPantalla } from '../../lib/lo-que-falta-del-precio.js';
import { Card } from '../../components/ui/Card.js';
import Icono from '../../components/ui/Icono.js';
import RevisionDelTaller, { type LoDelTaller } from './RevisionDelTaller.js';
import MandatoDeVenta, { type ComoSeFirma } from './MandatoDeVenta.js';
import ContratoDeCompraventa, { type Cerrado as CerradoConContrato } from './ContratoDeCompraventa.js';
import AnunciosDePortal from './AnunciosDePortal.js';

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
  mandato_id: string | null;
  firma_como: string | null;
  fee_gestion: string | null;
  fee_cancelacion: string | null;
}

export interface Cierre {
  motivo: string;
  como_acabo: string;
  importe: number;
}

export type Cerrado = CerradoConContrato;

/**
 * La cláusula del precio: qué falta para poder pedírsela y por dónde va.
 *
 * `falta` vacío quiere decir que ya se le puede mandar. Viene con la frase
 * hecha —«antes tiene que pasar por el taller»— porque quien mira esta ficha
 * tiene que saber qué falta sin ir a buscarlo.
 */
export interface ClausulaDelPrecio {
  falta: string;
  clausula_id: string | null;
  enviada_at: string | null;
  firmada_at: string | null;
  /** Si ha firmado **el precio que hay guardado**; uno distinto no cuenta. */
  aceptada: boolean;
  /** Si se le ha mandado el papel con el precio de ahora. */
  mandada: boolean;
  precio: number | null;
  /** El precio que decía el último papel que se le mandó. */
  precio_del_papel: number | null;
  /** Por qué el precio no deja publicar todavía. Vacío cuando deja. */
  por_que_no_deja: string;
  /** El papel que subió él firmado, que es el único que no se regenera. */
  subida: { id: string; nombre: string } | null;
}

export interface ElEncargo {
  encargo: Encargo | null;
  clausula_precio: ClausulaDelPrecio | null;
  ultimo_cerrado: Cerrado | null;
  cierres: Cierre[];
  puertas: Puerta[];
  /** Las seis puertas, las cinco suyas y la nuestra. Es lo que apaga el botón. */
  se_puede_publicar: boolean;
  /** Lo que falta **él**. Lo del taller va aparte: eso lo ponemos nosotros. */
  le_falta: string[];
  falta_el_taller: string;
  /** Y el precio de salida firmado, que también bloquea publicar. */
  falta_el_precio: string;
  /** El mandato: puerta de publicar y de cobrar. */
  mandato_firmado: boolean;
  por_que_no_firmado: string;
  /**
   * El papel que subió el cliente a su panel, si lo subió.
   *
   * El mandato de al lado se genera cada vez con lo que hay en el encargo, así
   * que sale en blanco. Éste tiene su firma y es el único que no se puede
   * volver a hacer.
   */
  mandato_subido: { id: string; nombre: string } | null;
  como_se_firma: ComoSeFirma[];
  /** Lo que habria que escribir a mano en el contrato si se imprime ahora. */
  falta_del_contrato: string[];
  /** Lo que dio su tasacion gratuita, si se la ha hecho. */
  tasacion: number | null;
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
  dias, aceptoElPrecio, penalizacion, mandatoFirmado,
}: {
  dias: number | null; aceptoElPrecio: boolean; penalizacion: number | null;
  mandatoFirmado: boolean;
}) {
  /*
   * Sin mandato firmado no se le cobra nada, así que no hay plazo que enseñar.
   *
   * Va antes que todo lo demás a propósito: la rama de abajo diría «siempre
   * paga la penalización de 150 €», y eso sería exactamente lo que el cierre no
   * va a facturar. Es la divergencia entre pantalla y factura que ya se evitó
   * una vez, y la descubre el cliente.
   */
  if (!mandatoFirmado) {
    return (
      <span className="inline-block rounded-lg bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-semibold">
        Sin mandato firmado · no se le puede facturar
      </span>
    );
  }
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
  /*
   * Los 30 días empiezan al publicar, no al firmar. Hasta entonces no corre
   * nada, y decir «sin fecha» se leería como un dato que falta.
   */
  if (dias === null) {
    return (
      <span className="inline-block rounded-lg bg-brand-50 text-brand-500 px-2.5 py-1 text-xs font-semibold">
        Los 30 días empiezan al publicar
      </span>
    );
  }

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
  const [guardando, setGuardando] = useState(false);
  const [taller, setTaller] = useState<LoDelTaller | null>(null);
  const [avisoClausula, setAvisoClausula] = useState('');

  /** Lo que sabe el servidor de la cláusula del precio de este encargo. */
  const clausula = datos?.clausula_precio ?? null;

  /**
   * Se le manda el documento del precio para que lo firme.
   *
   * No se marca nada aquí: lo que enciende «aceptó el precio» es que él suba el
   * papel firmado desde su panel. Mandarlo y darlo por aceptado sería volver al
   * dato que el ERP se escribe a sí mismo.
   */
  async function mandaLaClausula() {
    if (!datos?.encargo?.id) return;
    setGuardando(true);
    setFallo('');
    setAvisoClausula('');
    try {
      const r = await api.post<{ enviado_a: string }>(
        `/encargos/${datos.encargo.id}/clausula-precio/enviar`, {}
      );
      if (!r.ok) { setFallo(r.error ?? 'No se ha podido enviar.'); return; }
      setAvisoClausula(`Enviado a ${r.data.enviado_a}`);
      await carga();
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  /** Se baja el papel que firmó, que es el único del que hay una sola copia. */
  async function descargaElPrecioFirmado() {
    const doc = datos?.clausula_precio?.subida;
    if (!doc || !datos?.encargo?.id) return;
    setFallo('');
    try {
      await descargaConSesion(
        `/documentos/encargo/${datos.encargo.id}/${doc.id}`,
        doc.nombre || 'precio-firmado',
      );
    } catch (e) {
      setFallo((e as Error).message);
    }
  }

  /** El día y la hora, como se lee de un vistazo. */
  const cuandoConHoraLarga = (s: string | null) =>
    s ? new Date(s).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : '–';

  const carga = useCallback(async () => {
    try {
      const r = await api.get<ElEncargo>(`/encargos/coche/${vehicleId}`);
      if (!r.ok) { setFallo(r.error ?? 'no_se_ha_podido_leer'); return; }
      setDatos(r.data);
      // Los campos arrancan con lo que hay guardado, para que al abrir la ficha
      // se vea lo acordado y no dos casillas en blanco.
      /*
       * El precio arranca con lo acordado, y si no hay nada acordado todavía,
       * con lo que dio su tasación. Es de donde sale la conversación: se le
       * propone ese número y él lo acepta o no.
       */
      setPrecio(r.data.encargo?.precio_referencia ?? (r.data.tasacion ? String(r.data.tasacion) : ''));
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
        // Sin la casilla de «ha firmado»: lo que cuenta es el papel que sube
        // él, y eso lo marca PopCar. El servidor conserva lo que hubiera.
        precio_referencia: precio === '' ? null : Number(precio),
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

        {/*
          * Y si se vendió, el contrato de compraventa.
          *
          * Va aquí —en la ficha del encargo ya cerrado— porque es cuando
          * existe: antes de que haya comprador no hay contrato que hacer. Y
          * tiene que seguir estando después de cerrar, porque el papel se firma
          * en ese momento y a veces se reimprime al día siguiente.
          */}
        {datos.ultimo_cerrado?.motivo_cierre === 'vendido' && (
          <ContratoDeCompraventa
            cerrado={datos.ultimo_cerrado}
            falta={datos.falta_del_contrato}
            alGuardar={() => void carga()}
          />
        )}

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
          mandatoFirmado={datos.mandato_firmado}
        />
      </div>

      {/*
        * El mandato va lo primero, antes que las puertas.
        *
        * Las puertas son para publicar y el mandato es para cobrar, y de las
        * dos cosas la que no se puede arreglar después es esta: pedirle la
        * firma a alguien al que ya le hemos vendido el coche es una
        * conversación que no se gana.
        */}
      <MandatoDeVenta
        encargoId={e.id}
        mandatoId={e.mandato_id}
        firmado={datos.mandato_firmado}
        firmadoAt={e.firmado_at}
        firmaComo={e.firma_como}
        porQueNo={datos.por_que_no_firmado}
        comoSeFirma={datos.como_se_firma}
        mandatoSubido={datos.mandato_subido ?? null}
        alGuardar={() => void carga()}
      />

      <ul className="mb-3 mt-4">
        {datos.puertas.map((p) => <Semaforo key={p.clave} puerta={p} />)}
      </ul>

      {/*
        * El resumen de las seis puertas, dicho en una frase.
        *
        * Antes decía «falta la revisión del taller» sin mirar el taller: cuando
        * la revisión ya estaba hecha seguía pidiéndola, y quien leía esto no
        * podía saber si el coche estaba listo o no.
        */}
      <div className={`rounded-lg px-3 py-2 text-[13px] ${
        datos.se_puede_publicar ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-500'
      }`}>
        {datos.le_falta.length > 0
          ? `Le falta: ${datos.le_falta.join('; ')}`
          : datos.se_puede_publicar
            ? 'Listo para publicar.'
            : `Lo ha traído todo. ${taller?.por_que_no || datos.falta_el_taller || datos.falta_el_precio}.`}
      </div>

      <RevisionDelTaller
        vehicleId={vehicleId}
        encargoId={e.id}
        alCambiar={setTaller}
        alGuardar={() => void carga()}
      />

      {/*
        * Y dónde está anunciado fuera.
        *
        * Va después del taller porque es lo que viene después: primero se puede
        * publicar, luego se publica. Y va **dentro del encargo** y no en una
        * pantalla suya porque la pregunta que importa —«¿sigue puesto un
        * anuncio de un coche que ya no vendemos?»— se hace mirando el coche.
        */}
      <AnunciosDePortal vehicleId={vehicleId} />

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
          {/*
            * Aquí había una casilla «Ha firmado la cláusula del precio». Se
            * quitó: el precio tiene que firmarlo él, en el papel, y con la
            * cifra que hay guardada. Una casilla que marcamos nosotros no
            * puede abrir la puerta de publicar.
            */}
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
        {datos.tasacion !== null && (
          <p className="text-[11.5px] text-brand-500 mt-2">
            Su tasación gratuita dio <strong>{datos.tasacion.toLocaleString('es-ES')} €</strong>.
          </p>
        )}
        <p className="text-[11.5px] text-brand-400 mt-2 leading-snug">
          Sin el precio firmado no se publica, y la cancelación se le puede cobrar siempre.
          Firmado, solo durante los 30 días siguientes a la publicación del anuncio.
          Si cambias el precio después, hay que volver a mandárselo.
        </p>

        {/*
          * Mandarle el documento para que lo firme.
          *
          * Va después del taller y no antes: el precio se fija con lo que diga
          * —un coche «con reparos» no vale lo mismo que uno limpio—, y pedirle
          * que acepte una cifra antes de saberlo es pedirle que acepte una que
          * vamos a tener que cambiar. Mientras no toque, el botón dice por qué.
          */}
        {clausula && (
          <div className="mt-3 pt-3 border-t border-brand-100 flex items-end gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-brand-600">
                {clausula.aceptada
                  ? 'Ha aceptado el precio por escrito'
                  : clausula.mandada
                  ? 'Se le ha mandado el documento del precio'
                  : clausula.enviada_at
                  ? 'El precio ha cambiado: hay que volver a mandárselo'
                  : 'Mándale el documento del precio'}
              </p>
              <p className="text-[11.5px] text-brand-400 mt-0.5">
                {clausula.aceptada
                  ? `Firmado el ${cuandoConHoraLarga(clausula.firmada_at)}${clausula.clausula_id ? ` · ${clausula.clausula_id}` : ''}`
                  : clausula.falta
                  /* Con el número escrito y sin guardar, lo que falta no es
                     acordar el precio: es darle a Guardar. */
                  ? loQueFaltaEnPantalla(clausula.falta, precio, datos.encargo?.precio_referencia)
                  /* Mandado o firmado con otra cifra: lo dice el servidor con
                     las dos, para que se vea qué ha cambiado. */
                  : clausula.enviada_at && !clausula.mandada
                  ? loQueFaltaEnPantalla(clausula.por_que_no_deja, precio, datos.encargo?.precio_referencia)
                  : clausula.enviada_at
                  ? `Enviado el ${cuandoConHoraLarga(clausula.enviada_at)}. Lo sube firmado desde su panel.`
                  : 'Lo firma y lo sube desde su panel, como el mandato.'}
              </p>
            </div>
            {!clausula.aceptada && (
              <button
                type="button"
                onClick={() => void mandaLaClausula()}
                disabled={guardando || clausula.falta !== ''}
                title={clausula.falta || 'Le llega por correo con el documento adjunto'}
                className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-acento
                           text-acento hover:bg-amber-50 disabled:opacity-50"
              >
                {clausula.enviada_at ? 'Volver a mandárselo' : 'Mandarle el precio'}
              </button>
            )}
            {/*
              * El papel que firmó, que es el único que no se puede regenerar.
              *
              * El documento en blanco se hace cada vez con lo que hay en el
              * encargo; éste tiene su firma y solo existe una copia.
              */}
            {clausula.subida && (
              <button
                type="button"
                onClick={() => void descargaElPrecioFirmado()}
                className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-brand-200
                           text-brand-500 hover:bg-brand-50"
              >
                Descargar el firmado
              </button>
            )}
          </div>
        )}
        {avisoClausula && <p className="text-[12px] text-brand-500 mt-2">{avisoClausula}</p>}
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
