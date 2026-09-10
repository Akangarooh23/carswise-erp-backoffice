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
