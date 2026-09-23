/**
 * La ficha técnica, leída una vez y guardada.
 *
 * Leerla era un botón que alguien tenía que acordarse de pulsar. Así, el error
 * del T-Roc —110 CV donde son 150— se descubre solo si alguien entra en esa
 * pantalla y pulsa; mientras tanto el coche se tasa y se anuncia con cuarenta
 * caballos de menos.
 *
 * Ahora se lee **en cuanto el documento llega**, lo suba el cliente desde su
 * panel o alguien del equipo desde el ERP, y el resultado se guarda. Lo que se
 * gana no es ahorrar la pulsación: es que la contradicción exista antes de que
 * nadie tase nada.
 *
 * ## Por qué se guarda y no se relee
 *
 * Cada lectura es una llamada al lector y el papel no cambia. Se guarda por
 * documento —su dirección—, así que volver a subir otra ficha sí se lee otra
 * vez, y la misma no.
 *
 * ## Y por qué esto no corrige nada
 *
 * Guarda lo que dice el papel y deja que se vea en qué se diferencia. Aplicarlo
 * sigue siendo de una persona: corregir el coche cambia el anuncio que lee el
 * comprador, y un dato que cambia solo no lo revisa nadie.
 */
import { query } from '../db/pool.js';
import { loQueDiceLaFicha, lasDiferencias, laVersionNoCuadra, type Diferencia } from './la-ficha-tecnica.js';
import { bajaElPapel, leeElPapel } from './lee-la-ficha.js';
import { CAMPOS } from './caracteristicas-del-coche.js';

export const ENSURE_TABLA = `
  CREATE TABLE IF NOT EXISTS erp_fichas_tecnicas_leidas (
    vehicle_id  TEXT PRIMARY KEY,
    documento   TEXT        NOT NULL DEFAULT '',
    nombre      TEXT        NOT NULL DEFAULT '',
    codigos     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    confianza   TEXT        NOT NULL DEFAULT '',
    fallo       TEXT        NOT NULL DEFAULT '',
    leida_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

let tablaLista = false;
async function aseguraLaTabla(): Promise<void> {
  if (tablaLista) return;
  await query(ENSURE_TABLA).catch(() => {});
  tablaLista = true;
}

export const etiquetaDe = (clave: string): string =>
  CAMPOS.find((c) => c.clave === clave)?.etiqueta ?? '';

export interface LaLectura {
  documento: string;
  nombre: string;
  codigos: Record<string, unknown>;
  confianza: string;
  /** Por qué no se pudo leer, si no se pudo. Vacío cuando fue bien. */
  fallo: string;
  leida_at: string;
}

/** La ficha técnica subida de ese coche, la última. */
async function elDocumento(vehicleId: string): Promise<{ url: string; nombre: string } | null> {
  const r = await query(
    `SELECT file_url, file_name
       FROM moveadvisor_user_vehicle_documents
      WHERE vehicle_id = $1 AND document_type = 'technical_sheet'
        AND COALESCE(file_url, '') <> ''
      ORDER BY created_at DESC LIMIT 1`,
    [vehicleId],
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (!r.rows.length) return null;
  return { url: String(r.rows[0].file_url ?? ''), nombre: String(r.rows[0].file_name ?? '') };
}

/** Lo que ya está leído de ese coche, si lo está. */
export async function loLeido(vehicleId: string): Promise<LaLectura | null> {
  await aseguraLaTabla();
  const r = await query(
    `SELECT documento, nombre, codigos, confianza, fallo, leida_at
       FROM erp_fichas_tecnicas_leidas WHERE vehicle_id = $1`,
    [vehicleId],
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (!r.rows.length) return null;
  const f = r.rows[0];
  return {
    documento: String(f.documento ?? ''),
    nombre: String(f.nombre ?? ''),
    codigos: (f.codigos ?? {}) as Record<string, unknown>,
    confianza: String(f.confianza ?? ''),
    fallo: String(f.fallo ?? ''),
    leida_at: String(f.leida_at ?? ''),
  };
}

async function guarda(vehicleId: string, l: Omit<LaLectura, 'leida_at'>): Promise<void> {
  await aseguraLaTabla();
  await query(
    `INSERT INTO erp_fichas_tecnicas_leidas (vehicle_id, documento, nombre, codigos, confianza, fallo, leida_at)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
     ON CONFLICT (vehicle_id) DO UPDATE
            SET documento = EXCLUDED.documento, nombre = EXCLUDED.nombre,
                codigos = EXCLUDED.codigos, confianza = EXCLUDED.confianza,
                fallo = EXCLUDED.fallo, leida_at = NOW()`,
    [vehicleId, l.documento, l.nombre, JSON.stringify(l.codigos), l.confianza, l.fallo],
  );
}

/**
 * Lee la ficha técnica de ese coche y guarda lo que diga.
 *
 * Si ya está leída **ese mismo documento**, no se vuelve a leer: el papel no
 * cambia y cada lectura cuesta. Con `otraVez` se fuerza, que es lo que hace el
 * botón cuando alguien quiere repetirla.
 *
 * El fallo también se guarda. Un documento que no es una ficha técnica —la
 * factura del taller subida en la casilla equivocada— tiene que constar: si no,
 * se reintenta en cada repaso y nadie se entera de que lo que falla es el
 * documento, no el lector.
 */
export async function leeYGuarda(
  vehicleId: string,
  { otraVez = false }: { otraVez?: boolean } = {},
): Promise<LaLectura | null> {
  const doc = await elDocumento(vehicleId);
  if (!doc) return null;

  if (!otraVez) {
    const ya = await loLeido(vehicleId);
    /*
     * Se reaprovecha la lectura **buena**, no la fallida.
     *
     * El papel no cambia, así que releerlo no aporta nada; un fallo sí cambia
     * solo: la clave del lector que faltaba se configura, el almacén que no
     * respondía vuelve. Guardando también el fallo como resultado, el botón
     * seguiría enseñando para siempre un error ya arreglado.
     *
     * Que esto reintente no hace que el repaso reintente: aquel busca fichas
     * **sin ninguna fila**, y una fallida ya la tiene. Así un documento que no
     * hay manera de leer no se lee una y otra vez sin que nadie se entere.
     */
    if (ya && ya.documento === doc.url && !ya.fallo) return ya;
  }

  const base = { documento: doc.url, nombre: doc.nombre };
  try {
    const papel = await bajaElPapel(doc.url);
    const leido = await leeElPapel(papel);
    const lectura = { ...base, codigos: leido.codigos, confianza: leido.confianza, fallo: '' };
    await guarda(vehicleId, lectura);
    return { ...lectura, leida_at: new Date().toISOString() };
  } catch (err) {
    const lectura = { ...base, codigos: {}, confianza: '', fallo: (err as Error).message };
    await guarda(vehicleId, lectura).catch(() => {});
    return { ...lectura, leida_at: new Date().toISOString() };
  }
}

export interface LoQueSaleDeLaFicha {
  nombre: string;
  confianza: string;
  fallo: string;
  diferencias: Diferencia[];
  avisos: string[];
  /** Cierto cuando del documento no sale ni un dato: no es una ficha técnica. */
  no_es_una_ficha: boolean;
}

/**
 * Lo leído, puesto al lado de lo que hay en el coche.
 *
 * Se compara **al mirarlo** y no al leerlo: el coche se corrige a mano, así que
 * una diferencia guardada ayer puede estar ya resuelta. Lo que se guarda es lo
 * que dice el papel, que es lo que no cambia.
 */
export function comoQuedaContraElCoche(
  lectura: LaLectura | null | undefined,
  coche: Record<string, unknown> | null | undefined,
): LoQueSaleDeLaFicha | null {
  if (!lectura) return null;
  if (lectura.fallo) {
    return { nombre: lectura.nombre, confianza: '', fallo: lectura.fallo, diferencias: [], avisos: [], no_es_una_ficha: false };
  }
  const { campos, avisos } = loQueDiceLaFicha(lectura.codigos);
  if (!Object.keys(campos).length) {
    return { nombre: lectura.nombre, confianza: lectura.confianza, fallo: '', diferencias: [], avisos: [], no_es_una_ficha: true };
  }
  /*
   * Y si la versión que eligió el cliente contradice al papel, delante de todo.
   *
   * Es el aviso que más vale de los que hay aquí: la tasación compara su coche
   * con los de su versión, y una gama tiene tres «1.5» que no valen lo mismo.
   * Un caballo de diferencia en la casilla de potencia se corrige con un clic;
   * una versión equivocada mueve el precio del que se habla con el cliente.
   */
  const deLaVersion = laVersionNoCuadra(coche?.version, lectura.codigos);

  return {
    nombre: lectura.nombre,
    confianza: lectura.confianza,
    fallo: '',
    diferencias: lasDiferencias(coche, campos, etiquetaDe),
    avisos: deLaVersion ? [deLaVersion, ...avisos] : avisos,
    no_es_una_ficha: false,
  };
}

/** Cuántos datos del coche no cuadran con su ficha técnica. */
export function cuantosNoCuadran(x: LoQueSaleDeLaFicha | null | undefined): number {
  return (x?.diferencias ?? []).filter((d) => d.corrige).length;
}

/**
 * Las fichas subidas que todavía no se han leído.
 *
 * Es la red de debajo: cubre las que se subieron mientras el lector estaba
 * caído, y las que llegaron por un camino que todavía no avisa. Se lee una
 * ficha por coche y las más nuevas primero, que son las que alguien está
 * esperando.
 */
export async function lasQueFaltanPorLeer(limite = 20): Promise<string[]> {
  await aseguraLaTabla();
  const r = await query(
    `SELECT DISTINCT ON (d.vehicle_id) d.vehicle_id
       FROM moveadvisor_user_vehicle_documents d
       LEFT JOIN erp_fichas_tecnicas_leidas f
         ON f.vehicle_id = d.vehicle_id AND f.documento = d.file_url
      WHERE d.document_type = 'technical_sheet'
        AND COALESCE(d.file_url, '') <> ''
        AND f.vehicle_id IS NULL
      ORDER BY d.vehicle_id, d.created_at DESC
      LIMIT $1`,
    [limite],
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return r.rows.map((x) => String(x.vehicle_id));
}

/** Lee las que falten. Devuelve cuántas se han leído. */
export async function leeLasPendientes(limite = 20): Promise<number> {
  const pendientes = await lasQueFaltanPorLeer(limite);
  let leidas = 0;
  for (const id of pendientes) {
    // Una que falle no puede dejar sin leer a las demás.
    const r = await leeYGuarda(id).catch(() => null);
    if (r) leidas += 1;
  }
  return leidas;
}
