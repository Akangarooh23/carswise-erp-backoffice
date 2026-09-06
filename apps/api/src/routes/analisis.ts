/**
 * El análisis del marketplace y el de los portales.
 *
 * Son dos preguntas distintas y estaban contestadas con la misma cifra.
 *
 * - **El marketplace** es lo nuestro: los coches que publicamos y de los que
 *   sale un lead, una visita y una venta. Se mira por secciones, porque
 *   ex-renting, concesionario, particular e importación son cuatro negocios.
 * - **Los portales** son de otros: 798.300 anuncios que se rastrean para saber
 *   a qué precio está el mercado. Ni se venden ni se visitan. Contarlos juntos
 *   daba «4.469 activos» al lado de ochocientos mil y ninguno de los dos
 *   números servía para nada.
 *
 * Las dos consultas llevan `.catch` y devuelven vacío: una tabla que falte no
 * puede dejar la pantalla en blanco. El precio es que una columna mal escrita
 * enseña 0 sin romper nada, y por eso `npm run test:panel` le pide a Postgres
 * el plan de todas.
 */

import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { falloInterno } from '../lib/fallos.js';
import { lasSecciones, SQL_DE_LA_SECCION, SQL_ES_RENTING } from '../lib/secciones-del-marketplace.js';

export const analisisRouter = Router();

const vacio = () => ({ rows: [] as Record<string, unknown>[] });

/**
 * El marketplace por secciones, con lo que trae cada una.
 *
 * Los leads se cuentan por el portal del que vienen y no por la oferta: un lead
 * de renting no siempre apunta a un coche —a veces se pide el producto, no el
 * vehículo— y contando solo los que apuntan se perderían justo los del embudo
 * de arriba, que son los que interesan.
 */
analisisRouter.get('/marketplace/analisis', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  try {
    const [porSeccion, importacion, renting, leads, visitas, marcas] = await Promise.all([
      query(`
        SELECT ${SQL_DE_LA_SECCION} AS seccion,
               COUNT(*)::int                                            AS total,
               COUNT(*) FILTER (WHERE is_active)::int                   AS activos,
               AVG(price) FILTER (WHERE is_active AND price > 0)::numeric AS precio_medio
          FROM moveadvisor_marketplace_vo_offers
         WHERE NOT ${SQL_ES_RENTING}
         GROUP BY 1
      `).catch(vacio),

      // La importación vive en la tabla de ofertas rastreadas, con su marca de
      // publicada: es un coche alemán que hemos decidido enseñar aquí.
      query(`
        SELECT COUNT(*)::int                                      AS total,
               COUNT(*) FILTER (WHERE COALESCE(is_active, TRUE))::int AS activos,
               AVG(price) FILTER (WHERE price > 0)::numeric        AS precio_medio
          FROM moveadvisor_market_offers
         WHERE country = 'DE' AND import_published
      `).catch(vacio),

      query(`
        SELECT COUNT(*)::int                          AS total,
               COUNT(*) FILTER (WHERE is_active)::int AS activos
          FROM moveadvisor_marketplace_vo_offers
         WHERE ${SQL_ES_RENTING}
      `).catch(vacio),

      query(`
        SELECT COALESCE(NULLIF(portal, ''), '(directo)') AS portal,
               COALESCE(lead_type, 'sin tipo')           AS tipo,
               COUNT(*)::int                             AS n
          FROM moveadvisor_market_leads
         GROUP BY 1, 2
         ORDER BY 3 DESC
      `).catch(vacio),

      query(`
        SELECT COALESCE(status, 'sin estado') AS estado, COUNT(*)::int AS n
          FROM vehicle_visit_bookings
         GROUP BY 1
         ORDER BY 2 DESC
      `).catch(vacio),

      // Qué se publica, que es la otra mitad de «cómo va el escaparate».
      query(`
        SELECT brand AS marca, COUNT(*)::int AS n,
               AVG(price) FILTER (WHERE price > 0)::numeric AS precio_medio
          FROM moveadvisor_marketplace_vo_offers
         WHERE is_active AND COALESCE(brand, '') <> ''
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 12
      `).catch(vacio),
    ]);

    const imp = importacion.rows[0] ?? {};
    const secciones = lasSecciones([
      ...porSeccion.rows,
      { seccion: 'importacion', total: imp.total, activos: imp.activos, precio_medio: imp.precio_medio },
    ]);

    res.json({
      ok: true,
      data: {
        secciones,
        renting: renting.rows[0] ?? { total: 0, activos: 0 },
        leads: leads.rows,
        visitas: visitas.rows,
        marcas: marcas.rows,
      },
    });
  } catch (err) {
    falloInterno(res, 'marketplace_analisis_failed', err);
  }
});

/**
 * Y los portales, plataforma a plataforma.
 *
 * «Cuándo se vio por última vez» no sale de la tabla de pasadas del rastreador
 * —ahí el portal a veces es una lista separada por comas, así que no se puede
 * agrupar— sino de `last_checked_at` de la propia oferta. Es la respuesta más
 * honesta: lo que importa no es que la pasada arrancara, sino que comprobara
 * algo.
 *
 * Y es la barata. Con `updated_at` esta consulta tarda **ocho segundos**: no
 * hay índice y hay que recorrer los 2,5 GB de la tabla. `last_checked_at` sí
 * lo tiene y baja a uno. Aun así, un segundo es demasiado para el panel: allí
 * el resumen se pide aparte y se rellena cuando llega, sin retener lo demás.
 */
analisisRouter.get('/portales/analisis', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  try {
    const [porPortal, leads] = await Promise.all([
      query(`
        SELECT portal,
               COUNT(*)::int                                                AS total,
               COUNT(*) FILTER (WHERE COALESCE(is_active, TRUE))::int       AS activos,
               COUNT(*) FILTER (WHERE NOT COALESCE(is_active, TRUE))::int   AS inactivos,
               COUNT(*) FILTER (WHERE country = 'DE')::int                  AS alemanas,
               AVG(price) FILTER (WHERE COALESCE(is_active, TRUE) AND price > 0)::numeric AS precio_medio,
               MAX(last_checked_at)::date                                   AS ultima
          FROM moveadvisor_market_offers
         WHERE COALESCE(portal, '') <> ''
         GROUP BY 1
         ORDER BY 2 DESC
      `).catch(vacio),

      query(`
        SELECT COALESCE(NULLIF(portal, ''), '(directo)') AS portal, COUNT(*)::int AS n
          FROM moveadvisor_market_leads
         GROUP BY 1
      `).catch(vacio),
    ]);

    res.json({ ok: true, data: { portales: porPortal.rows, leads: leads.rows } });
  } catch (err) {
    falloInterno(res, 'portales_analisis_failed', err);
  }
});
