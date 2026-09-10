/**
 * Las revisiones de taller de los coches que vendemos por su dueño.
 *
 * Es la puerta que faltaba. Las otras cinco son cosas del cliente; esta la
 * ponemos nosotros, y hasta ahora no existía: se podía publicar un anuncio que
 * dice que el coche está comprobado sin que nadie lo hubiera comprobado.
 *
 * No hay integración con ningún taller ni hace falta: lo que hay es una ficha
 * que dice cuándo se llevó, adónde y qué dijeron. Se rellena a mano, como las
 * peritaciones de importación, y con eso ya se puede sostener lo que promete el
 * anuncio.
 *
 * El **porqué** está en el manual de ejecución «Flujo particular — Nosotros lo
 * vendemos por ti».
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { apuntaFacturaEsperada } from './provider-billing.js';
import {
  ESTADOS, RESULTADOS, QUE_TOCA, ETIQUETA, LO_QUE_CUESTA,
  esUnEstado, esUnResultado, elCocheEstaComprobado, porQueNoEstaComprobado,
  ENSURE_TABLE, ENSURE_UNA_VIVA, SQL_LA_DEL_COCHE,
} from '../lib/revision-del-taller.js';

export const revisionesTallerRouter = Router();

let listo = false;
async function prepara(): Promise<void> {
  if (listo) return;
  await query(ENSURE_TABLE);
  await query(ENSURE_UNA_VIVA).catch(() => {});
  listo = true;
}

/**
 * Y la misma preparación, para quien lea la tabla desde fuera.
 *
 * El panel cuenta los encargos que esperan al taller con una consulta que
 * incluye `erp_revisiones_taller`. Si nadie la ha creado todavía, esa consulta
 * falla, el panel se traga el fallo y **los cuatro avisos de encargos se quedan
 * a cero** — que es indistinguible de «no hay nada pendiente».
 */
export const preparaRevisionesTaller = prepara;

/** La revisión de un coche, con lo que falta dicho en una frase. */
export async function laRevisionDe(vehicleId: string) {
  await prepara();
  const r = await query(SQL_LA_DEL_COCHE, [vehicleId]).catch(() => ({ rows: [] }));
  return r.rows[0] ?? null;
}

/**
 * Si la revisión deja publicar este coche, o por qué no.
 *
 * Cadena vacía cuando sí. La usa el portero de publicar, que es donde de verdad
 * importa: en la pantalla el botón sale apagado, pero eso es una pista.
 */
export async function porQueElTallerNoDeja(vehicleId: string): Promise<string> {
  const r = await laRevisionDe(vehicleId);
  return porQueNoEstaComprobado(r);
}

revisionesTallerRouter.get(
  '/revisiones-taller/coche/:vehicleId',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      const r = await laRevisionDe(req.params.vehicleId);
      res.json({
        ok: true,
        data: {
          revision: r,
          estados: ESTADOS,
          resultados: RESULTADOS.map((x) => ({ clave: x, nombre: ETIQUETA[x] })),
          que_toca: r ? QUE_TOCA[r.estado as keyof typeof QUE_TOCA] ?? '' : '',
          comprobado: elCocheEstaComprobado(r),
          por_que_no: porQueNoEstaComprobado(r),
          lo_que_cuesta: LO_QUE_CUESTA,
        },
      });
    } catch (err) {
      console.error('[revisiones-taller] leer:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'revision_get_failed' });
    }
  }
);

/** Se le da cita en el taller. */
revisionesTallerRouter.post(
  '/revisiones-taller',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await prepara();
      const vehicleId = String(req.body?.vehicle_id ?? '').trim();
      const taller = String(req.body?.taller ?? '').trim();
      if (!vehicleId) { res.status(400).json({ ok: false, error: 'falta_el_coche' }); return; }
      if (!taller) { res.status(400).json({ ok: false, error: 'Falta a qué taller se lleva' }); return; }

      const r = await query(
        `INSERT INTO erp_revisiones_taller
           (id, vehicle_id, encargo_id, estado, taller, cita_at, coste, creado_por)
         VALUES ($1,$2,$3,'En el taller',$4,$5,$6,$7)
         RETURNING *`,
        [
          `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          vehicleId,
          String(req.body?.encargo_id ?? '').trim() || null,
          taller,
          req.body?.cita_at || null,
          Number(req.body?.coste) || LO_QUE_CUESTA,
          req.actor?.name ?? req.actor?.sub ?? '',
        ]
      );
      res.status(201).json({ ok: true, data: r.rows[0] });
    } catch (err) {
      const msg = (err as Error).message;
      if (/ux_revision_viva_por_coche/.test(msg)) {
        res.status(409).json({ ok: false, error: 'Ese coche ya está en el taller.' });
        return;
      }
      console.error('[revisiones-taller] crear:', msg);
      res.status(500).json({ ok: false, error: 'revision_create_failed' });
    }
  }
);

/**
 * Se apunta lo que dijo el taller.
 *
 * El resultado es obligatorio para cerrarla: una revisión «Hecha» sin resultado
 * es un coche sin revisar con papeleo encima, y lo que se promete en el anuncio
 * no es que lo hayamos llevado sino que lo han mirado.
 */
revisionesTallerRouter.patch(
  '/revisiones-taller/:id',
  requireRole(['admin', 'operations', 'support']),
  async (req, res) => {
    try {
      await prepara();
      const estado = String(req.body?.estado ?? '').trim();
      if (estado && !esUnEstado(estado)) {
        res.status(400).json({ ok: false, error: 'estado_no_valido' });
        return;
      }
      const resultado = req.body?.resultado === undefined ? undefined : String(req.body.resultado).trim();
      if (resultado !== undefined && resultado !== '' && !esUnResultado(resultado)) {
        res.status(400).json({ ok: false, error: 'resultado_no_valido' });
        return;
      }
      if (estado === 'Hecha' && !esUnResultado(resultado)) {
        res.status(400).json({
          ok: false, error: 'falta_el_resultado',
          detail: 'Para cerrarla hay que decir cómo salió',
        });
        return;
      }

      const r = await query(
        `UPDATE erp_revisiones_taller
            SET estado    = COALESCE($2, estado),
                resultado = COALESCE($3, resultado),
                notas     = COALESCE($4, notas),
                hecha_at  = CASE WHEN $2 = 'Hecha' THEN NOW() ELSE hecha_at END,
                updated_at = NOW()
          WHERE id = $1
        RETURNING *`,
        [req.params.id, estado || null, resultado || null,
         req.body?.notas === undefined ? null : String(req.body.notas)]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'revision_no_encontrada' }); return; }

      /*
       * Hecha: el taller ya puede facturarnos.
       *
       * Es lo mismo que con el perito, la gestoría y el transportista, y esta
       * era la única de las cuatro que no lo hacía. El coste se guardaba en la
       * ficha de la revisión y de ahí no salía: las cuentas se hacen con
       * facturas, así que esos 60 € por coche captado no aparecían en ningún
       * sitio.
       *
       * Lo que eso rompía: el margen por coche salía 60 € de más, la factura
       * del taller nunca entraba en «facturas de proveedor sin llegar» —que
       * existe justo para que un gasto no se quede sin deducir— y, sobre todo,
       * el gasto que **justifica** los 150 € de cancelación era el que los
       * libros no veían.
       *
       * Se apunta al quedar hecha y no al dar la cita: hasta que no está hecho,
       * el taller no tiene nada que cobrar.
       */
      if (estado === 'Hecha') {
        const rev = r.rows[0] as Record<string, unknown>;
        const coche = await query(
          `SELECT plate, brand, model FROM moveadvisor_user_vehicles WHERE id = $1`,
          [String(rev.vehicle_id ?? '')]
        ).catch(() => ({ rows: [] }));
        const v = coche.rows[0] ?? {};
        const titulo = [v.brand, v.model].filter(Boolean).join(' ')
          + (v.plate ? ` (${String(v.plate)})` : '');

        /*
         * El concepto lleva el día, y no es decoración.
         *
         * `apuntaFacturaEsperada` no duplica: reconoce el servicio por
         * proveedor + concepto + coche. Eso está bien para que volver a pulsar
         * no apunte dos veces, pero sin fecha el mismo coche llevado al mismo
         * taller el año que viene se plegaría sobre la revisión del año pasado
         * y nos comeríamos 60 € **en silencio**, que es justo el fallo que esto
         * viene a arreglar.
         *
         * Con el día, dos pulsaciones del mismo día siguen siendo una sola y
         * dos revisiones de años distintos son dos.
         */
        const dia = rev.hecha_at
          ? new Date(rev.hecha_at as string).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        await apuntaFacturaEsperada({
          proveedor: String(rev.taller ?? ''),
          concepto: `Revisión mecánica del vehículo · ${dia}`,
          importe: (rev.coste as string | null) ?? LO_QUE_CUESTA,
          vehiculo: titulo.trim() || String(rev.vehicle_id ?? ''),
        }).catch((e) => console.error('[revisiones-taller] sin factura esperada:', (e as Error).message));
      }

      res.json({
        ok: true,
        data: { revision: r.rows[0], comprobado: elCocheEstaComprobado(r.rows[0]) },
      });
    } catch (err) {
      console.error('[revisiones-taller] actualizar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'revision_update_failed' });
    }
  }
);
