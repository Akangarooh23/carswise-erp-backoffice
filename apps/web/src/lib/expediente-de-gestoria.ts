/**
 * El expediente de gestoría de un coche de fuera.
 *
 * Espejo de `apps/api/src/lib/expediente-de-gestoria.ts`, duplicado porque los
 * dos lados se compilan por separado. Lo que hay que sostener es que **piden lo
 * mismo**: si la pantalla dejara cerrar algo que el servidor rechaza, el botón
 * parecería roto.
 *
 * Lo que se le encarga a la gestoría de un coche de fuera, en un solo sitio.
 *
 * Son tres papeleos —el impuesto de matriculación, la ITV de homologación y la
 * matrícula española— pero **un solo encargo**: los lleva la misma gestoría,
 * con una factura y un interlocutor. Tenerlos como tres fichas era la misma
 * cosa contada tres veces.
 *
 * Lo que sí hace falta es que la caja **diga qué cubre**. Con el título a secas
 * —«Matriculación de importación»— quien la mira no sabe si el impuesto y la
 * ITV están dentro o se olvidaron, y acaba abriendo un trámite suelto por si
 * acaso.
 *
 * Y que diga **qué falta para darla por terminada**: los papeles que tienen que
 * volver y el coste que tiene que estar apuntado. Un expediente marcado resuelto
 * sin la ficha técnica es un coche que no se puede entregar, descubierto el día
 * de la entrega.
 */

/** Lo que va dentro del encargo, para poder decirlo. */
export const LO_QUE_CUBRE: Record<string, string[]> = {
  'Matriculación de importación': [
    'Impuesto de matriculación',
    'ITV de homologación',
    'Matrícula española',
  ],
};

/** Los papeles que tienen que volver de la gestoría antes de darlo por hecho. */
export const PAPELES_QUE_VUELVEN: Record<string, string[]> = {
  'Matriculación de importación': [
    'Permiso de circulación',
    'Ficha técnica',
    'Justificante del impuesto de matriculación',
  ],
};

export function loQueCubre(tipo: string): string[] {
  return LO_QUE_CUBRE[String(tipo ?? '').trim()] ?? [];
}

export function papelesQueVuelven(tipo: string): string[] {
  return PAPELES_QUE_VUELVEN[String(tipo ?? '').trim()] ?? [];
}

/**
 * Lo que falta para darlo por resuelto.
 *
 * Dos cosas y en este orden: **los papeles** —sin el permiso de circulación y
 * la ficha técnica el coche no se entrega— y **lo que ha costado**, que es lo
 * que cierra la cuenta del coche. Dar por terminado un expediente sin el coste
 * deja un gasto que aparece semanas después, cuando ya se ha calculado el
 * margen.
 *
 * Se compara por el nombre del papel, que es lo que se elige al subirlo: un
 * documento subido como «otro» no tapa ningún hueco a propósito, porque si
 * tapara bastaría con subir cualquier cosa para poder cerrar.
 */
export function faltaParaResolver(datos: {
  tipo?: string | null;
  papeles?: string[] | null;
  coste?: unknown;
}): string[] {
  const falta: string[] = [];
  const hay = new Set((datos.papeles ?? []).map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean));

  for (const papel of papelesQueVuelven(String(datos.tipo ?? ''))) {
    if (!hay.has(papel.toLowerCase())) falta.push(papel);
  }

  const cuesta = Number(String(datos.coste ?? '').replace(',', '.'));
  if (!Number.isFinite(cuesta) || cuesta <= 0) falta.push('Lo que ha costado, partida a partida');

  return falta;
}

export function puedeDarsePorResuelto(datos: {
  tipo?: string | null;
  papeles?: string[] | null;
  coste?: unknown;
}): boolean {
  return faltaParaResolver(datos).length === 0;
}
