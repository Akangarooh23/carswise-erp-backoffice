import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadInvoicePdf } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatCard } from '../components/ui/Card.js';
import { Pagination } from '../components/ui/Pagination.js';
import type { User } from '../types/index.js';

interface BillingSummary {
  free_count: number; plus_count: number; premium_count: number;
  active_trials: number; expired_trials: number; new_paid_30d: number;
}

interface InvoiceRow {
  id: string;
  type: 'suscripcion' | 'venta' | 'renting' | 'tasacion';
  date: string;
  customer_name: string;
  customer_email: string;
  description: string;
  precio: number | null;
  precio_facturado: number;
  status: string;
  cw_invoice_number?: string | null;
  cw_sent_at?: string | null;
  cw_generated_at?: string | null;
  cw_paid_at?: string | null;
  iva_rate?: number;
}

function fmtDate(s: string | null) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n == null) return '–';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const TYPE_BADGE: Record<string, string> = {
  suscripcion: 'bg-blue-50 text-blue-700',
  venta:       'bg-emerald-50 text-emerald-700',
  renting:     'bg-violet-50 text-violet-700',
  tasacion:    'bg-amber-50 text-amber-700',
};
const TYPE_LABEL: Record<string, string> = {
  suscripcion: 'Suscripción', venta: 'Venta', renting: 'Renting', tasacion: 'Tasación',
};
const STATUS_BADGE: Record<string, string> = {
  Pagada:     'bg-emerald-100 text-emerald-700',
  Pendiente:  'bg-yellow-100 text-yellow-700',
  Completada: 'bg-emerald-100 text-emerald-700',
  active:     'bg-blue-100 text-blue-700',
  completed:  'bg-slate-100 text-slate-500',
  cancelled:  'bg-red-100 text-red-600',
};

const TABS = ['all', 'suscripcion', 'tasacion', 'venta', 'renting', 'free'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  all:         'Todo',
  suscripcion: 'Suscripciones',
  tasacion:    'Tasaciones',
  venta:       'Ventas vehículos',
  renting:     'Contratos renting',
  free:        'Usuarios free',
};

export default function BillingPage() {
  const [summary, setSummary]   = useState<BillingSummary | null>(null);
  const [tab, setTab]           = useState<Tab>('all');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [freeUsers, setFreeUsers] = useState<User[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    api.get<BillingSummary>('/billing/summary').then((r) => { if (r.ok) setSummary(r.data); });
  }, []);

  useEffect(() => { setPage(1); }, [tab]);

  useEffect(() => {
    setLoading(true);
    if (tab === 'free') {
      api.get<User[]>(`/billing/free-users?page=${page}&limit=50`).then((r) => {
        if (r.ok) { setFreeUsers(r.data); setTotal(r.meta?.total ?? r.data.length); }
      }).finally(() => setLoading(false));
    } else {
      const typeParam = tab === 'all' ? '' : `&type=${tab}`;
      api.get<InvoiceRow[]>(`/billing/invoices?page=${page}&limit=50${typeParam}`).then((r) => {
        if (r.ok) { setInvoices(r.data); setTotal((r.meta as { total: number })?.total ?? r.data.length); }
      }).finally(() => setLoading(false));
    }
  }, [tab, page, refreshKey]);

  function exportCsv() {
    const BOM = '﻿';
    const sep = ';';
    const headers = ['Nº Factura', 'Fecha', 'Tipo', 'Cliente', 'Email', 'Descripción', 'Precio', 'Precio Facturado', 'Estado'];
    const toSpanish = (n: number | null) => n == null ? '' : n.toFixed(2).replace('.', ',');
    const rows = invoices.map(inv => [
      inv.cw_invoice_number ?? '–',
      inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '–',
      TYPE_LABEL[inv.type] ?? inv.type,
      inv.customer_name,
      inv.customer_email,
      inv.description,
      toSpanish(inv.precio),
      toSpanish(inv.precio_facturado),
      inv.status,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(sep));
    const csv = BOM + [headers.map(h => `"${h}"`).join(sep), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturación clientes"
        subtitle="Suscripciones cobradas por CarsWise · Ventas y rentings gestionados por el proveedor"
      />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Free"               value={summary.free_count}    icon="🆓" />
          <StatCard label="Plus"               value={summary.plus_count}    icon="⭐" color="blue" />
          <StatCard label="Premium"            value={summary.premium_count} icon="💎" color="purple" />
          <StatCard label="Trials activos"     value={summary.active_trials} icon="⏳" color="yellow" />
          <StatCard label="Trials expirados"   value={summary.expired_trials} icon="❌" color="red" />
          <StatCard label="Nuevos pagos (30d)" value={summary.new_paid_30d}  icon="💳" color="green" />
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          {tab !== 'free' && invoices.length > 0 && (
            <button onClick={exportCsv}
              className="ml-auto text-sm text-slate-600 border border-slate-200 rounded-lg px-4 py-1.5 hover:bg-slate-50">
              ↓ Exportar CSV
            </button>
          )}
        </div>

        {(tab === 'venta' || tab === 'renting') && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Precio facturado = 0 € — estos importes los cobra el proveedor directamente al cliente. CarsWise actúa como intermediario.
          </p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Cargando…</div>
          ) : tab === 'free' ? (
            /* ── Usuarios free ── */
            freeUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin usuarios free</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead><tr><th>Usuario</th><th>Plan</th><th>Registro</th></tr></thead>
                  <tbody>
                    {freeUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <Link to={`/users/${u.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                            {u.name} {u.apellidos || ''}
                          </Link>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </td>
                        <td><span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">Free · 0 €</span></td>
                        <td className="text-sm text-slate-500">{fmtDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination page={page} total={total} limit={50} onChange={setPage} />
              </>
            )
          ) : (
            /* ── Invoices table (Todo / Suscripciones / Ventas / Renting) ── */
            invoices.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Sin registros</div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      {tab === 'all' && <th>Tipo</th>}
                      <th>Cliente</th>
                      <th>Descripción</th>
                      <th>Precio</th>
                      <th>Precio facturado</th>
                      <th>Estado</th>
                      <th>Factura PDF</th>
                      <th>F. Generación</th>
                      <th>Enviado</th>
                      <th>F. Envío</th>
                      <th>Pagado</th>
                      <th>F. Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={`${inv.type}-${inv.id}`}>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(inv.date)}</td>
                        {tab === 'all' && (
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${TYPE_BADGE[inv.type] ?? 'bg-slate-100 text-slate-500'}`}>
                              {TYPE_LABEL[inv.type] ?? inv.type}
                            </span>
                          </td>
                        )}
                        <td>
                          <p className="text-sm font-medium text-slate-800">{inv.customer_name}</p>
                          <p className="text-xs text-slate-400">{inv.customer_email}</p>
                        </td>
                        <td className="text-xs text-slate-500 max-w-[220px] truncate">{inv.description}</td>
                        <td className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                          {inv.type === 'renting' && inv.precio != null
                            ? <>{fmtEur(inv.precio)}<span className="text-xs font-normal text-slate-400">/mes</span></>
                            : fmtEur(inv.precio)}
                        </td>
                        <td className="text-sm font-semibold whitespace-nowrap">
                          {inv.precio_facturado > 0
                            ? <span className="text-emerald-700">{fmtEur(inv.precio_facturado)}</span>
                            : <span className="text-slate-400">0,00 €</span>}
                        </td>
                        <td>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[inv.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td>
                          {inv.type === 'suscripcion' ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-2">
                                {/* Descargar sin enviar */}
                                <button
                                  disabled={downloadingId === inv.id}
                                  onClick={async () => {
                                    setPdfError(null);
                                    setDownloadingId(inv.id);
                                    try { await downloadInvoicePdf(`/invoices/subscription/${inv.id}/pdf`, `${inv.cw_invoice_number ?? inv.id}.pdf`); setRefreshKey(k => k + 1); }
                                    catch (e) { setPdfError({ id: inv.id, msg: (e as Error).message }); }
                                    setDownloadingId(null);
                                  }}
                                  className="text-xs text-blue-600 hover:underline disabled:opacity-50 whitespace-nowrap">
                                  {downloadingId === inv.id ? 'Generando…' : inv.cw_invoice_number ? `↓ ${inv.cw_invoice_number}` : '↓ Descargar'}
                                </button>
                                {/* Enviar y descargar */}
                                <button
                                  disabled={downloadingId === inv.id}
                                  onClick={async () => {
                                    setPdfError(null);
                                    setDownloadingId(`${inv.id}_send`);
                                    try { await downloadInvoicePdf(`/invoices/subscription/${inv.id}/pdf?send=true`, `${inv.cw_invoice_number ?? inv.id}.pdf`); setRefreshKey(k => k + 1); }
                                    catch (e) { setPdfError({ id: inv.id, msg: (e as Error).message }); }
                                    setDownloadingId(null);
                                  }}
                                  className="text-xs text-emerald-600 hover:underline disabled:opacity-50 whitespace-nowrap">
                                  {downloadingId === `${inv.id}_send` ? 'Enviando…' : '✉ Enviar'}
                                </button>
                              </div>
                              {pdfError?.id === inv.id && (
                                <span className="text-[10px] text-red-600 font-medium max-w-[180px] leading-tight">
                                  ⚠ {pdfError.msg}
                                </span>
                              )}
                              {inv.cw_sent_at && (
                                <span className="text-[10px] text-emerald-600 font-medium">
                                  ✓ Enviada · {new Date(inv.cw_sent_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                </span>
                              )}
                            </div>
                          ) : inv.type === 'venta' ? (
                            <button
                              disabled={downloadingId === inv.id}
                              onClick={async () => {
                                setPdfError(null);
                                setDownloadingId(inv.id);
                                try { await downloadInvoicePdf(`/invoices/sale/${inv.id}/pdf`, `${inv.cw_invoice_number ?? inv.id}.pdf`); setRefreshKey(k => k + 1); }
                                catch (e) { setPdfError({ id: inv.id, msg: (e as Error).message }); }
                                setDownloadingId(null);
                              }}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50 whitespace-nowrap">
                              {downloadingId === inv.id ? 'Generando…' : inv.cw_invoice_number ? `↓ ${inv.cw_invoice_number}` : '↓ Generar'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">–</span>
                          )}
                        </td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{inv.cw_generated_at ? fmtDate(inv.cw_generated_at) : '–'}</td>
                        <td className="text-xs whitespace-nowrap">
                          {inv.cw_sent_at
                            ? <span className="text-emerald-600 font-semibold">Sí</span>
                            : <span className="text-slate-400">No</span>}
                        </td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">{inv.cw_sent_at ? fmtDate(inv.cw_sent_at) : '–'}</td>
                        <td className="text-xs whitespace-nowrap">
                          {inv.cw_paid_at || String(inv.status || '').toLowerCase() === 'paid'
                            ? <span className="text-emerald-600 font-semibold">Sí</span>
                            : <span className="text-slate-400">No</span>}
                        </td>
                        <td className="text-xs text-slate-500 whitespace-nowrap">
                          {inv.cw_paid_at ? fmtDate(inv.cw_paid_at) : String(inv.status || '').toLowerCase() === 'paid' ? fmtDate(inv.date) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <Pagination page={page} total={total} limit={50} onChange={setPage} />
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
