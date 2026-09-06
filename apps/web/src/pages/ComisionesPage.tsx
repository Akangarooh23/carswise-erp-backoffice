import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatCard } from '../components/ui/Card.js';
import Icono from '../components/ui/Icono.js';

/**
 * Lo que nos comisionan los proveedores.
 *
 * En el panel era un total que llevaba a Facturación proveedores, y allí está
 * todo lo emitido —la venta de un coche de 20.190 € incluida—, sin filtrar. Un
 * número que lleva a una lista donde no está lo que buscabas es peor que un
 * número sin enlace: te hace buscarlo tú.
 *
 * Aquí hay dos cosas, y hacen falta las dos: lo facturado, y **lo que se
 * podría facturar**. Con la primera sola no se puede saber si se está
 * facturando todo lo que se vende, que es el fallo que de verdad cuesta
 * dinero: una garantía vendida sin su comisión emitida no la reclama nadie.
 */

interface Comision {
  id: string;
  invoice_number: string | null;
  provider_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  vehicle_title: string | null;
  notes: string | null;
  status: string | null;
  contract_id: string | null;
  base: string | number | null;
  total: string | number | null;
  iva: string | number | null;
  fecha: string | null;
  paid_at: string | null;
  garantia: string | null;
  pagado_por_el_cliente: string | number | null;
}

interface Garantia {
  id: string;
  nombre: string;
  precio: string | number;
  coste: string | number;
  comision: string | number;
  activo: boolean;
  vendidas: number;
}

const euros = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v);
};

function elDia(v: string | null): string {
  if (!v) return '–';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ESTADO: Record<string, { texto: string; clase: string }> = {
  paid:            { texto: 'Cobrada',   clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:         { texto: 'Emitida',   clase: 'bg-acento-tenue text-acento-texto border-acento' },
  pending_payment: { texto: 'Emitida',   clase: 'bg-acento-tenue text-acento-texto border-acento' },
};


/**
 * Un coche de concesionario que se vendió por una visita nuestra.
 *
 * El coche no es nuestro: lo que ganamos es un fee del concesionario. Sale aquí
 * en cuanto la visita se cierra como «fue y se lo quedó», que es lo único que
 * dice que hubo venta.
 */
interface VentaSinComisionar {
  id: string;
  vehicle_title: string | null;
  contact_name: string | null;
  user_email: string | null;
  date: string | null;
  proveedor: string | null;
  precio: string | number | null;
}

export default function ComisionesPage() {
  const [comisiones, setComisiones] = useState<Comision[] | null>(null);
  const [catalogo, setCatalogo] = useState<Garantia[]>([]);
  const [fallo, setFallo] = useState('');
  const [ventas, setVentas] = useState<VentaSinComisionar[]>([]);
  const [fee, setFee] = useState(0);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);


  function recarga() {
    api.get<{ comisiones: Comision[]; catalogo: Garantia[] }>('/comisiones')
      .then((r) => {
        if (!r.ok) { setFallo('No se pudieron cargar las comisiones'); return; }
        setComisiones(r.data.comisiones);
        setCatalogo(r.data.catalogo);
      })
      .catch(() => setFallo('Error de conexión'));
    cargaVentas();
  }

  useEffect(() => { recarga(); }, []);

  /** Las ventas de concesionario que esperan su factura. */
  function cargaVentas() {
    api.get<{ ventas: VentaSinComisionar[]; fee: number }>('/provider-billing/pending-dealer-commissions')
      .then((r) => { if (r.ok) { setVentas(r.data.ventas); setFee(r.data.fee); } })
      .catch(() => { /* el resto de la pantalla sirve igual */ });
  }

  async function emite(v: VentaSinComisionar) {
    setEmitiendo(v.id);
    const r = await api.post('/provider-billing/dealer-commissions', { booking_id: v.id });
    setEmitiendo(null);
    if (!r.ok) { setFallo(r.error || 'No se ha podido emitir la comisión'); return; }
    // Se recarga todo: la factura nueva va a la tabla de abajo y la venta sale
    // de esta lista. Quitarla de una sola dejaría la otra mintiendo.
    recarga();
  }


  if (fallo)       return <div className="text-red-500 text-sm pt-4">{fallo}</div>;
  if (!comisiones) return <div className="text-brand-300 text-sm pt-4">Cargando comisiones…</div>;

  const base = comisiones.reduce((n, c) => n + (Number(c.base) || 0), 0);
  const cobrado = comisiones.filter((c) => c.status === 'paid')
    .reduce((n, c) => n + (Number(c.base) || 0), 0);
  const sinCobrar = comisiones.filter((c) => c.status !== 'paid').length;

  const vendidas = catalogo.reduce((n, g) => n + Number(g.vendidas), 0);
  // Lo vendido sin su comisión emitida: es lo que se pierde sin darse cuenta.
  const sinFacturar = vendidas - comisiones.length;

  return (
    <div className="space-y-6">
      <PageHeader title="Comisiones"
        subtitle="Lo que nos pagan los proveedores por vender lo suyo. Las ventas de vehículo no están aquí." />

      {sinFacturar > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-acento bg-acento-tenue px-4 py-3">
          <span className="text-acento-texto mt-0.5"><Icono nombre="aviso" tam={18} /></span>
          <p className="text-sm text-acento-texto">
            <strong>{sinFacturar === 1 ? 'Una venta sin comisión emitida' : `${sinFacturar} ventas sin comisión emitida`}.</strong>{' '}
            Se han vendido {vendidas} y hay {comisiones.length} facturas. Una comisión que no se emite no la reclama nadie.
          </p>
        </div>
      )}


      {/* Las ventas de concesionario que esperan su factura.
          Va antes que la tabla porque es lo único que hay que hacer: lo de
          abajo ya está hecho. */}
      {ventas.length > 0 && (
        <div className="bg-white rounded-xl border border-acento shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-100 bg-acento-tenue">
            <h3 className="font-semibold text-acento-texto text-sm">
              {ventas.length === 1 ? 'Una venta de concesionario sin comisionar' : `${ventas.length} ventas de concesionario sin comisionar`}
            </h3>
            <p className="text-[12.5px] text-acento-texto/85 mt-0.5">
              Visitas que acabaron en venta. El fee es de {euros(fee)} por coche, IVA incluido, y es
              provisional hasta que haya contrato con cada concesionario.
            </p>
          </div>
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr>
              <th>Fecha</th><th>Concesionario</th><th>Coche</th><th>Cliente</th>
              <th>Se vendió por</th><th>Comisión</th><th></th>
            </tr></thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id}>
                  <td>{elDia(v.date)}</td>
                  <td className="font-medium text-brand-600">{v.proveedor}</td>
                  <td>{v.vehicle_title || '–'}</td>
                  <td>{v.contact_name || v.user_email || '–'}</td>
                  <td className="tabular-nums">{euros(v.precio)}</td>
                  <td className="tabular-nums font-semibold">{euros(fee)}</td>
                  <td>
                    <button type="button" disabled={emitiendo === v.id} onClick={() => emite(v)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60">
                      {emitiendo === v.id ? 'Emitiendo…' : 'Emitir la factura'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Comisionado" value={euros(base)} sub="sin IVA" icon="euro" color="bien" />
        <StatCard label="Cobrado" value={euros(cobrado)}
                  sub={cobrado < base ? `${euros(base - cobrado)} por cobrar` : 'todo al día'}
                  icon="comprobado" color="neutro" />
        <StatCard label="Facturas" value={String(comisiones.length)}
                  sub={sinCobrar ? `${sinCobrar} sin cobrar` : 'todas cobradas'}
                  icon="documento" color={sinCobrar ? 'espera' : 'neutro'} />
        <StatCard label="Productos vendidos" value={String(vendidas)}
                  sub="garantías contratadas por clientes" icon="escudo" color="neutro" />
      </div>

      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-100">
          <h3 className="font-semibold text-brand-600 text-sm">Facturas de comisión</h3>
        </div>
        {!comisiones.length ? (
          <p className="text-brand-300 text-sm text-center py-8">
            Todavía no se ha emitido ninguna comisión.
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr>
              <th>Fecha</th><th>Nº</th><th>Proveedor</th><th>Producto</th>
              <th>Cliente</th><th>Coche</th>
              <th>Pagó el cliente</th><th>Base</th><th>IVA</th><th>Total</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {comisiones.map((c) => {
                const e = ESTADO[String(c.status)] ?? { texto: c.status ?? '–', clase: 'bg-brand-50 text-brand-400 border-brand-200' };
                return (
                  <tr key={c.id}>
                    <td className="text-sm text-brand-400 tabular-nums">{elDia(c.fecha)}</td>
                    <td className="text-sm font-medium text-brand-500">{c.invoice_number || c.id}</td>
                    <td className="text-sm text-brand-500">{c.provider_name || '–'}</td>
                    <td className="text-sm text-brand-400">{c.garantia || c.notes || '–'}</td>
                    <td className="text-sm text-brand-400">{c.customer_name || c.customer_email || '–'}</td>
                    <td className="text-sm text-brand-400">{c.vehicle_title || '–'}</td>
                    {/* Al lado de la base, porque la comisión solo se entiende
                        contra lo que pagó el cliente: 70 de 190. */}
                    <td className="text-sm text-brand-300 tabular-nums">{euros(c.pagado_por_el_cliente)}</td>
                    <td className="text-sm font-semibold text-brand-600 tabular-nums">{euros(c.base)}</td>
                    <td className="text-sm text-brand-400 tabular-nums">
                      {c.iva != null ? `${Math.round(Number(c.iva) * 100)} %` : '–'}
                    </td>
                    <td className="text-sm text-brand-500 tabular-nums">{euros(c.total)}</td>
                    <td>
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${e.clase}`}>
                        {e.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-100">
          <h3 className="font-semibold text-brand-600 text-sm">Qué se puede comisionar</h3>
          <p className="text-[11px] text-brand-300 mt-0.5">
            Lo que dice el catálogo, para poder comprobar que lo facturado cuadra con lo vendido.
          </p>
        </div>
        {!catalogo.length ? (
          <p className="text-brand-300 text-sm text-center py-8">El catálogo está vacío.</p>
        ) : (
          <div className="overflow-x-auto"><table className="erp-table">
            <thead><tr>
              <th>Producto</th><th>Precio al cliente</th><th>Coste</th>
              <th>Nuestra comisión</th><th>Vendidas</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {catalogo.map((g) => (
                <tr key={g.id}>
                  <td className="text-sm font-medium text-brand-500">{g.nombre}</td>
                  <td className="text-sm text-brand-400 tabular-nums">{euros(g.precio)}</td>
                  <td className="text-sm text-brand-400 tabular-nums">{euros(g.coste)}</td>
                  <td className="text-sm font-semibold text-brand-600 tabular-nums">{euros(g.comision)}</td>
                  <td className="text-sm text-brand-500 tabular-nums">{g.vendidas}</td>
                  <td className="text-sm text-brand-400">{g.activo ? 'Activo' : 'Retirado'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
