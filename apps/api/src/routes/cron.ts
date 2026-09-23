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
import { recuerdaLasCitasDelTaller } from '../lib/recuerda-las-citas-del-taller.js';
import { leeLasPendientes } from '../lib/la-ficha-leida.js';

export const cronRouter = Router();

/**
 * Quién puede disparar una tarea.
 *
 * Antes: con `CRON_SECRET` puesto se exigía; **sin él bastaba con decir que
 * eres Vercel**, porque se miraba el agente. Y el agente lo escribe quien
 * llama: es una línea de texto, no una credencial. Detrás de estas direcciones
 * hay un recálculo de números y los recordatorios de taller, que son correos a
 * clientes.
 *
 * Ahora, sin secreto no pasa nadie. Un secreto que falta es un fallo de
 * configuración, y un fallo de configuración puede cerrar una puerta —eso se
 * nota y se arregla— pero no abrirla.
 *
 * `CRON_SECRET` está puesto en este proyecto, y Vercel manda ese mismo valor en
 * `Authorization` al disparar una tarea: cerrar aquí no apaga nada.
 */
export function autorizado(req: Pick<Request, 'headers'>): boolean {
  const secreto = String(process.env.CRON_SECRET ?? '').trim();
  if (!secreto) {
    console.error(
      '[cron] CRON_SECRET no está configurado: las tareas no se ejecutan. ' +
      'Ponlo en Vercel (Settings → Environment Variables) y vuelve a desplegar.'
    );
    return false;
  }
  return String(req.headers.authorization ?? '') === `Bearer ${secreto}`;
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

    /*
     * Y las fichas técnicas que se hayan quedado sin leer.
     *
     * Cuando el cliente sube la suya, PopCar nos avisa y se lee al momento.
     * Esto es la red de debajo: el aviso puede no llegar —el ERP caído, un
     * despliegue a medias, una ficha subida antes de que esto existiera— y sin
     * red esa ficha no se lee jamás. Y una ficha sin leer no es un hueco
     * visible: es un coche que se tasa con lo que escribió el cliente.
     *
     * Va colgado de esta tarea y no en una suya para no tocar los crons
     * configurados. Con tope, que aquí lo caro es el lector y no la base.
     */
    const fichas = await leeLasPendientes(20).catch((err) => {
      console.error('[cron] fichas técnicas pendientes:', (err as Error).message);
      return 0;
    });

    res.json({
      ok: true,
      data: {
        // Qué se ha guardado y qué no. Un `false` aquí no es un fallo: es que
        // no había con qué calcularlo, y eso también hay que poder verlo.
        portales_parados: Boolean(parados),
        precio_contra_el_mercado: Boolean(precios),
        fichas_tecnicas_leidas: fichas,
      },
    });
  } catch (err) {
    falloInterno(res, 'cron_kpis_failed', err);
  }
});

/**
 * Los recordatorios de las citas del taller.
 *
 * Va aparte de los KPI y no dentro: son dos cosas con horarios distintos —los
 * números se recalculan de madrugada y un recordatorio a las cuatro de la
 * mañana llega enterrado bajo el correo de la noche— y, sobre todo, esto manda
 * correos a clientes. Si un día falla el recálculo, lo que no puede pasar es
 * que se queden sin recordar las citas del día siguiente.
 */
cronRouter.get('/cron/recordatorios-taller', async (req, res) => {
  if (!autorizado(req)) {
    res.status(401).json({ ok: false, error: 'no_autorizado' });
    return;
  }
  try {
    res.json({ ok: true, data: await recuerdaLasCitasDelTaller() });
  } catch (err) {
    falloInterno(res, 'cron_recordatorios_taller_failed', err);
  }
});
