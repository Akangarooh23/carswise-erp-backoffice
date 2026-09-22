/**
 * Las ventas en curso, todas juntas.
 *
 * Desde que un comprador dice «quiero comprarlo» en PopCar, su venta vive en el
 * encargo del coche: quién compra, por cuánto, si financia y en qué paso está.
 * Todo eso ya se pintaba —y se decidía— **dentro de la ficha de cada IDCar**,
 * que es el sitio correcto para trabajar una venta concreta y el peor posible
 * para saber cuántas hay.
 *
 * Con una venta al mes se sostiene mirando coche por coche. Con cinco a la
 * semana, no: alguien tiene que poder abrir una pantalla y ver lo que está
 * esperando algo nuestro, que es exactamente lo que esta lista contesta.
 *
 * No decide nada. Los botones —aprobar la financiación, denegarla, pasar a
 * pago propio, anular— siguen en la ficha del coche, que es donde están los
 * datos con los que se decide. Aquí se ve qué hay y se entra.
 */

import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { enQuePasoEsta, QUE_TOCA, EN_CURSO, type Paso } from '../lib/venta-en-curso.js';

export const ventasRouter = Router();

/** Quien lleva las ventas: los mismos que pueden decidirlas en la ficha. */
const PUEDEN = ['admin', 'operations', 'sales'] as const;

/*
 * Los campos, a mano y nunca SELECT *.
 *
 * En esta tabla hay identificadores de documentos y testigos de firma que no
 * pinta nadie en una lista. Y el DNI del comprador tampoco sale: para saber qué
 * venta hay que atender basta con su nombre, y un listado es lo que más ojos
 * tiene encima.
 */
const CAMPOS = `
  e.id, e.vehicle_id, e.venta_estado, e.venta_financia, e.financiacion_estado,
  e.financiacion_entidad, e.financiacion_importe, e.financiacion_decidida_at,
  e.venta_iniciada_at, e.comprador_nombre, e.comprador_email, e.comprador_telefono,
  e.precio_venta, e.precio_referencia, e.cliente_nombre, e.cliente_email,
  v.plate, v.brand, v.model, v.year
`;

interface Fila {
  id: string;
  vehicle_id: string;
  venta_estado: string | null;
  venta_financia: boolean | null;
  financiacion_estado: string | null;
  financiacion_entidad: string | null;
  financiacion_importe: string | number | null;
  financiacion_decidida_at: string | null;
  venta_iniciada_at: string | null;
  comprador_nombre: string | null;
  comprador_email: string | null;
  comprador_telefono: string | null;
  precio_venta: string | number | null;
  precio_referencia: string | number | null;
  cliente_nombre: string | null;
  cliente_email: string | null;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
}

/** Cuántos días lleva esperando. Null si no consta cuándo empezó. */
function diasDesde(cuando: string | null): number | null {
  if (!cuando) return null;
  const t = new Date(cuando).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

ventasRouter.get('/ventas', requireRole([...PUEDEN]), async (req, res) => {
  const paso = String(req.query.paso || '').trim();
  const busca = String(req.query.q || '').trim().toLowerCase();

  try {
    /*
     * El filtro por paso no va en el SQL a propósito.
     *
     * El paso no es una columna: sale de `enQuePasoEsta`, que combina el estado
     * de la venta con el de la financiación. Repetir esa regla en un WHERE
     * sería tener dos versiones de la misma decisión y que se separen el día
     * que cambie una. Son decenas de filas, no miles.
     */
    const vals: unknown[] = [EN_CURSO];
    let where = 'WHERE e.cerrado_at IS NULL AND e.venta_estado = $1';
    if (busca) {
      vals.push('%' + busca + '%');
      const i = vals.length;
      where +=
        ` AND (lower(COALESCE(e.comprador_nombre,'')) LIKE $${i}` +
        ` OR lower(COALESCE(e.comprador_email,'')) LIKE $${i}` +
        ` OR lower(COALESCE(v.plate,'')) LIKE $${i}` +
        ` OR lower(COALESCE(v.brand,'') || ' ' || COALESCE(v.model,'')) LIKE $${i})`;
    }

    const r = await query<Fila>(`
      SELECT ${CAMPOS}
        FROM erp_encargos_venta e
        LEFT JOIN moveadvisor_user_vehicles v ON v.id = e.vehicle_id
        ${where}
       ORDER BY e.venta_iniciada_at ASC NULLS LAST
       LIMIT 300
    `, vals);

    const todas = r.rows.map((f) => {
      const suPaso = enQuePasoEsta(f);
      return {
        id: f.id,
        vehicle_id: f.vehicle_id,
        paso: suPaso,
        // La frase de qué toca es la misma que se lee en la ficha del coche.
        que_toca: suPaso ? QUE_TOCA[suPaso] : '',
        iniciada_at: f.venta_iniciada_at,
        dias: diasDesde(f.venta_iniciada_at),
        coche: [f.brand, f.model, f.year].filter(Boolean).join(' '),
        matricula: f.plate || '',
        comprador: f.comprador_nombre || '',
        comprador_email: f.comprador_email || '',
        comprador_telefono: f.comprador_telefono || '',
        vendedor: f.cliente_nombre || f.cliente_email || '',
        // De Postgres los NUMERIC llegan como texto.
        precio: Number(f.precio_venta) || Number(f.precio_referencia) || null,
        financia: f.venta_financia === true,
        financiacion_estado: f.financiacion_estado,
        financiacion_entidad: f.financiacion_entidad || '',
        financiacion_importe: Number(f.financiacion_importe) || null,
        financiacion_decidida_at: f.financiacion_decidida_at,
      };
    });

    const filtradas = paso ? todas.filter((x) => x.paso === paso) : todas;

    /*
     * El recuento va de todas, no de las filtradas: es lo que deja poner el
     * número en cada pestaña sin pedir la lista tres veces.
     */
    const cuenta: Record<Paso | 'todas', number> = {
      todas: todas.length,
      financiacion_en_estudio: 0,
      financiacion_denegada: 0,
      esperando_ingreso: 0,
    };
    for (const x of todas) if (x.paso) cuenta[x.paso] += 1;

    res.json({ ok: true, data: filtradas, meta: { total: filtradas.length, cuenta } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ventas] no se han podido leer:', msg);
    res.status(500).json({ ok: false, error: 'ventas_list_failed' });
  }
});
