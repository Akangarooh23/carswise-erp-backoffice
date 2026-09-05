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
  /**
   * Dónde se apunta la respuesta, para las esperas que se cierran así.
   *
   * Un correo contestado llega a un buzón, no al ERP: aquí seguimos
   * esperando hasta que alguien escribe lo que dijo. Sin este camino, la
   * espera se queda quieta con la respuesta ya encima de la mesa —y como una
   * espera no lleva número rojo, nada la reclama hasta que vence el plazo.
   */
  apuntarEn?: string;
  /**
   * Si este paso **mueve el coche** o va por su cuenta.
   *
   * La factura del perito hay que pedirla, pero el coche no la espera: sigue
   * a transporte y a trámites sin ella. Puesta como «ahora toca», le robaba
   * el titular al paso que sí mueve el expediente, y quien abre la ficha se
   * queda con la impresión de que hay algo parado.
   *
   * Sigue contando como tarea nuestra —el número rojo la cuenta—, pero se
   * dice aparte y sin prisa.
   */
  via?: 'principal' | 'aparte';
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
          via: 'aparte',
        }
      : p?.veredicto
        ? p?.factura_pedida_at
          // Ya se le ha pedido: la cuenta corre desde que se pidió, no desde
          // la visita. Reclamar dos días después de haberla pedido es prisa.
          ? esperando(
              {
                clave: 'facturaPerito', titulo: 'Que el perito mande su factura',
                estado: 'esperando', donde: '/peritaciones', via: 'aparte',
              },
              p.factura_pedida_at, PLAZOS.perito,
              'Reclamarle otra vez la factura al perito', hoy
            )
          : {
              clave: 'facturaPerito', titulo: 'Pedirle su factura al perito',
              estado: 'toca', donde: '/peritaciones', via: 'aparte',
            }
        : {
            clave: 'facturaPerito', titulo: 'Que el perito mande su factura',
            estado: 'porVenir', via: 'aparte',
          }
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

  /*
   * 10 · El papel que hace que ese dinero sea un suplido.
   *
   * Tiene tres momentos y antes tenía uno: **pedirla**, **que la mande** y
   * **tenerla guardada**. Se daba por hecha al pedirla, así que el camino
   * saltaba al transporte con el papel sin llegar — y ese papel es el que
   * convierte 16.890 € en un suplido y el que pide la gestoría para
   * matricular.
   *
   * No bloquea el transporte: el camión puede salir sin ella. Por eso va por
   * su cuenta y no le quita el titular a lo que sí mueve el coche.
   */
  const pedida = Boolean(m.factura_vendedor_pedida_at);
  const subida = Boolean(m.factura_vendedor_subida);
  pasos.push(
    subida
      ? {
          clave: 'factura', titulo: 'Su factura, a nombre del cliente, guardada',
          estado: 'hecho', donde: '/importaciones', via: 'aparte',
        }
      : pedida
        ? esperando(
            {
              clave: 'factura', titulo: 'Que mande su factura, y subirla',
              estado: 'esperando', donde: '/importaciones', via: 'aparte',
            },
            m.factura_vendedor_pedida_at, PLAZOS.vendedor,
            'Subir la factura del vendedor, que ya debería estar', hoy
          )
        : {
            clave: 'factura', titulo: 'Avisarle del pago y pedirle la factura',
            estado: liberado ? 'toca' : 'porVenir', donde: '/importaciones',
          }
  );

  /*
   * 10b · Atar el pago a este coche, en el pedido.
   *
   * Los 16.890 € han salido del banco. El número de la factura del vendedor
   * y la fecha del pago son lo que los ata a este coche; sin ellos queda un
   * cargo de dieciséis mil euros sin concepto, y aparece al cuadrar el mes.
   *
   * Va por su cuenta: no mueve el coche, pero es trabajo nuestro y cuenta.
   */
  const pedido = m.pedido ?? null;
  const atado = Boolean(String(pedido?.factura_proveedor ?? '').trim());
  if (pedido) {
    pasos.push(
      atado
        ? {
            clave: 'pedidoPagado', titulo: 'El pago, apuntado en el pedido',
            estado: 'hecho', detalle: pedido.factura_proveedor ?? undefined,
            donde: '/pedidos', via: 'aparte',
          }
        : {
            clave: 'pedidoPagado',
            titulo: 'Apuntar en el pedido el número de su factura y el pago',
            estado: liberado ? 'toca' : 'porVenir', donde: '/pedidos', via: 'aparte',
          }
    );
  }

  /*
   * 11 · Traerlo.
   *
   * Antes de contratar a nadie hay que preguntarle al vendedor **dónde y
   * cuándo** se recoge: un transportista no va a una ciudad, va a una calle,
   * un día, a una hora y preguntando por alguien. Y si un portacoches no
   * llega hasta el coche, cambia a quién se contrata y cuánto cuesta.
   *
   * La factura del vendedor no hace falta para esto: el camión puede salir
   * sin ella.
   */
  const enCamino = YA_ENVIADO.includes(x.status);
  const enTramites = x.status === 'En trámites' || x.status === 'Entregado';
  const preguntadaLaRecogida = Boolean(m.recogida_preguntada_at);
  // Que haya contestado se sabe porque hay día de recogida apuntado.
  const contestoLaRecogida = Boolean(String(m.tramo?.recogida_prevista ?? '').trim());

  /*
   * Preguntar es de aquí; organizar, de Transportes.
   *
   * El correo se manda desde el expediente —los tres al vendedor viven
   * juntos—, así que el número rojo de esta tarea tiene que llevar ahí. Lo
   * que se hace en Transportes es lo de después: apuntar lo que conteste y
   * mandarle la orden al transportista.
   */
  if (!enCamino) {
    pasos.push(
      preguntadaLaRecogida
        ? {
            clave: 'recogida', titulo: 'Preguntado dónde y cuándo se recoge',
            estado: 'hecho', cuando: m.recogida_preguntada_at ?? null,
            donde: '/importaciones',
          }
        : {
            clave: 'recogida',
            titulo: 'Preguntarle al vendedor dónde y cuándo se recoge',
            estado: liberado ? 'toca' : 'porVenir', donde: '/importaciones',
          }
    );
  }

  /*
   * Y organizarlo no es lo mismo que esperar a que conteste.
   *
   * Mientras no diga el día, no hay nada que organizar: contratar a ciegas es
   * lo que acaba con un camión en la puerta de una nave cerrada. Con su
   * respuesta apuntada, sí — y entonces el trabajo está en Transportes.
   *
   * Y **termina cuando la orden ha salido**, no cuando el coche se mueve. Son
   * cosas distintas y entre una y otra pueden pasar días: con el camión
   * contratado y la orden mandada no queda nada nuestro que hacer, y seguir
   * diciendo «organizar el transporte» manda a mirar un tramo que ya está.
   */
  const ordenMandada = Boolean(String(m.tramo?.orden_enviada_at ?? '').trim());
  pasos.push(
    enCamino || ordenMandada
      ? {
          clave: 'transporte', titulo: 'El transporte, organizado', estado: 'hecho',
          cuando: m.tramo?.orden_enviada_at ?? null,
          detalle: String(m.tramo?.transportista ?? '').trim() || undefined,
          donde: '/transportes',
        }
      : contestoLaRecogida
        ? {
            clave: 'transporte', titulo: 'Organizar el transporte',
            estado: 'toca', donde: '/transportes',
          }
        : preguntadaLaRecogida
          ? esperando(
              {
                clave: 'transporte', titulo: 'Que diga cuándo se puede recoger',
                estado: 'esperando', donde: '/importaciones',
                // Su respuesta se apunta en el tramo: la calle en «Desde», el
                // día en «Recogida prevista», el nombre y el teléfono de quien
                // sale a abrir, y el horario.
                apuntarEn: '/transportes',
              },
              m.recogida_preguntada_at, PLAZOS.vendedor,
              'Reclamarle al vendedor el día de la recogida', hoy
            )
          : { clave: 'transporte', titulo: 'Organizar el transporte', estado: 'porVenir' }
  );

  /*
   * 12 · Que llegue.
   *
   * Un coche de camino no pide nada nuestro, pero tampoco está parado: sin
   * este paso el camino se quedaba sin nada que decir mientras cruzaba
   * Europa, y «nada pendiente» en un expediente abierto se lee como que algo
   * se ha perdido.
   */
  /*
   * Y cuando se lo llevan, el expediente tiene que enterarse.
   *
   * El tramo se marca «Recogido» en Transportes, pero la etapa del coche la
   * mueve una persona: es lo que ve el cliente en su panel, y no se cambia
   * sola desde otra pantalla. Mientras no se mueva, el camino diría «que el
   * transportista lo recoja» con el coche ya cruzando Francia.
   */
  const yaRecogido = Boolean(String(m.tramo?.fecha_recogida ?? '').trim());
  /*
   * Y llegar es que el camión lo haya descargado, no que el expediente cambie
   * de etapa. La etapa la mueve una persona y detrás está el encargo a la
   * gestoría; entre una cosa y otra, el camino decía «que el coche llegue a
   * España» con el coche ya en Zaragoza.
   */
  const yaEnZaragoza = Boolean(String(m.tramo?.fecha_entrega ?? '').trim());
  pasos.push(
    enTramites || yaEnZaragoza
      ? {
          clave: 'llegada', titulo: 'El coche ha llegado a España', estado: 'hecho',
          cuando: m.tramo?.fecha_entrega ?? null,
        }
      : enCamino
        ? { clave: 'llegada', titulo: 'Que el coche llegue a España', estado: 'esperando' }
        : yaRecogido
          ? {
              clave: 'llegada', titulo: 'Pasarlo a «En transporte»: ya se lo han llevado',
              estado: 'toca', donde: '/importaciones',
              cuando: m.tramo?.fecha_recogida ?? null,
            }
          : ordenMandada
            ? {
                clave: 'llegada', titulo: 'Que el transportista lo recoja',
                estado: 'esperando', donde: '/transportes', apuntarEn: '/transportes',
              }
            : { clave: 'llegada', titulo: 'Que el coche llegue a España', estado: 'porVenir' }
  );

  /*
   * 12b · Mirarlo al bajarlo del camión.
   *
   * Los kilómetros hay que leerlos antes de moverlo y las llaves contarlas
   * delante de quien lo trae: son los dos datos que **pierden valor con el
   * tiempo**, y dentro de una semana ya no hay forma de sostener que faltaba
   * una llave. Por eso el pedido no pasa a «Recibido» solo, y por eso esto es
   * una tarea nuestra con su número rojo en Pedidos.
   *
   * Va **aparte**: no mueve el coche —los trámites siguen sin ella— pero es
   * trabajo, y de los que no se pueden hacer más tarde.
   */
  const elPedido = m.pedido;
  if (elPedido?.id && yaEnZaragoza) {
    const mirado = String(elPedido.km ?? '').trim() !== '' && String(elPedido.llaves ?? '').trim() !== '';
    pasos.push({
      clave: 'recepcion',
      titulo: mirado ? 'Mirado al llegar: kilómetros y llaves' : 'Apuntar los kilómetros y las llaves',
      estado: mirado ? 'hecho' : 'toca',
      donde: '/pedidos',
      via: 'aparte',
    });
  }

  /*
   * 13 · Ponerlo legal aquí.
   *
   * Encargarlos **no es tenerlos**. Entre el correo a la gestoría y la
   * matrícula pasan semanas, y el camino los daba por hechos el día que salió
   * el correo: un coche podía llevar un mes parado en la DGT con el camino
   * diciendo «encargados» y un ✓ verde al lado.
   */
  const conGestoria = Boolean(m.encargo_gestoria_enviado_at);
  const losTramites = Array.isArray(m.tramites) ? m.tramites : [];
  const sinResolver = losTramites.filter((t) => String(t?.estado ?? '') !== 'Resuelto');
  const todoResuelto = losTramites.length > 0 && sinResolver.length === 0;
  pasos.push(
    todoResuelto
      ? {
          clave: 'tramites', titulo: 'El coche ya está matriculado aquí', estado: 'hecho',
          donde: '/gestoria',
        }
      : conGestoria
        ? {
            clave: 'tramites', titulo: 'Que la gestoría termine los trámites',
            estado: 'esperando', donde: '/gestoria',
            cuando: m.encargo_gestoria_enviado_at ?? null,
            detalle: sinResolver.length
              ? `falta ${sinResolver.map((t) => String(t?.tipo ?? '').toLowerCase()).join(', ')}`
              : undefined,
          }
        : {
            clave: 'tramites', titulo: 'Encargarle los trámites a la gestoría',
            // Con el coche ya descargado toca, aunque la etapa no se haya
            // movido: mover la etapa es parte de esto, no un requisito previo.
            estado: (enTramites || yaEnZaragoza) ? 'toca' : 'porVenir',
            /*
             * Y el número va a Gestoría, que es donde se mira esto.
             *
             * Estuvo un rato en el expediente porque Gestoría salía vacía: los
             * papeleos no existían hasta encargarlos. Ahora se abren al llegar
             * el coche, así que allí están los tres esperando, y allí es donde
             * se viene a ver cómo van. El correo se sigue mandando desde el
             * expediente, y Gestoría lo dice.
             */
            donde: '/gestoria',
          }
  );

  /*
   * 13b · El segundo viaje.
   *
   * Una importación hace **dos**, y el camino solo contaba uno. El primero lo
   * trae a Zaragoza; este se lo lleva al cliente, y va después de los trámites
   * porque un coche sin matricular no se entrega. Sin este paso, entre «los
   * trámites hechos» y «entregado» había un viaje entero que no aparecía en
   * ningún sitio y que alguien tenía que recordar.
   *
   * No sale si el cliente lo recoge en Zaragoza: entonces no hay segundo
   * viaje, y un paso que nadie tiene que hacer es ruido.
   */
  const alCliente = m.tramo_al_cliente;
  if (alCliente?.id) {
    const entregadoAlli = Boolean(String(alCliente.fecha_entrega ?? '').trim());
    const ordenAlCliente = Boolean(String(alCliente.orden_enviada_at ?? '').trim());
    pasos.push(
      entregadoAlli
        ? {
            clave: 'transporteAlCliente', titulo: 'Llevado a casa del cliente',
            estado: 'hecho', cuando: alCliente.fecha_entrega ?? null, donde: '/transportes',
          }
        : ordenAlCliente
          ? {
              clave: 'transporteAlCliente', titulo: 'Que lo lleven a casa del cliente',
              estado: 'esperando', donde: '/transportes',
              detalle: String(alCliente.transportista ?? '').trim() || undefined,
            }
          : {
              clave: 'transporteAlCliente', titulo: 'Organizar el viaje hasta el cliente',
              estado: enTramites || x.status === 'Entregado' ? 'toca' : 'porVenir', donde: '/transportes',
              detalle: String(alCliente.hasta ?? '').trim() || undefined,
            }
    );
  }

  /*
   * 14 · Dárselo.
   *
   * No antes de tenerlo matriculado: un coche con matrícula alemana no se le
   * entrega a nadie, y el camino lo pedía desde el día en que llegaba a
   * Zaragoza. Y si hay segundo viaje, tampoco antes de que llegue a su casa.
   */
  const entregado = x.status === 'Entregado';
  const puedeEntregarse = todoResuelto
    && (!alCliente?.id || Boolean(String(alCliente.fecha_entrega ?? '').trim()));
  pasos.push({
    clave: 'entrega',
    titulo: entregado ? 'Entregado al cliente' : 'Entregárselo al cliente',
    estado: entregado ? 'hecho' : puedeEntregarse ? 'toca' : 'porVenir',
    donde: '/importaciones',
  });

  /*
   * 11 · Y las facturas que faltan, aunque el coche ya esté entregado.
   *
   * Un expediente cerrado no está terminado si tres proveedores no han
   * facturado: un gasto sin factura no se deduce, y cerrar el expediente no
   * hace que deje de faltar. Lo dijo el asesor con estas palabras: «puede ser
   * interesante indicar el estado y lo que hay pendiente».
   *
   * Va **aparte**, que es lo honesto: no mueve el coche y no puede volver a
   * abrir un expediente entregado. Solo hace que, al abrirlo, se vea.
   */
  const sinLlegar = Array.isArray(m.facturas_sin_llegar) ? m.facturas_sin_llegar : [];
  if (sinLlegar.length) {
    pasos.push({
      clave: 'facturasProveedor',
      titulo: sinLlegar.length === 1
        ? 'Falta una factura de proveedor'
        : `Faltan ${sinLlegar.length} facturas de proveedor`,
      // Quién y cuánto, para no tener que ir a buscarlo a otra pantalla.
      detalle: sinLlegar
        .map((f) => `${f.proveedor}${f.importe ? ` · ${Math.round(Number(f.importe))} €` : ''}`)
        .join(' · '),
      estado: 'esperando',
      donde: '/provider-billing',
      via: 'aparte',
    });
  }

  return pasos;
}

/**
 * El primero que depende de nosotros **y mueve el coche**.
 *
 * Es la respuesta a «y ahora qué». Lo que no mueve el expediente —pedirle la
 * factura al perito— es tarea igual, pero contestando eso a «ahora qué» se
 * lee como que el coche está parado esperándola, y no lo está.
 */
export function loQueToca(pasos: readonly Paso[]): Paso | null {
  return pasos.find((x) => x.estado === 'toca' && x.via !== 'aparte') ?? null;
}

/** Y lo que hay que hacer sin que el coche dependa de ello. */
export function loQueFaltaAparte(pasos: readonly Paso[]): Paso[] {
  return pasos.filter((x) => x.estado === 'toca' && x.via === 'aparte');
}

/** Lo que se está esperando de fuera, para poder decirlo sin alarmar. */
export function loQueSeEspera(pasos: readonly Paso[]): Paso | null {
  // También aquí manda la vía principal: lo que se espera por su cuenta —la
  // factura del vendedor— no es lo que tiene parado al coche, y de titular
  // haría pensar que sí.
  return pasos.find((x) => x.estado === 'esperando' && x.via !== 'aparte') ?? null;
}

/**
 * Si este coche pide algo nuestro, mueva o no mueva el expediente.
 *
 * Aquí sí cuenta lo de aparte: el número rojo dice «hay trabajo», y pedirle
 * la factura al perito es trabajo.
 */
export function pideAlgoNuestro(x: Expediente, hoy: Date = new Date()): boolean {
  const pasos = pasosDeLaImportacion(x, hoy);
  return loQueToca(pasos) !== null || loQueFaltaAparte(pasos).length > 0;
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
