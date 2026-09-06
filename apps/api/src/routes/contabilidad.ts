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
import { requireRole } from '../middleware/auth.js';
import {
  resumeElPeriodo, queFaltaAntesDeMandarlo, comoFichero, comoSeLlamaElFichero,
  delTrimestre, trimestreDe,
} from '../lib/libro-para-el-asesor.js';
import { losApuntes } from '../lib/apuntes.js';

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
