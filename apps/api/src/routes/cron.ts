/**
 * Lo que se hace solo, una vez al día.
 *
 * Hasta ahora no había ninguna tarea programada aquí, y los dos números caros
 * —cuántas plataformas están paradas y cuánto nos separamos del precio de
 * mercado— solo se refrescaban si alguien entraba en la pantalla que los
 * calcula. Así que el panel enseñaba lo último que alguien miró, y si nadie
 * miraba en dos semanas, eso era lo que decía.
 *
 * No lleva `requireRole`: quien la llama es Vercel, que no tiene sesión. La
 * puerta es el secreto, y sin secreto configurado solo pasa la llamada de
 * Vercel Cron. La condición va en ese orden a propósito — al revés, no tener la
 * variable puesta dejaría la dirección abierta sin avisar.
 *
 * Y no devuelve los números, solo qué se ha recalculado. Es una tarea, no una
 * consulta: quien quiera las cifras las mira donde se enseñan, con su fecha.
 */
import { Router } from 'express';
import type { Request } from 'express';
import { falloInterno } from '../lib/fallos.js';
import { recalculaPortalesParados, recalculaPrecioContraElMercado } from '../lib/recalcula-los-kpis.js';

export const cronRouter = Router();

/**
 * Quién puede disparar una tarea.
 *
 * Con `CRON_SECRET` puesto se exige; sin él, solo la llamada de Vercel Cron,
 * que se reconoce por su agente. Lo segundo es más débil —un agente se puede
 * copiar— y por eso lo único que hay detrás es un recálculo: lo peor que
 * consigue quien se cuele es que los números estén más frescos.
 */
export function autorizado(req: Pick<Request, 'headers'>): boolean {
  const secreto = String(process.env.CRON_SECRET ?? '').trim();
  if (secreto) return String(req.headers.authorization ?? '') === `Bearer ${secreto}`;
  return String(req.headers['user-agent'] ?? '').toLowerCase().includes('vercel-cron');
}


cronRouter.get('/cron/kpis', async (req, res) => {
  if (!autorizado(req)) {
    res.status(401).json({ ok: false, error: 'no_autorizado' });
    return;
  }
  try {
    /*
     * Uno detrás de otro y no a la vez.
     *
     * El de precios tarda ocho segundos sobre 798.000 anuncios y el de portales
     * uno sobre 2,5 GB. Lanzarlos juntos es pedirle a la base las dos cosas
     * caras al mismo tiempo, de noche, mientras corren los rastreadores.
     *
     * Y cada uno con su resultado: si el segundo se cae, el primero ya está
     * guardado y se dice cuál falló.
     */
    const parados = await recalculaPortalesParados();
    const precios = await recalculaPrecioContraElMercado();

    res.json({
      ok: true,
      data: {
        // Qué se ha guardado y qué no. Un `false` aquí no es un fallo: es que
        // no había con qué calcularlo, y eso también hay que poder verlo.
        portales_parados: Boolean(parados),
        precio_contra_el_mercado: Boolean(precios),
      },
    });
  } catch (err) {
    falloInterno(res, 'cron_kpis_failed', err);
  }
});
