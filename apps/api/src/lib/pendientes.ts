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
