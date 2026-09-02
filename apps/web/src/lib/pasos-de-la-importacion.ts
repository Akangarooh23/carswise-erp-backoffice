/**
 * El camino de un coche de importación: qué se ha hecho, qué toca y qué falta.
 *
 * Un expediente cruza cinco pantallas —Importaciones, Peritaciones, Pedidos,
 * Transportes y Gestoría— y hasta ahora, para saber en qué punto estaba, había
 * que abrirlas todas y reconstruirlo de memoria. Con un coche se puede. Con
 * quince, no: lo que pasa es que uno se queda parado tres semanas porque nadie
 * se acordó de que el perito no había contestado.
 *
 * De aquí salen las tres cosas, y por eso está en un sitio solo: el camino que
 * se pinta en el expediente, la frase de «ahora toca», y el número rojo del
 * menú. Calculadas por separado acabarían diciendo cosas distintas del mismo
 * coche, y entonces no se cree ninguna.
 *
 * ## Cuatro estados, no dos
 *
 * La diferencia que hace que esto sirva es **de quién depende**:
 *
 * - `hecho` — pasó, con su fecha.
 * - `toca` — depende de nosotros. Hay un botón que pulsar.
 * - `esperando` — depende de otro: el perito tiene que confirmar.
 * - `porVenir` — ni se puede ni toca.
 *
 * El número rojo cuenta **solo lo que depende de nosotros**. Un contador que
 * incluye esperas es un número que nunca baja, y un número que nunca baja se
 * deja de mirar.
 *
 * ## Y las esperas vencen
 *
 * Una espera no es eterna. Si el perito lleva tres días sin confirmar, deja de
 * ser «esperando» y pasa a «toca: reclamarle». Sin esa regla, «esperando» es
 * donde los expedientes se quedan a morir.
 */
import type { Expediente } from './expedientes-importacion.js';

export type EstadoPaso = 'hecho' | 'toca' | 'esperando' | 'porVenir';

export interface Paso {
  clave: string;
  /** Qué es, dicho como una acción. */
  titulo: string;
  estado: EstadoPaso;
  /** Cuándo se hizo, si se hizo. */
  cuando?: string | null;
  /** Lo que se sabe de ese paso: el día de la cita, quién lo firmó. */
  detalle?: string;
  /** A qué pantalla lleva. */
  donde?: string;
  /** Días esperando, cuando se espera a alguien de fuera. */
  dias?: number;
}

/** Lo que se aguanta esperando a cada uno antes de reclamar. */
export const PLAZOS = {
  vendedor: 3,
  perito: 3,
  /** Después del día de la visita, antes de preguntar qué pasó. */
  visita: 2,
  gestoria: 5,
} as const;

function dias(desde: unknown, hoy: Date): number {
  const d = desde ? new Date(String(desde)) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((hoy.getTime() - d.getTime()) / 86400000));
}

const dia = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('es-ES') : '');

/**
 * Una espera que se ha pasado de plazo deja de ser espera.
 *
 * Devuelve el paso como «toca», con el título cambiado a lo que hay que hacer:
 * reclamar. Es el único sitio donde un paso cambia de dueño solo.
 */
function esperando(base: Paso, desde: unknown, plazo: number, comoReclamar: string, hoy: Date): Paso {
  const d = dias(desde, hoy);
  if (d > plazo) {
    return { ...base, estado: 'toca', titulo: comoReclamar, dias: d };
  }
  return { ...base, estado: 'esperando', dias: d };
}

const YA_ENVIADO = ['En transporte', 'En trámites', 'Entregado'];

/**
 * El camino entero, en orden.
 *
 * Se calcula cada paso mirando lo que ya hay, no llevando una cuenta aparte: un
 * expediente puede haber avanzado desde otra pantalla —una peritación que se
 * marca hecha, un transporte que se entrega— y una cuenta propia se quedaría
 * atrás sin que nadie lo notara.
 */
export function pasosDeLaImportacion(x: Expediente, hoy: Date = new Date()): Paso[] {
  const m = x.meta ?? {};
  const p = m.peritacion ?? null;
  const pasos: Paso[] = [];

  // 1 · El dinero del cliente.
  const pagado = Boolean(m.deposit_paid_at);
  pasos.push({
    clave: 'deposito',
    titulo: pagado ? 'El cliente pagó el depósito' : 'Que el cliente pague el depósito',
    estado: pagado ? 'hecho' : 'esperando',
    cuando: m.deposit_paid_at ?? null,
    detalle: m.deposit_quoted ? `${Number(m.deposit_quoted).toLocaleString('es-ES')} €` : undefined,
  });

  // 2 · Si el coche sigue ahí. Es el paso que puede pararlo todo.
  const preguntado = Boolean(m.reserva_preguntada_at);
  pasos.push({
    clave: 'disponible',
    titulo: preguntado
      ? 'Preguntado al vendedor si sigue disponible'
      : 'Preguntarle al vendedor si sigue disponible',
    estado: preguntado ? 'hecho' : pagado ? 'toca' : 'porVenir',
    cuando: m.reserva_preguntada_at ?? null,
    donde: '/importaciones',
  });

  // 3 · Lo que conteste: día, hora, dirección, contacto y teléfono.
  const contesto = Boolean(p?.donde && p?.fecha_prevista);
  pasos.push(
    contesto
      ? {
          clave: 'respuesta',
          titulo: 'Apuntada su respuesta',
          estado: 'hecho',
          detalle: [dia(p?.fecha_prevista), p?.hora_prevista, p?.donde].filter(Boolean).join(' · '),
          donde: '/importaciones',
        }
      : preguntado
        ? esperando(
            { clave: 'respuesta', titulo: 'Que conteste el vendedor', estado: 'esperando', donde: '/importaciones' },
            m.reserva_preguntada_at, PLAZOS.vendedor,
            'Reclamarle al vendedor: no ha contestado', hoy
          )
        : { clave: 'respuesta', titulo: 'Que conteste el vendedor', estado: 'porVenir' }
  );

  // 4 · El encargo al perito.
  const encargado = Boolean(p?.encargo_enviado_at);
  pasos.push({
    clave: 'encargo',
    titulo: encargado ? 'Encargada la revisión al perito' : 'Encargarle la revisión al perito',
    estado: encargado ? 'hecho' : contesto ? 'toca' : 'porVenir',
    cuando: p?.encargo_enviado_at ?? null,
    detalle: p?.perito || undefined,
    donde: '/peritaciones',
  });

  // 5 · Que confirme que va, y lo que cobra. Las dos cosas vienen juntas.
  const confirmado = p?.coste !== null && p?.coste !== undefined && p?.coste !== '';
  pasos.push(
    confirmado
      ? {
          clave: 'confirma',
          titulo: 'El perito ha confirmado, y lo que cobra',
          estado: 'hecho',
          detalle: `${Number(p?.coste).toLocaleString('es-ES')} €`,
          donde: '/peritaciones',
        }
      : encargado
        ? esperando(
            { clave: 'confirma', titulo: 'Que el perito confirme y diga el precio', estado: 'esperando', donde: '/peritaciones' },
            p?.encargo_enviado_at, PLAZOS.perito,
            'Reclamarle al perito: no ha confirmado', hoy
          )
        : { clave: 'confirma', titulo: 'Que el perito confirme y diga el precio', estado: 'porVenir' }
  );

  // 6 · Confirmarle al vendedor el día y la hora.
  const avisado = Boolean(p?.cita_avisada_at);
  pasos.push({
    clave: 'cita',
    titulo: avisado ? 'Confirmado el día al vendedor' : 'Confirmarle el día y la hora al vendedor',
    estado: avisado ? 'hecho' : confirmado ? 'toca' : 'porVenir',
    cuando: p?.cita_avisada_at ?? null,
    donde: '/peritaciones',
  });

  // 7 · La visita. Aquí se decide si esto sigue.
  const noEra = p?.veredicto === 'no_es_el_que_se_anuncio';
  const visto = Boolean(m.verificado_alemania_at);
  pasos.push(
    p?.veredicto
      ? {
          clave: 'visita',
          titulo: noEra ? 'El perito dice que NO es el que se anunció' : 'El perito lo ha visto: es el del anuncio',
          estado: 'hecho',
          cuando: p?.fecha_hecha ?? null,
          detalle: p?.danos?.cuantas ? `${p.danos.cuantas} partidas dañadas` : undefined,
          donde: '/peritaciones',
        }
      : avisado
        ? esperando(
            { clave: 'visita', titulo: 'Que vaya a verlo y diga qué vio', estado: 'esperando', donde: '/peritaciones' },
            p?.fecha_prevista, PLAZOS.visita,
            'Preguntarle al perito qué pasó con la visita', hoy
          )
        : { clave: 'visita', titulo: 'Que vaya a verlo y diga qué vio', estado: 'porVenir' }
  );

  /*
   * Si no era el coche, el camino se acaba aquí.
   *
   * Lo que queda no es transporte ni trámites: es devolverle el dinero al
   * cliente. Enseñar los cinco pasos siguientes en gris invitaría a buscar la
   * forma de seguir, y no la hay.
   */
  if (noEra) {
    pasos.push({
      clave: 'devolver',
      titulo: 'Devolverle el depósito al cliente',
      estado: m.deposit_refunded_at ? 'hecho' : 'toca',
      cuando: m.deposit_refunded_at ?? null,
      donde: '/importaciones',
    });
    return pasos;
  }

  /*
   * 8 · Su factura.
   *
   * No bloquea nada —el pago se libera con el veredicto, no con la factura—,
   * y por eso mismo hace falta que esté escrita en alguna parte: 289 € que
   * nadie apunta no llegan al coste del coche ni a la lista de lo que hay que
   * pagar, y el margen sale mejor de lo que es.
   */
  const suFactura = Boolean(p?.factura_numero);
  pasos.push(
    suFactura
      ? {
          clave: 'facturaPerito',
          titulo: 'Apuntada la factura del perito',
          estado: 'hecho',
          detalle: p?.factura_numero ?? undefined,
          donde: '/peritaciones',
        }
      : p?.veredicto
        ? esperando(
            { clave: 'facturaPerito', titulo: 'Que el perito mande su factura', estado: 'esperando', donde: '/peritaciones' },
            p?.fecha_hecha, PLAZOS.perito,
            'Reclamarle la factura al perito', hoy
          )
        : { clave: 'facturaPerito', titulo: 'Que el perito mande su factura', estado: 'porVenir' }
  );

  // 9 · El dinero sale.
  const liberado = Boolean(m.escrow_liberado_at);
  pasos.push({
    clave: 'liberar',
    titulo: liberado ? 'Pagado al vendedor' : 'Liberar el pago al vendedor',
    estado: liberado ? 'hecho' : visto ? 'toca' : 'porVenir',
    cuando: m.escrow_liberado_at ?? null,
    donde: '/importaciones',
  });

  // 10 · Y el papel que hace que ese dinero sea un suplido.
  const pedida = Boolean(m.factura_vendedor_pedida_at);
  pasos.push({
    clave: 'factura',
    titulo: pedida ? 'Pedida su factura a nombre del cliente' : 'Avisarle del pago y pedirle la factura',
    estado: pedida ? 'hecho' : liberado ? 'toca' : 'porVenir',
    cuando: m.factura_vendedor_pedida_at ?? null,
    donde: '/importaciones',
  });

  // 11 · Traerlo.
  const enCamino = YA_ENVIADO.includes(x.status);
  pasos.push({
    clave: 'transporte',
    titulo: enCamino ? 'El transporte, organizado' : 'Organizar el transporte',
    estado: enCamino ? 'hecho' : liberado ? 'toca' : 'porVenir',
    donde: '/transportes',
  });

  // 12 · Ponerlo legal aquí.
  const enTramites = x.status === 'En trámites' || x.status === 'Entregado';
  const conGestoria = Boolean(m.encargo_gestoria_enviado_at);
  pasos.push({
    clave: 'tramites',
    titulo: conGestoria ? 'Encargados los trámites a la gestoría' : 'Encargarle los trámites a la gestoría',
    estado: conGestoria ? 'hecho' : enTramites ? 'toca' : 'porVenir',
    cuando: m.encargo_gestoria_enviado_at ?? null,
    donde: '/gestoria',
  });

  // 13 · Dárselo.
  const entregado = x.status === 'Entregado';
  pasos.push({
    clave: 'entrega',
    titulo: entregado ? 'Entregado al cliente' : 'Entregárselo al cliente',
    estado: entregado ? 'hecho' : enTramites ? 'toca' : 'porVenir',
    donde: '/importaciones',
  });

  return pasos;
}

/** El primero que depende de nosotros, que es la respuesta a «y ahora qué». */
export function loQueToca(pasos: readonly Paso[]): Paso | null {
  return pasos.find((x) => x.estado === 'toca') ?? null;
}

/** Lo que se está esperando de fuera, para poder decirlo sin alarmar. */
export function loQueSeEspera(pasos: readonly Paso[]): Paso | null {
  return pasos.find((x) => x.estado === 'esperando') ?? null;
}

/** Si este coche pide algo nuestro. Es lo que cuenta el número rojo del menú. */
export function pideAlgoNuestro(x: Expediente, hoy: Date = new Date()): boolean {
  return loQueToca(pasosDeLaImportacion(x, hoy)) !== null;
}

/**
 * Cuántas acciones esperan en cada pantalla.
 *
 * Cada paso sabe dónde se hace, así que el número rojo va donde está el
 * botón: encargar una peritación cuenta en Peritaciones, no en Importaciones.
 * Contarlo en las dos sería el mismo trabajo contado dos veces, y un número
 * inflado se deja de mirar igual que uno que no baja.
 *
 * **Se cuentan las acciones, no los coches**: un expediente parado en dos
 * sitios a la vez —el transporte y los trámites— son dos cosas que hacer.
 */
export function pendientesPorPantalla(
  expedientes: readonly Expediente[],
  hoy: Date = new Date()
): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const x of expedientes) {
    for (const p of pasosDeLaImportacion(x, hoy)) {
      if (p.estado !== 'toca' || !p.donde) continue;
      cuenta[p.donde] = (cuenta[p.donde] ?? 0) + 1;
    }
  }
  return cuenta;
}
