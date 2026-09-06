/**
 * De dónde sale cada euro y a dónde se va.
 *
 * Un total de ingresos no dice nada por sí solo. «Hemos ingresado 23.000 €» se
 * lee igual viniendo de un coche vendido una vez que de un servicio que se
 * repite, y son dos negocios distintos: uno hay que volver a comprarlo y el
 * otro no. La pregunta que importa es de qué línea viene, y esa respuesta no
 * está en ninguna columna: hay que sacarla de la serie de la factura y del tipo
 * del proveedor.
 *
 * Nada de adivinar por el texto. Una factura de 890 € cuyo concepto dice
 * «Transporte · tramo 1» se clasifica porque el proveedor está dado de alta
 * como transportista, no porque ponga «transporte»: el día que alguien escriba
 * «porte» el número se movería de sitio sin que nadie lo tocara.
 *
 * Lo que no se sabe clasificar cae en «sin clasificar» y se ve. Un cajón de
 * sobras que se reparte en silencio entre los demás es peor que un cajón de
 * sobras.
 */

/** De dónde viene el dinero que entra. */
export type LineaDeIngreso =
  | 'importacion'
  | 'venta'
  | 'comisiones'
  | 'informes'
  | 'suscripciones'
  | 'otros';

/** Y en qué se va el que sale. */
export type LineaDeGasto =
  | 'compra'
  | 'transporte'
  | 'peritacion'
  | 'gestoria'
  | 'garantia'
  | 'otros';

export const NOMBRE_DEL_INGRESO: Record<LineaDeIngreso, string> = {
  importacion:   'Importación de vehículos',
  venta:         'Venta de vehículos',
  comisiones:    'Comisiones de proveedores',
  informes:      'Informes y tasaciones',
  suscripciones: 'Suscripciones',
  otros:         'Sin clasificar',
};

export const NOMBRE_DEL_GASTO: Record<LineaDeGasto, string> = {
  compra:     'Compra de vehículos',
  transporte: 'Transporte',
  peritacion: 'Peritación',
  gestoria:   'Gestoría y trámites',
  garantia:   'Garantías',
  otros:      'Sin clasificar',
};

/** En qué orden se enseñan, de más a menos característico del negocio. */
export const ORDEN_DE_INGRESOS: readonly LineaDeIngreso[] =
  ['importacion', 'venta', 'comisiones', 'informes', 'suscripciones', 'otros'];

export const ORDEN_DE_GASTOS: readonly LineaDeGasto[] =
  ['compra', 'transporte', 'peritacion', 'gestoria', 'garantia', 'otros'];

/**
 * Las series de factura que emitimos, y qué línea es cada una.
 *
 * La serie es el dato bueno: la pone quien emite la factura, no cambia nunca y
 * es lo que mira el asesor. `CW` es la serie vieja de los informes de la web y
 * `TAS` la nueva; conviven porque las emitidas no se renumeran.
 */
const LINEA_POR_SERIE: Record<string, LineaDeIngreso> = {
  SRV:  'importacion',
  VTA:  'venta',
  FIA:  'importacion',
  CW:   'informes',
  TAS:  'informes',
  SUBS: 'suscripciones',
};

/** `SRV-2026-0001` → `SRV`. */
export function serieDe(numero: string | null | undefined): string {
  const m = String(numero ?? '').trim().toUpperCase().match(/^([A-Z]+)[-/]/);
  return m ? m[1] : '';
}

/** Lo que la factura de proveedor dice de sí misma. */
export type TipoDeFactura = 'vehicle_sale' | 'warranty_commission' | 'received_invoice' | string;

export interface ParaClasificar {
  /** El número, con su serie. */
  numero?: string | null;
  /** El `type` de la factura, cuando viene de la tabla de proveedores. */
  tipo?: TipoDeFactura | null;
  /** Los tipos con los que está dado de alta el proveedor. */
  tiposDelProveedor?: readonly string[] | null;
  /**
   * Si sale de la tabla de facturación al cliente.
   *
   * Importa para el caso por defecto: esa tabla solo tiene tres cosas dentro
   * —el servicio de importación, los informes y los cobros recurrentes del
   * plan—, y las dos primeras llevan serie propia. Lo que queda es una cuota,
   * aunque el número que le pone la pasarela no lo diga.
   */
  delCliente?: boolean;
}

/**
 * De qué línea es un ingreso.
 *
 * El `type` de la factura manda sobre la serie: una venta de vehículo lo dice
 * de sí misma y no depende de que alguien numerara bien.
 */
export function lineaDelIngreso(x: ParaClasificar): LineaDeIngreso {
  if (x.tipo === 'vehicle_sale') return 'venta';
  if (x.tipo === 'warranty_commission') return 'comisiones';

  const porSerie = LINEA_POR_SERIE[serieDe(x.numero)];
  if (porSerie) return porSerie;

  return x.delCliente ? 'suscripciones' : 'otros';
}

/** Y en qué se ha ido un gasto, según con qué está dado de alta el proveedor. */
export function lineaDelGasto(x: ParaClasificar): LineaDeGasto {
  const tipos = (x.tiposDelProveedor ?? []).map((t) => String(t ?? '').toLowerCase());

  // El orden importa cuando un proveedor lleva varios sombreros: el más
  // específico primero, para que un transportista que además perita no mande
  // todos sus portes a peritación.
  if (tipos.includes('vendedor')) return 'compra';
  if (tipos.includes('perito')) return 'peritacion';
  if (tipos.includes('gestoria')) return 'gestoria';
  if (tipos.includes('garantia')) return 'garantia';
  if (tipos.includes('transportista')) return 'transporte';

  return 'otros';
}
