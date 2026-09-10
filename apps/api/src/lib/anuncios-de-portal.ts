/**
 * Dónde hemos publicado cada coche fuera de casa.
 *
 * Publicar en coches.net o en Milanuncios lo hace una persona a mano, y
 * retirarlo también. Eso está decidido y no es lo que se arregla aquí: lo que
 * se arregla es que **nadie se acuerde de retirarlo**.
 *
 * ## El fallo que esto evita, que ya pasó una vez
 *
 * El Kia Sorento se entregó el 1 de septiembre y seguía en nuestro escaparate
 * una semana después. Aquello se arregló con una consulta porque el escaparate
 * es nuestro. Un anuncio en coches.net no se apaga con una consulta: hay que
 * entrar y borrarlo, y si nadie lo apuntó, nadie sabe que está.
 *
 * Y esta vez es peor: el teléfono que sale en ese anuncio es el nuestro, así
 * que las llamadas por un coche vendido las cogemos nosotros.
 *
 * ## Cuándo hay que retirar
 *
 * La regla no mira el estado del encargo, mira el escaparate: **si el coche ya
 * no está publicado en nuestro marketplace, tampoco puede estar publicado en los
 * de fuera.** Da igual por qué se cayó —vendido, vencido, cancelado o retirado a
 * mano—: cualquier motivo por el que dejamos de anunciarlo aquí vale también
 * allí, incluidos los que todavía no se nos han ocurrido.
 */

/**
 * Los portales donde publicamos, y cómo se escriben.
 *
 * Escrito a mano cada vez, «coches.net», «Coches.net» y «cochesnet» acaban
 * siendo tres portales distintos en la lista, y entonces no se puede contestar
 * ni «dónde está este coche» ni «cuánto nos cuesta cada portal».
 */
export const PORTALES = ['coches.net', 'AutoScout24', 'Milanuncios', 'Wallapop'] as const;

/**
 * El nombre con el que se compara.
 *
 * Se acepta cualquier portal, no solo los cuatro: mañana puede haber otro y no
 * es un motivo para no poder apuntarlo. Lo que se hace es reconocer los que ya
 * conocemos aunque vengan escritos de otra forma.
 */
export function elPortal(nombre: unknown): string {
  const bruto = String(nombre ?? '').trim();
  if (!bruto) return '';
  const llano = bruto.toLowerCase().replace(/[^a-z0-9]/g, '');
  const conocido = PORTALES.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, '') === llano);
  return conocido ?? bruto;
}

/** Qué falta para poder apuntar una publicación. */
export function faltaParaApuntar(a: { vehicle_id?: unknown; portal?: unknown; url?: unknown }): string {
  if (!String(a.vehicle_id ?? '').trim()) return 'Falta el coche';
  if (!elPortal(a.portal)) return 'Falta el portal';
  /*
   * El enlace se exige, y no es burocracia: es por donde se entra a borrarlo.
   * Apuntar «está en Milanuncios» sin la dirección obliga a buscarlo entre los
   * anuncios de la cuenta el día que haya que quitarlo, que es justo el día en
   * que nadie tiene tiempo.
   */
  const url = String(a.url ?? '').trim();
  if (!url) return 'Falta el enlace del anuncio: es por donde se entra a borrarlo';
  if (!/^https?:\/\//i.test(url)) return 'El enlace tiene que empezar por http';
  return '';
}

/**
 * El enlace que se pega en el anuncio del portal.
 *
 * En coches.net no se puede enlazar: lo único que se puede meter es texto que
 * alguien teclea o copia, así que la dirección tiene que ser corta y sin nada
 * raro. `popcar.com.es/v/8888LXR` se teclea; la de la ficha
 * —`/marketplace-vo/idcar-veh-1778144236925`— no.
 *
 * ## La UTM, y por qué se genera y no se escribe
 *
 * Sin ella, el comprador que llega de coches.net entra como «directo» y no hay
 * manera de saber si el portal trae gente o solo cuesta dinero — que es la
 * única pregunta que decide si se sigue pagando.
 *
 * Escrita a mano cada vez sale «coches.net», «Coches.net» y «cochesnet», y esas
 * tres son tres fuentes distintas en el informe: la respuesta a «¿cuánto trae
 * coches.net?» acaba repartida en tres filas que nadie suma.
 *
 * `utm_medium` va fijo en `portal` para poder preguntar por todos los portales
 * juntos sin enumerarlos.
 */
export const MEDIO = 'portal';

export function elEnlaceParaElPortal(
  sitio: string,
  matricula: string,
  portal: string,
): string {
  const base = String(sitio ?? '').replace(/\/+$/, '');
  const m = String(matricula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!m) return '';
  const fuente = elPortal(portal).toLowerCase();
  const q = new URLSearchParams({ utm_source: fuente, utm_medium: MEDIO });
  return `${base}/v/${m}?${q.toString()}`;
}

export interface AnuncioDePortal {
  portal: string;
  url: string;
  publicado_at?: string | null;
  retirado_at?: string | null;
}

/** Los que siguen vivos ahí fuera. */
export function losQueSiguenPuestos(anuncios: readonly AnuncioDePortal[]): AnuncioDePortal[] {
  return anuncios.filter((a) => !a.retirado_at);
}

/**
 * Cuántos coches tienen anuncios fuera que ya no deberían estar.
 *
 * Se cuentan **coches, no anuncios**: quien mira el panel tiene que salir
 * sabiendo a cuántos coches hay que entrar, no cuántas pestañas va a abrir.
 */
export const SQL_POR_RETIRAR = `
  SELECT COUNT(DISTINCT a.vehicle_id)::int AS n
    FROM erp_anuncios_de_portal a
    LEFT JOIN moveadvisor_marketplace_vo_offers o
           ON o.id = 'idcar-' || a.vehicle_id
   WHERE a.retirado_at IS NULL
     AND COALESCE(o.is_active, FALSE) = FALSE`;

/**
 * Y cuáles son, para la lista.
 *
 * El coche sale aunque su oferta ya no exista en la tabla —un LEFT JOIN sin
 * fila cuenta igual—: que hayamos borrado el anuncio de casa no quita que siga
 * puesto en coches.net.
 */
export const SQL_LOS_POR_RETIRAR = `
  SELECT a.id, a.vehicle_id, a.portal, a.url, a.publicado_at,
         v.plate, v.brand, v.model
    FROM erp_anuncios_de_portal a
    LEFT JOIN moveadvisor_marketplace_vo_offers o
           ON o.id = 'idcar-' || a.vehicle_id
    LEFT JOIN moveadvisor_user_vehicles v ON v.id = a.vehicle_id
   WHERE a.retirado_at IS NULL
     AND COALESCE(o.is_active, FALSE) = FALSE
   ORDER BY a.publicado_at ASC NULLS LAST`;

export const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_anuncios_de_portal (
    id            TEXT PRIMARY KEY,
    vehicle_id    VARCHAR(64) NOT NULL,
    portal        TEXT NOT NULL,
    url           TEXT NOT NULL,
    publicado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publicado_por TEXT NOT NULL DEFAULT '',
    retirado_at   TIMESTAMPTZ,
    retirado_por  TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

/**
 * Un anuncio vivo por coche y portal.
 *
 * Sin esto, apuntar dos veces el mismo anuncio deja dos filas y retirar una no
 * apaga el aviso: el coche seguiría saliendo como pendiente de retirar para
 * siempre, y la lista que no se vacía es la que se deja de mirar.
 *
 * Los retirados no cuentan: el mismo coche puede volver a anunciarse.
 */
export const ENSURE_UNO_VIVO = `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_anuncio_vivo_por_coche_y_portal
    ON erp_anuncios_de_portal (vehicle_id, portal)
    WHERE retirado_at IS NULL`;

/** Los de un coche, vivos y retirados: el rastro también cuenta. */
export const SQL_LOS_DEL_COCHE = `
  SELECT id, vehicle_id, portal, url, publicado_at, publicado_por,
         retirado_at, retirado_por
    FROM erp_anuncios_de_portal
   WHERE vehicle_id = $1
   ORDER BY retirado_at IS NOT NULL, publicado_at DESC`;

/**
 * Retirar uno.
 *
 * Solo si no estaba retirado ya, para que volver a pulsar no reescriba la fecha
 * ni el nombre de quien lo hizo: eso convertiría el rastro en la última vez que
 * alguien tocó el botón, y no en la vez que se retiró.
 */
export const SQL_RETIRA = `
  UPDATE erp_anuncios_de_portal
     SET retirado_at = NOW(), retirado_por = $2
   WHERE id = $1 AND retirado_at IS NULL
  RETURNING id`;
