/**
 * Cómo se escriben los números del marketplace.
 *
 * Precios, kilómetros y cuotas en formato de España, y un guion cuando no hay
 * dato: un cero y un hueco no son lo mismo, y en una tabla de precios esa
 * diferencia importa.
 */

export function fmtPrice(n: number) {
  return n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '–';
}
export function fmtKm(n: number) { return n ? `${n.toLocaleString('es-ES')} km` : '–'; }
export function fmtCuota(n: number | null | undefined) { return n ? `${n.toLocaleString('es-ES')} €/mes` : '–'; }

// ── Fechas y horas de las visitas ───────────────────────────────────────────

export function todayStr() { return new Date().toISOString().slice(0, 10); }
export function fmtVDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtVTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
export const V_TIMES: string[] = [];
for (let h = 8; h <= 21; h++)
  for (let m = 0; m < 60; m += 30)
    V_TIMES.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);

// movido a tipos.ts: type VisitEntry = { slots: any[]; bookings: any[]; loading: boolean };
// movido a tipos.ts: type SlotFormState = { date: string; timeStart: string; timeEnd: string };
