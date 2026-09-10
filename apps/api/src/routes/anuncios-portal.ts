/**
 * Dónde está anunciado cada coche fuera de casa, y quitarlo a tiempo.
 *
 * Publicar en coches.net lo hace una persona a mano, y retirarlo también. Eso
 * está decidido y no es lo que se arregla aquí: lo que se arregla es que
 * **nadie se acuerde de retirarlo**.
 *
 * El fallo ya pasó una vez con el Kia Sorento: se entregó el 1 de septiembre y
 * seguía en el escaparate una semana después. Aquello se tapó con una consulta
 * porque el escaparate es nuestro. Un anuncio en coches.net no se apaga con una
 * consulta —hay que entrar y borrarlo— y si nadie lo apuntó, nadie sabe que
 * está. Y esta vez es peor: el teléfono de ese anuncio es el nuestro, así que
 * las llamadas por un coche vendido las cogemos nosotros.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  PORTALES, elPortal, faltaParaApuntar, elEnlaceParaElPortal,
  ENSURE_TABLE, ENSURE_UNO_VIVO, SQL_LOS_DEL_COCHE, SQL_POR_RETIRAR,
  SQL_LOS_POR_RETIRAR, SQL_RETIRA,
} from '../lib/anuncios-de-portal.js';

export const anunciosPortalRouter = Router();

let listo = false;
async function prepara(): Promise<void> {
  if (listo) return;
  await query(ENSURE_TABLE);
  await query(ENSURE_UNO_VIVO).catch(() => {});
  listo = true;
}

/**
 * Y la misma preparación, para quien cuente desde fuera.
 *
 * El panel cuenta los que hay que retirar. Si la tabla no existe todavía, esa
 * consulta falla, el panel se traga el fallo y el aviso se queda a cero — que
 * es indistinguible de «no hay ninguno puesto».
 */
export const preparaAnunciosDePortal = prepara;

/** Cuántos coches tienen anuncios fuera que ya no deberían estar. */
export async function losAnunciosPorRetirar(): Promise<{ anuncios_por_retirar: number }> {
  await prepara().catch(() => {});
  const r = await query(SQL_POR_RETIRAR).catch(() => null);
  return { anuncios_por_retirar: Number(r?.rows[0]?.n ?? 0) };
}

/**
 * Los de un coche, con el enlace que hay que pegar.
 *
 * El enlace se calcula y no se guarda: sale de la matrícula y del portal, y
 * guardarlo sería una copia que se queda vieja el día que cambie el dominio.
 */
anunciosPortalRouter.get(
  '/anuncios-portal/coche/:vehicleId',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const [anuncios, coche] = await Promise.all([
        query(SQL_LOS_DEL_COCHE, [req.params.vehicleId]).catch(() => ({ rows: [] })),
        query(
          `SELECT plate FROM moveadvisor_user_vehicles WHERE id = $1`,
          [req.params.vehicleId]
        ).catch(() => ({ rows: [] })),
      ]);

      const matricula = String(coche.rows[0]?.plate ?? '');
      res.json({
        ok: true,
        data: {
          anuncios: anuncios.rows,
          portales: PORTALES,
          matricula,
          /*
           * El enlace para cada portal, ya montado con su UTM.
           *
           * Se dan todos hechos y no se pide que se escriba ninguno: escrita a
           * mano, la fuente sale unas veces «coches.net» y otras «Coches.net»,
           * y en el informe son dos filas distintas que nadie suma.
           */
          enlaces: PORTALES.map((p) => ({
            portal: p,
            url: elEnlaceParaElPortal(config.PUBLIC_SITE_URL, matricula, p),
          })).filter((e) => e.url),
        },
      });
    } catch (err) {
      console.error('[anuncios-portal] leer:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'anuncios_get_failed' });
    }
  }
);

/** Y todos los que hay que ir a quitar, para la lista de Pendientes. */
anunciosPortalRouter.get(
  '/anuncios-portal/por-retirar',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (_req, res) => {
    try {
      await prepara();
      const r = await query(SQL_LOS_POR_RETIRAR).catch(() => ({ rows: [] }));
      res.json({ ok: true, data: r.rows });
    } catch (err) {
      console.error('[anuncios-portal] por retirar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'anuncios_por_retirar_failed' });
    }
  }
);

/** Se apunta que el anuncio está puesto. */
anunciosPortalRouter.post(
  '/anuncios-portal',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const datos = {
        vehicle_id: String(req.body?.vehicle_id ?? '').trim(),
        portal: elPortal(req.body?.portal),
        url: String(req.body?.url ?? '').trim(),
      };
      const falta = faltaParaApuntar(datos);
      if (falta) { res.status(400).json({ ok: false, error: falta }); return; }

      const r = await query(
        `INSERT INTO erp_anuncios_de_portal (id, vehicle_id, portal, url, publicado_por)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          `anu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          datos.vehicle_id, datos.portal, datos.url,
          req.actor?.name ?? req.actor?.sub ?? '',
        ]
      );
      res.status(201).json({ ok: true, data: r.rows[0] });
    } catch (err) {
      const msg = (err as Error).message;
      if (/ux_anuncio_vivo_por_coche_y_portal/.test(msg)) {
        res.status(409).json({ ok: false, error: 'Ese coche ya está apuntado en ese portal.' });
        return;
      }
      console.error('[anuncios-portal] apuntar:', msg);
      res.status(500).json({ ok: false, error: 'anuncio_create_failed' });
    }
  }
);

/**
 * Y que ya se ha quitado.
 *
 * Se apunta quién y cuándo, y solo si no estaba retirado ya: volver a pulsar no
 * reescribe la fecha. Si no, el rastro diría la última vez que alguien tocó el
 * botón y no la vez que se retiró de verdad — que es lo que hace falta saber
 * cuando un anuncio sigue puesto y hay que preguntar a alguien.
 */
anunciosPortalRouter.post(
  '/anuncios-portal/:id/retirar',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(SQL_RETIRA, [
        req.params.id,
        req.actor?.name ?? req.actor?.sub ?? '',
      ]);
      if (!r.rows.length) {
        res.status(409).json({ ok: false, error: 'ya_estaba_retirado' });
        return;
      }
      res.json({ ok: true, data: { id: r.rows[0].id } });
    } catch (err) {
      console.error('[anuncios-portal] retirar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'anuncio_retirar_failed' });
    }
  }
);
