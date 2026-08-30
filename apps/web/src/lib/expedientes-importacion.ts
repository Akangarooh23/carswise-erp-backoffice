/**
 * Las reglas de un expediente de importación.
 *
 * Están aquí y no dentro de la pantalla porque son reglas, no pintura: qué
 * etapa va después de cuál, qué no se puede hacer todavía, y cuánto dinero de
 * clientes tenemos cobrado sin haber entregado el coche. Eso último es lo que
 * hay que poder mirar sin equivocarse.
 *
 * Las etapas son las mismas que el cliente ve marcarse en su panel y las mismas
 * que acepta la API. Si alguna vez dejan de serlo, se rompe por los dos lados a
 * la vez, que es lo que se quiere.
 */

export const ETAPAS = [
  'Pendiente',
  'Contactado',
  'Fianza pagada',
  'Pedido a Alemania',
  'En transporte',
  'En trámites',
  'Entregado',
] as const;

export type Etapa = (typeof ETAPAS)[number];

/** Qué hay que hacer con un expediente que está en esta etapa. */
export const QUE_TOCA: Record<Etapa, string> = {
  'Pendiente':         'Llamar y explicarle el proceso',
  'Contactado':        'Esperando a que pague la fianza',
  'Fianza pagada':     'Hacer el pedido a Alemania',
  'Pedido a Alemania': 'Confirmar fecha y organizar el transporte',
  'En transporte':     'El coche viene de camino',
  'En trámites':       'Impuesto, ITV y matrícula',
  'Entregado':         'Cerrado',
};

export interface MetaImportacion {
  name?: string;
  phone?: string;
  when?: string;
  vehicle_url?: string;
  erp_notes?: string;
  deposit_quoted?: string | number | null;
  deposit_paid_at?: string | null;
  delivery_estimate?: string | null;
  deposit_refunded_at?: string | null;
}

export interface Expediente {
  id: string;
  user_email: string;
  title: string;
  status: string;
  created_at: string;
  meta?: MetaImportacion | null;
}

export function esEtapa(status: string): status is Etapa {
  return (ETAPAS as readonly string[]).includes(status);
}

/** La etapa que viene después. Null si ya está entregado o fuera del camino. */
export function siguienteEtapa(status: string): Etapa | null {
  const i = (ETAPAS as readonly string[]).indexOf(status);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

export function fianzaPagada(x: Expediente): boolean {
  return Boolean(x.meta?.deposit_paid_at);
}

/**
 * Sin fianza no se pide el coche.
 *
 * Es la regla que sostiene todo lo demás: pedir un coche a Alemania nos
 * compromete con dinero, y lo que cubre ese riesgo es la fianza del cliente.
 */
export function puedePedirlo(x: Expediente): boolean {
  return fianzaPagada(x);
}

/**
 * La fecha de entrega no existe hasta que hay pedido.
 *
 * La da el vendedor al aceptarlo. Antes de eso cualquier fecha es inventada, y
 * una fecha inventada que el cliente ve en su panel es una promesa.
 */
export function puedeDarFecha(status: string): boolean {
  const i = (ETAPAS as readonly string[]).indexOf(status);
  return i >= (ETAPAS as readonly string[]).indexOf('Pedido a Alemania');
}

/** Cuántos días lleva abierto. Un expediente quieto es el problema. */
export function diasDesde(v?: string | null, ahora: Date = new Date()): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((ahora.getTime() - d.getTime()) / 86_400_000);
}

export function agrupaPorEtapa(expedientes: Expediente[]): Map<Etapa, Expediente[]> {
  const mapa = new Map<Etapa, Expediente[]>(ETAPAS.map((e) => [e, [] as Expediente[]]));
  for (const x of expedientes) if (esEtapa(x.status)) mapa.get(x.status)!.push(x);
  return mapa;
}

/** Lo que está fuera del camino: descartado, cancelado, lo que sea. */
export function fueraDelCamino(expedientes: Expediente[]): Expediente[] {
  return expedientes.filter((x) => !esEtapa(x.status));
}

export interface Resumen {
  enMarcha: number;
  sinFianza: number;
  /** Dinero de clientes cobrado y todavía sin entregar el coche. */
  comprometido: number;
  entregados: number;
}

export function resumen(expedientes: Expediente[]): Resumen {
  const enMarcha = expedientes.filter((x) => esEtapa(x.status) && x.status !== 'Entregado');
  return {
    enMarcha: enMarcha.length,
    sinFianza: enMarcha.filter((x) => !fianzaPagada(x)).length,
    // Una fianza devuelta ya no la tenemos: contarla sería decir que debemos
    // más de lo que debemos.
    comprometido: enMarcha
      .filter((x) => fianzaPagada(x) && !x.meta?.deposit_refunded_at)
      .reduce((suma, x) => suma + Number(x.meta?.deposit_quoted || 0), 0),
    entregados: expedientes.filter((x) => x.status === 'Entregado').length,
  };
}

/**
 * La nota que deja un cambio de etapa.
 *
 * Cambiar de etapa sin decir por qué deja un expediente que avanza solo: el
 * historial guarda que alguien lo movió, pero no lo que pasó. Y lo que pasó es
 * justo lo que necesita el siguiente que coja el teléfono —«le he llamado, se
 * lo piensa», «no contesta desde el martes»—, porque el estado a secas no lo
 * dice.
 *
 * Se escribe encabezada con el salto y la fecha, y se **añade** a lo que ya
 * hubiera: las notas de un expediente son un cuaderno, no un campo que se pisa.
 */
export function notaDelCambio(
  notasActuales: string,
  desde: string,
  hasta: string,
  texto: string,
  cuando: Date = new Date()
): string {
  const limpio = texto.trim();
  if (!limpio) return notasActuales;
  const dia = cuando.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const entrada = `[${dia} · ${desde} → ${hasta}] ${limpio}`;
  const previas = (notasActuales || '').trim();
  return previas ? `${previas}\n${entrada}` : entrada;
}
