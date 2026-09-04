/**
 * Los papeles de un coche: dónde cuelgan y cuáles se esperan.
 *
 * El almacén nació entendiendo solo de solicitudes, porque el primer sitio donde
 * hizo falta subir papeles fue un expediente de importación. Pero los papeles no
 * son de una solicitud: son **del coche**, y aparecen en sitios distintos según
 * el momento —la factura llega con el pedido, la ficha técnica la devuelve la
 * gestoría, el albarán lo trae el transportista—.
 *
 * Por eso un documento se guarda diciendo **de qué cuelga**: de una solicitud, de
 * un pedido, de un trámite o de un transporte —las fotos de la recogida y de la
 * entrega son de ese viaje, no del coche en general—.
 *
 * Y lo segundo, que es lo que de verdad faltaba: **saber cuáles no están**. Un
 * coche alemán no se matricula sin su ficha ni sin el COC, y eso hay que verlo
 * antes de tenerlo aparcado, no el día que la gestoría lo pide.
 */

export const AMBITOS = ['lead', 'pedido', 'tramite', 'transporte', 'peritacion'] as const;
export type Ambito = (typeof AMBITOS)[number];

export function esAmbito(v: string): v is Ambito {
  return (AMBITOS as readonly string[]).includes(v);
}

export interface PapelEsperado {
  /** Cómo se llama, y con lo que se marca en la lista. */
  papel: string;
  /** Para qué sirve. Lo lee quien no sabe por qué se lo están pidiendo. */
  porQue: string;
  /** Sin él no se puede seguir. Los demás son convenientes. */
  imprescindible: boolean;
}

/**
 * Lo que hay que reunir según a quién se le compre.
 *
 * Es una propuesta, no una aduana: se pueden subir otros y se puede seguir sin
 * alguno. Lo que no puede es no saberse cuáles faltan.
 */
export const PAPELES_POR_ORIGEN: Record<string, PapelEsperado[]> = {
  importacion: [
    { papel: 'Ficha del vehículo (parte II)', porQue: 'Es el título de propiedad alemán. Sin él no se matricula aquí', imprescindible: true },
    { papel: 'Ficha del vehículo (parte I)',  porQue: 'El permiso de circulación alemán', imprescindible: true },
    { papel: 'COC (certificado de conformidad)', porQue: 'La homologación europea. Sin él hay que homologar unidad a unidad: caro y lento', imprescindible: true },
    { papel: 'Factura del vendedor alemán', porQue: 'A nombre del cliente. Sin ella no se matricula, y es la que prueba que el coche es suyo', imprescindible: true },
    { papel: 'Contrato de compraventa', porQue: 'Entre el vendedor alemán y el cliente. Es a lo que se agarra una reclamación', imprescindible: false },
    { papel: 'Justificante de baja en Alemania', porQue: 'Que allí ya no está matriculado', imprescindible: false },
    { papel: 'Libro de mantenimiento', porQue: 'Se le entrega al cliente, y es lo que hace que el coche valga más el día que lo venda', imprescindible: false },
  ],
  concesionario: [
    { papel: 'Factura', porQue: 'La compra, con su IVA', imprescindible: true },
    { papel: 'Permiso de circulación', porQue: 'Quién es el titular hoy: es lo que se cambia al transferir', imprescindible: true },
    { papel: 'Ficha técnica', porQue: 'Lo que el coche es y las ITV que lleva pasadas', imprescindible: true },
    { papel: 'Contrato de compraventa', porQue: 'Lo que se acordó, por si hay que reclamar algo después', imprescindible: false },
    { papel: 'Justificante de que no hay cargas', porQue: 'Con una carga encima no se puede poner a nombre de nadie', imprescindible: false },
  ],
  'ex-renting': [
    { papel: 'Factura', porQue: 'La compra, con su IVA', imprescindible: true },
    { papel: 'Permiso de circulación', porQue: 'Quién es el titular hoy: es lo que se cambia al transferir', imprescindible: true },
    { papel: 'Ficha técnica', porQue: 'Lo que el coche es y las ITV que lleva pasadas', imprescindible: true },
    { papel: 'Contrato de compraventa', porQue: 'Lo que se acordó, por si hay que reclamar algo después', imprescindible: false },
    { papel: 'Justificante de que no hay cargas', porQue: 'Una flota puede llevar reserva de dominio, y con ella no se transfiere', imprescindible: true },
    { papel: 'Informe de inspección', porQue: 'El estado que certifica la empresa de renting al venderlo', imprescindible: false },
  ],
  particular: [
    { papel: 'DNI del vendedor', porQue: 'Quien firma tiene que ser el titular', imprescindible: true },
    { papel: 'Permiso de circulación', porQue: 'Quién es el titular: tiene que ser quien firma la venta', imprescindible: true },
    { papel: 'Ficha técnica', porQue: 'Lo que el coche es, y que la ITV está en vigor', imprescindible: true },
    { papel: 'Informe de la DGT', porQue: 'Cargas, embargos, bajas. Se mira ANTES de pagar', imprescindible: true },
    { papel: 'Último recibo del impuesto de circulación', porQue: 'Una deuda del ayuntamiento bloquea la transferencia', imprescindible: true },
    { papel: 'Contrato de compraventa', porQue: 'Firmado por los dos: es lo que prueba que el coche es tuyo', imprescindible: true },
  ],
  stock: [
    { papel: 'Factura', porQue: 'La compra: es el coste con el que entra en el inventario', imprescindible: true },
    { papel: 'Permiso de circulación', porQue: 'Quién es el titular hoy, para poder venderlo después', imprescindible: false },
    { papel: 'Ficha técnica', porQue: 'Lo que el coche es y las ITV que lleva pasadas', imprescindible: false },
  ],
};

/** Lo que se espera de este origen. Vacío si el origen no se conoce. */
export function papelesEsperados(origen: string): PapelEsperado[] {
  return PAPELES_POR_ORIGEN[origen] ?? [];
}

/**
 * Qué falta por reunir.
 *
 * Se compara por el nombre del papel, que es lo que se elige al subirlo. Un
 * documento subido como «otro» no tapa ningún hueco a propósito: si tapara,
 * bastaría con subir cualquier cosa para que la lista se pusiera verde.
 */
export function papelesQueFaltan(origen: string, subidos: string[]): PapelEsperado[] {
  const hay = new Set(subidos.map((x) => x.trim().toLowerCase()).filter(Boolean));
  return papelesEsperados(origen).filter((p) => !hay.has(p.papel.toLowerCase()));
}

/** Los que faltan y además hacen falta de verdad. */
export function faltaAlgoImprescindible(origen: string, subidos: string[]): boolean {
  return papelesQueFaltan(origen, subidos).some((p) => p.imprescindible);
}
