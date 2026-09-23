/**
 * La revisión del taller: lo que hace que el coche esté comprobado.
 *
 * Las cinco puertas del encargo son cosas del **cliente** — su coche, sus
 * papeles, su tasación, su informe, sus horas—. Esta es la nuestra, y hasta
 * ahora no existía: se podía pulsar «Publicar» y sacar un anuncio que dice que
 * el coche está comprobado sin que nadie lo hubiera comprobado.
 *
 * Es el mismo fallo que ya se tapó con el informe de estado, pero en la parte
 * que ponemos nosotros. Y es justo la que diferencia nuestro anuncio de uno de
 * Milanuncios: el informe lo hace una cámara y esto lo hace un mecánico.
 *
 * ## Lo que esto NO es
 *
 * **No es la garantía mecánica.** Esa es un producto aparte que el cliente
 * contrata o no, y no define el sello. Lo dijo Juan y estaba mal escrito en el
 * manual durante unos días.
 *
 * **Y no la hace una foto.** El informe de estado enseña los daños que se ven;
 * de la mecánica no dice nada, y mientras no haya una revisión física el coche
 * no puede anunciarse como comprobado.
 */

/**
 * Por dónde va.
 *
 * Tres estados y no cuatro: entre «encargada» y «hecha» no hay nada que el ERP
 * pueda saber. Cuando el coche está en el taller, lo que hay es una llamada.
 */
export const ESTADOS = ['Por llevar', 'En el taller', 'Hecha'] as const;
export type Estado = (typeof ESTADOS)[number];

export function esUnEstado(v: unknown): v is Estado {
  return (ESTADOS as readonly string[]).includes(String(v ?? '').trim());
}

/** Qué toca hacer en cada uno. Sale en la pantalla, al lado del estado. */
export const QUE_TOCA: Record<Estado, string> = {
  'Por llevar': 'Darle cita en un taller de la red y avisar al cliente',
  'En el taller': 'Esperando a que lo revisen',
  'Hecha': 'Ya se sabe lo que hay',
};

/**
 * Cómo salió.
 *
 * `con_reparos` no es un no: es un coche que se puede vender diciendo lo que
 * tiene. La mayoría de los coches de diez años caen ahí, y tratarlo como un
 * fallo dejaría fuera medio catálogo.
 *
 * `no_se_puede_vender` es la puerta cerrada: el taller ha visto algo que hace
 * que anunciarlo sea vender un problema. Ahí no se publica, y al cliente se le
 * llama.
 */
export const RESULTADOS = ['bien', 'con_reparos', 'no_se_puede_vender'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export function esUnResultado(v: unknown): v is Resultado {
  return (RESULTADOS as readonly string[]).includes(String(v ?? '').trim());
}

export const ETIQUETA: Record<Resultado, string> = {
  bien: 'Bien, sin nada que contar',
  con_reparos: 'Se puede vender, contando lo que tiene',
  no_se_puede_vender: 'No se puede vender así',
};

/**
 * Si la revisión deja publicar el coche.
 *
 * Hace falta que esté **hecha** y que el resultado no sea el que cierra la
 * puerta. Una revisión encargada y sin resultado no vale: lo que se promete en
 * el anuncio no es que lo hayamos llevado, es que lo han mirado.
 *
 * Y si el taller dijo que no se puede vender, no se publica aunque el cliente
 * lo haya traído todo. Esa es la única de las seis puertas que no depende de él.
 */
export function elCocheEstaComprobado(
  r: { estado?: unknown; resultado?: unknown } | null | undefined,
): boolean {
  if (!r) return false;
  if (String(r.estado ?? '').trim() !== 'Hecha') return false;
  if (!esUnResultado(r.resultado)) return false;
  return r.resultado !== 'no_se_puede_vender';
}

/**
 * Y por qué no, dicho para quien tiene que llamar al cliente.
 *
 * Cadena vacía cuando sí se puede. Devuelve la frase y no un booleano porque al
 * otro lado hay alguien explicándoselo por teléfono, y «false» no se explica.
 */
export function porQueNoEstaComprobado(
  r: { estado?: unknown; resultado?: unknown } | null | undefined,
): string {
  if (!r) return 'No se ha llevado al taller todavía';
  const estado = String(r.estado ?? '').trim();
  if (estado === 'Por llevar') return 'Falta darle cita en el taller';
  if (estado === 'En el taller') return 'Está en el taller, esperando resultado';
  if (!esUnResultado(r.resultado)) return 'La revisión está hecha pero nadie ha apuntado cómo salió';
  if (r.resultado === 'no_se_puede_vender') return 'El taller dice que así no se puede vender';
  return '';
}

/**
 * Si todavía se está esperando al taller.
 *
 * No es lo contrario de `elCocheEstaComprobado`: un coche que el taller ha
 * rechazado tampoco está comprobado, pero ya **no espera a nadie**. Mezclar los
 * dos casos dejaría ese coche en la lista de «listos para el taller» el resto
 * de su vida, cuando lo que necesita es una llamada al cliente.
 */
export function sigueEsperandoAlTaller(
  r: { estado?: unknown; resultado?: unknown } | null | undefined,
): boolean {
  return String(r?.estado ?? '').trim() !== 'Hecha';
}

/**
 * Y si el taller lo ha tumbado.
 *
 * Este coche no se publica y el cliente no lo sabe: lleva un encargo firmado y
 * su coche no va a salir. Sin un aviso propio se queda quieto sin que nadie se
 * entere, porque las demás listas lo dan por resuelto.
 */
export function elTallerLoTumbo(
  r: { estado?: unknown; resultado?: unknown } | null | undefined,
): boolean {
  return !sigueEsperandoAlTaller(r) && r?.resultado === 'no_se_puede_vender';
}

/** Lo que nos cuesta cada una. Es el precio que da Norauto. */
export const LO_QUE_CUESTA = 60;

export const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_revisiones_taller (
    id            TEXT PRIMARY KEY,
    vehicle_id    VARCHAR(64) NOT NULL,
    encargo_id    TEXT,
    estado        TEXT NOT NULL DEFAULT 'Por llevar',
    taller        TEXT NOT NULL DEFAULT '',
    cita_at       TIMESTAMPTZ,
    hecha_at      TIMESTAMPTZ,
    resultado     TEXT,
    notas         TEXT NOT NULL DEFAULT '',
    coste         NUMERIC(12,2),
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

/**
 * Lo que hace falta para que el cliente pueda ir.
 *
 * La ficha tenía el taller y el día, y con eso basta para nuestras cuentas. Para
 * el que tiene que llevar el coche, no: le falta **dónde** está ese taller y a
 * qué **hora** le esperan. El día ya viaja en `cita_at`, que es TIMESTAMPTZ y
 * siempre pudo llevar la hora; lo que no se guardaba en ningún sitio era la
 * dirección, y `avisado_at` es lo que separa «se lo hemos dicho» de «lo sabemos
 * nosotros».
 *
 * Va en un ALTER aparte y no dentro del CREATE: la tabla ya existe en
 * producción, y un `CREATE TABLE IF NOT EXISTS` no toca una tabla que está.
 */
export const ENSURE_COLUMNAS = `
  ALTER TABLE erp_revisiones_taller
    ADD COLUMN IF NOT EXISTS direccion  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS avisado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cliente_pidio    TEXT,
    ADD COLUMN IF NOT EXISTS cliente_pidio_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cliente_motivo   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS recordado_at     TIMESTAMPTZ,
    /*
     * Cual de los talleres del directorio es.
     *
     * El nombre se escribia a mano, asi que «Norauto Alcobendas» no era
     * ningun taller en concreto: no tenia direccion, ni agenda, ni a quien
     * facturarle los 60 EUR. Con el id es uno, el mismo que ve el cliente en
     * PopCar, y por eso la cita puede ocuparle la hora.
     *
     * Vacio en las de antes y en las que se escriban a mano: darles cita
     * tiene que seguir funcionando.
     */
    ADD COLUMN IF NOT EXISTS taller_id        TEXT NOT NULL DEFAULT ''`;

/**
 * Cuánto antes se le recuerda la cita.
 *
 * Treinta y seis horas, que con una pasada por la mañana es «el día de antes»
 * para cualquier hora del día siguiente: una cita mañana a las 18:00 entra en
 * la pasada de hoy a las 6:00.
 *
 * Y de paso cubre el mismo día. Una cita que se cierra con poca antelación no
 * tiene día de antes, y ese es justo el que más falta hace recordar.
 */
export const CUANTO_ANTES_SE_RECUERDA_MS = 36 * 60 * 60 * 1000;

/**
 * Y cuánto tiene que haber pasado desde que se le contó.
 *
 * Tres horas. Sin esto, dar la cita a las 9:00 para el día siguiente dispararía
 * el recordatorio en la pasada siguiente: dos correos casi seguidos diciendo lo
 * mismo, que es como se enseña a no leerlos.
 */
const DESDE_QUE_SE_LE_DIJO_MS = 3 * 60 * 60 * 1000;

/**
 * Si a esta cita le toca recordatorio ahora.
 *
 * Se manda **uno solo**, el día de antes —o el mismo día si no hubo día de
 * antes—. Dos recordatorios de lo mismo es spam nuestro, y el segundo enseña a
 * no leer el primero.
 *
 * Y no se le recuerda:
 *
 * - si no se le ha contado la cita todavía (`avisado_at`): no se recuerda algo
 *   que nunca se dijo;
 * - si ya nos ha pedido cambiarla o anularla: decirle «no olvides llevarlo
 *   mañana» después de haberle dicho «te llamamos» es contradecirnos;
 * - si la revisión ya está hecha o la cita ya pasó.
 */
export function elRecordatorioToca(
  r: {
    estado?: unknown;
    cita_at?: unknown;
    avisado_at?: unknown;
    recordado_at?: unknown;
    cliente_pidio?: unknown;
  } | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!r) return false;
  if (String(r.estado ?? '').trim() === 'Hecha') return false;
  if (!r.avisado_at) return false;
  if (r.recordado_at) return false;
  if (esLoQuePuedePedir(r.cliente_pidio)) return false;
  if (!r.cita_at) return false;

  const cita = new Date(r.cita_at as string).getTime();
  if (!Number.isFinite(cita)) return false;

  const falta = cita - ahora.getTime();
  if (falta <= 0) return false;
  if (falta > CUANTO_ANTES_SE_RECUERDA_MS) return false;

  const avisado = new Date(r.avisado_at as string).getTime();
  if (Number.isFinite(avisado) && ahora.getTime() - avisado < DESDE_QUE_SE_LE_DIJO_MS) return false;

  return true;
}

/**
 * Las que pueden tocar, para no traerse la tabla entera.
 *
 * Filtra en SQL lo que es barato y seguro de filtrar ahí —lo que ya pasó, lo
 * hecho, lo ya recordado— y deja la decisión a `elRecordatorioToca`, que es
 * donde está escrita la regla y donde se puede probar sin base de datos.
 */
export const SQL_CANDIDATAS_A_RECORDATORIO = `
  SELECT r.*, e.cliente_email, e.cliente_nombre,
         v.plate, v.brand, v.model
    FROM erp_revisiones_taller r
    LEFT JOIN moveadvisor_user_vehicles v ON v.id = r.vehicle_id
    LEFT JOIN erp_encargos_venta e
           ON e.vehicle_id = r.vehicle_id AND e.cerrado_at IS NULL
   WHERE r.estado <> 'Hecha'
     AND r.avisado_at IS NOT NULL
     AND r.recordado_at IS NULL
     AND r.cita_at IS NOT NULL
     AND r.cita_at > NOW()
     AND r.cita_at < NOW() + INTERVAL '36 hours'
   ORDER BY r.cita_at`;

/**
 * Lo que el cliente puede pedir sobre su cita, desde su panel.
 *
 * Dos cosas y no más: que se la cambiemos o que se la quitemos. No hay «elegir
 * otra hora» —las horas las da el taller por teléfono, no las tenemos— y por eso
 * lo que se recoge es la intención y el motivo, y lo demás es una llamada.
 *
 * Que pueda decirlo desde el panel es lo que evita el caso peor: el que no puede
 * ir, no contesta al correo y sencillamente no aparece. Eso nos cuesta la cita,
 * retrasa su anuncio y no lo sabe nadie hasta que llama el taller.
 */
export const LO_QUE_PUEDE_PEDIR = ['cambio', 'cancelar'] as const;
export type LoQuePidio = (typeof LO_QUE_PUEDE_PEDIR)[number];

export function esLoQuePuedePedir(v: unknown): v is LoQuePidio {
  return (LO_QUE_PUEDE_PEDIR as readonly string[]).includes(String(v ?? '').trim());
}

/** Dicho para quien lo lee en el ERP y tiene que coger el teléfono. */
export const LO_QUE_PIDIO: Record<LoQuePidio, string> = {
  cambio: 'El cliente pide que le cambiemos la cita',
  cancelar: 'El cliente pide que le anulemos la cita',
};

/**
 * Si este coche tiene una petición del cliente sin atender.
 *
 * Una revisión ya hecha no cuenta: si pidió el cambio y el coche acabó pasando
 * por el taller, lo que pidió ya no espera a nadie. Sin esto, el aviso se
 * quedaría encendido para siempre sobre algo que ya ocurrió.
 */
export function elClienteEsperaRespuesta(
  r: { estado?: unknown; cliente_pidio?: unknown } | null | undefined,
): boolean {
  if (!r) return false;
  if (String(r.estado ?? '').trim() === 'Hecha') return false;
  return esLoQuePuedePedir(r.cliente_pidio);
}

/**
 * Todos los clientes están en España.
 *
 * Sin zona se usa la del servidor, y en Vercel es UTC: a una cita de las 10:00
 * el correo le pondría las 08:00. El ERP la enseñaría bien —eso lo pinta el
 * navegador— así que las dos pantallas dirían cosas distintas y solo se vería
 * mirando el correo que le llega al cliente. Ya pasó con las visitas.
 */
export const ZONA = 'Europe/Madrid';

/** «lunes, 22 de septiembre», en la hora del cliente. */
export function elDiaDeLaCita(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA,
  });
}

/** «10:30», o cadena vacía si la cita se guardó sin hora. */
export function laHoraDeLaCita(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: ZONA,
  });
}

/**
 * Si a esta cita se le puede avisar al cliente.
 *
 * Hace falta el taller y el día: un correo que diga «tu coche tiene cita» sin
 * decir cuándo obliga a llamar para preguntar, y entonces el correo ha hecho
 * trabajo de más. La dirección no se exige —hay talleres que todo el mundo
 * ubica— pero se manda si está.
 */
export function porQueNoSeLePuedeAvisar(
  /** La dirección entra y no se mira: está aquí para que se lea que no se exige. */
  r: { taller?: unknown; cita_at?: unknown; direccion?: unknown } | null | undefined,
): string {
  if (!r) return 'No hay ninguna cita que contarle';
  if (!String(r.taller ?? '').trim()) return 'Falta a qué taller se lleva';
  if (!r.cita_at) return 'Falta el día de la cita';
  return '';
}

/**
 * Una revisión viva por coche.
 *
 * Sin esto, dar cita dos veces deja dos fichas y la que decide si se publica es
 * la que salga primero. Las hechas no cuentan: un coche que vuelve el año que
 * viene se revisa otra vez.
 */
export const ENSURE_UNA_VIVA = `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_revision_viva_por_coche
    ON erp_revisiones_taller (vehicle_id)
    WHERE estado <> 'Hecha'`;

/** La del coche, la más reciente. */
export const SQL_LA_DEL_COCHE = `
  SELECT * FROM erp_revisiones_taller
   WHERE vehicle_id = $1
   ORDER BY created_at DESC LIMIT 1`;
