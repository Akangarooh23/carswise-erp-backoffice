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
 * Lo que se firma no es un pago: es un mandato en exclusiva con fecha de
 * caducidad. El cliente no adelanta un euro.
 *
 * Los 150 € de cancelación no son un castigo: cubren lo que nos hemos gastado
 * en él aunque no venda —el anuncio y la revisión mecánica— y dejan algo. Por
 * eso poder cobrarlos es lo que permite no cobrar nada por delante.
 */
export const DIAS_DE_EXCLUSIVA = 30;
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

/** Cuándo se acaba la exclusiva. */
export function venceEl(firmadoAt: string | Date): Date | null {
  const d = new Date(firmadoAt);
  if (Number.isNaN(d.getTime())) return null;
  const vence = new Date(d);
  vence.setDate(vence.getDate() + DIAS_DE_EXCLUSIVA);
  return vence;
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
 * Si ya se pasó el plazo.
 *
 * Una fecha ilegible cuenta como **no vencida**, a propósito. Vencer despublica
 * el coche de alguien que está pagando por tenerlo publicado, y eso no puede
 * pasar por una fila mal escrita. Lo que sí pasa es que salga en la lista de
 * `laFechaEstaRota`, para que una persona lo mire.
 */
export function estaVencido(venceAt: string | Date | null, ahora: Date = new Date()): boolean {
  const dias = diasQueQuedan(venceAt, ahora);
  return dias === null ? false : dias < 0;
}

export function laFechaEstaRota(venceAt: string | Date | null): boolean {
  return diasQueQuedan(venceAt) === null;
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
 * Con cuántos días de antelación se avisa de que vence.
 *
 * No el día 30. Avisar el día que se muere es contárselo cuando ya no puede
 * hacer nada, y lo que se quiere es que le dé tiempo a renovar: uno de cada
 * cinco encargos acaba agotando el plazo sin vender ni cancelar, y cada uno de
 * esos nos ha costado el anuncio y la revisión y no ha pagado nada.
 */
export const AVISAR_CON = 5;

/** Si toca avisar ya —o si ya se pasó, que también hay que mirarlo—. */
export function tocaAvisar(venceAt: string | Date | null, ahora: Date = new Date()): boolean {
  const dias = diasQueQuedan(venceAt, ahora);
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
