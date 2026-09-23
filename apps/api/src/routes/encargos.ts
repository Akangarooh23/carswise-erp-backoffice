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
import { porQueElTallerNoDeja, preparaRevisionesTaller, laRevisionDe } from './revisiones-taller.js';
import {
  ENSURE_TABLA as ENSURE_FICHAS, comoQuedaContraElCoche, cuantosSeContradicen,
} from '../lib/la-ficha-leida.js';
import {
  COMO_SE_FIRMA, COMO_LO_DECIMOS, laMarcamosNosotros, SERIE as SERIE_DEL_MANDATO,
  esUnaFirma, estaFirmado, porQueNoEstaFirmado,
  elMandato, comoSeLlamaElFichero, miles,
} from '../lib/mandato-de-venta.js';
import { prefijoAnual, siguienteDeSerie } from '../lib/series.js';
import {
  SERIE as SERIE_DEL_CONTRATO, elContrato, loQueFaltaDelContrato,
  comoSeLlamaElFichero as comoSeLlamaElFicheroDelContrato,
} from '../lib/contrato-de-compraventa.js';
import { enviar } from '../lib/correo.js';
import { elCorreoDelMandato, elCorreoDelCierre, elCorreoDePublicado, elCorreoDelPrecioDeSalida } from '../lib/correos-del-encargo.js';
import { config } from '../config.js';
import {
  SERIE as SERIE_DEL_PRECIO, ENSURE_COLUMNAS as ENSURE_COLUMNAS_DEL_PRECIO,
  laClausula, porQueNoSeLePuedePedir, estaAceptada, estaMandada, porQueElPrecioNoDeja,
  PAPEL_FIRMADO as PAPEL_DEL_PRECIO,
  comoSeLlamaElFichero as comoSeLlamaElFicheroDelPrecio,
} from '../lib/clausula-del-precio.js';
import { abreLaTransferenciaDelEncargo } from './tramites.js';
import {
  ENSURE_COLUMNAS as ENSURE_COLUMNAS_DE_LA_VENTA, EN_CURSO, ANULADA,
  enQuePasoEsta, QUE_TOCA, porQueNoSeDecideLaFinanciacion, porQueNoPagaEl, porQueNoSeAnula,
  correoFinanciacionAprobada, correoFinanciacionDenegada,
  correoVentaAnuladaAlComprador, correoVentaAnuladaAlVendedor,
} from '../lib/venta-en-curso.js';
import { sigueEsperandoAlTaller, elTallerLoTumbo, elClienteEsperaRespuesta } from '../lib/revision-del-taller.js';

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
    ADD COLUMN IF NOT EXISTS publicado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acepto_el_precio BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS precio_referencia NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS lead_id TEXT,
    ADD COLUMN IF NOT EXISTS mandato_id TEXT,
    ADD COLUMN IF NOT EXISTS firma_como TEXT,
    ADD COLUMN IF NOT EXISTS firma_nota TEXT,
    /*
     * Y los del contrato de compraventa, que se rellenan al cerrar.
     *
     * El ERP no puede inventarse un DNI ni un domicilio: se piden cuando
     * existen, que es cuando ya se sabe quien compro. Nulables porque el cierre
     * no puede quedarse esperando a que alguien encuentre un carne.
     */
    ADD COLUMN IF NOT EXISTS contrato_id TEXT,
    ADD COLUMN IF NOT EXISTS vendedor_dni TEXT,
    ADD COLUMN IF NOT EXISTS vendedor_domicilio TEXT,
    ADD COLUMN IF NOT EXISTS comprador_nombre TEXT,
    ADD COLUMN IF NOT EXISTS comprador_dni TEXT,
    ADD COLUMN IF NOT EXISTS comprador_domicilio TEXT,
    ADD COLUMN IF NOT EXISTS bastidor TEXT,
    ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(12,2)`;

const ENSURE_UNO_VIVO = `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_encargo_vivo_por_coche
    ON erp_encargos_venta (vehicle_id)
    WHERE cerrado_at IS NULL`;

let listo = false;
async function prepara(): Promise<void> {
  if (listo) return;
  await query(ENSURE_TABLE);
  await query(ENSURE_COLUMNAS).catch(() => {});
  // Las de la cláusula del precio, que llegaron después.
  await query(ENSURE_COLUMNAS_DEL_PRECIO).catch(() => {});
  // Y las de la venta en curso, que llegaron después.
  await query(ENSURE_COLUMNAS_DE_LA_VENTA).catch(() => {});
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

  /*
   * Los papeles del seguro y las facturas de revisión.
   *
   * Cuelgan del seguro y del mantenimiento, no del coche, así que hay que pasar
   * por la tabla de en medio. Se cuentan **ficheros**: una compañía y un número
   * de póliza escritos a mano no prueban nada.
   */
  const seguros = await query(
    `SELECT COUNT(*)::int AS n
       FROM moveadvisor_user_insurance_documents d
       JOIN moveadvisor_user_insurances i ON i.id = d.insurance_id
      WHERE i.vehicle_id = $1`,
    [vehicleId]
  ).catch(() => ({ rows: [{ n: 0 }] }));

  const mantenimientos = await query(
    `SELECT COUNT(*)::int AS n
       FROM moveadvisor_user_maintenance_invoices f
       JOIN moveadvisor_user_maintenances m ON m.id = f.maintenance_id
      WHERE m.vehicle_id = $1`,
    [vehicleId]
  ).catch(() => ({ rows: [{ n: 0 }] }));

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
    seguros: seguros.rows[0]?.n ?? 0,
    mantenimientos: mantenimientos.rows[0]?.n ?? 0,
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
export interface AvisosDeEncargos {
  encargos_vendidos: number;
  encargos_por_llamar: number;
  encargos_sin_franjas: number;
  encargos_listos: number;
  encargos_rechazados: number;
  encargos_sin_firmar: number;
  /** El cliente ha dicho desde su panel que no puede ir al taller ese día. */
  citas_taller_que_pide_mover: number;
  /** Ya se puede pedir el precio de salida y todavía no se le ha mandado. */
  encargos_sin_mandar_el_precio: number;
  /** Hay comprador y ha pedido financiar: la entidad todavía no ha contestado. */
  ventas_financiacion_en_estudio: number;
  /** Le han denegado la financiación: o lo paga él o se anula. */
  ventas_financiacion_denegada: number;
  /** Hay comprador y falta que entre el importe. */
  ventas_esperando_ingreso: number;
  /**
   * Su ficha técnica dice otra cosa que lo que hay puesto en el coche.
   *
   * No es «le falta rellenar»: es que un dato **está puesto y contradice al
   * papel**. Mientras tanto el coche se tasa y se anuncia con ese número — al
   * T-Roc de la prueba le faltaban cuarenta caballos.
   */
  encargos_ficha_no_cuadra: number;
}

/**
 * Y lo mismo dicho por coche, que es lo que hace falta para ir a arreglarlo.
 *
 * El panel decía «1 encargo listo para el taller» y llevaba a la lista entera de
 * IDCars, donde no hay forma de saber cuál de todos es. Con dos coches ya es
 * adivinar; con doscientos, el aviso no sirve para nada.
 *
 * Sale del **mismo recorrido** que las cuentas, no de una segunda consulta: si
 * fueran dos, un día el panel diría uno y la lista marcaría otro.
 */
export interface EncargoConAvisos {
  vehicle_id: string;
  matricula: string;
  coche: string;
  /** Las claves de aviso de este coche, las mismas que cuenta el panel. */
  avisos: (keyof AvisosDeEncargos)[];
}

/**
 * Si de ese coche hay una ficha técnica leída.
 *
 * Sin lectura no hay nada que comparar, y un coche sin ficha subida ya sale
 * marcado por su puerta de papeles: sacarlo también aquí sería decir dos veces
 * lo mismo con dos nombres distintos.
 */
function hayLecturaDeLaFicha(fila: Record<string, unknown>): boolean {
  const codigos = fila.ficha_codigos as Record<string, unknown> | null | undefined;
  return Boolean(codigos) && Object.keys(codigos ?? {}).length > 0;
}

export async function losEncargosConAvisos(): Promise<EncargoConAvisos[]> {
  await prepara();
  // La consulta de abajo lee `erp_revisiones_taller`. Si nadie la ha creado
  // todavía, falla entera y los cinco avisos se quedan a cero para siempre.
  await preparaRevisionesTaller().catch(() => {});
  // Y la de las fichas leídas, por lo mismo: si no existe, la consulta de abajo
  // falla entera y **todos** los avisos se quedan a cero.
  await query(ENSURE_FICHAS).catch(() => {});

  const r = await query(`
    SELECT e.vehicle_id, e.firmado_at, e.publicado_at, e.acepto_el_precio, e.firma_como,
           EXISTS (
             SELECT 1 FROM vehicle_visit_bookings b
              WHERE b.offer_id = 'idcar-' || e.vehicle_id AND b.resultado = 'compro'
           ) AS se_vendio,
           v.plate, v.brand, v.model, v.year, v.mileage,
           -- Lo que hace falta para comparar el coche con su ficha técnica.
           v.version, v.cv, v.displacement, v.co2, v.seats, v.fuel, v.body_type, v.color,
           fic.codigos AS ficha_codigos, fic.fallo AS ficha_fallo,
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
           -- Los papeles del seguro y las facturas de revisión, como en la ficha.
           -- Sin estas dos, aquí esas puertas saldrían siempre cerradas y el
           -- panel diría que le falta algo que ya ha subido.
           (SELECT COUNT(*)::int
              FROM moveadvisor_user_insurance_documents sd
              JOIN moveadvisor_user_insurances si ON si.id = sd.insurance_id
             WHERE si.vehicle_id = e.vehicle_id) AS seguros,
           (SELECT COUNT(*)::int
              FROM moveadvisor_user_maintenance_invoices mf
              JOIN moveadvisor_user_maintenances mm ON mm.id = mf.maintenance_id
             WHERE mm.vehicle_id = e.vehicle_id) AS mantenimientos,
           tal.estado AS taller_estado, tal.resultado AS taller_resultado,
           -- Lo que el cliente ha pedido sobre su cita desde su panel.
           tal.cliente_pidio AS taller_cliente_pidio,
           -- Y el precio de salida: si hay cifra y si ya se le mandó el papel.
           e.precio_referencia, e.clausula_enviada_at, e.clausula_firmada_at, e.clausula_precio,
           e.venta_estado, e.financiacion_estado
      FROM erp_encargos_venta e
      LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
      LEFT JOIN erp_fichas_tecnicas_leidas fic ON fic.vehicle_id = e.vehicle_id
      -- La revisión del taller, la más reciente de ese coche. En LATERAL y no
      -- en dos subconsultas sueltas: con dos, un empate en la fecha podria dar
      -- el estado de una ficha y el resultado de otra.
      LEFT JOIN LATERAL (
        SELECT rt.estado, rt.resultado, rt.cliente_pidio
          FROM erp_revisiones_taller rt
         WHERE rt.vehicle_id = e.vehicle_id
         ORDER BY rt.created_at DESC LIMIT 1
      ) tal ON TRUE
     WHERE e.cerrado_at IS NULL
  `).catch(() => null);
  if (!r) return [];

  const salida: EncargoConAvisos[] = [];
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
      seguros: Number(fila.seguros ?? 0),
      mantenimientos: Number(fila.mantenimientos ?? 0),
    });

    const avisos: (keyof AvisosDeEncargos)[] = [];

    // Una visita de ese coche acabo en venta y el encargo sigue abierto: falta
    // cerrarlo y emitir los 299 EUR.
    /*
     * Pero no si la venta está en curso: entonces no falta «cerrarlo», falta
     * la financiación, el ingreso o la gestoría, y cada cosa tiene su aviso.
     */
    const paso = enQuePasoEsta(fila);
    if (fila.se_vendio && !paso) avisos.push('encargos_vendidos');
    if (paso === 'financiacion_en_estudio') avisos.push('ventas_financiacion_en_estudio');
    if (paso === 'financiacion_denegada') avisos.push('ventas_financiacion_denegada');
    if (paso === 'esperando_ingreso') avisos.push('ventas_esperando_ingreso');
    if (tocaLlamarle({ publicado_at: fila.publicado_at as string | null, acepto_el_precio: fila.acepto_el_precio as boolean })) avisos.push('encargos_por_llamar');
    if (soloLeFaltanFranjas(puertas)) avisos.push('encargos_sin_franjas');

    /*
     * Y si su ficha técnica dice otra cosa que lo que hay puesto.
     *
     * La ficha se lee sola al subirla, pero la contradicción se quedaba dentro
     * del coche: había que entrar a mirarla. Con doscientos coches eso es no
     * enterarse nunca — y mientras tanto el coche se tasa y se anuncia con el
     * dato malo.
     *
     * Solo lo que **se contradice**, no lo que falta por rellenar: contando
     * los huecos saltaría con cada coche recién subido, y un aviso que sale
     * siempre deja de mirarse.
     */
    if (hayLecturaDeLaFicha(fila)) {
      const contra = comoQuedaContraElCoche(
        {
          documento: '', nombre: '', leida_at: '', confianza: '',
          codigos: (fila.ficha_codigos ?? {}) as Record<string, unknown>,
          fallo: String(fila.ficha_fallo ?? ''),
        },
        fila,
      );
      if (cuantosSeContradicen(contra) > 0) avisos.push('encargos_ficha_no_cuadra');
    }

    /*
     * «Listo para el taller» es justo eso: el cliente ya lo ha traído todo y lo
     * único que falta es la revisión. En cuanto el taller dice algo el aviso se
     * apaga solo — si no, el coche seguiría saliendo como pendiente el resto de
     * su vida, ya publicado y ya revisado.
     */
    const taller = { estado: fila.taller_estado, resultado: fila.taller_resultado };
    if (sePuedePublicar(puertas) && sigueEsperandoAlTaller(taller)) avisos.push('encargos_listos');

    // Y el que el taller ha tumbado: su coche no va a salir y él no lo sabe.
    if (elTallerLoTumbo(taller)) avisos.push('encargos_rechazados');

    /*
     * Y el que ha dicho, desde su panel, que no puede ir ese día.
     *
     * Tiene fecha: si nadie lo mira antes de la cita, se pierde igual que si no
     * lo hubiera dicho — y encima habiéndolo dicho, que es peor.
     */
    if (elClienteEsperaRespuesta({ estado: fila.taller_estado, cliente_pidio: fila.taller_cliente_pidio })) {
      avisos.push('citas_taller_que_pide_mover');
    }

    /*
     * Y el precio de salida, que es lo siguiente al taller.
     *
     * Se avisa cuando ya se puede pedir y todavía no se le ha mandado el papel.
     * No bloquea publicar, pero mientras no lo acepte por escrito la cancelación
     * son 150 € desde el día uno y para siempre: no mandárselo le cuesta dinero
     * a él, y el día que lo descubra la conversación es nuestra.
     *
     * Se apaga al mandarlo, no al firmarlo: lo segundo depende de él, y un aviso
     * que solo se apaga cuando conteste un tercero se queda encendido semanas.
     */
    /*
     * «Sin mandar» también es haberlo mandado con otro precio: si se guardó uno
     * nuevo, el papel que tiene ya no vale y el anuncio no se puede publicar.
     */
    if (!estaMandada(fila)
        && porQueNoSeLePuedePedir({
          mandato_firmado: estaFirmado(fila),
          taller_hecho: !sigueEsperandoAlTaller(taller),
          taller_lo_tumbo: elTallerLoTumbo(taller),
          precio: Number(fila.precio_referencia) || null,
        }) === '') {
      avisos.push('encargos_sin_mandar_el_precio');
    }

    /*
     * Y el que no ha firmado el mandato.
     *
     * Se está trabajando para él —anuncio, taller, llamadas— y no hay nada que
     * permita cobrárselo. Cuanto más tarde se pida la firma, más raro es
     * pedirla.
     */
    if (!estaFirmado(fila)) avisos.push('encargos_sin_firmar');

    // Los que no esperan nada no salen: la lista es de trabajo por hacer.
    if (!avisos.length) continue;

    salida.push({
      vehicle_id: String(fila.vehicle_id ?? ''),
      matricula: String(fila.plate ?? ''),
      coche: [fila.brand, fila.model].filter(Boolean).join(' '),
      avisos,
    });
  }
  return salida;
}

/**
 * Los mismos avisos, contados para el panel.
 *
 * Cuenta sobre la lista de arriba en vez de recorrer otra vez los encargos: una
 * segunda pasada sería otra copia de las seis reglas.
 */
export function cuentaLosAvisos(coches: readonly EncargoConAvisos[]): AvisosDeEncargos {
  const cuenta: AvisosDeEncargos = {
    encargos_vendidos: 0, encargos_por_llamar: 0, encargos_sin_franjas: 0,
    encargos_listos: 0, encargos_rechazados: 0, encargos_sin_firmar: 0,
    citas_taller_que_pide_mover: 0,
    encargos_sin_mandar_el_precio: 0,
    ventas_financiacion_en_estudio: 0,
    ventas_financiacion_denegada: 0,
    ventas_esperando_ingreso: 0,
    encargos_ficha_no_cuadra: 0,
  };
  for (const c of coches) for (const a of c.avisos) cuenta[a] += 1;
  return cuenta;
}

/**
 * Y qué coches hay detrás de cada aviso.
 *
 * Es lo que permite que el panel lleve **al coche** cuando solo hay uno, en vez
 * de a la lista de todos. Con varios sigue llevando a la lista, que es donde
 * cada uno sale marcado.
 */
export function losCochesPorAviso(coches: readonly EncargoConAvisos[]): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const c of coches) {
    for (const a of c.avisos) (mapa[a] ??= []).push(c.vehicle_id);
  }
  return mapa;
}

/** Las cuentas solas, para quien no necesita saber de qué coche son. */
export async function losAvisosDeEncargos(): Promise<AvisosDeEncargos> {
  return cuentaLosAvisos(await losEncargosConAvisos().catch(() => []));
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
    `SELECT id, firmado_at, firma_como, precio_referencia,
            clausula_enviada_at, clausula_firmada_at, clausula_precio
       FROM erp_encargos_venta
      WHERE vehicle_id = $1 AND cerrado_at IS NULL`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));
  if (!r.rows.length) return '';

  /*
   * El mandato, y va el primero.
   *
   * Aquí ponía «el mandato no es puerta de publicar: es puerta de cobrar», y
   * esa frase describía un agujero. Sin mandato firmado se podía sacar el coche
   * de alguien en coches.net —con nuestro teléfono en el anuncio— sin que
   * constara por escrito que nos ha autorizado a venderlo, y si se vendía no
   * había con qué cobrarle los 299 €.
   *
   * Va delante de lo demás porque es lo único que decide si estamos autorizados
   * a trabajar en ese coche. Lo otro es qué le falta al anuncio; esto es si hay
   * anuncio que hacer.
   *
   * La cláusula del precio sigue sin bloquear: firmarla o no cambia lo que paga
   * si se retira, no si podemos publicar. Son dos cosas distintas y meterlas en
   * la misma puerta dejaría fuera a los que Juan puso dentro a propósito.
   */
  if (!estaFirmado(r.rows[0])) {
    return `Este coche lo vendemos nosotros y ${porQueNoEstaFirmado(r.rows[0]).toLowerCase()}`;
  }

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

  /*
   * Y el precio de salida, firmado y el mismo que hay guardado.
   *
   * Va el último porque es lo último que se le pide: el precio se fija con lo
   * que diga el taller. Un anuncio nuestro sale con el precio que el dueño ha
   * aceptado por escrito, y con ése y no con otro.
   */
  const precio = porQueElPrecioNoDeja(r.rows[0]);
  if (precio) return `Este coche lo vendemos nosotros. ${precio}`;

  return '';
}

/**
 * Qué espera cada coche, para marcarlo donde se mira.
 *
 * Lo leen dos sitios: el número rojo de IDCars en el menú y la propia lista de
 * IDCars, que sin esto enseña doscientos coches iguales y no dice cuál es el que
 * tiene algo pendiente. Es la misma cuenta del panel, coche a coche.
 */
encargosRouter.get(
  '/encargos/avisos-por-coche',
  requireRole(['admin', 'support', 'operations', 'sales']),
  async (_req, res) => {
    try {
      res.json({ ok: true, data: { coches: await losEncargosConAvisos() } });
    } catch (err) {
      console.error('[encargos] avisos por coche:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'avisos_por_coche_failed' });
    }
  }
);

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
        `SELECT id, motivo_cierre, cerrado_at, cliente_nombre, cliente_email,
                contrato_id, vendedor_dni, vendedor_domicilio, comprador_nombre,
                comprador_dni, comprador_domicilio, bastidor, precio_venta
           FROM erp_encargos_venta
          WHERE vehicle_id = $1 AND cerrado_at IS NOT NULL
          ORDER BY cerrado_at DESC LIMIT 1`,
        [req.params.vehicleId]
      ).catch(() => ({ rows: [] }));

      /*
       * El mandato firmado que subió el cliente a su panel.
       *
       * Se busca por el encargo vivo. Si hay más de uno —porque subió una foto
       * borrosa y luego el PDF— vale el último: es el que quiso que tuviéramos.
       */
      const elPapelFirmado = encargo?.id
        ? (await query<{ id: string; nombre: string; created_at: string }>(
            `SELECT id, nombre, created_at FROM erp_documentos
              WHERE ambito = 'encargo' AND ambito_id = $1 AND papel = 'mandato_firmado'
              ORDER BY created_at DESC LIMIT 1`,
            [String(encargo.id)]
          ).catch(() => ({ rows: [] }))).rows[0] ?? null
        : null;

      /*
       * Y el del precio, buscado igual que el mandato.
       *
       * Si subió dos —una foto borrosa y luego el PDF— vale el último: es el que
       * quiso que tuviéramos.
       */
      const elPrecioFirmado = encargo?.id
        ? (await query<{ id: string; nombre: string }>(
            `SELECT id, nombre FROM erp_documentos
              WHERE ambito = 'encargo' AND ambito_id = $1 AND papel = $2
              ORDER BY created_at DESC LIMIT 1`,
            [String(encargo.id), PAPEL_DEL_PRECIO]
          ).catch(() => ({ rows: [] }))).rows[0] ?? null
        : null;

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
      // La revisión entera, no solo si deja publicar: la cláusula del precio
      // necesita saber si está hecha y si el taller lo tumbó, que no es lo mismo.
      const revisionDelTaller = encargo ? await laRevisionDe(req.params.vehicleId) : null;
      const faltaElPrecio = encargo ? porQueElPrecioNoDeja(encargo) : '';

      res.json({
        ok: true,
        data: {
          encargo,
          ultimo_cerrado: cerrado.rows[0] ?? null,
          puertas,
          /*
           * Las mismas tres condiciones que el portero del servidor, en el
           * mismo orden.
           *
           * Si aquí dijera que sí y allí que no, el botón se vería encendido y
           * el «no» llegaría al pulsarlo — que es la peor manera de enterarse.
           */
          se_puede_publicar: estaFirmado(encargo) && sePuedePublicar(puertas) && !faltaElTaller && !faltaElPrecio,
          /** Lo que falta **él**. Lo del taller va aparte: eso lo ponemos nosotros. */
          le_falta: loQueLeFalta(puertas),
          falta_el_taller: faltaElTaller,
          /** Y el precio de salida firmado, que es lo último antes de publicar. */
          falta_el_precio: faltaElPrecio,
          /*
           * El mandato. Es puerta de publicar **y** de cobrar.
           *
           * De cobrar siempre lo fue: sin él, ni los 299 € ni los 150 €. Y de
           * publicar desde que se vio lo que permitía lo contrario: sacar el
           * coche de alguien en coches.net —con nuestro teléfono en el anuncio—
           * sin que constara por escrito que nos ha autorizado a venderlo.
           */
          /*
           * Y qué le falta al contrato de compraventa, si hubo venta.
           *
           * Se dice, no se bloquea: el documento sale igual con los huecos, y
           * esto es para que quien va a imprimirlo sepa qué tendrá que escribir
           * a mano antes de darlo a firmar.
           */
          falta_del_contrato: cerrado.rows[0]?.motivo_cierre === 'vendido'
            ? loQueFaltaDelContrato({
                vendedor_dni: cerrado.rows[0].vendedor_dni as string,
                comprador_nombre: cerrado.rows[0].comprador_nombre as string,
                comprador_dni: cerrado.rows[0].comprador_dni as string,
                bastidor: cerrado.rows[0].bastidor as string,
                precio: Number(cerrado.rows[0].precio_venta) || null,
              })
            : [],
          mandato_firmado: estaFirmado(encargo),
          /*
           * Y la cláusula del precio: qué falta para poder pedírsela, si ya se
           * le mandó y si ya la firmó.
           *
           * Va aquí y no en una llamada aparte porque la ficha la necesita para
           * decidir si enseña el botón, y dos llamadas para pintar una caja son
           * dos oportunidades de que una llegue y la otra no.
           */
          clausula_precio: encargo ? {
            falta: porQueNoSeLePuedePedir({
              mandato_firmado: estaFirmado(encargo),
              taller_hecho: !sigueEsperandoAlTaller(revisionDelTaller),
              taller_lo_tumbo: elTallerLoTumbo(revisionDelTaller),
              precio: Number(encargo.precio_referencia) || null,
            }),
            clausula_id: encargo.clausula_id ?? null,
            enviada_at: encargo.clausula_enviada_at ?? null,
            firmada_at: encargo.clausula_firmada_at ?? null,
            aceptada: estaAceptada(encargo),
            mandada: estaMandada(encargo),
            precio: Number(encargo.precio_referencia) || null,
            /** El precio que decía el papel que se le mandó, que puede no ser el de ahora. */
            precio_del_papel: Number(encargo.clausula_precio) || null,
            por_que_no_deja: faltaElPrecio,
            /*
             * Y el papel que subió él, para poder bajárselo.
             *
             * Es el único que no se puede regenerar: el de al lado se hace cada
             * vez con lo que hay en el encargo y sale en blanco. Éste tiene su
             * firma y solo existe una copia.
             */
            subida: elPrecioFirmado,
          } : null,
          por_que_no_firmado: encargo ? porQueNoEstaFirmado(encargo) : '',
          /*
           * La venta en curso, si hay comprador.
           *
           * Con sus datos para el contrato y en qué paso está, que es lo que
           * dice qué botón toca.
           */
          venta: encargo && encargo.venta_estado === EN_CURSO ? {
            paso: enQuePasoEsta(encargo),
            que_toca: QUE_TOCA[enQuePasoEsta(encargo) as keyof typeof QUE_TOCA] ?? '',
            iniciada_at: encargo.venta_iniciada_at ?? null,
            comprador: {
              nombre: encargo.comprador_nombre ?? '',
              dni: encargo.comprador_dni ?? '',
              domicilio: encargo.comprador_domicilio ?? '',
              email: encargo.comprador_email ?? '',
              telefono: encargo.comprador_telefono ?? '',
            },
            financia: Boolean(encargo.venta_financia),
            financiacion: {
              estado: encargo.financiacion_estado ?? null,
              entidad: encargo.financiacion_entidad ?? '',
              importe: Number(encargo.financiacion_importe) || null,
              decidida_at: encargo.financiacion_decidida_at ?? null,
            },
            precio: Number(encargo.precio_venta) || Number(encargo.precio_referencia) || null,
          } : null,
          /*
           * El papel que subió él, si lo subió.
           *
           * Sin esto, «Descargar» seguía dando el mandato en blanco —que se
           * genera cada vez— y el que tiene la firma se quedaba guardado sin
           * que nadie pudiera verlo. El documento en blanco se regenera cuando
           * haga falta; el firmado es el único que no.
           */
          mandato_subido: elPapelFirmado,
          /*
           * Solo las que marcamos nosotros.
           *
           * `subido_por_el` no se ofrece aquí: la escribe el cliente al subir
           * el papel a su panel, y ponerla en esta lista sería dejar que
           * alguien dijera que hay un documento que no está — que es justo lo
           * que esa forma de firma viene a evitar. Sigue saliendo cuando ya ha
           * subido, porque `COMO_LO_DECIMOS` la sabe traducir.
           */
          como_se_firma: COMO_SE_FIRMA
            .filter(laMarcamosNosotros)
            .map((c) => ({ clave: c, nombre: COMO_LO_DECIMOS[c] })),
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

      /*
       * Y el lead deja de estar pendiente de llamada.
       *
       * Nadie abre un encargo sin haber hablado antes con el dueño del coche:
       * abrirlo **es** la prueba de que se le llamó. Sin esto, el lead se queda
       * en «Pendiente» para siempre y el panel sigue diciendo «le hemos
       * prometido una llamada en menos de 24 horas laborables» con el mandato
       * firmado, el coche en el taller y el anuncio ya publicado.
       *
       * Solo desde «Pendiente»: uno que ya iba por «Vendido» no retrocede.
       *
       * Con `catch`: que el lead no se pueda tocar no puede impedir abrir el
       * encargo, que es lo que de verdad se ha pedido aquí.
       */
      const leadId = String(req.body?.lead_id ?? '').trim();
      if (leadId) {
        await query(
          `UPDATE moveadvisor_market_leads
              SET status = 'Contactado'
            WHERE id = $1 AND status = 'Pendiente'`,
          [leadId]
        ).catch((e) => console.error('[encargos] lead sin marcar:', (e as Error).message));
      }

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
/** Quién lo apunta, para el rastro de la visita. */
const quien = (req: unknown) => (req as { actor?: { sub?: string } }).actor?.sub ?? 'desconocido';

/** La venta en curso de un encargo, con lo que hace falta para escribir. */
async function laVentaDe(encargoId: string) {
  await prepara();
  const r = await query(
    `SELECT e.*, v.brand, v.model, v.plate
       FROM erp_encargos_venta e
       LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
      WHERE e.id = $1 AND e.cerrado_at IS NULL`,
    [encargoId]
  );
  return r.rows[0] ?? null;
}

const elCoche = (e: Record<string, unknown>) =>
  [e.brand, e.model].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || String(e.plate ?? 'el coche');

const datosDelCorreo = (e: Record<string, unknown>) => ({
  comprador_nombre: String(e.comprador_nombre ?? ''),
  coche: elCoche(e),
  precio: Number(e.precio_venta) || Number(e.precio_referencia) || null,
  entidad: String(e.financiacion_entidad ?? ''),
  importe: Number(e.financiacion_importe) || null,
  vendedor_nombre: String(e.cliente_nombre ?? ''),
  sitio: config.PUBLIC_SITE_URL.replace(/\/+$/, ''),
  oferta_id: `idcar-${String(e.vehicle_id ?? '')}`,
});

/**
 * La entidad contesta: aprobada o denegada.
 *
 * Aprobada se apunta también en la visita —entidad e importe—, que es de donde
 * sale la comisión que se le factura en Comisiones. Así no hay dos sitios donde
 * decir con quién se financió.
 */
encargosRouter.post(
  '/encargos/:id/venta/financiacion',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      const e = await laVentaDe(req.params.id);
      const resultado = String(req.body?.resultado ?? '').trim();
      const entidad = String(req.body?.entidad ?? '').trim().slice(0, 120);
      const importe = Number(req.body?.importe) > 0 ? Number(req.body.importe) : null;
      const falta = porQueNoSeDecideLaFinanciacion(e, resultado, entidad);
      if (falta) { res.status(e ? 409 : 404).json({ ok: false, error: falta }); return; }

      const aprobada = resultado === 'aprobada';
      await query(
        `UPDATE erp_encargos_venta
            SET financiacion_estado = $2, financiacion_entidad = $3, financiacion_importe = $4,
                financiacion_decidida_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [e.id, resultado, aprobada ? entidad : null, aprobada ? importe : null]
      );
      if (aprobada && e.venta_booking_id) {
        await query(
          `UPDATE vehicle_visit_bookings
              SET financiacion_resultado = 'financiada', financiacion_entidad = $2,
                  financiacion_importe = $3, financiacion_cerrada_at = NOW(),
                  financiacion_cerrada_por = $4, updated_at = NOW()
            WHERE id = $1`,
          [e.venta_booking_id, entidad, importe, quien(req)]
        ).catch((err) => console.error('[venta] financiación en la visita:', (err as Error).message));
      }

      const d = datosDelCorreo({ ...e, financiacion_entidad: entidad, financiacion_importe: importe });
      const correo = aprobada ? correoFinanciacionAprobada(d) : correoFinanciacionDenegada(d);
      let avisado = false;
      if (e.comprador_email) {
        await enviar({ to: String(e.comprador_email), subject: correo.subject, html: correo.html, alClienteSiempre: true, movil: correo.movil })
          .then(() => { avisado = true; })
          .catch((err) => console.error('[venta] correo de la financiación:', (err as Error).message));
      }
      res.json({ ok: true, data: { financiacion_estado: resultado, comprador_avisado: avisado } });
    } catch (err) {
      console.error('[venta] financiación:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'venta_financiacion_failed' });
    }
  }
);

/** Denegada la financiación, el comprador dice que lo paga él entero. */
encargosRouter.post(
  '/encargos/:id/venta/sin-financiar',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      const e = await laVentaDe(req.params.id);
      const falta = porQueNoPagaEl(e);
      if (falta) { res.status(e ? 409 : 404).json({ ok: false, error: falta }); return; }
      await query(
        `UPDATE erp_encargos_venta
            SET financiacion_estado = 'sin_financiacion', venta_financia = FALSE, updated_at = NOW()
          WHERE id = $1`,
        [e.id]
      );
      if (e.venta_booking_id) {
        await query(
          `UPDATE vehicle_visit_bookings
              SET financiacion_resultado = 'no_financiada', financiacion_cerrada_at = NOW(),
                  financiacion_cerrada_por = $2, updated_at = NOW()
            WHERE id = $1`,
          [e.venta_booking_id, quien(req)]
        ).catch((err) => console.error('[venta] sin financiar en la visita:', (err as Error).message));
      }
      res.json({ ok: true, data: { financiacion_estado: 'sin_financiacion' } });
    } catch (err) {
      console.error('[venta] sin financiar:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'venta_sin_financiar_failed' });
    }
  }
);

/**
 * La venta no sigue: se anula y el coche vuelve a estar a la venta.
 *
 * La visita pasa a «fue» —fue, lo vio y al final no lo compró—, que es lo que
 * apaga «vendido sin cerrar el encargo». Y el anuncio se vuelve a publicar.
 */
encargosRouter.post(
  '/encargos/:id/venta/anular',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      const e = await laVentaDe(req.params.id);
      const falta = porQueNoSeAnula(e);
      if (falta) { res.status(e ? 409 : 404).json({ ok: false, error: falta }); return; }
      const motivo = String(req.body?.motivo ?? '').trim().slice(0, 300);

      await query(
        `UPDATE erp_encargos_venta
            SET venta_estado = '${ANULADA}', venta_anulada_at = NOW(), venta_motivo_anulacion = $2, updated_at = NOW()
          WHERE id = $1`,
        [e.id, motivo]
      );
      if (e.venta_booking_id) {
        await query(
          `UPDATE vehicle_visit_bookings SET resultado = 'fue', updated_at = NOW() WHERE id = $1 AND resultado = 'compro'`,
          [e.venta_booking_id]
        ).catch((err) => console.error('[venta] visita al anular:', (err as Error).message));
      }
      const republicado = await query(
        `UPDATE moveadvisor_marketplace_vo_offers SET is_active = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [`idcar-${String(e.vehicle_id)}`]
      ).then((r) => r.rows.length > 0).catch(() => false);

      const d = { ...datosDelCorreo(e), motivo };
      const avisos: Promise<unknown>[] = [];
      if (e.comprador_email) {
        const c = correoVentaAnuladaAlComprador(d);
        avisos.push(enviar({ to: String(e.comprador_email), subject: c.subject, html: c.html, alClienteSiempre: true, movil: c.movil })
          .catch((err) => console.error('[venta] correo al comprador:', (err as Error).message)));
      }
      if (e.cliente_email) {
        const c = correoVentaAnuladaAlVendedor(d);
        avisos.push(enviar({ to: String(e.cliente_email), subject: c.subject, html: c.html, alClienteSiempre: true, movil: c.movil })
          .catch((err) => console.error('[venta] correo al vendedor:', (err as Error).message)));
      }
      await Promise.all(avisos);
      res.json({ ok: true, data: { anulada: true, republicado } });
    } catch (err) {
      console.error('[venta] anular:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'venta_anular_failed' });
    }
  }
);

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
      /*
       * Y su número de contrato, que se da al vender y no antes.
       *
       * Un contrato de compraventa de una venta que no ha pasado no es nada, y
       * gastaría un número de la serie. Se pide aquí, cuando ya hay comprador.
       *
       * Si la serie falla, el cierre sigue: el documento se podrá generar igual
       * y lo único que pasa es que sale sin número, que se rellena a mano como
       * el resto de huecos.
       */
      if (motivo === 'vendido' && !e.contrato_id) {
        const contratoId = await siguienteDeSerie(
          'erp_encargos_venta', prefijoAnual(SERIE_DEL_CONTRATO), 3, 'contrato_id',
        ).catch(() => '');
        if (contratoId) {
          await query(
            `UPDATE erp_encargos_venta SET contrato_id = $2 WHERE id = $1 AND contrato_id IS NULL`,
            [String(e.id), contratoId]
          ).catch((err) => console.error('[encargos] sin numero de contrato:', (err as Error).message));
        }
      }

      if (motivo === 'vendido') {
        /*
         * Quién compró, para poder cobrarle el papeleo.
         *
         * `cliente_email` es el vendedor: es su encargo y su coche. Pero el
         * contrato dice que los gastos del cambio de titularidad son del
         * comprador, así que la transferencia tiene que nacer sabiendo a quién
         * cobrársela — si no, el cobro se queda en una lista sin destinatario.
         *
         * Lo escrito a mano manda sobre la visita: puede que quien vino a verlo
         * y quien firma no sean la misma persona, y eso ya se decidió así para
         * el contrato.
         */
        const quienCompro = await query<{ buyer_name: string; buyer_email: string }>(
          `SELECT buyer_name, buyer_email FROM vehicle_visit_bookings
            WHERE offer_id = $1 AND resultado = 'compro'
            ORDER BY resultado_at DESC NULLS LAST LIMIT 1`,
          [`idcar-${String(e.vehicle_id)}`]
        ).catch(() => ({ rows: [] as { buyer_name: string; buyer_email: string }[] }));

        abreLaTransferenciaDelEncargo({
          encargoId: String(e.id),
          vehiculoTitulo: [e.brand, e.model].filter(Boolean).join(' '),
          matricula: String(e.plate ?? ''),
          clienteEmail: String(e.cliente_email ?? ''),
          creadoPor: req.actor?.name ?? req.actor?.sub ?? '',
          compradorNombre: String(e.comprador_nombre ?? quienCompro.rows[0]?.buyer_name ?? ''),
          compradorEmail: String(quienCompro.rows[0]?.buyer_email ?? ''),
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
        // Esperado, con su `catch`: en Vercel un correo sin esperar se corta
        // en cuanto sale la respuesta, y el fallo sigue sin tumbar el cierre.
        await enviar({
          to: String(e.cliente_email), subject, html, alClienteSiempre: true,
          movil: {
            titulo: 'Tu encargo de venta se ha cerrado',
            cuerpo: 'Te contamos por correo cómo ha acabado y si hay algo que pagar.',
          },
        }).catch((err) => console.error('[encargos] sin avisar del cierre:', (err as Error).message));
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
/**
 * Se apunta que el coche del encargo se ha publicado, y arrancan los 30 días.
 *
 * Solo la primera vez: despublicar para corregir una foto y volver a publicar
 * no le regala otro mes. Devuelve `true` si ésta ha sido la primera, que es
 * cuando se le escribe diciéndole que su coche ya está anunciado.
 *
 * Sin encargo vivo no apunta nada y devuelve `false`: el particular que publica
 * su propio IDCar no tiene plazo ni correo nuestro.
 */
export async function apuntaQueSePublico(vehicleId: string): Promise<boolean> {
  await prepara();
  const r = await query(
    `UPDATE erp_encargos_venta
        SET publicado_at = NOW(),
            libre_desde = CASE WHEN acepto_el_precio
                               THEN NOW() + ($2 || ' days')::interval
                               ELSE NULL END,
            updated_at = NOW()
      WHERE vehicle_id = $1 AND cerrado_at IS NULL AND publicado_at IS NULL
    RETURNING id`,
    [vehicleId, String(DIAS_HASTA_SALIR_GRATIS)]
  );
  return r.rows.length > 0;
}

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
  const coche = [e.brand, e.model].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Tu coche';
  await enviar({
    to: String(e.cliente_email), subject, html, alClienteSiempre: true,
    movil: { titulo: `${coche} ya está anunciado`, cuerpo: 'Ya está a la venta en PopCar. Las llamadas y las visitas las llevamos nosotros.' },
  });
}

/**
 * Los datos que solo existen al vender: DNI, domicilios, bastidor y precio.
 *
 * Se guardan aparte del cierre a propósito. Cerrar emite una factura y no puede
 * quedarse esperando a que alguien encuentre un carné; esto se rellena cuando
 * se tenga, antes o después, y el contrato sale con lo que haya.
 */
encargosRouter.patch(
  '/encargos/:id/contrato',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      await prepara();
      const b = req.body ?? {};
      const texto = (k: string) =>
        b[k] === undefined ? null : String(b[k]).trim();

      const r = await query(
        `UPDATE erp_encargos_venta
            SET vendedor_dni        = COALESCE($2, vendedor_dni),
                vendedor_domicilio  = COALESCE($3, vendedor_domicilio),
                comprador_nombre    = COALESCE($4, comprador_nombre),
                comprador_dni       = COALESCE($5, comprador_dni),
                comprador_domicilio = COALESCE($6, comprador_domicilio),
                bastidor            = COALESCE($7, bastidor),
                precio_venta        = COALESCE($8, precio_venta),
                updated_at = NOW()
          WHERE id = $1
        RETURNING *`,
        [
          req.params.id,
          texto('vendedor_dni'), texto('vendedor_domicilio'),
          texto('comprador_nombre'), texto('comprador_dni'), texto('comprador_domicilio'),
          texto('bastidor'),
          b.precio_venta === undefined ? null : (Number(b.precio_venta) || null),
        ]
      );
      if (!r.rows.length) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) {
      console.error('[encargos] datos del contrato:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'contrato_patch_failed' });
    }
  }
);

/**
 * El contrato de compraventa, para imprimirlo y darlo a firmar.
 *
 * Como el mandato: se genera cada vez con lo que hay y no se guarda copia. Lo
 * que falta sale como una raya, no en blanco — un campo vacío se pasa por alto
 * al imprimir y el papel se firma sin él.
 */
encargosRouter.get(
  '/encargos/:id/contrato',
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

      /*
       * Quién compró sale de la visita que acabó en venta.
       *
       * Es el mismo dato que ya tenemos y volver a pedirlo sería pedirle a
       * quien imprime que copie un nombre que está dos pantallas más allá. Si
       * se ha escrito uno a mano, ese manda: puede que quien vino a verlo y
       * quien firma no sean la misma persona.
       */
      const compra = await query(
        `SELECT buyer_name FROM vehicle_visit_bookings
          WHERE offer_id = $1 AND resultado = 'compro'
          ORDER BY resultado_at DESC NULLS LAST LIMIT 1`,
        [`idcar-${String(e.vehicle_id)}`]
      ).catch(() => ({ rows: [] }));

      const doc = elContrato({
        contrato_id: String(e.contrato_id ?? ''),
        vendedor_nombre: String(e.cliente_nombre ?? ''),
        vendedor_dni: String(e.vendedor_dni ?? ''),
        vendedor_domicilio: String(e.vendedor_domicilio ?? ''),
        comprador_nombre: String(e.comprador_nombre ?? compra.rows[0]?.buyer_name ?? ''),
        comprador_dni: String(e.comprador_dni ?? ''),
        comprador_domicilio: String(e.comprador_domicilio ?? ''),
        matricula: String(e.plate ?? ''),
        bastidor: String(e.bastidor ?? ''),
        marca: String(e.brand ?? ''),
        modelo: String(e.model ?? ''),
        ano: (e.year as number | null) ?? null,
        kilometros: (e.mileage as number | null) ?? null,
        precio: Number(e.precio_venta) || Number(e.precio_referencia) || null,
        fecha: e.cerrado_at ? new Date(e.cerrado_at as string) : new Date(),
      });

      res.setHeader('Content-Type', 'application/msword; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${comoSeLlamaElFicheroDelContrato(String(e.contrato_id ?? ''))}"`,
      );
      // La marca del principio es lo que hace que Word lea el texto en UTF-8.
      res.send('﻿' + doc);
    } catch (err) {
      console.error('[encargos] contrato:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'contrato_failed' });
    }
  }
);

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
        // Donde lo sube firmado. Antes se le pedía que contestara al correo, y
        // entonces el papel se quedaba en una bandeja de entrada.
        panel: `${config.PUBLIC_SITE_URL.replace(/\/+$/, '')}/panel/solicitudes`,
      });

      await enviar({
        to: String(e.cliente_email), subject, html, alClienteSiempre: true,
        movil: {
          titulo: 'Tienes el mandato de venta para firmar',
          cuerpo: 'Te lo hemos mandado por correo. Fírmalo y súbelo en Mis solicitudes.',
        },
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
 * El plazo de los 30 días no empieza aquí sino al publicar: `libre_desde` se
 * recalcula desde `publicado_at`, que casi siempre sigue vacío a estas alturas.
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
        `SELECT acepto_el_precio, publicado_at FROM erp_encargos_venta WHERE id = $1 AND cerrado_at IS NULL`,
        [req.params.id]
      );
      if (!actual.rows.length) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }

      const libre = actual.rows[0].publicado_at
        ? libreDesde(actual.rows[0].publicado_at as string, Boolean(actual.rows[0].acepto_el_precio))
        : null;

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
       * Los 30 días cuentan desde que se publicó, no desde hoy.
       *
       * Si se contaran desde el momento de marcar la casilla, alguien publicado
       * hace tres semanas y al que se le apunta hoy volvería a tener un mes por
       * delante — y le estaríamos cobrando una penalización que ya no le
       * corresponde. Sin publicar, no corre nada.
       */
      const libre = e.publicado_at ? libreDesde(e.publicado_at as string, aceptoElPrecio) : null;

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

      /*
       * Guardar un precio **no** lo lleva al anuncio.
       *
       * Lo llevaba, y así un anuncio vivo cambiaba de precio sin que el dueño
       * hubiera aceptado el nuevo. El anuncio lleva el precio que él ha firmado:
       * lo pone `llevaElPrecioFirmadoAlAnuncio` al publicar, y PopCar cuando
       * sube firmado el papel nuevo. Mientras tanto el anuncio sigue con el que
       * sí firmó, y el encargo avisa de que hay que volver a mandárselo.
       */

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

/**
 * La cláusula del precio: se descarga, se manda y se sabe si toca.
 *
 * Es el papel que dice a qué precio sale el coche, y va **después del taller**
 * porque el precio se fija con lo que diga. El porqué completo está en
 * `lib/clausula-del-precio.ts`.
 */
async function loDelPrecio(encargoId: string) {
  await prepara();
  const r = await query(
    `SELECT e.*, v.plate, v.brand, v.model,
            tal.estado AS taller_estado, tal.resultado AS taller_resultado
       FROM erp_encargos_venta e
       LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
       LEFT JOIN LATERAL (
         SELECT rt.estado, rt.resultado FROM erp_revisiones_taller rt
          WHERE rt.vehicle_id = e.vehicle_id
          ORDER BY rt.created_at DESC LIMIT 1
       ) tal ON TRUE
      WHERE e.id = $1 AND e.cerrado_at IS NULL`,
    [encargoId]
  );
  const e = r.rows[0];
  if (!e) return null;
  return {
    e,
    estado: {
      mandato_firmado: estaFirmado(e),
      taller_hecho: String(e.taller_estado ?? '') === 'Hecha',
      taller_lo_tumbo: elTallerLoTumbo({ estado: e.taller_estado, resultado: e.taller_resultado }),
      precio: Number(e.precio_referencia) || null,
      firmada_at: (e.clausula_firmada_at as string | null) ?? null,
    },
  };
}

/** El documento, para imprimirlo o mirarlo antes de mandarlo. */
encargosRouter.get(
  '/encargos/:id/clausula-precio',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      const lo = await loDelPrecio(req.params.id);
      if (!lo) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }

      const falta = porQueNoSeLePuedePedir(lo.estado);
      if (falta) { res.status(409).json({ ok: false, error: falta }); return; }

      const doc = laClausula({
        clausula_id: String(lo.e.clausula_id ?? `${SERIE_DEL_PRECIO}-${String(lo.e.id).slice(-6)}`),
        cliente_nombre: String(lo.e.cliente_nombre ?? ''),
        cliente_email: String(lo.e.cliente_email ?? ''),
        matricula: String(lo.e.plate ?? ''),
        marca: String(lo.e.brand ?? ''),
        modelo: String(lo.e.model ?? ''),
        precio: lo.estado.precio ?? 0,
        fecha: new Date(),
      });

      res.setHeader('Content-Type', 'application/msword; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${comoSeLlamaElFicheroDelPrecio(String(lo.e.clausula_id ?? ''))}"`,
      );
      res.send('﻿' + doc);
    } catch (err) {
      console.error('[encargos] clausula del precio:', (err as Error).message);
      res.status(500).json({ ok: false, error: 'clausula_precio_failed' });
    }
  }
);

/**
 * Se le manda para que la firme.
 *
 * Con su número, que se guarda la primera vez: mandarla dos veces no cambia el
 * documento, y el que él tiene delante y el que dice el ERP tienen que ser el
 * mismo cuando alguien pregunte por teléfono.
 */
encargosRouter.post(
  '/encargos/:id/clausula-precio/enviar',
  requireRole(['admin', 'operations', 'sales']),
  async (req, res) => {
    try {
      const lo = await loDelPrecio(req.params.id);
      if (!lo) { res.status(404).json({ ok: false, error: 'encargo_no_encontrado' }); return; }
      if (!lo.e.cliente_email) {
        res.status(400).json({ ok: false, error: 'Este encargo no tiene correo del cliente' });
        return;
      }

      const falta = porQueNoSeLePuedePedir(lo.estado);
      if (falta) { res.status(409).json({ ok: false, error: falta }); return; }

      const numero = String(lo.e.clausula_id ?? '')
        || `${prefijoAnual(SERIE_DEL_PRECIO)}${String(lo.e.id).slice(-4).toUpperCase()}`;
      const precio = lo.estado.precio ?? 0;

      const doc = laClausula({
        clausula_id: numero,
        cliente_nombre: String(lo.e.cliente_nombre ?? ''),
        cliente_email: String(lo.e.cliente_email ?? ''),
        matricula: String(lo.e.plate ?? ''),
        marca: String(lo.e.brand ?? ''),
        modelo: String(lo.e.model ?? ''),
        precio,
        fecha: new Date(),
      });

      const { subject, html } = elCorreoDelPrecioDeSalida({
        cliente_nombre: String(lo.e.cliente_nombre ?? ''),
        marca: String(lo.e.brand ?? ''), modelo: String(lo.e.model ?? ''),
        matricula: String(lo.e.plate ?? ''),
        clausula_id: numero,
        precio,
        dias_para_irse: DIAS_HASTA_SALIR_GRATIS,
        fee_cancelacion: Number(lo.e.fee_cancelacion) || FEE_DE_CANCELACION,
        panel: `${config.PUBLIC_SITE_URL.replace(/\/+$/, '')}/panel/solicitudes`,
      });

      await enviar({
        to: String(lo.e.cliente_email), subject, html, alClienteSiempre: true,
        movil: {
          titulo: 'Tienes el precio de salida para firmar',
          cuerpo: `${miles(precio)} €. Fírmalo y súbelo en Mis solicitudes: sin él no podemos publicar el anuncio.`,
        },
        attachments: [{
          filename: comoSeLlamaElFicheroDelPrecio(numero),
          content: Buffer.from('﻿' + doc, 'utf8').toString('base64'),
        }],
      });

      await query(
        `UPDATE erp_encargos_venta
            SET clausula_id = COALESCE(clausula_id, $2),
                clausula_enviada_at = NOW(),
                /*
                 * El precio que dice este papel. Si no es el que firmó la otra
                 * vez, esa firma deja de valer: firmó otra cifra.
                 */
                clausula_firmada_at = CASE WHEN clausula_precio = $3 THEN clausula_firmada_at ELSE NULL END,
                clausula_precio = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [req.params.id, numero, precio]
      );

      res.json({ ok: true, data: { enviado_a: String(lo.e.cliente_email), clausula_id: numero } });
    } catch (err) {
      console.error('[encargos] mandar la clausula del precio:', (err as Error).message);
      res.status(502).json({ ok: false, error: 'No se ha podido enviar el correo' });
    }
  }
);

/**
 * El precio acordado con el dueño, si este coche lo vendemos nosotros.
 *
 * `null` cuando no hay encargo vivo o cuando todavía no se ha acordado nada: son
 * dos casos distintos para quien llama —uno es «no es asunto nuestro» y el otro
 * «aún no»— pero los dos significan lo mismo aquí, que no hay cifra que imponer.
 *
 * Lo usa el publicar: el precio de un encargo se acuerda con él y se firma, así
 * que manda sobre el que haya quedado en el panel del coche.
 */
export async function elPrecioAcordadoDe(vehicleId: string): Promise<number | null> {
  await prepara();
  const r = await query(
    `SELECT precio_referencia FROM erp_encargos_venta
      WHERE vehicle_id = $1 AND cerrado_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [vehicleId]
  ).catch(() => ({ rows: [] }));
  const precio = Number(r.rows[0]?.precio_referencia);
  return Number.isFinite(precio) && precio > 0 ? precio : null;
}
