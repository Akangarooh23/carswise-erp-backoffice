/**
 * Los encargos de venta: «nosotros lo vendemos por ti».
 *
 * Un particular nos encarga vender su coche. Él lo conserva y lo único que hace
 * es enseñarlo; lo demás —anuncios, llamadas, papeles— lo llevamos nosotros. No
 * compramos el coche en ningún momento.
 *
 * ## Por qué esto tiene tabla propia y no una casilla en el IDCar
 *
 * Porque lo que hay que poder contestar no es «¿está publicado?» sino **cuándo
 * vence su exclusiva**, **qué le falta por traer** y **cuánto se le factura al
 * cerrar**. Eso son cuatro fechas y dos importes que no caben en una casilla, y
 * que además tienen que sobrevivir a que el coche se despublique y se vuelva a
 * publicar.
 *
 * ## Lo que aquí no se guarda
 *
 * Las cuatro puertas **no se guardan**: se calculan cada vez, mirando el coche,
 * sus papeles, su informe y sus franjas. Guardarlas sería tener dos versiones de
 * la verdad, y la copia se queda vieja en cuanto el cliente sube una foto o se
 * gasta una franja. Que la puerta de las franjas pueda volver a cerrarse sola
 * es justo lo que se quiere: un anuncio vivo que ya no se puede visitar tiene
 * que salir en los avisos.
 *
 * El **porqué** de todo el flujo está en el manual de ejecución «Flujo
 * particular — Nosotros lo vendemos por ti».
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  DIAS_DE_EXCLUSIVA, FEE_DE_GESTION, FEE_DE_CANCELACION,
  venceEl, diasQueQuedan, estaVencido, laFechaEstaRota,
  lasPuertas, sePuedePublicar, loQueLeFalta,
  type LoQueHay,
} from '../lib/encargo-de-venta.js';

export const encargosRouter = Router();

/**
 * Los dos importes se guardan en la fila, y a propósito: un mandato firmado por
 * 299 € sigue siendo de 299 € aunque mañana subamos la tarifa.
 *
 * Pero el valor no va en el DEFAULT de la columna. Un CREATE TABLE IF NOT
 * EXISTS no toca una tabla que ya existe, así que el día que cambie la tarifa
 * el DEFAULT de producción seguiría diciendo lo de antes mientras el código
 * dice otra cosa. Se escriben en el INSERT, desde las constantes.
 *
 * Y nada de acentos graves dentro de esta plantilla, ni siquiera en un
 * comentario SQL: en TypeScript cierran la cadena, y lo que sale es una
 * consulta cortada por la mitad que no falla hasta que se ejecuta.
 */
const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS erp_encargos_venta (
    id              TEXT PRIMARY KEY,
    vehicle_id      VARCHAR(64) NOT NULL,
    cliente_email   TEXT NOT NULL DEFAULT '',
    cliente_nombre  TEXT NOT NULL DEFAULT '',
    estado          TEXT NOT NULL DEFAULT 'recogiendo',
    firmado_at      TIMESTAMPTZ,
    vence_at        TIMESTAMPTZ,
    precio_acordado NUMERIC(12,2),
    fee_gestion     NUMERIC(12,2),
    fee_cancelacion NUMERIC(12,2),
    avisado_at      TIMESTAMPTZ,
    cerrado_at      TIMESTAMPTZ,
    motivo_cierre   TEXT NOT NULL DEFAULT '',
    creado_por      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

/**
 * Un coche, un encargo vivo.
 *
 * Sin esto, dos personas atendiendo al mismo cliente le abren dos mandatos y el
 * coche acaba con dos fechas de vencimiento distintas — y una de las dos
 * despublica el anuncio de la otra. Los cerrados no cuentan: el mismo señor
 * puede volver el año que viene con el mismo coche.
 */
const ENSURE_UNO_VIVO = `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_encargo_vivo_por_coche
    ON erp_encargos_venta (vehicle_id)
    WHERE cerrado_at IS NULL`;

let listo = false;
async function prepara(): Promise<void> {
  if (listo) return;
  await query(ENSURE_TABLE);
  await query(ENSURE_UNO_VIVO).catch(() => {});
  listo = true;
}

/**
 * Lo que el cliente lleva reunido, de las cinco tablas donde vive.
 *
 * Las franjas se piden **libres**: una que ya tiene visita no sirve para la
 * siguiente. El identificador de la oferta de un IDCar es `idcar-<id>`, que es
 * como lo escribe PopCar al publicar.
 */
export async function loQueHayDe(vehicleId: string): Promise<LoQueHay> {
  const coche = await query(
    `SELECT plate, brand, model, year, mileage
       FROM moveadvisor_user_vehicles WHERE id = $1`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));

  const fotos = await query(
    `SELECT COUNT(*)::int AS n FROM moveadvisor_user_vehicle_files
      WHERE vehicle_id = $1 AND file_type = 'photo' AND COALESCE(file_url, '') <> ''`,
    [vehicleId]
  ).catch(() => ({ rows: [{ n: 0 }] }));

  const papeles = await query(
    `SELECT DISTINCT document_type FROM moveadvisor_user_vehicle_documents
      WHERE vehicle_id = $1`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));

  const informe = await query(
    `SELECT status FROM moveadvisor_vehicle_condition_reports
      WHERE vehicle_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));

  const franjas = await query(
    `SELECT starts_at FROM vehicle_visit_availability
      WHERE offer_id = $1 AND status = 'available' AND starts_at > NOW()`,
    [`idcar-${vehicleId}`]
  ).catch(() => ({ rows: [] }));

  const v = coche.rows[0] ?? {};
  return {
    matricula: v.plate ?? null,
    marca: v.brand ?? null,
    modelo: v.model ?? null,
    ano: v.year ?? null,
    kilometros: v.mileage ?? null,
    fotos: fotos.rows[0]?.n ?? 0,
    papeles: papeles.rows.map((r) => String(r.document_type)),
    informe: informe.rows[0]?.status ?? null,
    franjas: franjas.rows.map((r) => new Date(r.starts_at as string).toISOString()),
  };
}

/**
 * Por qué no se puede publicar este coche todavía, o cadena vacía si sí se puede.
 *
 * Devuelve la frase, no un booleano, porque al otro lado hay alguien que tiene
 * que llamar al cliente y decirle qué le falta. Un `false` obliga a preguntarlo
 * otra vez.
 *
 * **Sin encargo no hay nada que comprobar.** Ese coche lo publica su dueño por
 * su cuenta y no nos ha prometido nada.
 */
export async function porQueNoSePuedePublicar(vehicleId: string): Promise<string> {
  await prepara();
  const r = await query(
    `SELECT id FROM erp_encargos_venta WHERE vehicle_id = $1 AND cerrado_at IS NULL`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));
  if (!r.rows.length) return '';

  const puertas = lasPuertas(await loQueHayDe(vehicleId));
  if (sePuedePublicar(puertas)) return '';
  return `Este coche lo vendemos nosotros y le falta: ${loQueLeFalta(puertas).join('; ')}`;
}

/** El encargo de un coche, con sus puertas al día. */
encargosRouter.get(
  '/encargos/coche/:vehicleId',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `SELECT * FROM erp_encargos_venta WHERE vehicle_id = $1 AND cerrado_at IS NULL`,
        [req.params.vehicleId]
      );
      const encargo = r.rows[0] ?? null;

      const hay = await loQueHayDe(req.params.vehicleId);
      const puertas = lasPuertas(hay);

      res.json({
        ok: true,
        data: {
          encargo,
          puertas,
          se_puede_publicar: sePuedePublicar(puertas),
          le_falta: loQueLeFalta(puertas),
          dias_que_quedan: encargo ? diasQueQuedan(encargo.vence_at) : null,
          vencido: encargo ? estaVencido(encargo.vence_at) : false,
          fecha_rota: encargo ? laFechaEstaRota(encargo.vence_at) : false,
        },
      });
    } catch (err) {
      console.error('[encargos] no se ha podido leer:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'encargo_get_failed' });
    }
  }
);

/** Se firma el mandato: nace el encargo y empieza a contar el plazo. */
encargosRouter.post(
  '/encargos',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await prepara();
      const vehicleId = String(req.body?.vehicle_id ?? '').trim();
      if (!vehicleId) {
        res.status(400).json({ ok: false, error: 'falta_el_coche' });
        return;
      }

      const coche = await query(
        `SELECT v.id, v.user_email, u.name
           FROM moveadvisor_user_vehicles v
           LEFT JOIN moveadvisor_users u ON u.id = v.user_id
          WHERE v.id = $1`,
        [vehicleId]
      );
      if (!coche.rows.length) {
        res.status(404).json({ ok: false, error: 'coche_no_encontrado' });
        return;
      }

      const firmado = new Date();
      const vence = venceEl(firmado);
      const id = `enc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const r = await query(
        `INSERT INTO erp_encargos_venta
           (id, vehicle_id, cliente_email, cliente_nombre, estado, firmado_at, vence_at,
            fee_gestion, fee_cancelacion, creado_por)
         VALUES ($1,$2,$3,$4,'recogiendo',$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          id, vehicleId,
          String(req.body?.cliente_email ?? coche.rows[0].user_email ?? ''),
          String(req.body?.cliente_nombre ?? coche.rows[0].name ?? ''),
          firmado.toISOString(), vence?.toISOString() ?? null,
          FEE_DE_GESTION, FEE_DE_CANCELACION,
          req.actor?.name ?? req.actor?.sub ?? '',
        ]
      );

      res.status(201).json({ ok: true, data: r.rows[0], dias: DIAS_DE_EXCLUSIVA });
    } catch (err) {
      const msg = (err as Error).message;
      // El índice de «un coche, un encargo vivo».
      if (/ux_encargo_vivo_por_coche/.test(msg)) {
        res.status(409).json({ ok: false, error: 'ya_tiene_un_encargo_vivo' });
        return;
      }
      console.error('[encargos] no se ha podido crear:', msg);
      res.status(500).json({ ok: false, error: 'encargo_create_failed' });
    }
  }
);
