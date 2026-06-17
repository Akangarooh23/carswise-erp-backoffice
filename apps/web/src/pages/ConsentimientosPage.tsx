import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Pagination } from '../components/ui/Pagination.js';

interface ConsentRow {
  id: string;
  name: string;
  apellidos: string;
  email: string;
  created_at: string;
  consent_legal_at:      string | null;
  consent_marketing_at:  string | null;
  consent_experian_at:   string | null;
  consents_reviewed_at:  string | null;
  registration_ip:  string;
  registration_ua:  string;
  language:         string;
  utm_source:   string;
  utm_medium:   string;
  utm_campaign: string;
  utm_content:  string;
  referer:      string;
  landing_url:  string;
  affiliate_data: Record<string, string> | null;
}

function fmtDate(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function FieldAlways({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs ${value ? 'text-slate-700' : 'text-slate-400'} break-all`}>{value || '–'}</p>
    </div>
  );
}

function ConsentBadge({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${value ? 'bg-emerald-400' : 'bg-slate-300'}`} />
      <div>
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <p className={`text-xs ${value ? 'text-emerald-700' : 'text-slate-400'}`}>
          {value ? fmtDate(value) : 'No aceptado'}
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs text-slate-700 break-all">{value}</p>
    </div>
  );
}

function ExpandedRow({ row }: { row: ConsentRow }) {
  return (
    <tr>
      <td colSpan={6} className="bg-slate-50 px-5 py-4 border-b border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Consentimientos */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consentimientos</p>
            <ConsentBadge value={row.consent_legal_at}     label="T&C y Política de Privacidad" />
            <ConsentBadge value={row.consent_marketing_at} label="Marketing email + SMS" />
            <ConsentBadge value={row.consent_experian_at}  label="Terceros email + SMS (Experian)" />

            {row.consents_reviewed_at && (
              <div className="pt-2 border-t border-slate-200">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Revisión realizada</p>
                <p className="text-xs text-slate-600">{fmtDate(row.consents_reviewed_at)}</p>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Fecha de registro</p>
              <p className="text-xs text-slate-700">{fmtDate(row.created_at) ?? '–'}</p>
            </div>
          </div>

          {/* Origen */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Origen del registro</p>
            <FieldAlways label="IP de registro"  value={row.registration_ip} />
            <FieldAlways label="Idioma"          value={row.language} />
            <FieldAlways label="UTM Source"      value={row.utm_source} />
            <FieldAlways label="UTM Medium"      value={row.utm_medium} />
            <FieldAlways label="UTM Campaign"    value={row.utm_campaign} />
            <Field       label="UTM Content"     value={row.utm_content} />
            <Field       label="Referer"         value={row.referer} />
            <Field       label="Landing URL"     value={row.landing_url} />
          </div>

          {/* Tracking / afiliación */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Afiliación y dispositivo</p>

            {row.affiliate_data && Object.keys(row.affiliate_data).length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Datos de afiliación</p>
                <div className="space-y-1 bg-white rounded p-2 border border-slate-200">
                  {Object.entries(row.affiliate_data).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-slate-400 shrink-0">{k}:</span>
                      <span className="text-slate-700 font-mono break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <FieldAlways label="Datos de afiliación" value={null} />
            )}

            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">User Agent</p>
              <p className={`text-[11px] leading-relaxed break-words ${row.registration_ua ? 'text-slate-500' : 'text-slate-400'}`}>
                {row.registration_ua || '–'}
              </p>
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
}

export default function ConsentimientosPage() {
  const [rows, setRows]         = useState<ConsentRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [q, setQ]               = useState('');
  const [filter, setFilter]     = useState<'all' | 'legal' | 'marketing' | 'experian'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const limit = 50;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q)              params.set('q', q);
    if (filter !== 'all') params.set('consent', filter);
    api.get<ConsentRow[]>(`/consentimientos?${params}`)
      .then((r) => {
        if (r.ok) {
          setRows(r.data ?? []);
          setTotal(r.meta?.total ?? 0);
        }
      })
      .finally(() => setLoading(false));
  }, [page, q, filter]);

  function handleSearch(v: string) { setQ(v); setPage(1); setExpanded(null); }
  function handleFilter(f: typeof filter) { setFilter(f); setPage(1); setExpanded(null); }
  function toggleRow(id: string) { setExpanded((prev) => prev === id ? null : id); }

  const filterLabels: { key: typeof filter; label: string }[] = [
    { key: 'all',       label: 'Todos' },
    { key: 'legal',     label: 'T&C' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'experian',  label: 'Experian' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consentimientos"
        subtitle={`${total} usuarios registrados`}
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchInput
          value={q}
          onChange={handleSearch}
          placeholder="Buscar por nombre o email…"
          className="w-full sm:w-72"
        />
        <div className="flex gap-1.5">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-slate-400 text-sm py-16">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-16">Sin resultados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Registro</th>
                  <th className="text-center">T&amp;C</th>
                  <th className="text-center">Marketing</th>
                  <th className="text-center">Experian</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <>
                    <tr
                      key={r.id}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${expanded === r.id ? 'bg-slate-50' : ''}`}
                      onClick={() => toggleRow(r.id)}
                    >
                      <td>
                        <Link
                          to={`/users/${r.id}`}
                          className="text-blue-600 hover:underline font-medium text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {[r.name, r.apellidos].filter(Boolean).join(' ') || r.email}
                        </Link>
                        <div className="text-xs text-slate-400">{r.email}</div>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(r.created_at) ?? '–'}
                      </td>
                      <td className="text-center">
                        {r.consent_legal_at
                          ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" title={fmtDate(r.consent_legal_at) ?? ''} />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" />}
                      </td>
                      <td className="text-center">
                        {r.consent_marketing_at
                          ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" title={fmtDate(r.consent_marketing_at) ?? ''} />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" />}
                      </td>
                      <td className="text-center">
                        {r.consent_experian_at
                          ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" title={fmtDate(r.consent_experian_at) ?? ''} />
                          : <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" />}
                      </td>
                      <td className="text-slate-400 text-xs pr-4">
                        {expanded === r.id ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expanded === r.id && <ExpandedRow key={`${r.id}-exp`} row={r} />}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > limit && (
        <Pagination
          page={page}
          total={total}
          limit={limit}
          onChange={setPage}
        />
      )}
    </div>
  );
}
