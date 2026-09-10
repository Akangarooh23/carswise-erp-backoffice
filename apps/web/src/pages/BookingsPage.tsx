import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { MARKETPLACE_URL } from '../lib/marca.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';
import Boton from '../components/ui/Boton.js';
import { comoSeLlama, elQueVende, alQueVende } from '../lib/quien-vende.js';
import { RESULTADOS, COMO_ACABO, TONO, comoAcabo, estaSinCerrar } from '../lib/resultado-de-la-visita.js';

type Booking = {
  id: string;
  offer_id: string;
  vehicle_title: string;
  starts_at: string;
  ends_at: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string;
  notes: string;
  /**
   * Si dijo que le interesaría financiarlo, al pedir la visita.
   *
   * Lo contesta en PopCar y hasta ahora se quedaba en la tabla de solicitudes,
   * que en el ERP no la mira nadie: se apuntaba y se tiraba.
   */
  quiere_financiar: boolean;
  // Dónde es la visita y por quién preguntar. Se apuntan al confirmar, pero
  // muchas veces se saben después, así que pueden llegar vacíos.
  meeting_place: string | null;
  meeting_contact: string | null;
  status: string;
  source: string;
  slot_source: string;
  created_at: string;
  // Quién vende. De un concesionario o un profesional, `seller` es el nombre y
  // el teléfono está en el anuncio; de un particular, `seller` es su correo.
  // Puede faltar: la oferta puede haberse despublicado y la visita sigue.
  seller: string | null;
  seller_type: string | null;
  source_url: string | null;
  // Para llamarle. Sale de la oferta si la oferta lo trae y, si no, de lo que
  // tengamos apuntado del vendedor: el teléfono es suyo, no de cada coche.
  seller_phone: string | null;
  seller_contact: string | null;
  /** Si el teléfono viene del vendedor y no de esta oferta en concreto. */
  del_vendedor?: boolean;
  /** Cuándo se le puede llamar. Es de uso interno, como el teléfono. */
  seller_horario?: string | null;
  /** Su ficha de Proveedores, cuando el nombre casa con una. */
  proveedor_id?: string | null;
  // Cómo acabó la visita, cuando ya ha pasado y alguien lo ha dicho. El estado
  // cuenta lo de antes de la visita; esto, lo de después.
  resultado: string | null;
  resultado_at: string | null;
  /**
   * Quién dijo cómo acabó: un trabajador o el propio cliente, desde el correo
   * de seguimiento. No valen lo mismo — de un «se lo quedó» sale una factura —,
   * así que se enseña.
   */
  resultado_actor?: string | null;
};

/**
 * De qué sección del marketplace es el coche.
 *
 * La etiqueta decía «PopCar» para todo lo que no fuera un particular, y con eso
 * un Astara o un Leasys —flota de renting devuelta— parecía stock nuestro. Se
 * usan las mismas palabras que ve el cliente en el marketplace, para que al
 * hablar con él se hable de lo mismo.
 */
function seccionDelCoche(b: Booking): string {
  const t = (b.seller_type || '').toLowerCase();
  if (t === 'particular') return 'Particular';
  if (t === 'professional') return 'Ex-renting';
  if (t === 'concesionario') return 'Concesionario';
  if (t === 'importador') return 'Importación';
  // Sin oferta —despublicada— queda lo único que se sabe: de dónde vino.
  return isProfessional(b) ? 'PopCar' : 'Particular';
}

/** El correo del vendedor, cuando lo hay: solo los particulares lo tienen. */
const correoDelVendedor = (b: Booking) =>
  b.seller && b.seller.includes('@') ? b.seller : '';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function inNDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

type Range = 'today' | 'week' | 'month' | 'all';

interface Paso {
  evento: string;
  actor: string;
  datos: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Cómo se lee cada paso del rastro.
 *
 * Las claves las escribe la API: unas al hacer algo —confirmar, mover,
 * cancelar— y otras porque alguien las apunta a mano, que son las de
 * `PASOS_A_MANO` en `routes/visits.ts`. Una que falte aquí no desaparece: sale
 * su clave cruda, fea pero legible, que es mejor que un hueco.
 */
const PASO: Record<string, string> = {
  solicitada:               'El cliente pidió la visita',
  concesionario_contactado: 'Hablado con el vendedor',
  horas_propuestas:         'El vendedor propone otras horas',
  whatsapp_enviado:         'Mandado al cliente por WhatsApp',
  correo_propuesta:         'Mandadas al cliente por correo, para que elija',
  cliente_respondio:        'El cliente eligió una hora',
  nota:                     'Nota',
  confirmada:               'Cita confirmada',
  movida:                   'Cita movida a otra hora',
  cancelada:                'Cita cancelada',
  concesionario_avisado:    'Avisado el vendedor de que el cliente va',
  lugar:                    'Apuntado dónde es y por quién preguntar',
  lugar_avisado:            'Mandado el sitio al cliente',
  resultado:                'Cómo acabó la visita',
};
const RANGE_LABELS: Record<Range, string> = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', all: 'Todas' };

function groupByDay(bookings: Booking[]): Record<string, Booking[]> {
  const map: Record<string, Booking[]> = {};
  for (const b of bookings) {
    const day = b.starts_at.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(b);
  }
  return map;
}

/**
 * La ficha del coche en el marketplace VO.
 *
 * Vale para todas, también para las de IDCar: viven en la misma tabla de ofertas
 * y tienen su ficha igual. Lo que no tienen las que no vienen de un portal es un
 * anuncio propio en internet, y por eso el enlace va siempre a la ficha nuestra
 * y no a la del portal de origen.
 */
function enlaceOferta(offerId: string): string {
  if (!offerId) return '';
  return `${MARKETPLACE_URL}/${encodeURIComponent(offerId)}`;
}

function isToday(d: string) { return d === todayIso(); }
function isProfessional(b: Booking) { return !b.offer_id?.startsWith('idcar-'); }

/**
 * Los pasos que ha dado una visita, en orden.
 *
 * El estado dice dónde está; esto dice cómo ha llegado. Sirve para lo de todos
 * los días: saber si ya se llamó al concesionario sin tener que preguntar a
 * quien lo hizo.
 */
/**
 * Quién tiene el coche y por dónde se le llama.
 *
 * El sistema no le avisa nunca —ni al reservar, ni al confirmar, ni al mover, ni
 * al cancelar—, así que llamarle es trabajo de una persona, y esa persona
 * necesita saber a quién. Antes en la Agenda solo estaba el identificador de la
 * oferta: había que abrirla en otra pestaña para averiguarlo.
 *
 * De un particular tenemos su correo. De los demás, solo el nombre: el enlace de
 * origen lleva a donde salió el coche, que unas veces es el anuncio del vendedor
 * —con su teléfono— y otras un informe de inspección o nada. **El teléfono de
 * quien vende no está guardado en ninguna parte**, y hay que llamarle igual.
 */
function QuienVende({ b, alApuntarTelefono }: { b: Booking; alApuntarTelefono?: () => void }) {
  if (!b.seller) return null;
  const correo = correoDelVendedor(b);
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
      <span className="text-brand-300 font-semibold uppercase tracking-wide">Vende</span>
      {correo ? (
        <a href={`mailto:${correo}`} onClick={(e) => e.stopPropagation()}
           className="font-semibold text-acento-texto underline underline-offset-2">
          {correo}
        </a>
      ) : (
        <span className="font-semibold text-brand-500">{b.seller}</span>
      )}
      <span className="text-brand-300">· {comoSeLlama(b.seller_type)}</span>
      {/* El teléfono, que es lo que hace falta para llamarle. Si no está
          puesto se dice, porque el hueco vacío se lee como «no hace falta». */}
      {b.seller_phone ? (
        <>
          <a href={`tel:${b.seller_phone}`} onClick={(e) => e.stopPropagation()}
             className="font-bold text-acento-texto underline underline-offset-2">
            ☎ {b.seller_phone}
          </a>
          {/* De dónde salió. Un número que no está en la ficha de este coche
              aparecía sin explicación, y quien llama quiere saber si es el de
              la sede o el de este coche en concreto. */}
          {b.del_vendedor && (
            <span className="text-brand-300" title={`Apuntado de ${b.seller}, no de esta oferta`}>
              (de {b.seller})
            </span>
          )}
        </>
      ) : alApuntarTelefono ? (
        // Se pide aquí porque aquí es donde falta: vas a llamar y no hay
        // número. Y se guarda por vendedor, así que con una vez valen todos
        // sus coches.
        <button type="button"
                onClick={(e) => { e.stopPropagation(); alApuntarTelefono(); }}
                className="font-bold text-amber-700 underline underline-offset-2">
          sin teléfono · apuntarlo
        </button>
      ) : (
        <span className="text-amber-700">sin teléfono</span>
      )}
      {b.seller_contact && <span className="text-brand-400">· pregunta por {b.seller_contact}</span>}
      {/* Cuándo se le puede llamar. Sin esto se llama a las tres y no coge
          nadie, y la visita se queda pendiente un día más por nada. */}
      {b.seller_horario && <span className="text-brand-400">· {b.seller_horario}</span>}
      {/* Su ficha, para el NIF, el IBAN y las sedes. Quien llama acaba
          necesitándola en cuanto hay que facturarle. */}
      {b.proveedor_id && (
        <a href={`/proveedores?abrir=${b.proveedor_id}`} onClick={(e) => e.stopPropagation()}
           className="text-acento-texto underline underline-offset-2">
          su ficha ↗
        </a>
      )}
      {b.source_url && (
        <a href={b.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
           className="text-acento-texto underline underline-offset-2"
           title="De dónde salió este coche. Puede ser el anuncio del vendedor o un informe de inspección; no siempre lleva teléfono.">
          origen ↗
        </a>
      )}
    </div>
  );
}

function Rastro({ pasos }: { pasos: Paso[] }) {
  if (!pasos.length) {
    return <p className="text-[12.5px] text-brand-300">Todavía no hay ningún paso apuntado.</p>;
  }
  return (
    <ol className="space-y-2">
      {pasos.map((p, i) => {
        const d = (p.datos ?? {}) as Record<string, unknown>;
        const horas = Array.isArray(d.horas) ? (d.horas as string[]) : null;
        return (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="text-brand-300 tabular-nums shrink-0 w-28">
              {new Date(p.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="flex-1">
              <span className="text-brand-600 font-medium">{PASO[p.evento] ?? p.evento}</span>
              <span className="text-brand-300"> · {p.actor}</span>
              {typeof d.motivo === 'string' && d.motivo && (
                <span className="block text-brand-400 italic">«{d.motivo}»</span>
              )}
              {typeof d.resultado === 'string' && comoAcabo(d.resultado) && (
                <span className="block text-brand-500">
                  {comoAcabo(d.resultado)}
                  {/* Lo que decía antes, si se ha corregido: sin eso, dos
                      líneas seguidas parecen dos visitas. */}
                  {typeof d.antes === 'string' && comoAcabo(d.antes) && (
                    <span className="text-brand-300"> · antes decía «{comoAcabo(d.antes)}»</span>
                  )}
                </span>
              )}
              {typeof d.nota === 'string' && d.nota && (
                <span className="block text-brand-500 whitespace-pre-wrap mt-0.5">{d.nota}</span>
              )}
              {typeof d.donde === 'string' && d.donde && (
                <span className="block text-brand-400">{d.donde}</span>
              )}
              {horas && (
                <span className="block text-brand-400">
                  {horas.map((h) => `${fmtDate(h)} ${fmtTime(h)}`).join(' · ')}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Escribir una nota sobre la cita.
 *
 * Va al rastro como un paso más, con quién la escribió y cuándo. No es un
 * campo que se edita: dos personas llevando la misma cita se pisarían el
 * texto, y lo que se apunta de una gestión no se corrige, se añade.
 *
 * Vive fuera de la página a propósito. Estaba declarado dentro, y entonces cada
 * vez que se teclea una letra React ve un componente distinto, tira el de antes
 * y monta otro: el cuadro perdía el foco a cada letra y había que volver a
 * pinchar. Declararlo aquí lo convierte en el mismo componente siempre.
 */
function NotaNueva({ valor, alEscribir, guardando, alGuardar }: {
  valor: string;
  alEscribir: (t: string) => void;
  guardando: boolean;
  alGuardar: () => void;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-brand-100">
      <label className="block text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-1.5">
        Añadir una nota
      </label>
      <div className="flex gap-2 items-start">
        <textarea
          value={valor}
          onChange={(e) => alEscribir(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Lo que haya que saber: qué dijo el vendedor, si el cliente llamó…"
          className="flex-1 px-3 py-2 text-[13px] border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
        />
        <Boton tam="sm" variante="secundario" cargando={guardando} onClick={alGuardar}>
          Guardar
        </Boton>
      </div>
    </div>
  );
}

/**
 * Lo que se despliega al pedir el rastro de una visita: los pasos dados, los
 * dos botones para apuntar lo que se hizo por teléfono, y el sitio de escribir
 * notas.
 *
 * Estaba escrito dos veces —una en las pendientes y otra en las confirmadas— y
 * las dos copias se separaron: la de las confirmadas se quedó sin los botones.
 * Nadie decidió eso, y el paso que más falta hace ahí es justo uno de los dos:
 * «le he dicho que el cliente va» pasa **después** de confirmar.
 *
 * Devuelve los tres trozos sueltos y no su marco: cada sitio lo coloca con su
 * propio espaciado, y el marco es lo único que de verdad cambia entre los dos.
 */
function PanelDelRastro({ b, pasos, alApuntar, nota, alEscribirNota, guardandoNota, alGuardarNota }: {
  b: Booking;
  pasos: Paso[];
  alApuntar: (evento: string, texto: string) => void;
  nota: string;
  alEscribirNota: (t: string) => void;
  guardandoNota: boolean;
  alGuardarNota: () => void;
}) {
  const quienEs = elQueVende(b.seller_type);
  const aQuien = alQueVende(b.seller_type);
  return (
    <>
      <Rastro pasos={pasos} />
      <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-brand-100">
        {/* Lo que hace una persona por teléfono no cambia nada en la base: si
            no se apunta, no existe para nadie más. */}
        <Boton tam="sm" variante="secundario"
               onClick={() => alApuntar('concesionario_contactado', `Apuntado que has hablado con ${quienEs}.`)}>
          He llamado {aQuien}
        </Boton>
        <Boton tam="sm" variante="secundario"
               onClick={() => alApuntar('concesionario_avisado', `Apuntado que ${quienEs} ya sabe que el cliente va.`)}>
          Le he dicho que el cliente va
        </Boton>
      </div>
      <NotaNueva valor={nota} alEscribir={alEscribirNota}
                 guardando={guardandoNota} alGuardar={alGuardarNota} />
    </>
  );
}

/**
 * Cómo acabó la visita, en tres botones.
 *
 * Solo sale cuando la visita ya ha empezado y está confirmada. Antes no: cerrar
 * una cita que no ha pasado es inventarse el pasado, y repasando la agenda de
 * la semana ese botón se pulsa sin querer.
 *
 * Son tres y no dos porque contestan cosas distintas: si el cliente fue dice si
 * el concesionario nos falla, y si se lo quedó dice si el coche convence.
 * Juntos en uno, la conversión no se puede calcular.
 */
function ComoAcabo({ b, cerrando, alCerrar }: {
  b: Booking;
  cerrando: boolean;
  alCerrar: (resultado: string) => void;
}) {
  if (b.resultado) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${TONO[b.resultado as keyof typeof TONO] ?? 'bg-brand-50 text-brand-500 border-brand-200'}`}>
          {comoAcabo(b.resultado)}
        </span>
        {/* Un «se lo quedó» dicho por el cliente en un correo es un indicio; el
            de un trabajador viene de hablar con el concesionario. Quien va a
            emitir la factura decide si lo comprueba antes. */}
        {b.resultado_actor === 'cliente' && (
          <span className="text-[11px] text-brand-400" title="Contestó al correo de «¿qué tal fue la visita?»">
            lo dijo el cliente
          </span>
        )}
        {/* Se puede corregir: quien lo apuntó pudo equivocarse de fila, y cada
            cambio queda en el rastro con lo que decía antes. */}
        <span className="text-[11px] text-brand-300">¿No fue así?</span>
        {RESULTADOS.filter((r) => r !== b.resultado).map((r) => (
          <button key={r} type="button" disabled={cerrando} onClick={() => alCerrar(r)}
                  className="text-[11px] font-medium text-brand-400 underline underline-offset-2 disabled:opacity-50">
            {COMO_ACABO[r]}
          </button>
        ))}
      </div>
    );
  }
  if (!estaSinCerrar(b)) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold text-brand-300 uppercase tracking-wide">Cómo acabó</span>
      {RESULTADOS.map((r) => (
        <Boton key={r} tam="sm" variante={r === 'compro' ? 'acento' : 'secundario'}
               cargando={cerrando} onClick={() => alCerrar(r)}>
          {COMO_ACABO[r]}
        </Boton>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [range, setRange]           = useState<Range>('week');
  const [search, setSearch]         = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cerrando, setCerrando]     = useState<string | null>(null);
  const [quitarElAnuncio, setQuitarElAnuncio] = useState(false);
  const [telefonoDe, setTelefonoDe] = useState<Booking | null>(null);
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [contactoNuevo, setContactoNuevo] = useState('');
  const [horarioNuevo, setHorarioNuevo] = useState('');
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<Booking | null>(null);
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<{ mal: boolean; texto: string } | null>(null);
  const [pendientes, setPendientes] = useState<Booking[]>([]);
  const [porCerrar, setPorCerrar]   = useState<Booking[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Booking | null>(null);
  // El mismo par de datos que pide confirmar, pero para una cita que ya lo
  // está: la dirección concreta casi nunca se sabe cuando se dice que sí.
  const [lugar, setLugar] = useState<Booking | null>(null);
  const [avisarDelLugar, setAvisarDelLugar] = useState(true);
  const [guardandoLugar, setGuardandoLugar] = useState(false);
  const [donde, setDonde] = useState('');
  const [preguntarPor, setPreguntarPor] = useState('');
  const [proponer, setProponer] = useState<Booking | null>(null);
  const [horas, setHoras] = useState<{ dia: string; hora: string }[]>([{ dia: '', hora: '' }]);
  const [proponiendo, setProponiendo] = useState(false);
  // Lo que va a leer el cliente, antes de mandárselo. Un correo sale de una vez
  // y no se puede recoger.
  const [borrador, setBorrador] = useState<{
    asunto: string; correo: string; texto: string;
    email: string; telefono: string; sinCorreo: boolean; sinTelefono: boolean;
  } | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; enviado: boolean; motivo?: string; telefono: string; correo?: boolean; falloCorreo?: string; email?: string } | null>(null);
  const [rastroDe, setRastroDe] = useState<string | null>(null);
  const [rastro, setRastro] = useState<Paso[]>([]);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [mover, setMover] = useState<Booking | null>(null);
  const [nuevoDia, setNuevoDia] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [moviendo, setMoviendo] = useState(false);
  const [laEligio, setLaEligio] = useState(false);
  // Las horas que le propusimos, sacadas del rastro. Cuando contesta «la 2»
  // hay que poder darle a la 2, no volver a teclear el día y la hora.
  const [propuestas, setPropuestas] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIso();
    let from = today, to = '';
    if (range === 'today')  { from = today; to = today + 'T23:59:59Z'; }
    if (range === 'week')   { from = today; to = inNDays(7) + 'T23:59:59Z'; }
    if (range === 'month')  { from = today; to = inNDays(30) + 'T23:59:59Z'; }
    // «Todas» incluye lo ya pasado: si no, era «todas las que vienen», y quien
    // busca una visita de la semana pasada no la encontraba en ninguna parte.
    if (range === 'all')    { from = inNDays(-90); }
    // Las pendientes se piden aparte y sin acotar por fecha: son trabajo que
    // hay que despachar, y una que caiga fuera del rango elegido no puede
    // desaparecer de la vista sin más.
    const params = new URLSearchParams({ status: 'confirmed', from });
    if (to) params.set('to', to);
    const [conf, pend, cerrar] = await Promise.all([
      api.get<any>(`/all-bookings?${params}`),
      // Sin acotar por fecha, ni siquiera por hoy. Una pendiente que se pasa de
      // fecha es una persona a la que no contestamos: esconderla no la arregla,
      // y además el número rojo del menú las cuenta todas, así que marcaba una
      // cifra que en la Agenda no aparecía por ningún lado.
      api.get<any>('/all-bookings?status=pending'),
      // Las que ya pasaron y nadie ha cerrado. Tampoco se acotan por fecha, y
      // por el mismo motivo: la Agenda enseña de hoy en adelante, así que estas
      // no salían salvo cambiando el rango a «Todas». Trabajo invisible.
      api.get<any>('/all-bookings?status=confirmed&sin_cerrar=1'),
    ]);
    if (conf.ok) setBookings(conf.data?.bookings || []);
    if (pend.ok) setPendientes(pend.data?.bookings || []);
    if (cerrar.ok) setPorCerrar(cerrar.data?.bookings || []);
    setLoading(false);
  }, [range]);

  /** De un día y una hora sueltos a la fecha que espera la API. */
  const aFecha = (dia: string, hora: string) => (dia && hora ? new Date(`${dia}T${hora}:00`).toISOString() : '');

  /**
   * Arma lo que se le va a mandar y lo enseña. No manda nada.
   *
   * Se puede volver atrás, cambiar las horas y volver a mirar: esta llamada no
   * deja rastro, así que un intento que no fue no aparece en el rastro de la cita.
   */
  async function preparaPropuesta() {
    if (!proponer) return;
    const fechas = horas.map((h) => aFecha(h.dia, h.hora)).filter(Boolean);
    if (!fechas.length) { setResultado({ mal: true, texto: 'Pon al menos una hora.' }); return; }
    setProponiendo(true);
    const r = await api.post<{
      asunto: string; correo: string; texto: string;
      email: string; telefono: string; sinCorreo: boolean; sinTelefono: boolean;
    }>(`/visit-bookings/${proponer.id}/proponer/vista`, { horas: fechas });
    setProponiendo(false);
    if (!r.ok || !r.data) { setResultado({ mal: true, texto: r.error || 'No se ha podido preparar el mensaje.' }); return; }
    setBorrador(r.data);
  }

  async function mandarPropuesta() {
    if (!proponer) return;
    const fechas = horas.map((h) => aFecha(h.dia, h.hora)).filter(Boolean);
    if (!fechas.length) { setResultado({ mal: true, texto: 'Pon al menos una hora.' }); return; }
    setProponiendo(true);
    const r = await api.post<{
      texto: string; enviado: boolean; motivo?: string; telefono: string;
      correo?: boolean; falloCorreo?: string; email?: string;
    }>(`/visit-bookings/${proponer.id}/proponer`, { horas: fechas });
    setProponiendo(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido guardar la propuesta.' }); return; }
    // El diálogo no se cierra: ahora enseña el mensaje, que es lo que hay que
    // mandar o comprobar. Cerrarlo y dejarlo en un aviso lo haría desaparecer.
    setBorrador(null);
    setMensaje({ ...r.data!, telefono: r.data?.telefono || proponer.buyer_phone || '' });
    load();
  }

  /**
   * Trae los pasos y los enseña. Siempre: no alterna.
   *
   * Estaba metido dentro de `verRastro`, que alterna, y refrescar después de
   * guardar una nota cerraba el panel en vez de recargarlo —React no había
   * aplicado todavía el `setRastroDe(null)` de la línea anterior, así que veía
   * el panel como abierto y lo cerraba—. La nota se guardaba bien; lo que no se
   * veía era el resultado, que es la mitad de lo que hace falta.
   */
  async function cargaRastro(b: Booking) {
    setRastroDe(b.id);
    setRastro([]);
    const r = await api.get<{ pasos: Paso[] }>(`/visit-bookings/${b.id}/pasos`);
    if (r.ok) setRastro(r.data?.pasos || []);
  }

  /** Abre o cierra el rastro, según esté. */
  async function verRastro(b: Booking) {
    if (rastroDe === b.id) { setRastroDe(null); return; }
    await cargaRastro(b);
  }


  async function guardaNota(b: Booking) {
    const texto = notaNueva.trim();
    if (!texto) return;
    setGuardandoNota(true);
    const r = await api.post(`/visit-bookings/${b.id}/paso`, { evento: 'nota', nota: texto });
    setGuardandoNota(false);
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido guardar la nota.' }); return; }
    setNotaNueva('');
    // `cargaRastro` y no `verRastro`: el segundo alterna, y aquí lo que hay
    // que hacer es releerlo, no cerrarlo.
    await cargaRastro(b);
  }

  /**
   * Dice cómo acabó la visita.
   *
   * Recarga la lista después: el resultado cambia la fila y, en cuanto está
   * puesto, la visita deja de contar entre las que esperan a que alguien las
   * cierre. Si el rastro está abierto, también se relee, para que se vea la
   * línea que se acaba de escribir.
   */
  async function cierraLaVisita(b: Booking, resultado: string) {
    setCerrando(b.id);
    const r = await api.post(`/visit-bookings/${b.id}/resultado`, { resultado });
    setCerrando(null);
    if (!r.ok) {
      // El servidor manda: puede negarse porque la visita no ha empezado o
      // porque está cancelada, y esa razón hay que contarla tal cual.
      setResultado({ mal: true, texto: r.error || 'No se ha podido guardar cómo acabó.' });
      return;
    }
    setResultado({ mal: false, texto: `Apuntado: ${COMO_ACABO[resultado as keyof typeof COMO_ACABO]}.` });
    if (rastroDe === b.id) await cargaRastro(b);
    await load();
  }


  /**
   * Apunta el teléfono de quien vende. Por vendedor, no por coche.
   *
   * Después recarga: el número que se acaba de poner vale para todas las demás
   * visitas de ese vendedor que estén en pantalla, y dejarlas diciendo «sin
   * teléfono» invitaría a apuntarlo otra vez.
   */
  /** Abre el diálogo con lo que ya hubiera, que casi nunca es nada. */
  function abreElTelefono(b: Booking) {
    setTelefonoDe(b);
    setTelefonoNuevo(b.seller_phone || '');
    setContactoNuevo(b.seller_contact || '');
    setHorarioNuevo(b.seller_horario || '');
  }

  async function guardaElTelefono() {
    if (!telefonoDe) return;
    const tel = telefonoNuevo.trim();
    if (!tel) { setResultado({ mal: true, texto: 'Pon el teléfono.' }); return; }
    setGuardandoTelefono(true);
    const r = await api.post<{ vendedor?: string }>(
      `/visit-bookings/${telefonoDe.id}/telefono-del-vendedor`,
      { telefono: tel, contacto: contactoNuevo.trim(), horario: horarioNuevo.trim() },
    );
    setGuardandoTelefono(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido guardar el teléfono.' }); return; }
    setTelefonoDe(null);
    setResultado({ mal: false, texto: `Apuntado el teléfono de ${r.data?.vendedor || 'quien vende'}, para todos sus coches.` });
    await load();
  }

  async function apuntaPaso(b: Booking, evento: string, texto: string) {
    const r = await api.post(`/visit-bookings/${b.id}/paso`, { evento });
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido apuntar.' }); return; }
    setResultado({ mal: false, texto });
    if (rastroDe === b.id) await cargaRastro(b);
  }

  /** El día y la hora, como los quieren los dos cuadros del diálogo. */
  function enCuadros(iso: string) {
    const d = new Date(iso);
    const dosCifras = (n: number) => String(n).padStart(2, '0');
    return {
      dia: `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`,
      hora: `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`,
    };
  }

  /**
   * Abre el diálogo ya con el día y la hora que tenía: casi siempre cambia uno
   * de los dos.
   *
   * Arranca con «la ha elegido el cliente» marcado cuando se entra desde el botón
   * de la pendiente, que es el final normal de haberle propuesto otras horas. Y se
   * traen las que se le propusieron, del rastro: contestó «la 2», así que lo que
   * hay que hacer es pinchar la 2, no volver a teclear una fecha y equivocarse.
   */
  async function abreMover(b: Booking, eligioElCliente = false) {
    const { dia, hora } = enCuadros(b.starts_at);
    setNuevoDia(dia);
    setNuevaHora(hora);
    setLaEligio(eligioElCliente);
    setPropuestas([]);
    setMover(b);
    const r = await api.get<{ pasos: Paso[] }>(`/visit-bookings/${b.id}/pasos`);
    const pasos = r.data?.pasos || [];
    // La última propuesta manda: si se le propusieron horas dos veces, las
    // buenas son las de la segunda vez.
    const ultima = [...pasos].reverse().find((paso) => paso.evento === 'horas_propuestas');
    const horas = (ultima?.datos?.horas as string[] | undefined) || [];
    setPropuestas(horas.filter((h) => !Number.isNaN(new Date(h).getTime())));
  }

  async function guardarNuevaHora() {
    if (!mover || !nuevoDia || !nuevaHora) return;
    setMoviendo(true);
    // Se manda la hora tal y como la ha escrito quien la teclea, en su huso: si
    // se convirtiera a UTC aquí, una cita de las 10 podría acabar a las 8.
    const startsAt = new Date(`${nuevoDia}T${nuevaHora}:00`).toISOString();
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${mover.id}/reprogramar`, { startsAt, laEligioElCliente: laEligio });
    setMoviendo(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido cambiar la hora.' }); return; }
    const quien = mover.buyer_name || 'El cliente';
    setMover(null);
    setResultado(
      r.data?.avisado
        ? {
            mal: false,
            texto: laEligio
              ? `Hecho: la visita queda confirmada a la hora que eligió. ${quien} ya tiene el correo con el calendario.`
              : `Visita movida y confirmada. ${quien} ya lo sabe: le hemos escrito con la hora nueva y el calendario.`,
          }
        : { mal: true, texto: `Movida, pero no hemos podido avisar a ${quien}. Llámale antes de que se presente a la hora vieja.` }
    );
    load();
  }

  async function confirmarVisita(b: Booking) {
    setConfirmando(b.id);
    const r = await api.post<{ avisado?: boolean }>(`/visit-bookings/${b.id}/confirm`, {
      donde: donde.trim(),
      preguntarPor: preguntarPor.trim(),
    });
    setConfirmando(null);
    setConfirmar(null);
    setDonde('');
    setPreguntarPor('');
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido confirmar la visita.' }); return; }
    setResultado(
      r.data?.avisado
        ? { mal: false, texto: `Visita confirmada. ${b.buyer_name || 'El cliente'} ya lo sabe: le hemos escrito con el calendario.` }
        : { mal: true, texto: `Confirmada, pero no hemos podido avisar a ${b.buyer_name || 'el cliente'}. Llámale al ${b.buyer_phone || 'teléfono que tengas'}.` }
    );
    load();
  }

  /**
   * Se apunta dónde es y por quién preguntar en una cita que ya existe.
   *
   * Vale para una confirmada y para una pendiente. Escribir al cliente es una
   * casilla y no algo automático: si la dirección se corrige por un dedazo, no
   * hace falta un correo; si es la primera vez que la sabe, sí.
   */
  async function guardaLugar() {
    if (!lugar) return;
    const b = lugar;
    setGuardandoLugar(true);
    const r = await api.post<{ avisado?: boolean; escrito?: boolean }>(`/visit-bookings/${b.id}/lugar`, {
      donde: donde.trim(),
      preguntarPor: preguntarPor.trim(),
      avisar: avisarDelLugar,
    });
    setGuardandoLugar(false);
    if (!r.ok) { setResultado({ mal: true, texto: r.error || 'No se ha podido guardar el sitio.' }); return; }
    setLugar(null);
    setDonde('');
    setPreguntarPor('');
    setResultado(
      !r.data?.escrito
        ? { mal: false, texto: 'Apuntado. Al cliente no se le ha escrito.' }
        : r.data?.avisado
          ? { mal: false, texto: `Apuntado. ${b.buyer_name || 'El cliente'} ya sabe dónde es.` }
          : { mal: true, texto: `Apuntado, pero no hemos podido escribir a ${b.buyer_name || 'el cliente'}. Llámale al ${b.buyer_phone || 'teléfono que tengas'}.` }
    );
    load();
  }

  useEffect(() => { load(); }, [load]);

  async function confirmarCancelacion() {
    if (!cancelar) return;
    const b = cancelar;
    setCancelling(b.id);
    const r = await api.post<{ avisado?: boolean; anuncioQuitado?: boolean }>(
      `/visit-bookings/${b.id}/cancel`, { motivo, quitarElAnuncio });
    const pedidoQuitarlo = quitarElAnuncio;
    setCancelling(null);
    setCancelar(null);
    setMotivo('');
    setQuitarElAnuncio(false);
    if (!r.ok) { setResultado({ mal: true, texto: 'No se ha podido cancelar la visita.' }); return; }
    // Recargar y no filtrar a mano: la cancelada puede estar en las confirmadas
    // o en las pendientes, y quitarla de una sola dejaba la otra lista mintiendo.
    load();
    // Que el aviso saliera o no cambia lo que hay que hacer después, así que se
    // dice; no se da por hecho que el cliente está enterado.
    // Y si se pidió quitar el anuncio, si se ha quitado de verdad: uno que se
    // cree quitado y sigue puesto trae la siguiente visita al mismo coche.
    const delAnuncio = !pedidoQuitarlo ? ''
      : r.data?.anuncioQuitado ? ' El anuncio ya no sale en el marketplace.'
      : ' El anuncio no se ha podido quitar: hazlo desde Marketplace.';
    setResultado(
      r.data?.avisado
        ? { mal: pedidoQuitarlo && !r.data?.anuncioQuitado, texto: `Visita cancelada. ${b.buyer_name || 'El cliente'} ya lo sabe: le hemos escrito.${delAnuncio}` }
        : { mal: true, texto: `Visita cancelada, pero no hemos podido avisar a ${b.buyer_name || 'el cliente'}. Llámale al ${b.buyer_phone || 'teléfono que tengas'}.${delAnuncio}` }
    );
  }

  const filtered = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [b.buyer_name, b.buyer_email, b.vehicle_title, b.offer_id, b.buyer_phone]
      .some((v) => (v || '').toLowerCase().includes(q));
  });

  // Stats
  const today = todayIso();
  const todayCount = bookings.filter((b) => b.starts_at.slice(0, 10) === today).length;
  const weekEnd = inNDays(7);
  // Con suelo, no solo techo. Sin el `>= today`, en «Todas» —que ahora empieza
  // tres meses atrás— «esta semana» contaba también todo lo ya pasado.
  const weekCount = bookings.filter(
    (b) => b.starts_at.slice(0, 10) >= today && b.starts_at.slice(0, 10) <= weekEnd
  ).length;

  const grouped = groupByDay(filtered);
  const days = Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda de visitas"
        subtitle="Gestión de citas confirmadas"
      />

      {resultado && (
        <div className={
          'flex items-start gap-2.5 rounded-lg border px-4 py-2.5 text-[13px] ' +
          (resultado.mal
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800')
        } role={resultado.mal ? 'alert' : undefined}>
          <span className="flex-1">{resultado.texto}</span>
          <button onClick={() => setResultado(null)} className="font-bold shrink-0" aria-label="Cerrar">✕</button>
        </div>
      )}

      {/* Las pendientes van arriba y no dentro del listado: son trabajo por
          hacer, y una lista donde se mezclan con las cerradas no se despacha. */}
      {pendientes.length > 0 && (
        <div className="rounded-xl border border-acento bg-acento-tenue overflow-hidden">
          <div className="px-4 py-3 border-b border-acento/50">
            <h2 className="text-sm font-bold text-acento-texto">
              {pendientes.length === 1 ? 'Una visita por confirmar' : `${pendientes.length} visitas por confirmar`}
            </h2>
            {/* En singular cuando hay una: el titular ya dice cuántas, y decir
                «cayeron» de una sola se lee como un descuido. */}
            <p className="text-[12.5px] text-acento-texto/85 mt-0.5 max-w-3xl">
              {pendientes.length === 1
                ? 'El cliente ha pedido esta hora y todavía no se la hemos dado: lo sabe, y no ha recibido calendario. Llama a quien tiene el coche y confírmala o proponle otra.'
                : 'Los clientes han pedido estas horas y todavía no se las hemos dado: lo saben, y no han recibido calendario. Llama a quien tiene el coche y confírmalas o proponles otra.'}
            </p>
          </div>
          <ul className="divide-y divide-acento/40">
            {pendientes.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="shrink-0 text-center w-16">
                  <div className="text-lg font-black text-acento-texto leading-none tabular-nums">{fmtTime(b.starts_at)}</div>
                  <div className="text-[10px] text-acento-texto/70 tabular-nums">{fmtDate(b.starts_at)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-600 text-sm truncate">{b.vehicle_title || b.offer_id}</span>
                    {/* La fecha que pidió ya pasó y nadie le contestó. Sale marcado
                        porque lo que toca no es confirmarla: es llamarle. */}
                    {new Date(b.starts_at).getTime() < Date.now() && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        se pasó la fecha
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-brand-400">
                    {b.buyer_name || '–'}{b.buyer_phone ? ` · ${b.buyer_phone}` : ''}
                  </div>
                  {/* A quién hay que llamar. El sistema no le avisa nunca, así
                      que lo primero que hace falta aquí es su nombre y dónde
                      está su teléfono. */}
                  <QuienVende b={b} alApuntarTelefono={() => abreElTelefono(b)} />
                  {b.notes && <div className="text-xs text-brand-300 italic mt-0.5">"{b.notes}"</div>}
                </div>
                {/* Los tres finales de la llamada al concesionario: que sí, que
                    no a esa hora pero sí a otras, o que ya no hay coche. */}
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {/* Abre el diálogo en vez de confirmar de golpe: al cliente
                      hay que decirle dónde va y por quién preguntar, y quien
                      acaba de hablar con el concesionario lo tiene delante. */}
                  <Boton tam="sm" variante="acento"
                         onClick={() => { setConfirmar(b); setDonde(b.meeting_place || ''); setPreguntarPor(b.meeting_contact || ''); }}>
                    Confirmar
                  </Boton>
                  <Boton tam="sm" variante="secundario"
                         onClick={() => { setProponer(b); setHoras([{ dia: '', hora: '' }]); setMensaje(null); }}>
                    Propone otras horas
                  </Boton>
                  {/* El final del camino de «Propone otras horas»: el cliente
                      contesta por WhatsApp y hay que meter esa hora. Sin esto había
                      que confirmarla a la hora vieja y moverla después, con lo que
                      al cliente le llegaba una confirmación de una hora que nadie
                      había acordado. */}
                  <Boton tam="sm" variante="secundario" onClick={() => abreMover(b, true)}>
                    El cliente ha elegido hora
                  </Boton>
                  <Boton tam="sm" variante="fantasma" onClick={() => { setCancelar(b); setMotivo(''); setQuitarElAnuncio(false); }}>
                    Cancelar cita
                  </Boton>
                  <button onClick={() => verRastro(b)}
                          className="px-2 py-1 text-[11px] font-bold text-brand-400 underline underline-offset-2">
                    {rastroDe === b.id ? 'Ocultar' : 'Ver'} rastro
                  </button>
                </div>

                {rastroDe === b.id && (
                  <div className="w-full mt-1 rounded-lg border border-brand-200 bg-white px-4 py-3">
                    <PanelDelRastro
                      b={b} pasos={rastro}
                      alApuntar={(evento, texto) => apuntaPaso(b, evento, texto)}
                      nota={notaNueva} alEscribirNota={setNotaNueva}
                      guardandoNota={guardandoNota} alGuardarNota={() => guardaNota(b)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Las que ya pasaron y nadie ha dicho cómo acabaron.
          Van en su propio bloque y no dentro de la lista porque la lista enseña
          de hoy en adelante: estas son de antes de hoy, y son lo único que
          convierte una visita concertada en un número. Sin esto, la visita se
          queda confirmada para siempre y nadie sabe si el cliente fue. */}
      {porCerrar.length > 0 && (
        <div className="rounded-xl border border-brand-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-100">
            <h2 className="text-sm font-bold text-brand-600">
              {porCerrar.length === 1 ? 'Una visita por cerrar' : `${porCerrar.length} visitas por cerrar`}
            </h2>
            <p className="text-[12.5px] text-brand-400 mt-0.5 max-w-3xl">
              Ya han pasado y nadie ha dicho cómo acabaron. Es lo único que dice si de las
              visitas que concertamos sale algo.
            </p>
          </div>
          <ul className="divide-y divide-brand-100">
            {porCerrar.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="shrink-0 text-center w-16">
                  <div className="text-lg font-black text-brand-500 leading-none tabular-nums">{fmtTime(b.starts_at)}</div>
                  <div className="text-[10px] text-brand-300 tabular-nums">{fmtDate(b.starts_at)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-brand-600 text-sm truncate">{b.vehicle_title || b.offer_id}</div>
                  <div className="text-xs text-brand-400">
                    {b.buyer_name || '–'}{b.buyer_phone ? ` · ${b.buyer_phone}` : ''}
                  </div>
                  <QuienVende b={b} alApuntarTelefono={() => abreElTelefono(b)} />
                </div>
                <div className="shrink-0">
                  <ComoAcabo b={b} cerrando={cerrando === b.id}
                             alCerrar={(r) => cierraLaVisita(b, r)} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* El teléfono de quien vende, cuando no lo hay.
          Se guarda por vendedor y no por coche: es suyo, y con ponerlo una vez
          quedan cubiertos todos sus coches. Hoy hay 4.316 ofertas de
          concesionario y ningún teléfono, así que el sitio donde se pedía era
          el equivocado. */}
      {telefonoDe && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setTelefonoDe(null)} role="dialog" aria-modal="true" aria-label="Apuntar el teléfono de quien vende">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">El teléfono de {telefonoDe.seller}</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                Queda apuntado para todos sus coches, no solo para este.
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="block text-xs font-medium text-brand-500">
                Teléfono
                <input value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} maxLength={40}
                       placeholder="El fijo de la sede o el móvil del comercial"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <label className="block text-xs font-medium text-brand-500">
                Por quién preguntar (si hay alguien fijo)
                <input value={contactoNuevo} onChange={(e) => setContactoNuevo(e.target.value)} maxLength={120}
                       placeholder="Nombre de quien lleva las ventas"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <label className="block text-xs font-medium text-brand-500">
                Cuándo se le puede llamar
                <input value={horarioNuevo} onChange={(e) => setHorarioNuevo(e.target.value)} maxLength={200}
                       placeholder="L-V de 9 a 14 y de 16 a 20, S de 10 a 13"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <p className="text-[12px] text-brand-300">
                Estos datos son para llamar nosotros: <b>no se le mandan nunca al cliente</b>. Si
                un coche suyo está en otra sede con otro número, ese se pone en la ficha de la
                oferta, en Marketplace, y manda sobre este.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setTelefonoDe(null)}>Volver</Boton>
              <Boton variante="acento" cargando={guardandoTelefono} onClick={guardaElTelefono}>
                Guardar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setConfirmar(null)} role="dialog" aria-modal="true" aria-label="Confirmar la visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Confirmar la visita</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {confirmar.buyer_name || confirmar.buyer_email} · {fmtDate(confirmar.starts_at)} a las {fmtTime(confirmar.starts_at)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-brand-400">
                Estos dos datos van en el correo del cliente y en sus recordatorios.
                Los tienes de la llamada {alQueVende(confirmar.seller_type)}.
              </p>
              <label className="block text-xs font-medium text-brand-500">
                Dónde es
                <input value={donde} onChange={(e) => setDonde(e.target.value)} maxLength={200}
                       placeholder="Calle y número, o el nombre del sitio"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <label className="block text-xs font-medium text-brand-500">
                Por quién preguntar
                <input value={preguntarPor} onChange={(e) => setPreguntarPor(e.target.value)} maxLength={120}
                       placeholder="Nombre de quien le atiende"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <p className="text-[12px] text-brand-300">
                Si los dejas vacíos la cita se confirma igual, y al cliente se le dice que le
                confirmaremos la dirección antes de la visita.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setConfirmar(null)}>Volver</Boton>
              <Boton variante="acento" cargando={confirmando === confirmar.id} onClick={() => confirmar && confirmarVisita(confirmar)}>
                Confirmar y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}


      {lugar && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setLugar(null)} role="dialog" aria-modal="true" aria-label="Dónde es la visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Dónde es y por quién preguntar</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {lugar.buyer_name || lugar.buyer_email} · {fmtDate(lugar.starts_at)} a las {fmtTime(lugar.starts_at)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <label className="block text-xs font-medium text-brand-500">
                Dónde es
                <input value={donde} onChange={(e) => setDonde(e.target.value)} maxLength={200}
                       placeholder="Calle y número, o el nombre del sitio"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              <label className="block text-xs font-medium text-brand-500">
                Por quién preguntar
                <input value={preguntarPor} onChange={(e) => setPreguntarPor(e.target.value)} maxLength={120}
                       placeholder="Nombre de quien le atiende"
                       className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
              </label>
              {lugar.status === 'confirmed' ? (
                <label className="flex items-start gap-2 text-[12.5px] text-brand-500">
                  <input type="checkbox" checked={avisarDelLugar} className="mt-0.5"
                         onChange={(e) => setAvisarDelLugar(e.target.checked)} />
                  <span>
                    Escribir al cliente con estos datos. La hora no cambia y no se le manda
                    calendario otra vez.
                  </span>
                </label>
              ) : (
                <p className="text-[12px] text-brand-300">
                  La cita todavía está pendiente, así que al cliente no se le escribe: estos
                  datos irán en el correo de cuando se confirme.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setLugar(null)}>Volver</Boton>
              <Boton variante="acento" cargando={guardandoLugar}
                     disabled={!donde.trim() && !preguntarPor.trim()}
                     onClick={guardaLugar}>
                Guardar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {proponer && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4 py-8 overflow-y-auto"
             onClick={() => { setProponer(null); setMensaje(null); setBorrador(null); }} role="dialog" aria-modal="true"
             aria-label="Horas que propone quien tiene el coche">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-brand-200 shadow-2xl my-auto"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Horas que propone {elQueVende(proponer.seller_type)}</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {proponer.buyer_name || proponer.buyer_email} · {proponer.vehicle_title || proponer.offer_id}
              </p>
            </div>

            {borrador ? (
              /* Lo que va a leer el cliente, tal cual. El correo va dentro de un
                 marco aparte para que se vea como se va a ver y para que sus
                 estilos no se mezclen con los de esta pantalla. */
              <>
                <div className="px-6 py-5 space-y-4">
                  <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-500">
                    Esto es lo que va a leer. Todavía no se ha mandado nada.
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-1.5">
                      Correo {borrador.sinCorreo
                        ? <span className="text-red-600 normal-case">· esta cita no tiene correo del cliente, así que no saldrá</span>
                        : <span className="text-brand-400 normal-case font-medium">· a {borrador.email}</span>}
                    </div>
                    <div className="text-[13px] text-brand-600 font-semibold mb-1.5">{borrador.asunto}</div>
                    <iframe title="El correo, como lo va a ver" srcDoc={borrador.correo} sandbox=""
                            className="w-full h-72 rounded-lg border border-brand-200 bg-white" />
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-1.5">
                      WhatsApp {borrador.sinTelefono
                        ? <span className="text-amber-700 normal-case">· esta cita no tiene teléfono</span>
                        : <span className="text-brand-400 normal-case font-medium">· al {borrador.telefono}</span>}
                    </div>
                    <pre className="whitespace-pre-wrap rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-600 font-sans">
                      {borrador.texto}
                    </pre>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
                  <Boton variante="fantasma" onClick={() => setBorrador(null)}>Cambiar las horas</Boton>
                  <Boton variante="acento" cargando={proponiendo} onClick={mandarPropuesta}>
                    Enviar al cliente
                  </Boton>
                </div>
              </>
            ) : !mensaje ? (
              <>
                <div className="px-6 py-5 space-y-3">
                  <p className="text-[13px] text-brand-400">
                    Pon las que te haya dado. Se las mandamos al cliente para que elija, y la cita
                    sigue pendiente hasta que conteste.
                  </p>
                  {horas.map((h, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <label className="flex-1 text-xs font-medium text-brand-500">
                        Día
                        <input type="date" value={h.dia}
                               onChange={(e) => setHoras(horas.map((x, j) => j === i ? { ...x, dia: e.target.value } : x))}
                               className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                      </label>
                      <label className="w-28 text-xs font-medium text-brand-500">
                        Hora
                        <input type="time" value={h.hora}
                               onChange={(e) => setHoras(horas.map((x, j) => j === i ? { ...x, hora: e.target.value } : x))}
                               className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                      </label>
                      {horas.length > 1 && (
                        <button onClick={() => setHoras(horas.filter((_, j) => j !== i))}
                                className="px-2 py-2 text-brand-300 hover:text-red-600" aria-label="Quitar esta hora">✕</button>
                      )}
                    </div>
                  ))}
                  {horas.length < 6 && (
                    <button onClick={() => setHoras([...horas, { dia: '', hora: '' }])}
                            className="text-[13px] font-medium text-acento-texto underline underline-offset-2">
                      Añadir otra hora
                    </button>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
                  <Boton variante="fantasma" onClick={() => setProponer(null)}>Volver</Boton>
                  <Boton variante="acento" cargando={proponiendo} onClick={preparaPropuesta}>
                    Ver lo que se le manda
                  </Boton>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-5 space-y-3">
                  {/* El correo es el camino que cierra la cita sin que nadie
                      teclee nada: el cliente pincha una hora y queda confirmada. */}
                  {mensaje.correo ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
                      Le hemos escrito a <b>{mensaje.email}</b> con las horas para pinchar. Si elige una,
                      la visita queda confirmada sola y te llega un aviso.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                      No ha salido el correo con las horas{mensaje.falloCorreo ? ` — ${mensaje.falloCorreo}` : ''}.
                      Tendrá que contestarte por WhatsApp y aplicarlo tú con «El cliente ha elegido hora».
                    </div>
                  )}
                  {mensaje.enviado ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
                      Mandado por WhatsApp al {mensaje.telefono}. Esto es lo que se le ha dicho:
                    </div>
                  ) : (
                    <div className="rounded-lg border border-acento bg-acento-tenue px-4 py-2.5 text-[13px] text-acento-texto">
                      No ha salido solo{mensaje.motivo ? ` — ${mensaje.motivo}` : ''}. Copia el mensaje y
                      mándaselo tú al <b>{mensaje.telefono || 'teléfono que tengas'}</b>. El paso ya está apuntado.
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-[13px] text-brand-600 font-sans">
                    {mensaje.texto}
                  </pre>
                </div>
                <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
                  <Boton variante="secundario"
                         onClick={() => { navigator.clipboard?.writeText(mensaje.texto); setResultado({ mal: false, texto: 'Mensaje copiado.' }); }}>
                    Copiar mensaje
                  </Boton>
                  <Boton variante="acento" onClick={() => { setProponer(null); setMensaje(null); }}>Hecho</Boton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {mover && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setMover(null)} role="dialog" aria-modal="true" aria-label="Cambiar la hora de la visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">
                {mover.status === 'pending' ? 'Poner la hora acordada' : 'Mover la visita a otra hora'}
              </h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {mover.buyer_name || mover.buyer_email} · {mover.vehicle_title || mover.offer_id}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-[13px] text-brand-400">
                Pidió el <b className="text-brand-600">{fmtDate(mover.starts_at)} a las {fmtTime(mover.starts_at)}</b>.
                {mover.status === 'pending'
                  ? ' Pon la hora que ha aceptado.'
                  : ` Pon la hora que te haya dado ${elQueVende(mover.seller_type)}.`}
              </p>
              {propuestas.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-brand-300 uppercase tracking-wide mb-1.5">
                    Las que le propusiste
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {propuestas.map((h, i) => {
                      const puesto = enCuadros(h);
                      const puesta = puesto.dia === nuevoDia && puesto.hora === nuevaHora;
                      return (
                        <button key={h} type="button"
                                onClick={() => { setNuevoDia(puesto.dia); setNuevaHora(puesto.hora); }}
                                className={`px-2.5 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                                  puesta
                                    ? 'bg-acento-tenue border-acento text-acento-texto font-bold'
                                    : 'bg-white border-brand-200 text-brand-500 hover:bg-brand-50'
                                }`}>
                          {i + 1}. {fmtDate(h)} a las {fmtTime(h)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-brand-300 mt-1.5">
                    Pincha la que te haya dicho. Si te ha dado otra distinta, escríbela abajo.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <label className="flex-1 text-xs font-medium text-brand-500">
                  Día
                  <input type="date" value={nuevoDia} onChange={(e) => setNuevoDia(e.target.value)}
                         className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                </label>
                <label className="w-32 text-xs font-medium text-brand-500">
                  Hora
                  <input type="time" value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)}
                         className="mt-1 w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento" />
                </label>
              </div>
              {/* No es lo mismo moverla nosotros que aplicar la que ha elegido
                  él: cambia el rastro y cambia lo que se le escribe. */}
              <label className="flex items-start gap-2.5 text-[13px] text-brand-500 cursor-pointer">
                <input type="checkbox" checked={laEligio} onChange={(e) => setLaEligio(e.target.checked)}
                       className="mt-0.5 accent-[var(--acento,#FFC400)]" />
                <span>
                  Esta hora <b>la ha elegido el cliente</b>, contestando a las que le propusimos
                </span>
              </label>

              <p className="text-[12px] text-brand-300">
                {laEligio
                  ? 'Se apunta que contestó y la cita queda confirmada. Se le escribe confirmándosela, no diciéndole que se la hemos movido.'
                  : 'La visita queda confirmada en la hora nueva: quien tenía que aprobarla es quien la ha propuesto. Al cliente se le escribe con las dos horas, el calendario y un enlace por si no le viene bien.'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setMover(null)}>Volver</Boton>
              <Boton variante="acento" cargando={moviendo} onClick={guardarNuevaHora}>
                Mover y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {cancelar && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setCancelar(null)} role="dialog" aria-modal="true" aria-label="Cancelar visita">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Cancelar la visita</h2>
              <p className="text-[12.5px] text-brand-400 mt-0.5">
                {cancelar.buyer_name || cancelar.buyer_email} · {cancelar.vehicle_title || cancelar.offer_id}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-brand-500" htmlFor="motivo-cancelacion">
                Motivo (se le cuenta al cliente)
              </label>
              <textarea
                id="motivo-cancelacion"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="El coche ya no está disponible, el taller cierra ese día…"
                className="w-full px-3 py-2 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
              />
              <p className="text-[12px] text-brand-300">
                Se le manda un correo avisándole, con un enlace para pedir otra hora. Si lo dejas
                vacío se le avisa igual, solo que sin explicación.
              </p>

              {/* El motivo más común es que el coche ya no está, y eso lo
                  acabas de saber por teléfono. Sin esto había que acordarse de
                  ir al Marketplace a quitarlo, y el siguiente cliente pedía
                  visita al mismo coche que no existe. */}
              <label className="flex items-start gap-2.5 text-[13px] text-brand-500 cursor-pointer pt-1">
                <input type="checkbox" checked={quitarElAnuncio} className="mt-0.5"
                       onChange={(e) => setQuitarElAnuncio(e.target.checked)} />
                <span>
                  El coche ya no está: <b>quitar también el anuncio</b>.
                  <span className="block text-[12px] text-brand-300">
                    Deja de salir en el marketplace. Se vuelve a poner desde Marketplace, con
                    «Publicar».
                  </span>
                </span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setCancelar(null)}>Volver</Boton>
              <Boton variante="peligro" cargando={cancelling === cancelar.id} onClick={confirmarCancelacion}>
                Cancelar y avisar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {/* Las tres cifras contaban solo confirmadas, así que con todo por
          confirmar salían tres ceros debajo de un bloque lleno de trabajo. La
          cuarta dice cuánto hay pendiente, que es lo que hay que despachar. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Por confirmar', value: pendientes.length, color: 'text-acento-texto', bg: 'bg-acento-tenue', border: 'border-acento' },
          { label: 'Confirmadas hoy', value: todayCount, color: 'text-brand-500', bg: 'bg-brand-50', border: 'border-brand-100' },
          { label: 'Esta semana', value: weekCount, color: 'text-brand-500', bg: 'bg-brand-50', border: 'border-brand-100' },
          { label: range === 'all' ? 'Total' : 'Período', value: bookings.length, color: 'text-brand-500', bg: 'bg-brand-50', border: 'border-brand-100' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs font-semibold text-brand-300 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-brand-100 rounded-lg p-1 gap-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${range === r ? 'bg-white shadow-sm text-brand-600' : 'text-brand-400 hover:text-brand-500'}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar comprador, vehículo…"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-brand-400 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition-colors"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-brand-300">
          <div className="text-center">
            <div className="flex justify-center mb-3 animate-pulse"><Icono nombre="calendario" tam={34} /></div>
            <div className="text-sm">Cargando agenda…</div>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="flex justify-center mb-4 text-brand-200"><Icono nombre="bandeja" tam={42} /></div>
            <div className="font-semibold text-brand-400">Sin citas en este período</div>
            <div className="text-sm text-brand-300 mt-1">Prueba con un rango de fechas más amplio</div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    isToday(day) ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-400'
                  }`}
                >
                  {isToday(day) ? '● HOY' : fmtDate(day + 'T12:00:00')}
                </div>
                <div className="text-xs text-brand-300 font-medium">
                  {grouped[day].length} cita{grouped[day].length !== 1 ? 's' : ''}
                </div>
                <div className="flex-1 h-px bg-brand-100" />
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {grouped[day].map((b) => {
                  const isExpanded = expandedId === b.id;
                  const isProf = isProfessional(b);

                  return (
                    // Abre y cierra la cabecera, no la tarjeta entera. Estaba en la
                    // tarjeta, y entonces pinchar dentro del detalle —en el cuadro de
                    // la nota, sin ir más lejos— la cerraba: no se podía escribir.
                    <div
                      key={b.id}
                      className="bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {/* Left accent bar */}
                      <div className="flex">
                        <div className={`w-1 shrink-0 ${isProf ? 'bg-acento-tenue0' : 'bg-brand-300'}`} />
                        <div className="flex-1">
                          {/* Main row */}
                          <div className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                               onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                            {/* Time block */}
                            <div className="shrink-0 text-center w-16">
                              <div className="text-xl font-black text-brand-600 leading-none tabular-nums">
                                {fmtTime(b.starts_at)}
                              </div>
                              <div className="text-[10px] text-brand-300 mt-0.5 tabular-nums">
                                {fmtTime(b.ends_at)}
                              </div>
                            </div>

                            <div className="w-px h-10 bg-brand-100 shrink-0" />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-brand-600 text-sm truncate">
                                {b.vehicle_title || b.offer_id}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs font-semibold text-brand-500">{b.buyer_name || '–'}</span>
                                {b.buyer_phone && (
                                  <span className="text-xs text-brand-300">· {b.buyer_phone}</span>
                                )}
                                {/* Solo mientras está pendiente.
                                    La marca dice que ese hueco lo generó el sistema —L a V de 9 a
                                    18— y que nadie había acordado esa hora. En cuanto alguien llama
                                    al concesionario y la confirma, deja de ser verdad: la hora ya
                                    está acordada, y seguir avisando de lo contrario confunde. */}
                                {b.slot_source === 'auto' && b.status === 'pending' && (
                                  <span title="Este hueco lo generó el sistema; nadie ha acordado aún esa hora"
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                    hora propuesta por el sistema
                                  </span>
                                )}
                                {/*
                                  * Lo contestó él al pedir la visita, y hasta ahora se quedaba
                                  * guardado en una tabla que no miraba nadie. Es la operación que
                                  * deja margen y la que se atiende a mano: hay que saberlo antes
                                  * de la visita, no descubrirlo en el parking.
                                  */}
                                {b.quiere_financiar && (
                                  <span title="Dijo que le interesaría financiarlo. Llámale antes de la visita."
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                                    quiere financiar
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Type badge */}
                            <div className="shrink-0 flex items-center gap-2">
                              {/* Cómo acabó, sin desplegar: una lista de visitas
                                  pasadas se lee para ver cuáles quedan por
                                  cerrar, y para eso hay que verlo de un vistazo. */}
                              {b.resultado ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TONO[b.resultado as keyof typeof TONO] ?? 'bg-brand-50 text-brand-500 border-brand-200'}`}>
                                  {comoAcabo(b.resultado)}
                                </span>
                              ) : estaSinCerrar(b) ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  sin cerrar
                                </span>
                              ) : null}
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                isProf ? 'bg-acento-tenue text-acento-texto' : 'bg-brand-100 text-brand-400'
                              }`}>
                                {seccionDelCoche(b)}
                              </span>
                              <span className="text-brand-300 text-xs">{isExpanded ? '▾' : '▸'}</span>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-brand-50 bg-brand-50 px-5 py-4">
                              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs mb-4">
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Email</div>
                                  <div className="text-brand-500 font-medium">{b.buyer_email}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Teléfono</div>
                                  <div className="text-brand-500 font-medium">{b.buyer_phone || '–'}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Oferta</div>
                                  {/* Enlace al anuncio de verdad: quien va a llamar al
                                      concesionario necesita ver el coche, y copiar un
                                      identificador a mano se hace mal. */}
                                  {enlaceOferta(b.offer_id) ? (
                                    <a href={enlaceOferta(b.offer_id)} target="_blank" rel="noreferrer"
                                       onClick={(e) => e.stopPropagation()}
                                       className="font-mono text-acento-texto text-[10px] underline underline-offset-2 break-all">
                                      {b.offer_id} ↗
                                    </a>
                                  ) : (
                                    <div className="font-mono text-brand-300 text-[10px] break-all">{b.offer_id}</div>
                                  )}
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Quién vende</div>
                                  {b.seller
                                    ? <QuienVende b={b} alApuntarTelefono={() => abreElTelefono(b)} />
                                    : <div className="text-brand-300">La oferta ya no está publicada</div>}
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Reservado</div>
                                  <div className="text-brand-400">{new Date(b.created_at).toLocaleDateString('es-ES')}</div>
                                </div>
                                {/* Dónde es y por quién preguntar. Se enseñan siempre,
                                    también vacíos: si no están, alguien tiene que
                                    verlo y apuntarlos antes de que llegue el día. */}
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Dónde es</div>
                                  {b.meeting_place
                                    ? <div className="text-brand-500 font-medium">{b.meeting_place}</div>
                                    : <div className="text-amber-700">Sin apuntar</div>}
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Preguntar por</div>
                                  {b.meeting_contact
                                    ? <div className="text-brand-500 font-medium">{b.meeting_contact}</div>
                                    : <div className="text-amber-700">Sin apuntar</div>}
                                </div>
                                {b.notes && (
                                  <div className="col-span-2">
                                    <div className="text-[10px] font-bold text-brand-300 uppercase tracking-wide mb-0.5">Notas</div>
                                    <div className="text-brand-400 italic">"{b.notes}"</div>
                                  </div>
                                )}
                              </div>

                              {/* Cómo acabó, encima de los botones y separado:
                                  es lo único que queda por hacer en una visita
                                  que ya ha pasado, y mezclado entre «Otra hora»
                                  y «Llamar» no se ve. */}
                              {(b.resultado || estaSinCerrar(b)) && (
                                <div className="mb-3 pb-3 border-b border-brand-100"
                                     onClick={(e) => e.stopPropagation()}>
                                  <ComoAcabo b={b} cerrando={cerrando === b.id}
                                             alCerrar={(r) => cierraLaVisita(b, r)} />
                                </div>
                              )}

                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCancelar(b); setMotivo(''); setQuitarElAnuncio(false); }}
                                  disabled={cancelling === b.id}
                                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                  {cancelling === b.id ? 'Cancelando…' : '✕ Cancelar cita'}
                                </button>
                                {/* Una confirmada también se mueve: el concesionario
                                    puede cambiar de día después de haber dicho que sí. */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); abreMover(b); }}
                                  className="px-3 py-1.5 text-xs font-bold text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                                >
                                  Otra hora
                                </button>
                                {/* También en las confirmadas: lo que pasa después
                                    de confirmar —que el cliente llame, que cambie
                                    algo— hay que poder apuntarlo igual. */}
                                {/* La dirección concreta llega casi siempre después de
                                    confirmar, y sin esto se quedaba en la cabeza del que
                                    llamó. */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setLugar(b); setDonde(b.meeting_place || ''); setPreguntarPor(b.meeting_contact || ''); setAvisarDelLugar(!b.meeting_place); }}
                                  className="px-3 py-1.5 text-xs font-bold text-brand-600 bg-white border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                                >
                                  {b.meeting_place || b.meeting_contact ? 'Cambiar el sitio' : 'Apuntar el sitio'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); verRastro(b); }}
                                  className="px-3 py-1.5 text-xs font-bold text-brand-400 underline underline-offset-2"
                                >
                                  {rastroDe === b.id ? 'Ocultar' : 'Ver'} rastro y notas
                                </button>
                                <a
                                  href={`mailto:${b.buyer_email}?subject=Tu visita al ${b.vehicle_title || 'vehículo'}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-1.5 text-xs font-bold text-acento-texto bg-acento-tenue border border-acento rounded-lg hover:bg-acento-tenue transition-colors"
                                >
                                  Contactar
                                </a>
                                {b.buyer_phone && (
                                  <a
                                    href={`tel:${b.buyer_phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                                  >
                                    Llamar
                                  </a>
                                )}
                              </div>

                              {rastroDe === b.id && (
                                <div className="mt-3 rounded-lg border border-brand-200 bg-white px-4 py-3">
                                  <PanelDelRastro
                                    b={b} pasos={rastro}
                                    alApuntar={(evento, texto) => apuntaPaso(b, evento, texto)}
                                    nota={notaNueva} alEscribirNota={setNotaNueva}
                                    guardandoNota={guardandoNota} alGuardarNota={() => guardaNota(b)}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
