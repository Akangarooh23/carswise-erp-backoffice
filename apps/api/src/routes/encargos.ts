/**
 * Los encargos de venta: «nosotros lo vendemos por ti».
 *
 * Un particular nos encarga vender su coche. Él lo conserva y lo único que hace
 * es enseñarlo; lo demás —anuncios, llamadas, papeles— lo llevamos nosotros. No
 * compramos el coche en ningún momento.
 *
 * ## Por qué esto tiene tabla propia y no una casilla en el IDCar
 *
 * Porque lo que hay que poder contestar no es «¿está publicado?» sino **si
 * aceptó nuestro precio**, **qué le falta por traer**, **desde cuándo puede
 * irse sin pagarnos** y **cuánto se le factura al cerrar**. Eso no cabe en una
 * casilla, y además tiene que sobrevivir a que el coche se despublique y se
 * vuelva a publicar.
 *
 * ## El mandato no caduca
 *
 * Se extiende hasta que el cliente lo cancela o hasta que vendemos. Los 30 días
 * no son una caducidad: son hasta cuándo se le puede cobrar la penalización.
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
  DIAS_HASTA_SALIR_GRATIS, FEE_DE_GESTION, FEE_DE_CANCELACION,
  libreDesde, diasQueQuedan, laPenalizacion, yaSePuedeIrGratis,
  lasPuertas, sePuedePublicar, loQueLeFalta, tocaLlamarle, soloLeFaltanFranjas,
  type LoQueHay,
} from '../lib/encargo-de-venta.js';
import {
  MOTIVOS, COMO_ACABO, esUnMotivo, loQueSeLeFactura,
  TIPO_DE_FACTURA, SQL_YA_EMITIDA, SQL_CIERRA,
} from '../lib/cierre-del-encargo.js';
import { nextProviderInvoiceId } from './provider-billing.js';
import { guardaConIdUnico } from '../lib/series.js';

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
    libre_desde     TIMESTAMPTZ,
    acepto_el_precio BOOLEAN NOT NULL DEFAULT FALSE,
    precio_referencia NUMERIC(12,2),
    precio_acordado NUMERIC(12,2),
    fee_gestion     NUMERIC(12,2),
    fee_cancelacion NUMERIC(12,2),
    avisado_at      TIMESTAMPTZ,
    cerrado_at      TIMESTAMPTZ,
    motivo_cierre   TEXT NOT NULL DEFAULT '',
    lead_id         TEXT,
    creado_por      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

/**
 * Un coche, un encargo vivo.
 *
 * Sin esto, dos personas atendiendo al mismo cliente le abren dos mandatos y el
 * coche acaba con dos mandatos distintos, cada uno con su penalización y su
 * fecha — y ninguna de las dos vale. Los cerrados no cuentan: el mismo señor
 * puede volver el año que viene con el mismo coche.
 */
/*
 * Las columnas que llegaron después.
 *
 * La tabla se creó con un modelo de caducidad que resultó no ser el trato: el
 * mandato no vence, se extiende hasta que el cliente cancela o vendemos. Se
 * quedó una `vence_at` que ya no escribe ni lee nadie.
 */
const ENSURE_COLUMNAS = `
  ALTER TABLE erp_encargos_venta
    ADD COLUMN IF NOT EXISTS libre_desde TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acepto_el_precio BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio_referencia NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS lead_id TEXT`;

const ENSURE_UNO_VIVO = `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_encargo_vivo_por_coche
    ON erp_encargos_venta (vehicle_id)
    WHERE cerrado_at IS NULL`;

let listo = false;
async function prepara(): Promise<void> {
  if (listo) return;
  await query(ENSURE_TABLE);
  await query(ENSURE_COLUMNAS).catch(() => {});
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
 * Los tres avisos de los encargos, para el panel.
 *
 * Se traen **todos los encargos vivos en una consulta** y las puertas se
 * calculan aquí, con las mismas reglas que la ficha. La alternativa —contarlos
 * en SQL— obligaría a reescribir las cuatro puertas en otro idioma, y el día
 * que cambie una de las dos versiones el panel diría una cosa y la ficha otra.
 *
 * Traerlos todos se puede porque son pocos: los vivos son los que se han
 * captado y todavía no se han vendido ni cancelado.
 */
export async function losAvisosDeEncargos(): Promise<{
  encargos_vendidos: number;
  encargos_por_llamar: number;
  encargos_sin_franjas: number;
  encargos_listos: number;
}> {
  const vacio = { encargos_vendidos: 0, encargos_por_llamar: 0, encargos_sin_franjas: 0, encargos_listos: 0 };
  await prepara();

  const r = await query(`
    SELECT e.firmado_at, e.acepto_el_precio,
           EXISTS (
             SELECT 1 FROM vehicle_visit_bookings b
              WHERE b.offer_id = 'idcar-' || e.vehicle_id AND b.resultado = 'compro'
           ) AS se_vendio,
           v.plate, v.brand, v.model, v.year, v.mileage,
           (SELECT COUNT(*) FROM moveadvisor_user_vehicle_files f
             WHERE f.vehicle_id = e.vehicle_id AND f.file_type = 'photo'
               AND COALESCE(f.file_url, '') <> '') AS fotos,
           (SELECT COALESCE(array_agg(DISTINCT d.document_type), '{}')
              FROM moveadvisor_user_vehicle_documents d
             WHERE d.vehicle_id = e.vehicle_id) AS papeles,
           (SELECT r2.status FROM moveadvisor_vehicle_condition_reports r2
             WHERE r2.vehicle_id = e.vehicle_id ORDER BY r2.created_at DESC LIMIT 1) AS informe,
           (SELECT COALESCE(array_agg(a.starts_at), '{}')
              FROM vehicle_visit_availability a
             WHERE a.offer_id = 'idcar-' || e.vehicle_id
               AND a.status = 'available' AND a.starts_at > NOW()) AS franjas
      FROM erp_encargos_venta e
      LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
     WHERE e.cerrado_at IS NULL
  `).catch(() => null);
  if (!r) return vacio;

  const cuenta = { ...vacio };
  for (const fila of r.rows) {
    const puertas = lasPuertas({
      matricula: fila.plate as string | null,
      marca: fila.brand as string | null,
      modelo: fila.model as string | null,
      ano: fila.year as number | null,
      kilometros: fila.mileage as number | null,
      fotos: Number(fila.fotos ?? 0),
      papeles: (fila.papeles as string[]) ?? [],
      informe: fila.informe as string | null,
      franjas: ((fila.franjas as (string | Date)[]) ?? []).map((f) => new Date(f).toISOString()),
    });

    // Una visita de ese coche acabo en venta y el encargo sigue abierto: falta
    // cerrarlo y emitir los 299 EUR.
    if (fila.se_vendio) cuenta.encargos_vendidos += 1;
    if (tocaLlamarle({ firmado_at: fila.firmado_at as string | null, acepto_el_precio: fila.acepto_el_precio as boolean })) cuenta.encargos_por_llamar += 1;
    if (soloLeFaltanFranjas(puertas)) cuenta.encargos_sin_franjas += 1;
    if (sePuedePublicar(puertas)) cuenta.encargos_listos += 1;
  }
  return cuenta;
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

      /*
       * Y el último que se cerró, si lo hubo.
       *
       * Sin esto, en cuanto se cierra un encargo la ficha vuelve a decir «este
       * coche no lo gestionamos nosotros», que es verdad pero se lee como si no
       * se hubiera guardado nada.
       */
      const cerrado = await query(
        `SELECT id, motivo_cierre, cerrado_at, cliente_nombre, cliente_email
           FROM erp_encargos_venta
          WHERE vehicle_id = $1 AND cerrado_at IS NOT NULL
          ORDER BY cerrado_at DESC LIMIT 1`,
        [req.params.vehicleId]
      ).catch(() => ({ rows: [] }));

      const hay = await loQueHayDe(req.params.vehicleId);
      const puertas = lasPuertas(hay);

      res.json({
        ok: true,
        data: {
          encargo,
          ultimo_cerrado: cerrado.rows[0] ?? null,
          puertas,
          se_puede_publicar: sePuedePublicar(puertas),
          le_falta: loQueLeFalta(puertas),
          /*
           * Nada de esto caduca. Lo que se dice es qué pasaría si se fuera hoy,
           * que es lo que hace falta saber cuando se le llama.
           */
          penalizacion: encargo ? laPenalizacion(encargo) : null,
          ya_se_puede_ir_gratis: encargo ? yaSePuedeIrGratis(encargo) : false,
          dias_hasta_irse_gratis: encargo ? diasQueQuedan(encargo.libre_desde) : null,
          /*
           * Cuánto se le cobraría en cada final, calculado aquí y no en la
           * pantalla. Si la pantalla lo repitiera, un día enseñaría un importe
           * y el botón cobraría otro — y el que lo descubre es el cliente.
           */
          cierres: encargo
            ? MOTIVOS.map((m) => ({
                motivo: m,
                como_acabo: COMO_ACABO[m],
                importe: loQueSeLeFactura(m, encargo)?.total ?? 0,
              }))
            : [],
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
      /*
       * Si firmó la cláusula del precio o no.
       *
       * Por defecto **no**, que es la respuesta prudente: da por hecho que se le
       * puede cobrar la penalización, y eso lo corrige el cliente en cuanto
       * pase. Al revés —darlo por firmado— se dejaría de cobrar sin que nadie se
       * entere.
       */
      const aceptoElPrecio = req.body?.acepto_el_precio === true;
      const libre = libreDesde(firmado, aceptoElPrecio);
      const id = `enc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const r = await query(
        `INSERT INTO erp_encargos_venta
           (id, vehicle_id, cliente_email, cliente_nombre, estado, firmado_at,
            acepto_el_precio, libre_desde, precio_referencia,
            fee_gestion, fee_cancelacion, lead_id, creado_por)
         VALUES ($1,$2,$3,$4,'recogiendo',$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          id, vehicleId,
          String(req.body?.cliente_email ?? coche.rows[0].user_email ?? ''),
          String(req.body?.cliente_nombre ?? coche.rows[0].name ?? ''),
          firmado.toISOString(),
          aceptoElPrecio, libre?.toISOString() ?? null,
          Number(req.body?.precio_referencia) || null,
          FEE_DE_GESTION, FEE_DE_CANCELACION,
          String(req.body?.lead_id ?? '').trim() || null,
          req.actor?.name ?? req.actor?.sub ?? '',
        ]
      );

      res.status(201).json({ ok: true, data: r.rows[0], dias: DIAS_HASTA_SALIR_GRATIS });
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

/**
 * Cerrar el encargo, y facturar lo que toque.
 *
 * Hasta ahora un encargo se abría y no se podía terminar: `cerrado_at` estaba
 * en la tabla y no lo escribía nadie. Un encargo abierto para siempre acaba
 * llenando los avisos del panel de clientes de hace meses.
 *
 * El orden importa: **primero la factura, después el cierre**. Si el cierre
 * falla, la factura está y el encargo sigue abierto — se ve, y se puede
 * reintentar sin emitir dos veces porque el guardián mira si ya existe. Al
 * revés, el encargo quedaría cerrado y el cobro perdido, que no lo ve nadie.
 */
encargosRouter.post(
  '/encargos/:id/cerrar',
  requireRole(['admin', 'operations']),
  async (req, res) => {
    try {
      await prepara();
      const motivo = String(req.body?.motivo ?? '').trim();
      if (!esUnMotivo(motivo)) {
        res.status(400).json({ ok: false, error: 'motivo_no_valido', detail: `vale uno de: ${MOTIVOS.join(', ')}` });
        return;
      }

      const r = await query(
        `SELECT e.*, v.plate, v.brand, v.model
           FROM erp_encargos_venta e
           LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
          WHERE e.id = $1`,
        [req.params.id]
      );
      const e = r.rows[0];
      if (!e) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }
      if (e.cerrado_at) {
        res.status(409).json({ ok: false, error: 'ya_estaba_cerrado', detail: String(e.motivo_cierre ?? '') });
        return;
      }

      const factura = loQueSeLeFactura(motivo, {
        firmado_at: e.firmado_at as string | null,
        acepto_el_precio: e.acepto_el_precio as boolean,
      });

      let facturaId: string | null = null;
      if (factura) {
        const ya = await query(SQL_YA_EMITIDA, [TIPO_DE_FACTURA, String(e.id)]);
        if (ya.rows.length) {
          facturaId = String(ya.rows[0].id);
        } else {
          const coche = [e.brand, e.model].filter(Boolean).join(' ')
            + (e.plate ? ` (${String(e.plate)})` : '');
          const nueva = await guardaConIdUnico(nextProviderInvoiceId, async (id) => {
            await query(
              `INSERT INTO moveadvisor_provider_invoices
                 (id, type, provider_name, contract_id, vehicle_title,
                  customer_name, customer_email,
                  base_amount, invoice_amount, iva_rate, regimen, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'nacional', $11)`,
              [
                id, TIPO_DE_FACTURA,
                // A un particular se le factura a él: no hay proveedor detrás.
                String(e.cliente_nombre ?? e.cliente_email ?? 'Cliente particular'),
                String(e.id), coche.trim() || null,
                e.cliente_nombre, e.cliente_email,
                factura.base, factura.total, factura.iva / 100, factura.concepto,
              ]
            );
          });
          facturaId = nueva.id;
        }
      }

      const cerrado = await query(SQL_CIERRA, [String(e.id), motivo]);
      if (!cerrado.rows.length) {
        // Se le adelantó otra pestaña entre la lectura y el cierre.
        res.status(409).json({ ok: false, error: 'ya_estaba_cerrado' });
        return;
      }

      res.json({
        ok: true,
        data: {
          motivo,
          como_acabo: COMO_ACABO[motivo],
          factura: facturaId,
          importe: factura?.total ?? 0,
        },
      });
    } catch (err) {
      console.error('[encargos] cerrar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'encargo_cerrar_failed' });
    }
  }
);

/**
 * El precio y si lo ha aceptado.
 *
 * Va aparte del alta porque el precio se acuerda **después**: se le propone uno
 * salido del mercado y él dice que sí o que no, y eso puede pasar el mismo día
 * o tres llamadas más tarde.
 *
 * Y es lo que decide la penalización, así que si no se pudiera cambiar, la
 * regla de las tres ramas no serviría de nada: todos los encargos se quedarían
 * en «no aceptó», que es donde nacen.
 */
encargosRouter.patch(
  '/encargos/:id/precio',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `SELECT * FROM erp_encargos_venta WHERE id = $1 AND cerrado_at IS NULL`,
        [req.params.id]
      );
      const e = r.rows[0];
      if (!e) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }

      const acepta = req.body?.acepto_el_precio;
      const aceptoElPrecio = acepta === undefined
        ? Boolean(e.acepto_el_precio)
        : acepta === true;

      /*
       * Los 30 días cuentan desde que firmó, no desde hoy.
       *
       * Si se contaran desde el momento de marcar la casilla, alguien que
       * firmó hace tres semanas y al que se le apunta hoy volvería a tener un
       * mes por delante — y le estaríamos cobrando una penalización que ya no
       * le corresponde.
       */
      const libre = e.firmado_at ? libreDesde(e.firmado_at as string, aceptoElPrecio) : null;

      const precio = req.body?.precio_referencia === undefined
        ? (e.precio_referencia as number | null)
        : Number(req.body.precio_referencia) || null;

      const upd = await query(
        `UPDATE erp_encargos_venta
            SET acepto_el_precio = $2, libre_desde = $3, precio_referencia = $4, updated_at = NOW()
          WHERE id = $1 AND cerrado_at IS NULL
        RETURNING *`,
        [req.params.id, aceptoElPrecio, libre?.toISOString() ?? null, precio]
      );
      if (!upd.rows.length) { res.status(409).json({ ok: false, error: 'ya_estaba_cerrado' }); return; }

      res.json({
        ok: true,
        data: {
          encargo: upd.rows[0],
          penalizacion: laPenalizacion(upd.rows[0]),
          dias_hasta_irse_gratis: diasQueQuedan(upd.rows[0].libre_desde),
        },
      });
    } catch (err) {
      console.error('[encargos] precio:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'encargo_precio_failed' });
    }
  }
);

/**
 * Los coches de un cliente, para poder abrirle el encargo desde su lead.
 *
 * Un lead de la web llega con el coche escrito a mano —«Volkswagen T-Roc R line
 * 2022»— y eso no es un IDCar: el IDCar lo crea él en su cuenta, porque es
 * quien sube las fotos, los papeles y el informe. Así que entre el lead y el
 * encargo hay una llamada y un rato.
 *
 * Esto es lo que hace que ese rato no acabe en «búscalo tú en IDCars»: se le
 * enseñan sus coches, con cuál ya tiene encargo, y se abre sobre el que sea.
 * Si no tiene ninguno, eso también hay que verlo — es lo que se le pide en la
 * llamada.
 *
 * Se busca por el correo del lead y no por el identificador de usuario porque
 * el que deja el formulario puede no tener cuenta todavía: el correo es lo
 * único que hay a los dos lados.
 */
encargosRouter.get(
  '/encargos/candidatos',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const email = String(req.query.email ?? '').trim().toLowerCase();
      if (!email) { res.status(400).json({ ok: false, error: 'falta_el_correo' }); return; }

      const r = await query(
        `SELECT v.id, v.plate, v.brand, v.model, v.year, v.created_at,
                e.id AS encargo_id, e.cerrado_at
           FROM moveadvisor_user_vehicles v
           LEFT JOIN moveadvisor_users u ON u.id = v.user_id
           LEFT JOIN erp_encargos_venta e
                  ON e.vehicle_id = v.id AND e.cerrado_at IS NULL
          WHERE lower(COALESCE(v.user_email, '')) = $1
             OR lower(COALESCE(u.email, '')) = $1
          ORDER BY v.created_at DESC`,
        [email]
      );
      res.json({ ok: true, data: r.rows });
    } catch (err) {
      console.error('[encargos] candidatos:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'candidatos_failed' });
    }
  }
);
