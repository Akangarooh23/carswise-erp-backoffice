/**
 * Todos los papeles de un coche, en un sitio.
 *
 * Hoy están repartidos en **ocho tablas, dos almacenes y tres formas distintas
 * de servir un fichero**. Para contestar «enséñame todo lo del 5228HNS» hay
 * que abrir cuatro pantallas y, sobre todo, saber de antemano dónde mirar. La
 * consecuencia no es incomodidad: es que lo que no se encuentra se vuelve a
 * pedir, y ya ha pasado —una póliza subida dos veces, un informe que se daba
 * por perdido y estaba.
 *
 * ## Por qué una vista y no una carpeta de verdad
 *
 * La idea natural es «una carpeta por coche y dentro Fotos, Peritación,
 * Mandato…». Como **vista** es exactamente lo correcto, y es lo que esto
 * devuelve. Como **almacén** rompería dos cosas:
 *
 * 1. **Una carpeta no sabe de permisos.** Las fotos tienen que ser públicas:
 *    son el anuncio. El informe del perito lleva la dirección de casa del
 *    cliente y no puede serlo. Si lo que organiza es «dónde está», acaba
 *    ganando una sola regla para todo, y la que gana siempre es la cómoda.
 *    Lo que tiene que variar por documento es **quién puede verlo**.
 * 2. **Un papel no es solo del coche: es de un momento.** El informe es de
 *    *esa* visita, el mandato de *ese* encargo, la factura de *ese*
 *    mantenimiento. Una carpeta «Peritación» con dos informes dentro ya no
 *    dice cuál es de cuál, y las revisiones se repiten.
 *
 * Así que los ficheros se quedan donde están, cada uno colgando del momento
 * que lo produjo, y lo que se construye aquí es el índice.
 *
 * ## Lo que NO hace, a propósito
 *
 * No sirve ni un byte. Devuelve **dónde está** cada papel y **por qué puerta**
 * se abre, y abrirlo sigue siendo cosa de la ruta que ya sabe comprobar de
 * quién es. Un reunidor que además sirviera ficheros sería un sitio nuevo por
 * donde sacar la póliza de alguien.
 */

import { query } from '../db/pool.js';

/**
 * Los cajones, que son los que pediría cualquiera que busque algo.
 *
 * El orden es el del expediente de venta, no el alfabético: primero lo que se
 * ve —las fotos—, luego lo que prueba que el coche es lo que decimos, y al
 * final el dinero. Quien abre esto suele venir buscando uno de los tres
 * primeros.
 */
export const CAJONES = [
  'Fotos',
  'Papeles del coche',
  'Informe de estado',
  'Peritación',
  'Mandato',
  'Tasación',
  'Seguro',
  'Mantenimiento',
  'Otros',
] as const;
export type Cajon = (typeof CAJONES)[number];

/** Dónde vive hoy un fichero, que no es lo mismo que quién puede verlo. */
export type Donde =
  /** Almacén público: se abre con la dirección, sin sesión. Son las fotos. */
  | 'publico'
  /** Almacén privado: hace falta pasar por una ruta que comprueba quién pide. */
  | 'privado'
  /** No es nuestro: vive en Check y se pide allí. */
  | 'fuera';

export interface PapelDelCoche {
  /** Para poder pedirlo después. No es único entre cajones: lo es con el cajón. */
  id: string;
  cajon: Cajon;
  nombre: string;
  tipo: string;
  tamano: number;
  /** Cuándo entró. */
  cuando: string | null;
  /**
   * De qué momento es, con palabras.
   *
   * «Visita del 5 de octubre», «Encargo ENC-2026-0003». Es la mitad del dato
   * cuando hay dos: sin esto, dos informes en el cajón «Peritación» son dos
   * ficheros indistinguibles.
   */
  deQue: string;
  donde: Donde;
  /** Por dónde se abre: una dirección pública, o la ruta que lo comprueba. */
  comoSeAbre: string;
  /**
   * Si hoy lo ve el cliente en su panel.
   *
   * Se dice, no se decide: es el estado de hoy, y enseñarlo es lo que permite
   * ver de un vistazo que la póliza de alguien es pública sin que nadie lo
   * haya elegido.
   */
  loVeElCliente: boolean;
}

/** Lo que sale de aquí, agrupado como se va a enseñar. */
export interface Expediente {
  vehicle_id: string;
  papeles: PapelDelCoche[];
  /** Cuántos hay en cada cajón, para pintar los vacíos sin recorrer la lista. */
  porCajon: Record<string, number>;
}

const texto = (v: unknown) => String(v ?? '').trim();
const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fecha = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

/**
 * Cómo se llama cada tipo de papel del cliente.
 *
 * El nombre guardado es el de la máquina —`circulation_permit`— y el que se
 * enseña tiene que ser el de la persona. Lo que no esté aquí cae en «Otros»
 * con su nombre de fichero, que es peor que tener nombre pero mejor que
 * desaparecer.
 */
const COMO_SE_LLAMA: Record<string, { nombre: string; cajon: Cajon }> = {
  circulation_permit: { nombre: 'Permiso de circulación', cajon: 'Papeles del coche' },
  technical_sheet: { nombre: 'Ficha técnica', cajon: 'Papeles del coche' },
  itv: { nombre: 'ITV', cajon: 'Papeles del coche' },
  insurance: { nombre: 'Póliza del seguro', cajon: 'Seguro' },
  maintenance_invoices: { nombre: 'Factura de mantenimiento', cajon: 'Mantenimiento' },
};

/**
 * Un día con palabras, para el «de qué momento es».
 *
 * Sin año: dentro del expediente de un coche el año se sobreentiende, y
 * ponerlo hace que la línea no quepa. El año completo está en `cuando`.
 */
export function elDia(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

/**
 * El expediente de un coche: los ocho sitios, reunidos.
 *
 * Cada consulta lleva su `catch`: una tabla que falla deja su cajón vacío y no
 * tira el expediente entero. Un expediente a medias se ve —el cajón está
 * vacío— y uno que no carga, no: enseña un error y esconde los otros siete.
 */
export async function elExpedienteDe(vehicleId: string): Promise<Expediente> {
  const id = texto(vehicleId);
  const papeles: PapelDelCoche[] = [];
  if (!id) return { vehicle_id: '', papeles, porCajon: cuenta(papeles) };

  // Todas las consultas devuelven filas sueltas, así que el vacío es el mismo
  // para las ocho. Con un genérico, TypeScript no lo deducía dentro del
  // `Promise.all` y cada fila salía como `unknown`.
  const vacio = () => ({ rows: [] as Record<string, unknown>[] });

  const [fotos, docs, seguros, mantenimientos, informes, tasaciones, delErp] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, file_type, file_name, file_size, file_mime_type, file_url, created_at
         FROM moveadvisor_user_vehicle_files
        WHERE vehicle_id = $1 ORDER BY created_at`, [id]).catch(vacio),

    query<Record<string, unknown>>(
      `SELECT id, document_type, file_name, file_size, file_mime_type, file_url, created_at
         FROM moveadvisor_user_vehicle_documents
        WHERE vehicle_id = $1 ORDER BY created_at`, [id]).catch(vacio),

    // La póliza cuelga del seguro y el seguro del coche: dos saltos.
    query<Record<string, unknown>>(
      `SELECT d.id, d.file_name, d.file_size, d.file_mime_type, d.file_url, d.created_at,
              s.provider, s.policy_number
         FROM moveadvisor_user_insurance_documents d
         JOIN moveadvisor_user_insurances s ON s.id = d.insurance_id
        WHERE s.vehicle_id = $1 ORDER BY d.created_at`, [id]).catch(vacio),

    query<Record<string, unknown>>(
      `SELECT f.id, f.file_name, f.file_size, f.file_mime_type, f.file_url, f.created_at,
              m.title, m.workshop_name
         FROM moveadvisor_user_maintenance_invoices f
         JOIN moveadvisor_user_maintenances m ON m.id = f.maintenance_id
        WHERE m.vehicle_id = $1 ORDER BY f.created_at`, [id]).catch(vacio),

    /*
     * El informe de estado no es un fichero nuestro: lo guarda Check y lo
     * servimos pidiéndoselo. Por eso sale con `donde: 'fuera'` en vez de
     * callarse: un cajón vacío diría que no hay informe, y lo hay.
     */
    query<Record<string, unknown>>(
      `SELECT id, status, created_at, to_jsonb(r)->>'capture_url' AS capture_url
         FROM moveadvisor_vehicle_condition_reports r
        WHERE vehicle_id = $1 ORDER BY created_at`, [id]).catch(vacio),

    query<Record<string, unknown>>(
      `SELECT id, title, status, created_at, to_jsonb(v)->>'pdf_path' AS pdf_path
         FROM moveadvisor_user_valuations v
        WHERE vehicle_id = $1 ORDER BY created_at`, [id]).catch(vacio),

    /*
     * Y los del ERP, que cuelgan del momento y no del coche: el mandato de su
     * encargo y el informe del perito de su visita. Se llega por ahí, no por
     * `vehicle_id`, porque en `erp_documentos` no hay tal columna — y no la
     * hay a propósito: lo que identifica a ese papel es de qué trámite salió.
     */
    query<Record<string, unknown>>(
      `SELECT d.id, d.ambito, d.ambito_id, d.papel, d.nombre, d.tipo, d.tamano, d.created_at,
              e.numero AS encargo_numero,
              r.cita_at, r.modalidad
         FROM erp_documentos d
         LEFT JOIN erp_encargos_venta e
                ON d.ambito = 'encargo'  AND e.id = d.ambito_id AND e.vehicle_id = $1
         LEFT JOIN erp_revisiones_taller r
                ON d.ambito = 'revision' AND r.id = d.ambito_id AND r.vehicle_id = $1
        WHERE (d.ambito = 'encargo'  AND e.id IS NOT NULL)
           OR (d.ambito = 'revision' AND r.id IS NOT NULL)
        ORDER BY d.created_at`, [id]).catch(vacio),
  ]);

  for (const f of fotos.rows) {
    const tipo = texto(f.file_type);
    const conocido = COMO_SE_LLAMA[tipo];
    papeles.push({
      id: texto(f.id),
      cajon: tipo === 'photo' ? 'Fotos' : conocido?.cajon ?? 'Otros',
      nombre: texto(f.file_name) || conocido?.nombre || 'Sin nombre',
      tipo: texto(f.file_mime_type),
      tamano: numero(f.file_size),
      cuando: fecha(f.created_at),
      deQue: 'Lo subió el cliente',
      donde: 'publico',
      comoSeAbre: texto(f.file_url),
      loVeElCliente: true,
    });
  }

  for (const d of docs.rows) {
    const tipo = texto(d.document_type);
    const conocido = COMO_SE_LLAMA[tipo];
    papeles.push({
      id: texto(d.id),
      cajon: conocido?.cajon ?? 'Papeles del coche',
      nombre: conocido?.nombre ?? texto(d.file_name) ?? 'Sin nombre',
      tipo: texto(d.file_mime_type),
      tamano: numero(d.file_size),
      cuando: fecha(d.created_at),
      deQue: 'Lo subió el cliente',
      donde: 'publico',
      comoSeAbre: texto(d.file_url),
      loVeElCliente: true,
    });
  }

  for (const s of seguros.rows) {
    papeles.push({
      id: texto(s.id),
      cajon: 'Seguro',
      nombre: texto(s.file_name) || 'Póliza',
      tipo: texto(s.file_mime_type),
      tamano: numero(s.file_size),
      cuando: fecha(s.created_at),
      deQue: [texto(s.provider), texto(s.policy_number)].filter(Boolean).join(' · ') || 'Su seguro',
      donde: 'publico',
      comoSeAbre: texto(s.file_url),
      loVeElCliente: true,
    });
  }

  for (const m of mantenimientos.rows) {
    papeles.push({
      id: texto(m.id),
      cajon: 'Mantenimiento',
      nombre: texto(m.file_name) || 'Factura',
      tipo: texto(m.file_mime_type),
      tamano: numero(m.file_size),
      cuando: fecha(m.created_at),
      /*
       * El taller primero, que es lo que distingue una factura de otra.
       *
       * Y si el título es la palabra del cajón —«Mantenimiento»— no se
       * repite: «Mantenimiento · Mantenimiento» ocupa una línea para no
       * decir nada. En su sitio va la fecha, que al menos ordena.
       */
      deQue: [
        texto(m.workshop_name),
        texto(m.title).toLowerCase() === 'mantenimiento' ? '' : texto(m.title),
      ].filter(Boolean).join(' · ') || `Del ${elDia(m.created_at)}`,
      donde: 'publico',
      comoSeAbre: texto(m.file_url),
      loVeElCliente: true,
    });
  }

  for (const i of informes.rows) {
    const url = texto(i.capture_url);
    if (!url) continue;
    papeles.push({
      id: texto(i.id),
      cajon: 'Informe de estado',
      nombre: 'Informe de estado',
      tipo: 'application/pdf',
      tamano: 0,
      cuando: fecha(i.created_at),
      // El estado va aquí y no en el nombre: una caducada sigue existiendo, y
      // llamarla «Informe de estado» a secas la hace pasar por la buena.
      deQue: texto(i.status) === 'caducada' ? 'Caducada' : `Del ${elDia(i.created_at)}`,
      donde: 'fuera',
      comoSeAbre: url,
      loVeElCliente: true,
    });
  }

  for (const t of tasaciones.rows) {
    papeles.push({
      id: texto(t.id),
      cajon: 'Tasación',
      nombre: texto(t.title) || 'Tasación',
      tipo: 'application/pdf',
      tamano: 0,
      cuando: fecha(t.created_at),
      deQue: `Del ${elDia(t.created_at)}`,
      /*
       * Existe y desde aquí no se puede abrir, y eso se dice en vez de
       * esconderlo.
       *
       * El PDF vive en el cajón privado de PopCar y lo sirve una ruta de allí
       * que comprueba que la tasación es **del cliente que la pide** y firma
       * una dirección que caduca a los cinco minutos. Una sesión del ERP no
       * pasa por esa puerta. Dejarlo fuera de la lista sería peor: diría que
       * ese coche no tiene tasación, y la tiene.
       */
      donde: 'fuera',
      comoSeAbre: '',
      loVeElCliente: true,
    });
  }

  for (const d of delErp.rows) {
    const esRevision = texto(d.ambito) === 'revision';
    papeles.push({
      id: texto(d.id),
      cajon: esRevision ? 'Peritación' : texto(d.papel) === 'mandato_firmado' ? 'Mandato' : 'Otros',
      nombre: texto(d.nombre) || 'Sin nombre',
      tipo: texto(d.tipo),
      tamano: numero(d.tamano),
      cuando: fecha(d.created_at),
      deQue: esRevision
        ? `${texto(d.modalidad) === 'a_domicilio' ? 'Visita del perito' : 'Visita al taller'}${d.cita_at ? ` · ${elDia(d.cita_at)}` : ''}`
        : texto(d.encargo_numero) || 'Del encargo',
      donde: 'privado',
      // La ruta que ya existe y ya comprueba quién pide. Aquí solo se dice
      // cuál es: servir ficheros desde el reunidor sería una puerta nueva.
      comoSeAbre: `/documentos/${texto(d.ambito)}/${texto(d.ambito_id)}/${texto(d.id)}`,
      // Hoy no: están en el cajón privado del ERP y el cliente no tiene puerta.
      // Cuando la tenga, esto deja de ser una constante.
      loVeElCliente: false,
    });
  }

  papeles.sort((a, b) => CAJONES.indexOf(a.cajon) - CAJONES.indexOf(b.cajon)
    || String(a.cuando ?? '').localeCompare(String(b.cuando ?? '')));

  return { vehicle_id: id, papeles, porCajon: cuenta(papeles) };
}

/** Cuántos hay en cada cajón, los vacíos incluidos. */
export function cuenta(papeles: readonly PapelDelCoche[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const c of CAJONES) n[c] = 0;
  for (const p of papeles) n[p.cajon] = (n[p.cajon] ?? 0) + 1;
  return n;
}
