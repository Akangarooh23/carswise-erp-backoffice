/**
 * El encargo de venta de un particular: «nosotros lo vendemos por ti».
 *
 * Lo que existe no es el anuncio, es el **encargo**. El anuncio llega tarde —
 * solo cuando están las cuatro puertas y el coche tiene sello— y hay muchas
 * cosas que pasan antes: alguien a medio traer sus papeles es el mejor cliente
 * que vamos a tener, y sin una fila que lo represente no se le puede ni ver ni
 * llamar.
 *
 * Aquí están las reglas, sin base de datos y sin pantalla, porque son lo que se
 * discute: cuántos días dura la exclusiva, qué hace falta para publicar y
 * cuándo deja de hacer falta.
 *
 * El **porqué** de todo esto está en el manual de ejecución «Flujo particular —
 * Nosotros lo vendemos por ti».
 */

/**
 * Lo que se firma no es un pago: es un mandato de gestión de venta. El cliente
 * no adelanta un euro.
 *
 * **El mandato no caduca.** Se extiende hasta que él lo cancela o hasta que
 * vendemos el coche. Esto estuvo escrito al revés durante unos días —una fecha
 * de vencimiento a los 30 que despublicaba el coche y le escribía diciéndoselo—
 * y era un invento: nadie retira el anuncio de un cliente por el calendario.
 *
 * Los 30 días son otra cosa: **hasta cuándo se le puede cobrar la penalización**.
 *
 * Los 150 € no son un castigo: cubren lo que nos hemos gastado en él aunque no
 * venda —el anuncio y la revisión mecánica— y dejan algo. Por eso poder
 * cobrarlos es lo que permite no cobrarle nada por delante.
 */
export const DIAS_HASTA_SALIR_GRATIS = 30;
export const FEE_DE_GESTION = 299;
export const FEE_DE_CANCELACION = 150;

/** Los papeles del coche. El DNI no está aquí: ese se pide al firmar la venta. */
export const PAPELES_DEL_COCHE = ['circulation_permit', 'technical_sheet', 'itv'] as const;

/**
 * Cuántas franjas hacen falta, y en cuánto tiempo.
 *
 * Seis en dos semanas es poder enseñar el coche tres fines de semana. Menos que
 * eso es un anuncio que nadie puede visitar, que es peor que no tenerlo: gasta
 * el interés del comprador y no lo convierte en nada.
 */
export const FRANJAS_MINIMAS = 6;
export const DIAS_DE_FRANJAS = 14;

/**
 * Cuántas fotos. **Este número es una decisión, no un hallazgo.**
 *
 * Seis son las cuatro esquinas, el interior y el salpicadero, que es lo que
 * lleva un anuncio decente. Si al probarlo con clientes de verdad resulta que
 * seis espantan a la gente, se baja aquí y se baja en un solo sitio.
 */
export const FOTOS_MINIMAS = 6;

/**
 * En qué estados de PopCar Check el informe cuenta como hecho.
 *
 * Son los mismos que allí llaman «listos»: hay un informe emitido y ya no se
 * puede perder. Uno «capturando» es alguien a medias, y publicar con eso sería
 * publicar sin informe.
 */
export const INFORME_HECHO = ['informe_listo', 'verificada', 'publicada'];

export type Estado = 'recogiendo' | 'listo' | 'publicado' | 'vendido' | 'cancelado' | 'vencido';

/**
 * Desde cuándo se puede ir sin pagar nada.
 *
 * Solo el que **firmó la cláusula del precio** llega a estar libre, y a los 30
 * días de firmar. El que firmó el acuerdo pero no esa cláusula paga la
 * penalización desde el día 1 y no deja de deberla nunca mientras no venda con
 * nosotros: por eso ahí no hay fecha, y se devuelve `null`.
 *
 * `null` quiere decir «nunca», no «no lo sé». Son cosas distintas y quien lea
 * esto tiene que poder distinguirlas: mira `aceptoElPrecio` para saber cuál es.
 */
export function libreDesde(firmadoAt: string | Date, aceptoElPrecio: boolean): Date | null {
  if (!aceptoElPrecio) return null;
  const d = new Date(firmadoAt);
  if (Number.isNaN(d.getTime())) return null;
  const libre = new Date(d);
  libre.setDate(libre.getDate() + DIAS_HASTA_SALIR_GRATIS);
  return libre;
}

/**
 * Cuánto se le cobra si se va sin vender con nosotros.
 *
 * Las tres ramas, que son las que dijo Juan:
 *
 *   · No firmó la cláusula del precio → **150 €, desde el día 1 y siempre**.
 *   · La firmó y aún no han pasado 30 días → **150 €**.
 *   · La firmó y ya han pasado → **0 €**, se va gratis.
 *
 * No confundir con el fee de gestión: eso son 299 € y se cobran cuando el coche
 * se vende **con** nosotros. Esto es lo contrario, lo que se cobra cuando no.
 */
export function laPenalizacion(
  e: { firmado_at?: string | Date | null; acepto_el_precio?: boolean | null },
  ahora: Date = new Date(),
): number {
  if (!e.acepto_el_precio) return FEE_DE_CANCELACION;
  const libre = e.firmado_at ? libreDesde(e.firmado_at, true) : null;
  /*
   * Sin fecha de firma legible no se le perdona la penalización.
   *
   * Perdonar sale de la puerta equivocada: se dejaría de cobrar por una fila
   * mal escrita y nadie se enteraría. Cobrar de más, en cambio, lo ve el
   * cliente y lo dice.
   */
  if (!libre) return FEE_DE_CANCELACION;
  return ahora >= libre ? 0 : FEE_DE_CANCELACION;
}

/**
 * Cuántos días quedan. `null` si la fecha no se puede leer.
 *
 * Se cuenta por días naturales y no por horas: al cliente se le dijo «treinta
 * días», y «te quedan 0,4 días» no es algo que se pueda decir por teléfono.
 */
export function diasQueQuedan(venceAt: string | Date | null, ahora: Date = new Date()): number | null {
  if (!venceAt) return null;
  const d = new Date(venceAt);
  if (Number.isNaN(d.getTime())) return null;
  const dia = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((dia(d) - dia(ahora)) / 86400000);
}

/**
 * Si ya se puede ir gratis.
 *
 * Aquí ya no hay nada que caduque: esto no despublica ningún coche ni cierra
 * ningún encargo. Solo dice si, en caso de irse hoy, se le puede cobrar.
 */
export function yaSePuedeIrGratis(
  e: { firmado_at?: string | Date | null; acepto_el_precio?: boolean | null },
  ahora: Date = new Date(),
): boolean {
  return laPenalizacion(e, ahora) === 0;
}

/** Lo que hay reunido de un coche, tal como sale de la base. */
export interface LoQueHay {
  matricula?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | string | null;
  kilometros?: number | string | null;
  /** Cuántas fotos tiene subidas. */
  fotos?: number | null;
  /** Los `document_type` que ya ha subido. */
  papeles?: readonly string[] | null;
  /** El estado del informe de PopCar Check, si hay alguno. */
  informe?: string | null;
  /**
   * Cuándo empieza cada franja **libre**, en ISO.
   *
   * Libres, no todas: una franja que ya tiene visita no sirve para la
   * siguiente. Por eso esta puerta puede volver a cerrarse sola cuando se
   * gastan, y por eso hay un aviso de «se quedó sin franjas».
   */
  franjas?: readonly string[] | null;
}

export interface Puerta {
  clave: 'idcar' | 'papeles' | 'informe' | 'franjas';
  nombre: string;
  abierta: boolean;
  /** Qué falta, en la frase que se le puede leer al cliente por teléfono. */
  falta: string;
}

const hayAlgo = (v: unknown) => String(v ?? '').trim() !== '';

/** Cuántas franjas libres caen dentro de la ventana. */
export function franjasQueValen(
  franjas: readonly string[] | null | undefined,
  ahora: Date = new Date(),
): number {
  const hasta = new Date(ahora);
  hasta.setDate(hasta.getDate() + DIAS_DE_FRANJAS);
  return (franjas ?? []).filter((f) => {
    const d = new Date(f);
    // Una fecha ilegible no cuenta: no se puede citar a nadie a una hora que no
    // se sabe cuál es.
    if (Number.isNaN(d.getTime())) return false;
    return d > ahora && d <= hasta;
  }).length;
}

/**
 * Las cuatro puertas, en el orden en que se le piden al cliente.
 *
 * Se devuelven siempre las cuatro, abiertas o no, porque la pantalla enseña la
 * lista entera con su semáforo: lo que hace falta saber no es «¿puedo
 * publicar?» sino «¿qué le pido cuando le llame?».
 */
export function lasPuertas(hay: LoQueHay, ahora: Date = new Date()): Puerta[] {
  const faltaDelCoche = [
    hayAlgo(hay.matricula) ? '' : 'la matrícula',
    hayAlgo(hay.marca) ? '' : 'la marca',
    hayAlgo(hay.modelo) ? '' : 'el modelo',
    hayAlgo(hay.ano) ? '' : 'el año',
    hayAlgo(hay.kilometros) ? '' : 'los kilómetros',
  ].filter(Boolean);

  const fotos = Number(hay.fotos ?? 0);
  if (fotos < FOTOS_MINIMAS) {
    faltaDelCoche.push(`${FOTOS_MINIMAS - fotos} foto${FOTOS_MINIMAS - fotos === 1 ? '' : 's'}`);
  }

  const tiene = new Set(hay.papeles ?? []);
  const COMO_SE_LLAMAN: Record<string, string> = {
    circulation_permit: 'el permiso de circulación',
    technical_sheet: 'la ficha técnica',
    itv: 'la ITV',
  };
  const faltanPapeles = PAPELES_DEL_COCHE.filter((p) => !tiene.has(p)).map((p) => COMO_SE_LLAMAN[p]);

  const libres = franjasQueValen(hay.franjas, ahora);

  return [
    {
      clave: 'idcar',
      nombre: 'El coche',
      abierta: faltaDelCoche.length === 0,
      falta: faltaDelCoche.length ? `Falta ${enLista(faltaDelCoche)}` : '',
    },
    {
      clave: 'papeles',
      nombre: 'Los papeles',
      abierta: faltanPapeles.length === 0,
      falta: faltanPapeles.length ? `Falta ${enLista(faltanPapeles)}` : '',
    },
    {
      clave: 'informe',
      nombre: 'El informe de estado',
      abierta: INFORME_HECHO.includes(String(hay.informe ?? '').trim()),
      falta: hayAlgo(hay.informe) ? 'Lo empezó y no lo ha terminado' : 'No lo ha hecho',
    },
    {
      clave: 'franjas',
      nombre: 'Las franjas de visita',
      abierta: libres >= FRANJAS_MINIMAS,
      falta: `Tiene ${libres} de ${FRANJAS_MINIMAS} en los próximos ${DIAS_DE_FRANJAS} días`,
    },
  ];
}

/** «la matrícula, el año y 2 fotos» */
function enLista(cosas: string[]): string {
  if (cosas.length === 1) return cosas[0];
  return `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`;
}

/** Las cuatro, por su nombre. */
export const LAS_CUATRO: Puerta['clave'][] = ['idcar', 'papeles', 'informe', 'franjas'];

/**
 * Si el coche se puede publicar ya.
 *
 * Se comprueba que estén **las cuatro por su clave**, y no que «todas las que
 * me han pasado» estén abiertas: con lo segundo, pasarle una lista ya filtrada
 * —o una lista vacía— diría que sí. Las cuatro puertas y nada más: el sello del
 * taller es otra cosa y va aparte, porque quien lo cierra no es el cliente sino
 * nosotros.
 */
export function sePuedePublicar(puertas: readonly Puerta[]): boolean {
  return LAS_CUATRO.every((clave) => puertas.some((p) => p.clave === clave && p.abierta));
}

/** Lo que falta, para decírselo al cliente de una vez. */
export function loQueLeFalta(puertas: readonly Puerta[]): string[] {
  return puertas.filter((p) => !p.abierta).map((p) => p.falta).filter(Boolean);
}

/**
 * Con cuántos días de antelación sale en la lista de llamar.
 *
 * El aviso no es una despedida: es lo contrario. Faltan cinco días para que ese
 * cliente pueda irse sin pagarnos nada, así que es **el momento de llamarle** —
 * con un ajuste de precio, con quién ha preguntado, con lo que sea—. Después de
 * esa fecha sigue siendo cliente, pero ya no hay nada que le retenga.
 *
 * Uno de cada cinco encargos acaba así, sin vender ni cancelar, y en cada uno de
 * esos nos hemos gastado el anuncio y la revisión sin cobrar.
 */
export const AVISAR_CON = 5;

/**
 * Si toca llamarle ya, porque está a punto de poder irse gratis o ya puede.
 *
 * Al que nunca va a poder irse gratis —el que no firmó el precio— no se le pone
 * en esta lista: no hay ninguna fecha que corra en su contra y llamarle por esto
 * sería llenar la lista de gente sin motivo.
 */
export function tocaLlamarle(
  e: { firmado_at?: string | Date | null; acepto_el_precio?: boolean | null },
  ahora: Date = new Date(),
): boolean {
  const libre = e.firmado_at ? libreDesde(e.firmado_at, Boolean(e.acepto_el_precio)) : null;
  if (!libre) return false;
  const dias = diasQueQuedan(libre, ahora);
  return dias !== null && dias <= AVISAR_CON;
}

/**
 * Si lo único que le falta es poner horas.
 *
 * Este es el aviso que vale, y no «encargos sin franjas» a secas. Uno recién
 * firmado no tiene nada, y eso no es una tarea: es que acaba de empezar, y ya
 * se ve en su ficha. Lo que sí hay que hacer esta tarde es llamar al que lo ha
 * traído todo y se ha quedado sin huecos — porque ese es un anuncio vivo, o a
 * punto de estarlo, que **nadie puede visitar**.
 */
export function soloLeFaltanFranjas(puertas: readonly Puerta[]): boolean {
  const cerradas = puertas.filter((p) => !p.abierta);
  return cerradas.length === 1 && cerradas[0].clave === 'franjas';
}
