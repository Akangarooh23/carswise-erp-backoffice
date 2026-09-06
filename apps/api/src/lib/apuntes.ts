/**
 * Todas las facturas de un periodo, de los dos sitios donde viven.
 *
 * Las que emitimos a un cliente por un servicio salen de la pasarela de pago
 * con su propia serie, y las de proveedores y ventas de coche viven aparte.
 * Aquí se juntan una sola vez, que es de donde tienen que salir el fichero del
 * asesor **y** los números del panel: calculados por separado acabarían
 * diciendo cosas distintas del mismo trimestre, y entonces no se cree ninguno.
 *
 * Cada apunte sale ya clasificado —de qué línea de negocio viene el ingreso, en
 * qué se fue el gasto—, porque para clasificarlo hace falta la ficha del
 * proveedor y esa se lee aquí.
 */

import { query } from '../db/pool.js';
import { CUADRADA, ESPERADA } from './facturas-esperadas.js';
import { elDia } from './el-periodo.js';
import { elProveedorDe } from './proveedores.js';
import { lineaDelIngreso, lineaDelGasto } from './lineas-de-negocio.js';
import type { ApunteConLinea } from './cuenta-de-resultados.js';

const nt = (v: unknown) => String(v ?? '').trim();

export interface FichaDeProveedor {
  nombre: string;
  nif: string | null;
  tipos: string[] | null;
}

/**
 * Una fila de la tabla de facturas de proveedor, convertida en apunte.
 *
 * Está aparte de la consulta para poder probarla: lo que se equivoca aquí no es
 * el SQL, es la conversión —el tipo de IVA que la columna guarda en tanto por
 * uno, la esperada que hay que marcar sin esconder, el proveedor del que sale
 * el NIF y la clasificación—. Con todo dentro de la función que habla con la
 * base, eso solo se puede comprobar leyendo el código.
 */
export function elApunteDelProveedor(
  f: Record<string, unknown>,
  alta: readonly FichaDeProveedor[]
): ApunteConLinea {
  const emitida = nt(f.direction) === 'emitted';
  const ficha = emitida ? null : elProveedorDe(nt(f.provider_name), alta);
  const numero = nt(f.invoice_number) || nt(f.id);

  return {
    numero,
    fecha: elDia(f.fecha),
    sentido: emitida ? 'emitida' : 'recibida',
    contraparte: emitida ? nt(f.customer_name) || nt(f.customer_email) : nt(f.provider_name),
    nif: ficha?.nif ?? null,
    concepto: nt(f.notes) || null,
    vehiculo: nt(f.vehicle_title) || null,
    base: f.base,
    // La columna guarda el tipo en tanto por uno; aquí se trabaja en tanto por
    // ciento, que es como lo escribe una factura. Sin convertirlo, el resumen
    // daría un IVA del 0,21 % y nadie lo miraría dos veces.
    iva: f.tipo != null ? Number(f.tipo) * 100 : null,
    // Y la cuota, cuando la factura lleva varios tipos y no tiene uno solo.
    cuota: f.cuota ?? null,
    total: f.total,
    regimen: (nt(f.regimen) || 'nacional') as ApunteConLinea['regimen'],
    // También en tanto por uno en la columna, y también en por ciento aquí.
    // Nulo quiere decir sin decidir, que no es cero.
    autorepercusion: f.autorepercusion != null ? Number(f.autorepercusion) * 100 : null,
    pendiente: nt(f.status) === ESPERADA,
    linea: emitida
      ? lineaDelIngreso({ numero, tipo: nt(f.type) })
      : lineaDelGasto({ tiposDelProveedor: ficha?.tipos ?? null }),
  };
}

/**
 * Y una de las nuestras al cliente, que salen de la pasarela.
 *
 * El importe que guarda es el total cobrado, con su IVA dentro. El desglose se
 * hace aquí con el general: son servicios nuestros, y no hay ninguno a otro
 * tipo. Si algún día lo hay, será una columna y no una suposición.
 */
export function elApunteDelCliente(f: Record<string, unknown>): ApunteConLinea {
  const numero = nt(f.number);
  return {
    numero,
    fecha: elDia(f.date),
    sentido: 'emitida',
    contraparte: nt(f.email),
    concepto: nt(f.description) || null,
    total: f.total,
    iva: 21,
    regimen: 'nacional',
    linea: lineaDelIngreso({ numero, delCliente: true }),
  };
}

/**
 * Y los suplidos que van en esa misma factura, uno por línea.
 *
 * En la factura del servicio de importación van el precio del coche, el
 * impuesto a cuenta y la garantía: 18.500 € que el cliente paga, que pasan por
 * la cuenta y que salen enteros a un tercero. No son ingreso —el importe de la
 * factura ya los deja fuera— pero **sí son movimiento**, y hasta ahora no
 * existían en ningún sitio: la columna se leía y no se usaba, así que el panel
 * decía que por la cuenta no había pasado dinero de nadie.
 *
 * Van marcados como suplido, que es lo que hace que se queden fuera de la base
 * y de la cuota. Un suplido metido en cualquiera de las dos es el error que
 * hace que a una gestoría le salga IVA repercutido de las tasas de la DGT.
 */
export function losSuplidosDelCliente(f: Record<string, unknown>): ApunteConLinea[] {
  const lista = Array.isArray(f.suplidos) ? f.suplidos : [];
  const numero = nt(f.number);
  const fecha = elDia(f.date);

  return lista.flatMap((s, i) => {
    const linea = (s ?? {}) as Record<string, unknown>;
    const importe = Number(linea.importe);
    if (!Number.isFinite(importe) || importe <= 0) return [];
    return [{
      // El mismo número con su orden detrás: son líneas de una sola factura, no
      // facturas distintas, y con el número a secas se ven como duplicados.
      numero: `${numero}·s${i + 1}`,
      fecha,
      sentido: 'emitida' as const,
      contraparte: nt(f.email),
      concepto: nt(linea.concepto) || 'Suplido',
      total: importe,
      iva: 0,
      regimen: 'exento' as const,
      que: 'suplido' as const,
      linea: lineaDelIngreso({ numero, delCliente: true }),
    }];
  });
}

/**
 * Las facturas del periodo, ya clasificadas.
 *
 * Las esperadas vienen también, marcadas: no son un apunte contable —sin número
 * ni fecha no hay nada que declarar— pero quien mira el trimestre tiene que
 * saber cuántas faltan por llegar antes de darlo por cerrado.
 *
 * Las **cuadradas** no vienen. Una cuadrada es una espera cuya factura llegó
 * por otro lado: el papel existe, pero es el otro. Contarla suma dos veces el
 * mismo transporte, y esos 400 € de más se los queda uno en el libro sin que
 * nada chille.
 */
export async function losApuntes(desde: string, hasta: string): Promise<ApunteConLinea[]> {
  const [proveedores, fichas, clientes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT i.id, i.invoice_number, i.provider_name, i.customer_name, i.customer_email,
              i.vehicle_title, i.notes, i.direction, i.status, i.type,
              i.invoice_amount::numeric AS total, i.base_amount::numeric AS base,
              i.iva_rate::numeric AS tipo, i.iva_amount::numeric AS cuota, i.regimen,
              i.autorepercusion::numeric AS autorepercusion,
              COALESCE(i.invoice_date, i.issued_at::date) AS fecha
         FROM moveadvisor_provider_invoices i
        WHERE COALESCE(i.invoice_date, i.issued_at::date) BETWEEN $1::date AND $2::date
          AND COALESCE(i.status, '') <> $3
        ORDER BY 17`,
      [desde, hasta, CUADRADA]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),

    // La ficha se trae entera y se empareja aquí: el LEFT JOIN por nombre
    // exacto dejaba sin NIF ni tipo a cualquier factura escrita de otra manera.
    query<Record<string, unknown>>(
      `SELECT nombre, nif, tipos FROM erp_proveedores`
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),

    query<Record<string, unknown>>(
      `SELECT number, email, date, amount::numeric AS total, description, status, suplidos
         FROM moveadvisor_user_invoices
        WHERE date::date BETWEEN $1::date AND $2::date
        ORDER BY date`,
      [desde, hasta]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);

  const alta: FichaDeProveedor[] = fichas.rows.map((p) => ({
    nombre: nt(p.nombre),
    nif: nt(p.nif) || null,
    tipos: Array.isArray(p.tipos) ? p.tipos.map((t) => String(t)) : null,
  }));

  return [
    ...proveedores.rows.map((f) => elApunteDelProveedor(f, alta)),
    ...clientes.rows.flatMap((f) => [elApunteDelCliente(f), ...losSuplidosDelCliente(f)]),
  ];
}

