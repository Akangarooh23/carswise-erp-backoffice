/**
 * El coche entregado pasa a ser el IdCar del cliente.
 *
 * Hasta ahora, el día de la entrega el expediente se cerraba y ahí se acababa
 * todo: el cliente tenía un coche y en su panel no tenía nada. Sus papeles —el
 * permiso de circulación, la ficha técnica, el COC, las facturas— se quedaban
 * en nuestros cajones, que son los del ERP y él no ve.
 *
 * Y son suyos. Los va a necesitar el día que lo venda, el día que le pare la
 * Guardia Civil y el día que pida un presupuesto de taller. Que estén en un
 * cajón nuestro es exactamente el problema que el IdCar existe para resolver.
 *
 * Así que al entregar se le da de alta el coche en su garaje con lo que
 * sabemos: marca, modelo, matrícula, año y los kilómetros que marcaba al
 * recibirlo. Y se le enganchan los documentos.
 *
 * **Los documentos no se copian: se apuntan.** El fichero ya está subido en el
 * mismo almacén, y duplicar un PDF de tres megas por cada coche entregado es
 * pagar dos veces por el mismo byte y quedarse con dos copias que pueden acabar
 * diciendo cosas distintas. Se guarda la URL pública del que ya hay.
 *
 * Se hace una sola vez por expediente: `source_lead_id` es la marca. Volver a
 * guardar un expediente entregado no puede dejarle el garaje con dos coches
 * iguales.
 */

/**
 * Los papeles del coche que le interesan a él, y dónde van.
 *
 * Su panel tiene dos sitios y no uno. Los documentos «oficiales» del coche
 * viven en una tabla con un tipo cerrado —permiso de circulación, ficha
 * técnica e ITV, y no hay más—: son los que la pantalla sabe enseñar con su
 * nombre y su hueco. Lo demás va al cajón de ficheros del coche, que es un
 * cajón sin tipo.
 *
 * Meter una factura alemana como «ficha técnica» para que entre en el hueco
 * bonito sería mentirle a su propia pantalla: el día que busque su ficha
 * técnica encontraría una factura.
 */
export type DondeVa = 'documento' | 'fichero';

export const PAPELES_DEL_CLIENTE: Record<string, { donde: DondeVa; tipo: string }> = {
  'Permiso de circulación':                    { donde: 'documento', tipo: 'circulation_permit' },
  'Ficha técnica':                             { donde: 'documento', tipo: 'technical_sheet' },
  'Ficha del vehículo (parte I)':              { donde: 'documento', tipo: 'technical_sheet' },
  'Ficha del vehículo (parte II)':             { donde: 'documento', tipo: 'technical_sheet' },
  'ITV de homologación':                       { donde: 'documento', tipo: 'itv' },
  'COC (certificado de conformidad)':          { donde: 'fichero',   tipo: 'document' },
  'Justificante del impuesto de matriculación': { donde: 'fichero',  tipo: 'document' },
  'Factura del vendedor alemán':               { donde: 'fichero',   tipo: 'document' },
  'Factura de nuestro servicio':               { donde: 'fichero',   tipo: 'document' },
};

/**
 * Si un papel nuestro es también suyo.
 *
 * No todo lo que hay en un expediente le interesa: el presupuesto del
 * transportista, la factura del perito y las fotos del viaje son papeles de
 * nuestra operación. Meterlos en su garaje es darle a leer nuestros costes.
 */
export function esSuyo(papel: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAPELES_DEL_CLIENTE, String(papel ?? '').trim());
}

/** Dónde va y con qué tipo, o nulo si no es suyo. */
export function dondeVaEnSuPanel(papel: string): { donde: DondeVa; tipo: string } | null {
  return PAPELES_DEL_CLIENTE[String(papel ?? '').trim()] ?? null;
}

/**
 * La marca y el modelo, sacados del título del anuncio.
 *
 * Viene como «Kia Sorento 2.4 GDI AWD Automatik Kamera LED»: la primera palabra
 * es la marca, la segunda el modelo y lo demás es la versión. No es exacto
 * —«Land Rover» son dos palabras— pero es lo que hay, y el cliente puede
 * corregirlo en su ficha. Dejar los tres campos vacíos sería peor: un coche sin
 * marca no sale en ninguna búsqueda de su propio panel.
 */
export function marcaYModelo(titulo: string): { brand: string; model: string; version: string } {
  const limpio = String(titulo ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) return { brand: '', model: '', version: '' };

  // Las marcas de dos palabras que salen de verdad en un anuncio alemán.
  const DOBLES = ['land rover', 'alfa romeo', 'aston martin', 'mercedes benz', 'mercedes-benz', 'rolls royce'];
  const bajo = limpio.toLowerCase();
  const doble = DOBLES.find((d) => bajo.startsWith(d + ' '));

  const trozos = limpio.split(' ');
  const brand = doble ? limpio.slice(0, doble.length) : trozos[0] ?? '';
  const resto = limpio.slice(brand.length).trim().split(' ').filter(Boolean);
  return {
    brand,
    model: resto[0] ?? '',
    version: resto.slice(1).join(' '),
  };
}

/** Lo que hace falta para darle de alta el coche. */
export function faltaParaDarleElIdCar(d: {
  correo?: string | null;
  vehiculo?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!String(d.correo ?? '').trim()) falta.push('el correo del cliente');
  if (!String(d.vehiculo ?? '').trim()) falta.push('qué coche es');
  return falta;
}

/**
 * La URL pública de un fichero del almacén.
 *
 * El bucket es el mismo que usa el panel del cliente, así que el fichero que ya
 * está subido le vale tal cual: no hay que copiar nada.
 */
export function urlDelFichero(base: string, ruta: string): string {
  const raiz = String(base ?? '').replace(/\/+$/, '');
  const dentro = String(ruta ?? '').replace(/^\/+/, '');
  if (!raiz || !dentro) return '';
  return `${raiz}/storage/v1/object/public/vehicle-files/${dentro}`;
}
