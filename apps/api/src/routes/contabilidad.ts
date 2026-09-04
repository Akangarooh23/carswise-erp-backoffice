/**
 * Lo que se le manda al asesor contable.
 *
 * El ERP no lleva los libros. Los lleva él con su programa, y hacerlos aquí
 * también sería garantizar que las dos versiones difieren y que un día hay que
 * decidir cuál vale.
 *
 * Esto es el puente, que hoy es un correo con unos PDF y alguien tecleando. Al
 * teclear se pierde una factura y un transporte alemán de 890 € entra con
 * 154,46 € de IVA que nadie soportó.
 *
 * Las facturas viven en dos tablas y no en una, y eso no es un descuido: las
 * que emitimos a un cliente por un servicio salen de la pasarela de pago con su
 * propia serie, y las de proveedores y ventas de coche viven aparte. Aquí se
 * juntan, que es como las mira quien lleva la contabilidad.
 */

import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  resumeElPeriodo, queFaltaAntesDeMandarlo, comoFichero, comoSeLlamaElFichero,
  delTrimestre, trimestreDe, type Apunte,
} from '../lib/libro-para-el-asesor.js';

export const contabilidadRouter = Router();

const nt = (v: unknown) => String(v ?? '').trim();

/**
 * El periodo que se pide, o el trimestre en el que estamos.
 *
 * Sin fechas se contesta el trimestre corriente y no «todo»: un fichero con dos
 * años dentro no se abre, se archiva.
 */
function elPeriodo(q: Record<string, unknown>): { desde: string; hasta: string; anio: number; trimestre: number } {
  const anio = Number(nt(q.anio)) || new Date().getFullYear();
  const pedido = Number(nt(q.trimestre));
  const ahora = trimestreDe(new Date());
  const trimestre = pedido >= 1 && pedido <= 4 ? pedido : (ahora?.trimestre ?? 1);
  return { ...delTrimestre(anio, trimestre), anio, trimestre };
}

/**
 * Todas las facturas del periodo, de los dos sitios donde viven.
 *
 * Las esperadas vienen también, marcadas: no son un apunte contable —sin número
 * ni fecha no hay nada que declarar— pero quien mira el trimestre tiene que
 * saber cuántas faltan por llegar antes de darlo por cerrado.
 */
async function losApuntes(desde: string, hasta: string): Promise<Apunte[]> {
  const [proveedores, clientes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT i.id, i.invoice_number, i.provider_name, i.customer_name, i.customer_email,
              i.vehicle_title, i.notes, i.direction, i.status,
              i.invoice_amount::numeric AS total, i.base_amount::numeric AS base,
              i.iva_rate::numeric AS tipo, i.regimen,
              COALESCE(i.invoice_date, i.issued_at::date) AS fecha,
              p.nif
         FROM moveadvisor_provider_invoices i
         LEFT JOIN erp_proveedores p ON p.nombre = i.provider_name
        WHERE COALESCE(i.invoice_date, i.issued_at::date) BETWEEN $1::date AND $2::date
        ORDER BY 12`,
      [desde, hasta]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    query<Record<string, unknown>>(
      `SELECT number, email, date, amount::numeric AS total, description, status, suplidos
         FROM moveadvisor_user_invoices
        WHERE date::date BETWEEN $1::date AND $2::date
        ORDER BY date`,
      [desde, hasta]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);

  const apuntes: Apunte[] = [];

  for (const f of proveedores.rows) {
    const emitida = nt(f.direction) === 'emitted';
    apuntes.push({
      numero: nt(f.invoice_number) || nt(f.id),
      fecha: nt(f.fecha),
      sentido: emitida ? 'emitida' : 'recibida',
      contraparte: emitida ? nt(f.customer_name) || nt(f.customer_email) : nt(f.provider_name),
      nif: nt(f.nif) || null,
      concepto: nt(f.notes) || null,
      vehiculo: nt(f.vehicle_title) || null,
      base: f.base,
      // La columna guarda el tipo en tanto por uno; aquí se trabaja en tanto
      // por ciento, que es como lo escribe una factura.
      iva: f.tipo != null ? Number(f.tipo) * 100 : null,
      total: f.total,
      regimen: (nt(f.regimen) || 'nacional') as Apunte['regimen'],
      pendiente: nt(f.status) === 'esperada',
    });
  }

  /*
   * Y las nuestras al cliente, que salen de la pasarela.
   *
   * El importe que guarda es el total cobrado, con su IVA dentro. El desglose
   * se hace aquí con el general: son servicios nuestros, y no hay ninguno a
   * otro tipo. Si algún día lo hay, será una columna y no una suposición.
   */
  for (const f of clientes.rows) {
    apuntes.push({
      numero: nt(f.number),
      fecha: nt(f.date),
      sentido: 'emitida',
      contraparte: nt(f.email),
      concepto: nt(f.description) || null,
      total: f.total,
      iva: 21,
      regimen: 'nacional',
    });
  }

  return apuntes;
}

/** El trimestre, resumido y con sus apuntes. */
contabilidadRouter.get('/contabilidad', requireRole(['admin']), async (req, res) => {
  try {
    const p = elPeriodo(req.query as Record<string, unknown>);
    const apuntes = await losApuntes(p.desde, p.hasta);
    const resumen = resumeElPeriodo(apuntes);
    res.json({
      ok: true,
      data: {
        ...p,
        resumen,
        falta: queFaltaAntesDeMandarlo(resumen),
        apuntes,
      },
    });
  } catch (err) {
    console.error('[contabilidad]:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'contabilidad_failed' });
  }
});

/**
 * Y el fichero, que es lo que se le manda.
 *
 * Se descarga y se le adjunta. No se le manda solo por correo desde aquí a
 * propósito: quien lo manda tiene que haber mirado antes lo que falta, y un
 * envío automático se convierte en un fichero que llega todos los trimestres
 * con los mismos huecos.
 */
contabilidadRouter.get('/contabilidad/fichero', requireRole(['admin']), async (req, res) => {
  try {
    const p = elPeriodo(req.query as Record<string, unknown>);
    const csv = comoFichero(await losApuntes(p.desde, p.hasta));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="${comoSeLlamaElFichero(p.anio, p.trimestre)}"`);
    // Con BOM: sin él, un Excel español abre «Gestoría» como «GestorÃ­a».
    res.send('﻿' + csv);
  } catch (err) {
    console.error('[contabilidad] fichero:', (err as Error).message);
    res.status(500).json({ ok: false, error: 'contabilidad_failed' });
  }
});
