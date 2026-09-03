/**
 * Dónde viven los papeles de un coche.
 *
 * Un expediente de importación reparte sus documentos en tres sitios: el
 * expediente —los papeles del coche—, el pedido —la compra— y la peritación —el
 * informe del perito—. Están separados porque cada pantalla sube a lo suyo, y
 * eso está bien: lo que no puede ser es que cada una **lea** solo lo suyo.
 *
 * La factura del vendedor alemán es el ejemplo: se sube desde el pedido o desde
 * el expediente, y hasta ahora el otro seguía diciendo que faltaba. El final de
 * esa historia es siempre el mismo, subirla dos veces.
 *
 * Así que los papeles son **del coche**. Se suben a un cajón concreto y se ven
 * desde cualquiera de los tres, y la lista de lo que falta se cuenta sobre
 * todos.
 */
import { query } from '../db/pool.js';

export interface Cajon {
  ambito: string;
  id: string | null;
}

/**
 * Los tres cajones de un expediente: él mismo, su pedido y su peritación.
 *
 * Devuelve el del expediente siempre; los otros dos, cuando existen. Un `id`
 * nulo se queda dentro a propósito: quien lo usa para adjuntar correos ya sabe
 * descartarlos, y quitarlos aquí escondería que ese cajón podría existir.
 */
export async function cajonesDelCoche(leadId: string): Promise<Cajon[]> {
  const pedido = await query<{ id: string }>(
    `SELECT id FROM erp_pedidos WHERE lead_id = $1 ORDER BY created_at LIMIT 1`,
    [leadId]
  ).catch(() => ({ rows: [] as { id: string }[] }));

  const peritacion = await query<{ id: string }>(
    `SELECT id FROM erp_peritaciones WHERE lead_id = $1 LIMIT 1`,
    [leadId]
  ).catch(() => ({ rows: [] as { id: string }[] }));

  return [
    { ambito: 'lead', id: leadId },
    { ambito: 'pedido', id: pedido.rows[0]?.id ?? null },
    { ambito: 'peritacion', id: peritacion.rows[0]?.id ?? null },
  ];
}
