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
  consent_legal_at:     string | null;
  consent_marketing_at: string | null;
  consent_experian_at:  string | null;
  registration_ip:  string;
  utm_source:   string;
  utm_medium:   string;
  utm_campaign: string;
}

function fmtDateTime(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ConsentCell({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700 text-xs whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      {fmtDateTime(value)}
    </span>
  );
}

export default function ConsentimientosPage() {
  const [rows, setRows]       = useState<ConsentRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState('');
  const [filter, setFilter]   = useState<'all' | 'legal' | 'marketing' | 'experian'>('all');
  const [loading, setLoading] = useState(true);
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

  function handleSearch(v: string) { setQ(v); setPage(1); }
  function handleFilter(f: typeof filter) { setFilter(f); setPage(1); }

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
                  <th>T&amp;C</th>
                  <th>Comunicaciones</th>
                  <th>Experian</th>
                  <th>IP</th>
                  <th>UTM Source</th>
                  <th>Campaña</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        to={`/users/${r.id}`}
                        className="text-blue-600 hover:underline font-medium text-sm"
                      >
                        {[r.name, r.apellidos].filter(Boolean).join(' ') || r.email}
                      </Link>
                      <div className="text-xs text-slate-400">{r.email}</div>
                    </td>
                    <td className="text-xs text-slate-500 whitespace-nowrap">
                      {fmtDateTime(r.created_at) ?? '–'}
                    </td>
                    <td><ConsentCell value={r.consent_legal_at} /></td>
                    <td><ConsentCell value={r.consent_marketing_at} /></td>
                    <td><ConsentCell value={r.consent_experian_at} /></td>
                    <td className="text-xs text-slate-500 font-mono">{r.registration_ip || '–'}</td>
                    <td className="text-xs text-slate-500">{r.utm_source || '–'}</td>
                    <td className="text-xs text-slate-500 max-w-[140px] truncate">{r.utm_campaign || '–'}</td>
                  </tr>
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
