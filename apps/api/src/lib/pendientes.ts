/**
 * Todo lo que espera a alguien, en un sitio.
 *
 * Estaba repartido: unas fichas amarillas arriba del panel, dos avisos dentro
 * de la pestaña Financiera, otro en la pantalla de Portales y otro en la de
 * Comisiones. Repartido así, lo que pasa es que se ve lo de la pestaña en la
 * que estás y lo demás no existe —y justo lo de dentro de una pestaña es lo que
 * cuesta dinero: dos facturas de la UE sin decidir su tipo no dejan salir el
 * 349—.
 *
 * ## Lo que entra aquí y lo que no
 *
 * Entra lo que **alguien tiene que hacer**, no lo que está mal. «Hay 391
 * personas que no entran al marketplace» es un problema, pero no es una tarea:
 * nadie lo arregla esta tarde y ponerlo aquí convierte la lista en un informe.
 * Lo que entra son cosas con un botón detrás.
 *
 * Y entra con **su número**. Una lista de avisos sin cifra obliga a abrir cada
 * uno para saber si es uno o son cuarenta.
 */

/** Cómo de urgente es. El rojo se reserva para lo que cuesta dinero. */
export type Tono = 'urgente' | 'espera';

export interface Pendiente {
  clave: string;
  /** Qué es, dicho como lo diría alguien: en minúscula y en plural. */
  etiqueta: string;
  /** Y en singular, para cuando hay una sola: «1 facturas» se lee mal. */
  una: string;
  /** Por qué importa. Sale debajo, y es lo que evita tener que preguntarlo. */
  porque: string;
  n: number;
  /** A dónde se va a hacerlo. */
  a: string;
  icono: string;
  tono: Tono;
}

/**
 * Qué se puede quedar pendiente, en el orden en que se mira.
 *
 * El orden es fijo y no por cantidad: lo que cuesta dinero va primero aunque
 * sea uno solo, y lo que solo espera va detrás aunque sean cuarenta. Ordenado
 * por cantidad, un día cualquiera las cuarenta citas taparían la factura que no
 * se puede deducir.
 */
export const CATALOGO: readonly Omit<Pendiente, 'n'>[] = [
  {
    clave: 'facturas_sin_llegar',
    etiqueta: 'facturas de proveedor sin llegar', una: 'factura de proveedor sin llegar',
    porque: 'un gasto sin factura no se deduce',
    a: '/provider-billing', icono: 'documento', tono: 'urgente',
  },
  {
    clave: 'sin_autorepercusion',
    etiqueta: 'facturas de la UE sin decidir su tipo', una: 'factura de la UE sin decidir su tipo',
    porque: 'sin eso no sale el 349',
    a: '/provider-billing', icono: 'aviso', tono: 'urgente',
  },
  {
    clave: 'sin_desglosar',
    etiqueta: 'facturas que no dicen su IVA', una: 'factura que no dice su IVA',
    porque: 'mientras tanto, las cuentas del panel son aproximadas',
    a: '/contabilidad', icono: 'tabla', tono: 'urgente',
  },
  {
    clave: 'comisiones_sin_emitir',
    etiqueta: 'comisiones vendidas y sin facturar', una: 'comisión vendida y sin facturar',
    porque: 'una comisión que no se emite no la reclama nadie',
    a: '/comisiones', icono: 'euro', tono: 'urgente',
  },
  {
    clave: 'sin_deposito',
    etiqueta: 'importaciones sin depósito', una: 'importación sin depósito',
    porque: 'ese coche lo estamos financiando nosotros',
    a: '/importaciones', icono: 'euro', tono: 'urgente',
  },
  {
    clave: 'usuarios_en_riesgo',
    etiqueta: 'usuarios en riesgo', una: 'usuario en riesgo',
    porque: 'se van si nadie los llama',
    a: '/users', icono: 'usuarios', tono: 'urgente',
  },
  {
    clave: 'peritaciones_sin_informe',
    etiqueta: 'peritaciones hechas sin su informe', una: 'peritación hecha sin su informe',
    porque: 'es la prueba de que alguien fue a ver el coche, y con eso se sueltan veinte mil euros',
    a: '/peritaciones', icono: 'informe', tono: 'urgente',
  },
  {
    clave: 'portales_parados',
    etiqueta: 'plataformas sin repasar', una: 'plataforma sin repasar',
    porque: 'sus precios son los de hace una semana, y el mercado que comparamos ya no es ese',
    a: '/portales', icono: 'tabla', tono: 'espera',
  },
  {
    clave: 'leads_pendientes',
    etiqueta: 'leads sin contestar', una: 'lead sin contestar',
    porque: 'un lead frío a los tres días ya no compra',
    a: '/leads', icono: 'megafono', tono: 'espera',
  },
  {
    clave: 'leads_reagendar',
    etiqueta: 'leads por reagendar', una: 'lead por reagendar',
    porque: 'pidieron otra fecha y siguen esperando',
    a: '/leads', icono: 'historial', tono: 'espera',
  },
  /*
   * Las visitas del marketplace, que no estaban.
   *
   * Lo único que las contaba era el número rojo del menú, al lado de Agenda, y
   * ese hay que ir a buscarlo. En el panel no salían: `citas_7d` cuenta las de
   * mantenimiento, que son otra tabla y otra pantalla.
   *
   * Y son las dos cosas que peor sientan de este flujo. Una por confirmar es
   * una persona que pidió hora y no ha recibido respuesta —a quien vende hay
   * que llamarle a mano, y si nadie llama, nadie llama—. Una sin cerrar es una
   * visita que ya pasó y de la que no sabemos si salió algo.
   */
  /*
   * Y el dinero del concesionario, que es de los que se pierden solos.
   *
   * El coche se vendió, el concesionario cobró y nuestro fee no lo reclama
   * nadie si no se emite. Es el mismo caso que la garantía, y por eso va con
   * los urgentes: no espera a nadie de fuera, espera a que alguien pulse.
   */
  {
    clave: 'ventas_sin_comisionar',
    etiqueta: 'ventas de concesionario sin comisionar', una: 'venta de concesionario sin comisionar',
    porque: 'la visita acabó en venta y nuestro fee no está facturado',
    a: '/comisiones', icono: 'euro', tono: 'urgente',
  },
  {
    clave: 'visitas_por_confirmar',
    etiqueta: 'visitas por confirmar', una: 'visita por confirmar',
    porque: 'el cliente pidió hora y sigue esperando a que llamemos',
    a: '/bookings', icono: 'calendario', tono: 'urgente',
  },
  {
    clave: 'visitas_sin_cerrar',
    etiqueta: 'visitas sin cerrar', una: 'visita sin cerrar',
    porque: 'ya pasaron y nadie ha dicho cómo acabaron',
    a: '/bookings', icono: 'calendario', tono: 'espera',
  },
  /*
   * Los encargos de venta de particulares.
   *
   * El mandato no caduca: se extiende hasta que el cliente cancela o vendemos.
   * Lo que sí tiene fecha es **hasta cuándo se le puede cobrar la penalización**
   * —30 días, si firmó la cláusula del precio—, y por eso el aviso no es una
   * despedida sino lo contrario: quedan cinco días para que pueda irse sin
   * pagarnos nada, así que es el momento de llamarle. Uno de cada cinco acaba
   * yéndose así, y en ese nos hemos gastado el anuncio y la revisión sin cobrar.
   *
   * El de las franjas va con los urgentes porque es un coche publicado —o a
   * punto— que **nadie puede visitar**: paga el anuncio y no convierte a nadie.
   */
  /*
   * A este cliente le hemos prometido, en la pagina y en el correo, que le
   * llamamos en menos de 24 horas laborables. Un lead de esos en el cajon de
   * «leads sin contestar» -cuyo criterio son tres dias- no tiene a nadie
   * vigilando esa promesa.
   */
  {
    clave: 'encargos_sin_llamar',
    etiqueta: 'encargos de venta sin llamar', una: 'encargo de venta sin llamar',
    porque: 'le hemos prometido una llamada en menos de 24 horas laborables',
    a: '/leads', icono: 'telefono', tono: 'urgente',
  },
  /*
   * Y el encargo sin mandato firmado.
   *
   * Ese coche se puede anunciar y se puede vender: lo que no se puede es
   * **cobrar**, ni los 299 € ni los 150 €. Es trabajo que ya se está haciendo y
   * que hoy no tiene detrás nada que lo sostenga, y cuanto más tarde se pida la
   * firma más raro es pedirla.
   */
  {
    clave: 'encargos_sin_firmar',
    etiqueta: 'encargos sin el mandato firmado', una: 'encargo sin el mandato firmado',
    porque: 'sin él no se le puede facturar nada, ni aunque el coche se venda',
    a: '/idcars', icono: 'documento', tono: 'urgente',
  },
  {
    clave: 'encargos_vendidos',
    etiqueta: 'coches vendidos sin cerrar el encargo', una: 'coche vendido sin cerrar el encargo',
    porque: 'la visita acabó en venta y los 299 € de gestión no están facturados',
    a: '/idcars', icono: 'euro', tono: 'urgente',
  },
  {
    clave: 'encargos_por_llamar',
    etiqueta: 'encargos a punto de poder irse', una: 'encargo a punto de poder irse',
    porque: 'en unos días podrá vender por su cuenta sin pagarnos nada',
    a: '/idcars', icono: 'reloj', tono: 'urgente',
  },
  {
    clave: 'encargos_sin_franjas',
    etiqueta: 'encargos sin horas para visitar', una: 'encargo sin horas para visitar',
    porque: 'lo ha traído todo y se ha quedado sin huecos: nadie puede ir a ver el coche',
    a: '/idcars', icono: 'calendario', tono: 'urgente',
  },
  /*
   * Y el que el taller ha tumbado.
   *
   * Ese coche no se publica y su dueño no lo sabe: tiene un encargo firmado y
   * está esperando a ver su anuncio. Es el único caso en que la respuesta no es
   * pulsar un botón sino coger el teléfono, y por eso no puede quedarse dentro
   * de «listos para el taller»: ahí no espera a nadie y desaparecería.
   */
  {
    clave: 'encargos_rechazados',
    etiqueta: 'coches que el taller no deja vender', una: 'coche que el taller no deja vender',
    porque: 'su anuncio no va a salir y el cliente sigue esperándolo',
    a: '/idcars', icono: 'aviso', tono: 'urgente',
  },
  {
    clave: 'encargos_listos',
    etiqueta: 'encargos listos para el taller', una: 'encargo listo para el taller',
    porque: 'el cliente ya lo ha traído todo y falta la revisión para poder publicar',
    a: '/idcars', icono: 'taller', tono: 'espera',
  },
  /*
   * Y los anuncios que siguen puestos fuera de un coche que ya no está a la
   * venta.
   *
   * No es papeleo: el teléfono que sale en ese anuncio es el nuestro, así que
   * las llamadas por un coche vendido las cogemos nosotros — y al que llama se
   * le dice que no, que es la peor manera de conocernos. Además se sigue
   * pagando el anuncio.
   *
   * Y no se apaga solo, como el del escaparate: hay que entrar a coches.net y
   * borrarlo. Si nadie lo apuntó, nadie sabe que está.
   */
  {
    clave: 'anuncios_por_retirar',
    etiqueta: 'anuncios que hay que quitar de los portales', una: 'anuncio que hay que quitar de un portal',
    porque: 'ese coche ya no está a la venta y las llamadas del anuncio las cogemos nosotros',
    a: '/portales', icono: 'tabla', tono: 'urgente',
  },
  {
    clave: 'citas_7d',
    etiqueta: 'citas de mantenimiento en 7 días', una: 'cita de mantenimiento en 7 días',
    porque: 'hay que confirmarlas antes',
    a: '/appointments', icono: 'llave-inglesa', tono: 'espera',
  },
];

/**
 * Los que tienen algo, en el orden del catálogo.
 *
 * Los que están a cero **no salen**. Aquí sí se esconde lo vacío, al revés que
 * en los desgloses del negocio: una lista de tareas con nueve filas a cero es
 * una lista que se deja de leer, y lo que se quiere saber de esta pantalla es
 * exactamente qué hay que hacer.
 */
export function losPendientes(cuentas: Record<string, unknown> | null | undefined): Pendiente[] {
  const salida: Pendiente[] = [];
  for (const p of CATALOGO) {
    const n = Number(cuentas?.[p.clave] ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    salida.push({ ...p, n: Math.round(n) });
  }
  return salida;
}

/** Cuántas cosas hay que hacer en total, para el número del título. */
export function cuantasCosas(pendientes: readonly Pendiente[]): number {
  return pendientes.reduce((s, p) => s + p.n, 0);
}
