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
  comoSeQuitaElAnuncio, SQL_YA_NO_ESTA_LISTADO,
} from '../lib/cierre-del-encargo.js';
import { nextProviderInvoiceId } from './provider-billing.js';
import { guardaConIdUnico } from '../lib/series.js';
import { porQueElTallerNoDeja, preparaRevisionesTaller } from './revisiones-taller.js';
import {
  COMO_SE_FIRMA, COMO_LO_DECIMOS, SERIE as SERIE_DEL_MANDATO,
  esUnaFirma, estaFirmado, porQueNoEstaFirmado,
  elMandato, comoSeLlamaElFichero,
} from '../lib/mandato-de-venta.js';
import { prefijoAnual, siguienteDeSerie } from '../lib/series.js';
import { enviar } from '../lib/correo.js';
import { elCorreoDelMandato, elCorreoDelCierre, elCorreoDePublicado } from '../lib/correos-del-encargo.js';
import { config } from '../config.js';
import { abreLaTransferenciaDelEncargo } from './tramites.js';
import { sigueEsperandoAlTaller, elTallerLoTumbo } from '../lib/revision-del-taller.js';

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
    ADD COLUMN IF NOT EXISTS lead_id TEXT,
    ADD COLUMN IF NOT EXISTS mandato_id TEXT,
    ADD COLUMN IF NOT EXISTS firma_como TEXT,
    ADD COLUMN IF NOT EXISTS firma_nota TEXT`;

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

  /*
   * Su tasación gratuita, la más reciente con importe.
   *
   * Sin importe no vale: una fila a cero es alguien que empezó el cuestionario
   * y lo dejó, y tomar eso por un precio acordado sería publicar un coche a un
   * número que no ha dicho nadie.
   */
  const tasacion = await query(
    `SELECT estimate_value FROM moveadvisor_user_valuations
      WHERE vehicle_id = $1 AND COALESCE(estimate_value, 0) > 0
      ORDER BY created_at DESC LIMIT 1`,
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
    tasacion: Number(tasacion.rows[0]?.estimate_value ?? 0) || null,
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
  encargos_rechazados: number;
  encargos_sin_firmar: number;
}> {
  const vacio = {
    encargos_vendidos: 0, encargos_por_llamar: 0, encargos_sin_franjas: 0,
    encargos_listos: 0, encargos_rechazados: 0, encargos_sin_firmar: 0,
  };
  await prepara();
  // La consulta de abajo lee `erp_revisiones_taller`. Si nadie la ha creado
  // todavía, falla entera y los cinco avisos se quedan a cero para siempre.
  await preparaRevisionesTaller().catch(() => {});

  const r = await query(`
    SELECT e.firmado_at, e.acepto_el_precio, e.firma_como,
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
           (SELECT t.estimate_value FROM moveadvisor_user_valuations t
             WHERE t.vehicle_id = e.vehicle_id AND COALESCE(t.estimate_value, 0) > 0
             ORDER BY t.created_at DESC LIMIT 1) AS tasacion,
           (SELECT r2.status FROM moveadvisor_vehicle_condition_reports r2
             WHERE r2.vehicle_id = e.vehicle_id ORDER BY r2.created_at DESC LIMIT 1) AS informe,
           (SELECT COALESCE(array_agg(a.starts_at), '{}')
              FROM vehicle_visit_availability a
             WHERE a.offer_id = 'idcar-' || e.vehicle_id
               AND a.status = 'available' AND a.starts_at > NOW()) AS franjas,
           tal.estado AS taller_estado, tal.resultado AS taller_resultado
      FROM erp_encargos_venta e
      LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
      -- La revisión del taller, la más reciente de ese coche. En LATERAL y no
      -- en dos subconsultas sueltas: con dos, un empate en la fecha podria dar
      -- el estado de una ficha y el resultado de otra.
      LEFT JOIN LATERAL (
        SELECT rt.estado, rt.resultado
          FROM erp_revisiones_taller rt
         WHERE rt.vehicle_id = e.vehicle_id
         ORDER BY rt.created_at DESC LIMIT 1
      ) tal ON TRUE
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
      tasacion: Number(fila.tasacion ?? 0) || null,
      informe: fila.informe as string | null,
      franjas: ((fila.franjas as (string | Date)[]) ?? []).map((f) => new Date(f).toISOString()),
    });

    // Una visita de ese coche acabo en venta y el encargo sigue abierto: falta
    // cerrarlo y emitir los 299 EUR.
    if (fila.se_vendio) cuenta.encargos_vendidos += 1;
    if (tocaLlamarle({ firmado_at: fila.firmado_at as string | null, acepto_el_precio: fila.acepto_el_precio as boolean })) cuenta.encargos_por_llamar += 1;
    if (soloLeFaltanFranjas(puertas)) cuenta.encargos_sin_franjas += 1;

    /*
     * «Listo para el taller» es justo eso: el cliente ya lo ha traído todo y lo
     * único que falta es la revisión. En cuanto el taller dice algo el aviso se
     * apaga solo — si no, el coche seguiría saliendo como pendiente el resto de
     * su vida, ya publicado y ya revisado.
     */
    const taller = { estado: fila.taller_estado, resultado: fila.taller_resultado };
    if (sePuedePublicar(puertas) && sigueEsperandoAlTaller(taller)) cuenta.encargos_listos += 1;

    // Y el que el taller ha tumbado: su coche no va a salir y él no lo sabe.
    if (elTallerLoTumbo(taller)) cuenta.encargos_rechazados += 1;

    /*
     * Y el que no ha firmado el mandato.
     *
     * Se está trabajando para él —anuncio, taller, llamadas— y no hay nada que
     * permita cobrárselo. Cuanto más tarde se pida la firma, más raro es
     * pedirla.
     */
    if (!estaFirmado(fila)) cuenta.encargos_sin_firmar += 1;
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
  if (!sePuedePublicar(puertas)) {
    return `Este coche lo vendemos nosotros y le falta: ${loQueLeFalta(puertas).join('; ')}`;
  }

  /*
   * Y la sexta, que es la nuestra.
   *
   * Las cinco puertas son cosas del cliente. La revisión del taller la ponemos
   * nosotros, y sin ella el anuncio diría que el coche está comprobado sin que
   * nadie lo haya comprobado — que es el mismo fallo que se tapó con el informe,
   * pero en la parte que depende de nosotros.
   *
   * Va después de las cinco a propósito: si le falta algo suyo, eso es lo que
   * hay que decirle cuando se le llame, y el taller todavía no toca.
   */
  const taller = await porQueElTallerNoDeja(vehicleId);
  if (taller) return `Este coche lo vendemos nosotros. ${taller}`;

  return '';
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

      /*
       * Y la sexta, la nuestra.
       *
       * Solo cuenta si hay encargo vivo: un particular que publica su propio
       * IDCar no nos ha encargado nada y no le hemos prometido revisión.
       *
       * Va dentro de `se_puede_publicar` y no aparte porque ese campo es el que
       * apaga el botón de la ficha. Si aquí dijera que sí y el portero del
       * servidor dijera que no, el botón se vería encendido y el «no» llegaría
       * al pulsarlo — que es la peor manera de enterarse.
       */
      const faltaElTaller = encargo ? await porQueElTallerNoDeja(req.params.vehicleId) : '';

      res.json({
        ok: true,
        data: {
          encargo,
          ultimo_cerrado: cerrado.rows[0] ?? null,
          puertas,
          se_puede_publicar: sePuedePublicar(puertas) && !faltaElTaller,
          /** Lo que falta **él**. Lo del taller va aparte: eso lo ponemos nosotros. */
          le_falta: loQueLeFalta(puertas),
          falta_el_taller: faltaElTaller,
          /*
           * El mandato. No es una puerta de publicar —un coche sin mandato
           * firmado se puede anunciar igual— sino de **cobrar**: sin él, ni los
           * 299 € ni los 150 €.
           */
          mandato_firmado: estaFirmado(encargo),
          por_que_no_firmado: encargo ? porQueNoEstaFirmado(encargo) : '',
          como_se_firma: COMO_SE_FIRMA.map((c) => ({ clave: c, nombre: COMO_LO_DECIMOS[c] })),
          /*
           * Nada de esto caduca. Lo que se dice es qué pasaría si se fuera hoy,
           * que es lo que hace falta saber cuando se le llama.
           */
          tasacion: hay.tasacion ?? null,
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

      /*
       * El encargo nace **sin firmar**, y esto es lo que se ha arreglado.
       *
       * Antes aquí se escribía `new Date()` en `firmado_at`: el ERP se
       * inventaba una fecha de firma en el momento en que alguien pulsaba un
       * botón, y de esa fecha colgaban los 299 € y los 150 €. Ahora se abre el
       * encargo, se le manda el mandato, y la fecha se apunta cuando de verdad
       * lo firma. Hasta entonces no se le puede facturar nada.
       *
       * `libre_desde` también nace en blanco, por lo mismo: el plazo de los 30
       * días cuenta desde la firma, y sin firma no ha empezado a correr.
       */
      /*
       * Si firmó la cláusula del precio o no.
       *
       * Por defecto **no**, que es la respuesta prudente: da por hecho que se le
       * puede cobrar la penalización, y eso lo corrige el cliente en cuanto
       * pase. Al revés —darlo por firmado— se dejaría de cobrar sin que nadie se
       * entere.
       */
      const aceptoElPrecio = req.body?.acepto_el_precio === true;
      const id = `enc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const mandatoId = await siguienteDeSerie(
        'erp_encargos_venta', prefijoAnual(SERIE_DEL_MANDATO), 3, 'mandato_id',
      ).catch(() => '');

      const r = await query(
        `INSERT INTO erp_encargos_venta
           (id, vehicle_id, cliente_email, cliente_nombre, estado, mandato_id,
            acepto_el_precio, precio_referencia,
            fee_gestion, fee_cancelacion, lead_id, creado_por)
         VALUES ($1,$2,$3,$4,'recogiendo',$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          id, vehicleId,
          String(req.body?.cliente_email ?? coche.rows[0].user_email ?? ''),
          String(req.body?.cliente_nombre ?? coche.rows[0].name ?? ''),
          mandatoId || null,
          aceptoElPrecio,
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

      /*
       * La fila entera, no tres campos elegidos a mano.
       *
       * Aquí se pasaban solo `firmado_at` y `acepto_el_precio`, y al añadir el
       * mandato eso dejó de valer: sin `firma_como` la regla nueva daba «sin
       * firmar» siempre y **no se facturaba nunca**, ni a quien había firmado.
       * Un fallo que no rompe nada visible — simplemente no se cobra.
       */
      const factura = loQueSeLeFactura(motivo, e);

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

      /*
       * Se quita el anuncio, acabe como acabe.
       *
       * En ese anuncio sale **nuestro** teléfono. Dejarlo puesto después de
       * cerrar significa seguir cogiendo llamadas por un coche que ya no
       * gestionamos, y decirle que no a quien llama.
       *
       * No lo hacía nadie: ni esto ni cerrar la visita como «se lo quedó». Y de
       * ahí colgaba el aviso de retirar de los portales, que dispara cuando el
       * coche deja de estar activo aquí — así que no saltaba nunca.
       *
       * Va antes del correo y de la transferencia a propósito: si algo de esto
       * falla, lo que no puede quedarse es el anuncio vivo.
       */
      const offerId = `idcar-${String(e.vehicle_id)}`;
      await query(comoSeQuitaElAnuncio(motivo), [offerId])
        .catch((err) => console.error('[encargos] sin quitar el anuncio:', (err as Error).message));
      await query(SQL_YA_NO_ESTA_LISTADO, [String(e.vehicle_id)])
        .catch((err) => console.error('[encargos] su garaje sigue diciendo publicado:', (err as Error).message));

      /*
       * Si se vendió, se abre la transferencia.
       *
       * Es lo que le prometemos por escrito en el mandato y en la guía: «cuando
       * se vende, hacemos el contrato y la transferencia en la DGT». No la abría
       * nadie — el trámite existe, pero salta cuando un *lead* pasa a
       * «Vendido», y este flujo cierra encargos—. Se cobraban los 299 € y el
       * papel prometido no existía.
       *
       * Cuelga del encargo y no del lead: un encargo abierto desde la ficha del
       * IDCar no tiene lead, y aunque lo tenga, el mandato es lo que tiene la
       * venta.
       *
       * Sin bloquear la respuesta y después de cerrar: el cierre y la factura ya
       * están hechos, y que esto falle no puede hacer que la pantalla diga que
       * el encargo no se cerró.
       */
      if (motivo === 'vendido') {
        abreLaTransferenciaDelEncargo({
          encargoId: String(e.id),
          vehiculoTitulo: [e.brand, e.model].filter(Boolean).join(' '),
          matricula: String(e.plate ?? ''),
          clienteEmail: String(e.cliente_email ?? ''),
          creadoPor: req.actor?.name ?? req.actor?.sub ?? '',
        }).catch((err) => console.error('[encargos] sin transferencia:', (err as Error).message));
      }

      /*
       * Y se le dice cómo acabó, con el importe que acaba de calcularse.
       *
       * También cuando no se le cobra nada: cerrar en silencio es lo que hace
       * que llame tres semanas después preguntando si le vamos a cobrar.
       *
       * Va después de cerrar y sin bloquear la respuesta: el cierre ya está
       * hecho y la factura emitida. Si el correo falla, lo que no puede pasar
       * es que la pantalla diga que el cierre no se hizo.
       */
      if (e.cliente_email) {
        const { subject, html } = elCorreoDelCierre({
          cliente_nombre: String(e.cliente_nombre ?? ''),
          marca: String(e.brand ?? ''), modelo: String(e.model ?? ''),
          matricula: String(e.plate ?? ''),
          motivo, importe: factura?.total ?? 0, concepto: factura?.concepto ?? '',
        });
        enviar({ to: String(e.cliente_email), subject, html, alClienteSiempre: true })
          .catch((err) => console.error('[encargos] sin avisar del cierre:', (err as Error).message));
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
/**
 * El mandato, para imprimirlo o mandárselo.
 *
 * Se genera cada vez con lo que hay en el encargo y no se guarda una copia: si
 * se guardara, el día que se acuerde otro precio habría dos documentos y el que
 * el cliente tiene delante no sería el que dice el ERP. Lo que sí queda
 * guardado es **cuál firmó**, que es el número de mandato y la fecha.
 */
encargosRouter.get(
  '/encargos/:id/mandato',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `SELECT e.*, v.plate, v.brand, v.model, v.year, v.mileage
           FROM erp_encargos_venta e
           LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
          WHERE e.id = $1`,
        [req.params.id]
      );
      const e = r.rows[0];
      if (!e) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }

      const doc = elMandato({
        mandato_id: String(e.mandato_id ?? ''),
        cliente_nombre: String(e.cliente_nombre ?? ''),
        cliente_email: String(e.cliente_email ?? ''),
        matricula: String(e.plate ?? ''),
        marca: String(e.brand ?? ''),
        modelo: String(e.model ?? ''),
        ano: (e.year as number | null) ?? null,
        kilometros: (e.mileage as number | null) ?? null,
        precio: Number(e.precio_referencia) || null,
        acepto_el_precio: Boolean(e.acepto_el_precio),
        // La del día en que se firma, no la de apertura: es la que va en el
        // papel que el cliente tiene delante.
        fecha: e.firmado_at ? new Date(e.firmado_at as string) : new Date(),
      });

      /*
       * La marca del principio es lo que hace que Word lea el texto como UTF-8.
       * Sin ella abre el documento con la codificación del sistema, y en un
       * papel lleno de «matrícula» y «vehículo» se nota en la primera línea.
       */
      res.setHeader('Content-Type', 'application/msword; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${comoSeLlamaElFichero(String(e.mandato_id ?? ''))}"`,
      );
      res.send('﻿' + doc);
    } catch (err) {
      console.error('[encargos] mandato:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'mandato_failed' });
    }
  }
);

/**
 * Le decimos al dueño que su coche ya está anunciado.
 *
 * Vive aquí y no en la pantalla de publicar porque la condición es de este
 * flujo: **solo si hay encargo vivo**. Un particular que publica su propio
 * IDCar no nos ha encargado nada, y este correo le prometería que atendemos sus
 * llamadas.
 *
 * No lanza: quien la llama ya ha publicado el coche, y que el correo falle no
 * puede deshacer eso.
 */
export async function avisaDeQueSePublico(
  vehicleId: string,
  offerId: string,
  precio: number,
): Promise<void> {
  await prepara();
  const r = await query(
    `SELECT e.cliente_email, e.cliente_nombre, v.plate, v.brand, v.model
       FROM erp_encargos_venta e
       LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
      WHERE e.vehicle_id = $1 AND e.cerrado_at IS NULL`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));
  const e = r.rows[0];
  if (!e?.cliente_email) return;

  const base = config.PUBLIC_SITE_URL.replace(/\/+$/, '');
  const { subject, html } = elCorreoDePublicado({
    cliente_nombre: String(e.cliente_nombre ?? ''),
    marca: String(e.brand ?? ''), modelo: String(e.model ?? ''),
    matricula: String(e.plate ?? ''),
    url: `${base}/marketplace-vo/${encodeURIComponent(offerId)}`,
    precio: precio > 0 ? precio : null,
  });
  await enviar({ to: String(e.cliente_email), subject, html, alClienteSiempre: true });
}

/**
 * Y se le manda para que lo firme, con el documento adjunto.
 *
 * Es lo que hasta ahora había que hacer a mano: descargar el `.doc`, abrir el
 * correo, adjuntarlo y escribir el trato de memoria. Escrito de memoria cada
 * vez, tarde o temprano una de esas veces dice otra cosa.
 */
encargosRouter.post(
  '/encargos/:id/mandato/enviar',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const r = await query(
        `SELECT e.*, v.plate, v.brand, v.model, v.year, v.mileage
           FROM erp_encargos_venta e
           LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
          WHERE e.id = $1 AND e.cerrado_at IS NULL`,
        [req.params.id]
      );
      const e = r.rows[0];
      if (!e) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }
      if (!e.cliente_email) {
        res.status(400).json({
          ok: false, error: 'sin_correo',
          detail: 'Este encargo no tiene correo del cliente',
        });
        return;
      }

      const precio = Number(e.precio_referencia) || null;
      const doc = elMandato({
        mandato_id: String(e.mandato_id ?? ''),
        cliente_nombre: String(e.cliente_nombre ?? ''),
        cliente_email: String(e.cliente_email ?? ''),
        matricula: String(e.plate ?? ''),
        marca: String(e.brand ?? ''),
        modelo: String(e.model ?? ''),
        ano: (e.year as number | null) ?? null,
        kilometros: (e.mileage as number | null) ?? null,
        precio,
        acepto_el_precio: Boolean(e.acepto_el_precio),
        fecha: new Date(),
      });

      const { subject, html } = elCorreoDelMandato({
        cliente_nombre: String(e.cliente_nombre ?? ''),
        marca: String(e.brand ?? ''), modelo: String(e.model ?? ''),
        matricula: String(e.plate ?? ''),
        mandato_id: String(e.mandato_id ?? ''),
        precio,
        /*
         * Los importes salen de la fila, que es donde se congelaron al abrir
         * el encargo. Un mandato firmado por 299 € sigue siendo de 299 €
         * aunque mañana subamos la tarifa, y el correo tiene que decir lo que
         * dice su papel — no lo que diga hoy la constante.
         */
        fee_gestion: Number(e.fee_gestion) || FEE_DE_GESTION,
        fee_cancelacion: Number(e.fee_cancelacion) || FEE_DE_CANCELACION,
      });

      await enviar({
        to: String(e.cliente_email), subject, html, alClienteSiempre: true,
        // La marca del principio es lo que hace que Word lea el adjunto en
        // UTF-8; sin ella las tildes salen rotas en la primera línea.
        attachments: [{
          filename: comoSeLlamaElFichero(String(e.mandato_id ?? '')),
          content: Buffer.from('﻿' + doc, 'utf8').toString('base64'),
        }],
      });

      res.json({ ok: true, data: { enviado_a: String(e.cliente_email) } });
    } catch (err) {
      console.error('[encargos] mandar el mandato:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'mandato_enviar_failed' });
    }
  }
);

/**
 * Se apunta que el cliente lo ha firmado.
 *
 * Hacen falta las dos cosas —cuándo y cómo nos consta— porque una fecha sola es
 * exactamente lo que había antes: un dato que el ERP se escribía a sí mismo.
 *
 * Y aquí es donde empieza a correr el plazo de los 30 días, no al abrir el
 * encargo: `libre_desde` se recalcula desde la fecha de firma.
 */
encargosRouter.post(
  '/encargos/:id/firmado',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const como = String(req.body?.firma_como ?? '').trim();
      if (!esUnaFirma(como)) {
        res.status(400).json({
          ok: false, error: 'falta_como_firmo',
          detail: 'Hay que decir cómo nos consta que lo firmó',
        });
        return;
      }

      const cuando = req.body?.firmado_at ? new Date(String(req.body.firmado_at)) : new Date();
      if (Number.isNaN(cuando.getTime())) {
        res.status(400).json({ ok: false, error: 'fecha_no_valida' });
        return;
      }
      /*
       * Una firma en el futuro no se guarda.
       *
       * Un dedo de más en el año adelanta la fecha, y con ella los 30 días: al
       * cliente se le podría cobrar la penalización durante un año entero sin
       * que nadie viera nada raro en la pantalla.
       */
      if (cuando.getTime() > Date.now() + 86400000) {
        res.status(400).json({ ok: false, error: 'fecha_en_el_futuro' });
        return;
      }

      const actual = await query(
        `SELECT acepto_el_precio FROM erp_encargos_venta WHERE id = $1 AND cerrado_at IS NULL`,
        [req.params.id]
      );
      if (!actual.rows.length) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }

      const libre = libreDesde(cuando, Boolean(actual.rows[0].acepto_el_precio));

      const upd = await query(
        `UPDATE erp_encargos_venta
            SET firmado_at = $2, firma_como = $3, firma_nota = $4,
                libre_desde = $5, updated_at = NOW()
          WHERE id = $1 AND cerrado_at IS NULL
        RETURNING *`,
        [
          req.params.id, cuando.toISOString(), como,
          String(req.body?.firma_nota ?? '').trim(),
          libre?.toISOString() ?? null,
        ]
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
      console.error('[encargos] firmado:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'encargo_firmado_failed' });
    }
  }
);

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
