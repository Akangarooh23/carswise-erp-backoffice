import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { falloInterno } from '../lib/fallos.js';
import { losApuntes } from '../lib/apuntes.js';
import { ESPERADA, CUADRADA } from '../lib/facturas-esperadas.js';
import { cuentaDeResultados, mesAMes } from '../lib/cuenta-de-resultados.js';
import { elPeriodo, elPeriodoAnterior, esTramo, comoHaCambiado, elDia } from '../lib/el-periodo.js';
import { margenPorCoche } from '../lib/margen-por-coche.js';
import { elEmbudo, dondeSePierde, SQL_HONDURA, SQL_QUIEN } from '../lib/embudo.js';
import { losPendientes } from '../lib/pendientes.js';
import { leeKpi, KPI } from '../lib/kpis-guardados.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard/stats', requireRole(['admin', 'support', 'operations', 'sales']), async (_req, res) => {
  try {
    /*
     * Solo lo que se pinta.
     *
     * Aquí se calculaban también los siete contadores de tickets, los cinco de
     * citas, la media y los extremos del marketplace y los cinco tickets
     * recientes: cuatro consultas en cada carga del panel que no salían por
     * ningún sitio desde que la pantalla se repartió en pestañas.
     */
    const [users, leads, recentAppointments,
           importacion, sinFacturar, escaparate] = await Promise.all([
      // User stats — base from moveadvisor_users, status from erp_users
      query(`
        SELECT
          COUNT(mu.id)::int                                                                AS total,
          COUNT(*) FILTER (WHERE COALESCE(eu.status,'active') = 'active')::int            AS active,
          COUNT(*) FILTER (WHERE eu.status = 'at_risk')::int                              AS at_risk,
          COUNT(*) FILTER (WHERE eu.status = 'blocked')::int                              AS blocked,
          COUNT(*) FILTER (WHERE mu.created_at >= NOW() - INTERVAL '30 days')::int        AS new_30d,
          COUNT(*) FILTER (WHERE mu.plan_id = 'plus')::int                              AS plus,
          COUNT(*) FILTER (WHERE mu.plan_id = 'premium')::int                           AS premium
        FROM moveadvisor_users mu
        LEFT JOIN erp_users eu ON eu.email = mu.email
      `).catch((e) => { console.error("[dashboard] consulta fallida:", (e as Error).message); return { rows: [{ total: 0, active: 0, at_risk: 0, blocked: 0, new_30d: 0, plus: 0, premium: 0 }] }; }),

      // Leads stats
      query(`
        SELECT
          COUNT(*)::int                                                                          AS total,
          COUNT(*) FILTER (WHERE status = 'Pendiente')::int                                     AS pending,
          COUNT(*) FILTER (WHERE status = 'Contactado')::int                                    AS contacted,
          COUNT(*) FILTER (WHERE status IN ('Cita confirmada', 'Cerrado'))::int                 AS resolved,
          COUNT(*) FILTER (WHERE status IN ('Reagendar solicitado'))::int                       AS reschedule,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int                 AS new_7d
        FROM moveadvisor_market_leads
      `).catch((e) => { console.error("[dashboard] consulta fallida:", (e as Error).message); return { rows: [{ total: 0, pending: 0, contacted: 0, resolved: 0, reschedule: 0, new_7d: 0 }] }; }),

      // Upcoming appointments
      query(`
        SELECT a.id, a.user_id, a.type, a.status, a.scheduled_at,
               mu.name AS user_name, mu.email AS user_email
        FROM erp_appointments a
        LEFT JOIN moveadvisor_users mu ON mu.id = a.user_id
        WHERE a.scheduled_at >= NOW()
        ORDER BY a.scheduled_at ASC
        LIMIT 5
      `).catch((e) => { console.error("[dashboard] consulta fallida:", (e as Error).message); return { rows: [] }; }),

      /*
       * La importación, que es el negocio que está corriendo.
       *
       * El panel enseñaba usuarios, tickets y precios medios del marketplace, y
       * de lo que de verdad pasa cada día —coches viniendo de Alemania, dinero
       * de clientes retenido, facturas que no llegan— no decía nada.
       *
       * Solo lo accionable. «Depósitos retenidos» es dinero de clientes que
       * todavía no es de nadie, y «facturas sin llegar» son gastos que hoy no
       * se pueden deducir.
       */
      query(`
        SELECT
          COUNT(*) FILTER (WHERE l.status <> 'Entregado')::int                       AS en_marcha,
          COUNT(*) FILTER (WHERE l.status = 'Entregado')::int                        AS entregados,
          COUNT(*) FILTER (WHERE l.deposit_paid_at IS NULL AND l.status <> 'Entregado')::int AS sin_deposito,
          COALESCE(SUM(l.deposit_quoted) FILTER (
            WHERE l.deposit_paid_at IS NOT NULL AND l.status <> 'Entregado'
          ), 0)::numeric                                                             AS retenido
        FROM moveadvisor_market_leads l
         WHERE l.lead_type = 'import'
      `).catch((e) => { console.error('[dashboard] consulta fallida:', (e as Error).message); return { rows: [{ en_marcha: 0, entregados: 0, sin_deposito: 0, retenido: 0 }] }; }),

      // Las facturas de proveedor que no han llegado: un gasto sin factura no
      // se deduce, y hasta ahora solo se veía entrando en su pantalla.
      query(`
        SELECT COUNT(*)::int AS n,
               COALESCE(SUM(invoice_amount), 0)::numeric AS importe
          FROM moveadvisor_provider_invoices
         WHERE direction = 'received' AND status = 'esperada'
      `).catch((e) => { console.error('[dashboard] consulta fallida:', (e as Error).message); return { rows: [{ n: 0, importe: 0 }] }; }),

      // Y los coches alemanes publicados, que es el escaparate de importación.
      query(`
        SELECT COUNT(*)::int AS publicados,
               COUNT(*) FILTER (WHERE COALESCE(is_active, TRUE))::int AS vivos
          FROM moveadvisor_market_offers
         WHERE country = 'DE' AND import_published
      `).catch((e) => { console.error('[dashboard] consulta fallida:', (e as Error).message); return { rows: [{ publicados: 0, vivos: 0 }] }; }),
    ]);

    res.json({
      ok: true,
      data: {
        users: users.rows[0],
        leads: leads.rows[0],
        importacion: {
          ...importacion.rows[0],
          facturas_sin_llegar: sinFacturar.rows[0]?.n ?? 0,
          facturas_sin_llegar_importe: sinFacturar.rows[0]?.importe ?? 0,
          publicados: escaparate.rows[0]?.publicados ?? 0,
          vivos: escaparate.rows[0]?.vivos ?? 0,
        },
        upcomingAppointments: recentAppointments.rows,
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_stats_failed', err);
  }
});

/**
 * La situación financiera, que es con lo que abre el panel.
 *
 * Sale de las mismas facturas que el fichero del asesor y por el mismo camino
 * —`losApuntes`—, a propósito: dos cuentas del mismo trimestre calculadas por
 * separado acaban difiriendo, y el día que difieren hay que decidir cuál vale.
 *
 * Va aparte de `/dashboard/stats` porque se pide con un periodo y se vuelve a
 * pedir al cambiarlo, y arrastrar los tickets y las citas en cada cambio de
 * pestaña es tráfico por nada.
 */
dashboardRouter.get('/dashboard/finanzas', requireRole(['admin']), async (req, res) => {
  try {
    const pedido = String((req.query as Record<string, unknown>).tramo ?? '');
    const p = elPeriodo(esTramo(pedido) ? pedido : 'anio');

    // Los apuntes del gráfico contienen a los del periodo, así que se piden una
    // vez y el periodo se recorta encima. Dos consultas traerían lo mismo dos
    // veces y podrían no coincidir si algo entra entre medias.
    const largo = await losApuntes(p.desdeElGrafico, p.hasta);
    const entre = (desde: string, hasta: string) => largo.filter((a) => {
      const f = String(a.fecha ?? '').slice(0, 10);
      return f >= desde && f <= hasta;
    });

    /*
     * Y el mismo tramo un paso atrás, para poder decir hacia dónde va.
     *
     * Una cifra suelta no dice si vamos bien: 19.805 € se lee igual siendo el
     * doble del año pasado que la mitad.
     *
     * Si el tramo anterior cae dentro de los doce meses que ya se han pedido
     * —el mes o el trimestre pasado— se recorta de ahí; si cae fuera —el año
     * pasado— se pide aparte. Volver a la base para algo que ya está en memoria
     * es una consulta de más en cada carga del panel.
     */
    const anterior = elPeriodoAnterior(p.tramo);
    const apuntesAnteriores = anterior.desde >= p.desdeElGrafico
      ? entre(anterior.desde, anterior.hasta)
      : await losApuntes(anterior.desde, anterior.hasta);

    const ahora = cuentaDeResultados(entre(p.desde, p.hasta));
    const antes = cuentaDeResultados(apuntesAnteriores);

    res.json({
      ok: true,
      data: {
        periodo: { tramo: p.tramo, desde: p.desde, hasta: p.hasta, etiqueta: p.etiqueta },
        ...ahora,
        anterior: {
          etiqueta: anterior.etiqueta,
          ingresos: antes.ingresos,
          gastos: antes.gastos,
          margen: antes.margen,
          suplidos: antes.suplidos,
          cambioIngresos: comoHaCambiado(ahora.ingresos, antes.ingresos),
          cambioGastos: comoHaCambiado(ahora.gastos, antes.gastos),
          cambioMargen: comoHaCambiado(ahora.margen, antes.margen),
          cambioSuplidos: comoHaCambiado(ahora.suplidos, antes.suplidos),
        },
        meses: mesAMes(largo, p.desdeElGrafico, p.hasta),
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_finanzas_failed', err);
  }
});

/**
 * Lo que se vende y lo que se pide, que en el panel no estaba.
 *
 * Cuatro servicios —informes de tasación, seguros, mantenimientos y la gestión
 * integral de venta— y las citas, que hasta ahora eran un número suelto sin
 * decir de qué. Y las comisiones de proveedores, que es la otra pata del
 * ingreso.
 *
 * Los que están a cero salen a cero **y se ven**. Que la gestión integral de
 * venta no tenga ninguna solicitud es la respuesta a «cómo va eso»; sin la
 * fila, la pregunta se queda sin contestar y nadie se acuerda de mirarla.
 */
dashboardRouter.get('/dashboard/negocio', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  const vacio = () => ({ rows: [] as Record<string, unknown>[] });
  try {
    const [informes, seguros, mantenimientos, ventaIntegral, visitas, citasCliente, taller, comisiones, garantias] =
      await Promise.all([
        // La tasación se cobra por la pasarela y no deja rastro en la tabla de
        // tasaciones: lo que hay de verdad son las facturas de los informes.
        query(`
          SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::numeric AS importe
            FROM moveadvisor_user_invoices
           WHERE number LIKE 'CW-%' OR number LIKE 'TAS-%'
        `).catch(vacio),

        query(`
          SELECT COUNT(*)::int AS n,
                 COUNT(*) FILTER (WHERE status = 'activo')::int AS activos
            FROM moveadvisor_user_insurances
        `).catch(vacio),

        query(`
          SELECT COUNT(*)::int AS n,
                 COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) LIKE 'pendiente%')::int AS pendientes,
                 COALESCE(SUM(estimated_cost), 0)::numeric AS presupuestado
            FROM moveadvisor_user_maintenances
        `).catch(vacio),

        query(`
          SELECT COUNT(*)::int AS n,
                 COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) NOT IN ('cerrada', 'cancelada'))::int AS abiertas
            FROM moveadvisor_service_requests
        `).catch(vacio),

        query(`
          SELECT COALESCE(status, 'sin estado') AS estado, COUNT(*)::int AS n
            FROM vehicle_visit_bookings
           GROUP BY 1
        `).catch(vacio),

        query(`
          SELECT COALESCE(appointment_type, 'sin tipo') AS tipo, COUNT(*)::int AS n
            FROM moveadvisor_user_appointments
           GROUP BY 1
        `).catch(vacio),

        query(`
          SELECT COUNT(*)::int AS n,
                 COUNT(*) FILTER (WHERE scheduled_at >= NOW() AND scheduled_at < NOW() + INTERVAL '7 days')::int AS proximas
            FROM erp_appointments
        `).catch(vacio),

        // Lo emitido a proveedores que no es una venta de coche: comisiones.
        query(`
          SELECT COUNT(*)::int AS n,
                 COALESCE(SUM(COALESCE(base_amount, invoice_amount)), 0)::numeric AS base,
                 COUNT(*) FILTER (WHERE status <> 'paid')::int AS sin_cobrar
            FROM moveadvisor_provider_invoices
           WHERE direction = 'emitted' AND type <> 'vehicle_sale'
        `).catch(vacio),

        query(`
          SELECT COUNT(*)::int AS vendidas,
                 COALESCE(SUM(garantia_precio), 0)::numeric AS cobrado
            FROM moveadvisor_market_leads
           WHERE garantia_id IS NOT NULL
        `).catch(vacio),
      ]);

    res.json({
      ok: true,
      data: {
        servicios: {
          informes: informes.rows[0] ?? { n: 0, importe: 0 },
          seguros: seguros.rows[0] ?? { n: 0, activos: 0 },
          mantenimientos: mantenimientos.rows[0] ?? { n: 0, pendientes: 0, presupuestado: 0 },
          ventaIntegral: ventaIntegral.rows[0] ?? { n: 0, abiertas: 0 },
          garantias: garantias.rows[0] ?? { vendidas: 0, cobrado: 0 },
        },
        citas: {
          visitas: visitas.rows,
          cliente: citasCliente.rows,
          taller: taller.rows[0] ?? { n: 0, proximas: 0 },
        },
        comisiones: comisiones.rows[0] ?? { n: 0, base: 0, sin_cobrar: 0 },
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_negocio_failed', err);
  }
});

/**
 * El embudo: cuánta gente llega, cuánta avanza y dónde se cae.
 *
 * El panel decía «11 leads» sin decir de cuántos vienen, y esa es la mitad que
 * sirve para decidir algo: once de doce visitas es un negocio y once de cuatro
 * mil es otro, y el arreglo de cada caso es el contrario.
 *
 * **Cuenta personas, no eventos.** Alguien que recarga la portada catorce veces
 * son catorce eventos y una persona. Por eventos este embudo sale
 * 1.511 → 437 → 139 → 22, y por personas 400 → 8 → 3 → 3: son dos historias
 * distintas y solo la segunda dice dónde invertir.
 *
 * Y cada persona cuenta en el paso **más hondo** al que llegó, no en todos los
 * que tocó: contando cada paso por su cuenta, quien entra directo a una ficha
 * por un enlace hace que «abren un coche» tenga más gente que «llegan a la
 * web», y entonces el dibujo enseña un embudo que se ensancha.
 */
dashboardRouter.get('/dashboard/embudo', requireRole(['admin', 'operations', 'sales']), async (req, res) => {
  try {
    const pedido = String((req.query as Record<string, unknown>).tramo ?? '');
    const p = elPeriodo(esTramo(pedido) ? pedido : 'anio');

    const [hondura, origenes] = await Promise.all([
      query(`
        SELECT hondura, COUNT(*)::int AS personas
          FROM (
            SELECT ${SQL_QUIEN} AS quien, MAX(${SQL_HONDURA}) AS hondura
              FROM moveadvisor_funnel_events
             WHERE created_at::date BETWEEN $1::date AND $2::date
               AND ${SQL_QUIEN} IS NOT NULL
             GROUP BY 1
          ) AS gente
         WHERE hondura > 0
         GROUP BY 1
      `, [p.desde, p.hasta]).catch(() => ({ rows: [] as Record<string, unknown>[] })),

      // Y de dónde llega esa gente, que es la otra mitad de la pregunta: sin
      // esto se sabe que se cae, pero no de qué campaña venía.
      query(`
        SELECT COALESCE(NULLIF(utm_source, ''), '(directo)') AS origen,
               COUNT(DISTINCT ${SQL_QUIEN})::int AS personas,
               COUNT(DISTINCT ${SQL_QUIEN}) FILTER (WHERE event_type = 'lead_request')::int AS solicitudes
          FROM moveadvisor_funnel_events
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY 1
         ORDER BY 2 DESC
         LIMIT 10
      `, [p.desde, p.hasta]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    const escalones = elEmbudo(hondura.rows as { hondura?: unknown; personas?: unknown }[]);

    res.json({
      ok: true,
      data: {
        periodo: { tramo: p.tramo, desde: p.desde, hasta: p.hasta, etiqueta: p.etiqueta },
        escalones,
        cuelloDeBotella: dondeSePierde(escalones),
        origenes: origenes.rows,
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_embudo_failed', err);
  }
});

/**
 * Todo lo que espera a alguien, en una sola pregunta.
 *
 * Estaba repartido entre las fichas de arriba del panel, dos avisos dentro de
 * la pestaña Financiera y otros dos en pantallas de detalle. Lo que pasa
 * repartido así es que se ve lo de la pestaña en la que estás; y las dos
 * facturas de la UE sin decidir su tipo —que son las que no dejan salir el
 * 349— vivían dentro de una pestaña.
 *
 * Las dos de contabilidad salen de `losApuntes` del **año corriente**, que es
 * el periodo en el que alguien puede todavía arreglarlas. Del año pasado ya no
 * se arregla nada: se declaró como se declaró.
 */
dashboardRouter.get('/dashboard/pendientes', requireRole(['admin', 'operations', 'sales']), async (_req, res) => {
  const vacio = () => ({ rows: [] as Record<string, unknown>[] });
  try {
    const [leads, citas, usuarios, facturas, importacion, comisiones, contabilidad, portales] = await Promise.all([
      query(`
        SELECT COUNT(*) FILTER (WHERE status = 'Pendiente')::int            AS leads_pendientes,
               COUNT(*) FILTER (WHERE status = 'Reagendar solicitado')::int AS leads_reagendar
          FROM moveadvisor_market_leads
      `).catch(vacio),

      query(`
        SELECT COUNT(*) FILTER (
                 WHERE scheduled_at >= NOW() AND scheduled_at < NOW() + INTERVAL '7 days'
               )::int AS citas_7d
          FROM erp_appointments
      `).catch(vacio),

      query(`
        SELECT COUNT(*) FILTER (WHERE status = 'at_risk')::int AS usuarios_en_riesgo
          FROM erp_users
      `).catch(vacio),

      query(`
        SELECT COUNT(*) FILTER (WHERE direction = 'received' AND status = 'esperada')::int AS facturas_sin_llegar
          FROM moveadvisor_provider_invoices
      `).catch(vacio),

      query(`
        SELECT COUNT(*) FILTER (
                 WHERE deposit_paid_at IS NULL AND status <> 'Entregado'
               )::int AS sin_deposito
          FROM moveadvisor_market_leads
         WHERE lead_type = 'import'
      `).catch(vacio),

      /*
       * Lo vendido menos lo facturado.
       *
       * Una garantía vendida sin su comisión emitida no la reclama nadie, y no
       * hay ninguna pantalla donde eso chille: en Comisiones se ve si se entra,
       * y a Comisiones no entra nadie a mirar si falta algo.
       */
      query(`
        SELECT GREATEST(
                 (SELECT COUNT(*)::int FROM moveadvisor_market_leads WHERE garantia_id IS NOT NULL)
                 - (SELECT COUNT(*)::int FROM moveadvisor_provider_invoices
                     WHERE direction = 'emitted' AND type <> 'vehicle_sale'),
                 0
               )::int AS comisiones_sin_emitir
      `).catch(vacio),

      /*
       * Las dos de contabilidad, contadas y no construidas.
       *
       * Antes esto montaba **todos** los apuntes del año —las dos tablas de
       * facturas, el emparejado de proveedores, los suplidos— para quedarse con
       * dos números. Y `/dashboard/finanzas` hacía lo mismo en la misma carga
       * del panel: la consulta cara, dos veces.
       *
       * Lo que hace falta aquí son dos cuentas. Una factura al cliente sale
       * siempre de la pasarela con su 21 %, así que solo pueden faltarle a una
       * de proveedor: mirando esa tabla se contesta igual y sin construir nada.
       */
      query(`
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(regimen, 'nacional') = 'nacional'
              AND iva_rate IS NULL AND iva_amount IS NULL
              AND COALESCE(invoice_amount, 0) > 0
          )::int AS sin_desglosar,
          COUNT(*) FILTER (
            WHERE regimen = 'intracomunitario' AND autorepercusion IS NULL
          )::int AS sin_autorepercusion
        FROM moveadvisor_provider_invoices
        WHERE COALESCE(status, '') NOT IN ($1, $2)
      `, [ESPERADA, CUADRADA]).catch(vacio),

      /*
       * Y las plataformas paradas, leídas y no calculadas.
       *
       * Contarlas cuesta un segundo sobre 2,5 GB de anuncios, y esto se pide en
       * cada carga del panel. Lo guarda la pantalla de Portales, que ya hace esa
       * consulta para lo suyo; aquí solo se lee lo último que dejó.
       */
      leeKpi<{ n?: number }>(KPI.portalesParados).catch(() => null),
    ]);

    res.json({
      ok: true,
      data: {
        pendientes: losPendientes({
          ...leads.rows[0], ...citas.rows[0], ...usuarios.rows[0],
          ...facturas.rows[0], ...importacion.rows[0], ...comisiones.rows[0],
          ...contabilidad.rows[0],
          portales_parados: portales?.valor?.n ?? 0,
        }),
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_pendientes_failed', err);
  }
});

/**
 * Cuánto deja cada coche, uno a uno.
 *
 * El agregado dice si el mes fue bueno; esto dice si el negocio funciona. Con un
 * coche la cuenta se hace a mano, con quince no: y un coche que pierde 400 €
 * desaparece dentro de un total que sale en verde.
 *
 * Los apuntes son los mismos del resto del panel —el fichero del asesor y las
 * cuentas salen de ahí—, así que el margen de un coche y el margen del mes no
 * pueden decir cosas distintas. Se pide el año corriente: un expediente abierto
 * hace catorce meses es un problema distinto y no es este.
 */
dashboardRouter.get('/dashboard/margenes', requireRole(['admin', 'operations']), async (_req, res) => {
  try {
    const anio = elPeriodo('anio');

    const [coches, apuntes] = await Promise.all([
      query<{ id: string; vehicle_title: string | null; status: string | null; created_at: unknown }>(`
        SELECT id, vehicle_title, status, created_at
          FROM moveadvisor_market_leads
         WHERE lead_type = 'import'
         ORDER BY created_at DESC
      `).catch(() => ({ rows: [] as { id: string; vehicle_title: string | null; status: string | null; created_at: unknown }[] })),
      losApuntes(anio.desde, anio.hasta).catch(() => []),
    ]);

    res.json({
      ok: true,
      data: {
        periodo: anio.etiqueta,
        ...margenPorCoche(
          coches.rows.map((c) => ({
            id: c.id, vehiculo: c.vehicle_title, estado: c.status, desde: elDia(c.created_at),
          })),
          apuntes
        ),
      },
    });
  } catch (err) {
    falloInterno(res, 'dashboard_margenes_failed', err);
  }
});
