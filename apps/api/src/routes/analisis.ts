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
import { leeKpi, KPI } from '../lib/kpis-guardados.js';
import {
  recalculaPrecioContraElMercado, recalculaLosPortales, type FilaDePortal,
} from '../lib/recalcula-los-kpis.js';

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
    const [porSeccion, importacion, renting, leads, visitas] = await Promise.all([
      query(`
        SELECT ${SQL_DE_LA_SECCION} AS seccion,
               COUNT(*)::int                                            AS total,
               COUNT(*) FILTER (WHERE is_active)::int                   AS activos,
               AVG(price) FILTER (WHERE is_active AND price > 0)::numeric AS precio_medio
          FROM moveadvisor_marketplace_vo_offers
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
      },
    });
  } catch (err) {
    falloInterno(res, 'marketplace_analisis_failed', err);
  }
});

/**
 * Y los portales, plataforma a plataforma. **De lo guardado anoche.**
 *
 * «Cuándo se vio por última vez» no sale de la tabla de pasadas del rastreador
 * —ahí el portal a veces es una lista separada por comas, así que no se puede
 * agrupar— sino de `last_checked_at` de la propia oferta. Es la respuesta más
 * honesta: lo que importa no es que la pasada arrancara, sino que comprobara
 * algo.
 *
 * ## Por qué ya no se cuenta aquí
 *
 * Aquí ponía que esta consulta era «la barata», de un segundo. Lo fue. Con
 * 2,6 millones de ofertas y 4,4 GB pasó a tardar entre 72 y 113 segundos, y
 * la función de Vercel corta a los 30: la pantalla llevaba semanas enseñando
 * «No se pudo cargar el análisis», que no dice de qué se ha muerto.
 *
 * No hay índice que lo arregle, y no por falta de intentarlo: un índice con
 * las cinco columnas dentro se midió en **162 segundos**, siete veces peor que
 * recorrer la tabla. Contar todas las filas es leerlas todas.
 *
 * Así que se cuentan de madrugada, una vez, y la pantalla lee once filas
 * guardadas. Se sirve **con su fecha**, porque un número sin fecha no se puede
 * juzgar: «133.848 anuncios» puede ser de esta noche o de hace tres semanas y
 * se lee exactamente igual.
 *
 * Los leads sí van en vivo: son otra tabla, mucho más pequeña, y los pide la
 * misma pantalla.
 */
analisisRouter.get('/portales/analisis', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  try {
    const [guardado, leads] = await Promise.all([
      leeKpi<FilaDePortal[]>(KPI.portalesAnalisis),

      query(`
        SELECT COALESCE(NULLIF(portal, ''), '(directo)') AS portal, COUNT(*)::int AS n
          FROM moveadvisor_market_leads
         GROUP BY 1
      `).catch(vacio),
    ]);

    res.json({
      ok: true,
      data: {
        portales: guardado?.valor ?? [],
        leads: leads.rows,
        /*
         * Cuándo se contó, y null si no se ha contado nunca.
         *
         * Null y «hoy» son cosas distintas: la pantalla dice «todavía no se ha
         * calculado» en el primer caso, que es lo que pasa la primera vez y
         * tiene arreglo —el botón—, y una fecha en el segundo.
         */
        calculado: guardado?.cuando ?? null,
        horas: guardado?.horas ?? null,
      },
    });
  } catch (err) {
    falloInterno(res, 'portales_analisis_failed', err);
  }
});

/**
 * Y volver a contarlos, que lo pide una persona.
 *
 * Los veinte segundos los paga quien pulsa, sabiéndolo, en vez de cobrárselos
 * a quien entraba a mirar otra cosa. Es lo mismo que el botón del precio
 * contra el mercado, y corre **la misma función que la tarea nocturna**: dos
 * copias del mismo cálculo acaban dando dos cifras.
 *
 * Hace falta aunque haya tarea: cuando un rastreador se arregla a media
 * mañana, esperar a la noche para ver si ha vuelto a traer anuncios no vale.
 */
analisisRouter.post('/portales/analisis/recalcular', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    await recalculaLosPortales();
    const guardado = await leeKpi<FilaDePortal[]>(KPI.portalesAnalisis);
    res.json({
      ok: true,
      data: {
        portales: guardado?.valor ?? [],
        calculado: guardado?.cuando ?? null,
        horas: guardado?.horas ?? null,
      },
    });
  } catch (err) {
    falloInterno(res, 'portales_recalculo_failed', err);
  }
});

/**
 * Las comisiones que nos pagan los proveedores, una a una.
 *
 * En el panel había un total y llevaba a Facturación proveedores, que enseña
 * todo lo emitido —la venta de un coche de 20.190 € incluida— sin filtrar. Un
 * número que lleva a una lista donde no está lo que buscas es peor que un
 * número sin enlace: te hace buscarlo.
 *
 * Aquí solo hay comisiones: lo emitido que no es una venta de vehículo. Hoy es
 * la de las garantías; cuando haya de seguros o de financiación entrarán aquí
 * sin tocar nada, porque el filtro dice qué **no** es en vez de enumerar qué sí.
 */
analisisRouter.get('/comisiones', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const [filas, catalogo] = await Promise.all([
      query(`
        SELECT i.id, i.invoice_number, i.provider_name, i.customer_name, i.customer_email,
               i.vehicle_title, i.notes, i.status, i.contract_id,
               i.base_amount::numeric  AS base,
               i.invoice_amount::numeric AS total,
               i.iva_rate::numeric     AS iva,
               COALESCE(i.invoice_date, i.issued_at::date) AS fecha,
               i.paid_at,
               g.nombre                AS garantia,
               l.garantia_precio::numeric AS pagado_por_el_cliente
          FROM moveadvisor_provider_invoices i
          LEFT JOIN moveadvisor_market_leads l ON l.id = i.contract_id
          LEFT JOIN market_garantias g         ON g.id = l.garantia_id
         WHERE i.direction = 'emitted' AND i.type <> 'vehicle_sale'
         ORDER BY COALESCE(i.invoice_date, i.issued_at::date) DESC
      `).catch(vacio),

      /*
       * Y lo que se podría comisionar, que es la otra mitad.
       *
       * Sin el catálogo al lado, la lista de arriba no dice si se está
       * facturando todo lo vendido: solo dice lo que se facturó.
       */
      query(`
        SELECT g.id, g.nombre, g.precio::numeric, g.coste::numeric, g.comision::numeric, g.activo,
               COUNT(l.id)::int AS vendidas
          FROM market_garantias g
          LEFT JOIN moveadvisor_market_leads l ON l.garantia_id = g.id
         GROUP BY g.id, g.nombre, g.precio, g.coste, g.comision, g.activo, g.nivel
         ORDER BY g.nivel
      `).catch(vacio),
    ]);

    res.json({ ok: true, data: { comisiones: filas.rows, catalogo: catalogo.rows } });
  } catch (err) {
    falloInterno(res, 'comisiones_failed', err);
  }
});

/**
 * Cuánto se separan nuestros precios de los del mercado.
 *
 * Es para lo que están los 798.000 anuncios rastreados, y hasta ahora solo se
 * contaban. Comparando cada coche nuestro con la media de los que hay
 * publicados de la misma marca, modelo y año se contesta la pregunta que
 * importa: si estamos caros o baratos, y en cuáles.
 *
 * **Solo cuenta si hay al menos tres comparables.** Con uno, la «media del
 * mercado» es el precio que puso un vendedor, y compararse contra el capricho
 * de otro no dice nada.
 *
 * ## Y con la potencia, que es lo que separa los acabados
 *
 * Comparando solo por marca, modelo y año, un Giulia Quadrifoglio de 510 CV
 * salía contra la media de todos los Giulia —71.722 €— y encabezaba la lista de
 * «los más caros» con 267.000 € de diferencia. Eso no es estar caro: es estar
 * comparado con otro coche.
 *
 * Metiendo la potencia en tramos de 25 CV, ese mismo Giulia compara contra
 * cuatro Quadrifoglio. Cuesta 142 comparables de 3.851 —los que no tienen la
 * potencia apuntada— y a cambio la lista deja de ser una lista de acabados
 * altos. Además baja de cinco segundos a dos: el tramo parte los grupos.
 *
 * Se guarda con su fecha y solo se recalcula cuando alguien lo pide.
 */

analisisRouter.get('/kpis/precio-contra-el-mercado', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  try {
    res.json({ ok: true, data: await leeKpi(KPI.precioContraElMercado) });
  } catch (err) {
    falloInterno(res, 'kpi_failed', err);
  }
});

/**
 * Y volver a calcularlo, que lo pide una persona.
 *
 * Ocho segundos de espera que quien pulsa sabe que está pagando, y que en una
 * carga cualquiera se los cobraría a quien pasaba por ahí a mirar otra cosa.
 *
 * Desde que hay tarea nocturna el botón no es lo único que lo refresca, pero
 * sigue haciendo falta: cuando se cambian precios a media mañana, esperar a la
 * noche para saber cómo quedamos no vale. Es la misma función que corre la
 * tarea, así que las dos dan la misma cifra.
 */
analisisRouter.post('/kpis/precio-contra-el-mercado', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    await recalculaPrecioContraElMercado();
    res.json({ ok: true, data: await leeKpi(KPI.precioContraElMercado) });
  } catch (err) {
    falloInterno(res, 'kpi_recalculo_failed', err);
  }
});
