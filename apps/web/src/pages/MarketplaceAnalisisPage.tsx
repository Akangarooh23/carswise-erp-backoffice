import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';

/**
 * El marketplace, por secciones.
 *
 * El panel decía «4.469 activos · 23.435 € de precio medio» y con eso no se
 * contesta nada: el marketplace son cuatro negocios —VO de flotas de renting,
 * stock de concesionario, particulares e importación— que se compran, se venden
 * y se marginan de otra manera. Sumados, el número es la media de cosas que no
 * se parecen.
 *
 * Hoy hay coches en dos de las cuatro. Las otras salen a cero **y se ven a
 * cero**: eso contesta «cuánto stock propio tenemos», y esconderlas convierte
 * la respuesta en una pregunta.
 */

interface Seccion {
  clave: string;
  nombre: string;
  queEs: string;
  total: number;
  activos: number;
  precioMedio: number | null;
  leads: number;
}

interface Datos {
  secciones: Seccion[];
  renting: { total: number; activos: number };
  leads: { portal: string; tipo: string; n: number }[];
  visitas: { estado: string; n: number }[];
  marcas: { marca: string; n: number; precio_medio: string | number | null }[];
}

const num = (n: number) => (n ?? 0).toLocaleString('es-ES');
const euros = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

/** Cómo se llama un tipo de lead para quien no lleva el código en la cabeza. */
const TIPO_DE_LEAD: Record<string, string> = {
  visit: 'visita', info: 'información', renting: 'renting', import: 'importación',
};

export default function MarketplaceAnalisisPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    api.get<Datos>('/marketplace/analisis')
      .then((r) => { if (r.ok) setDatos(r.data); else setFallo('No se pudo cargar el análisis'); })
      .catch(() => setFallo('Error de conexión'));
  }, []);

  if (fallo)  return <div className="text-red-500 text-sm pt-4">{fallo}</div>;
  if (!datos) return <div className="text-brand-300 text-sm pt-4">Cargando el marketplace…</div>;

  const totalActivos = datos.secciones.reduce((n, s) => n + s.activos, 0);
  const leadsTotal = datos.leads.reduce((n, l) => n + Number(l.n), 0);
  const visitasTotal = datos.visitas.reduce((n, v) => n + Number(v.n), 0);
  const maxMarca = Math.max(...datos.marcas.map((m) => Number(m.n)), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Análisis del marketplace"
        subtitle="Lo que publicamos nosotros, por secciones. Los anuncios de otros están en Portales." />

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">Las cuatro secciones</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {datos.secciones.map((s) => (
            <div key={s.clave}
                 className={'rounded-xl border bg-white shadow-sm p-5 ' +
                   (s.activos > 0 ? 'border-brand-200' : 'border-dashed border-brand-200')}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">{s.nombre}</p>
              <p className={'mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums ' +
                   (s.activos > 0 ? 'text-brand-600' : 'text-brand-200')}>
                {num(s.activos)}
              </p>
              <p className="mt-1.5 text-[11px] text-brand-300 leading-snug">{s.queEs}</p>
              <dl className="mt-3 pt-3 border-t border-brand-100 space-y-1 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-brand-300">Precio medio</dt>
                  <dd className="font-semibold text-brand-500 tabular-nums">{euros(s.precioMedio)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-300">En total</dt>
                  <dd className="font-semibold text-brand-500 tabular-nums">{num(s.total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-300">Del escaparate</dt>
                  <dd className="font-semibold text-brand-500 tabular-nums">
                    {totalActivos > 0 ? `${Math.round((s.activos / totalActivos) * 100)} %` : '–'}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {/*
          * El renting va aquí abajo y no como una quinta tarjeta: es otro
          * producto sobre el mismo coche —en vez de comprarlo, se alquila—, y de
          * sección haría que la suma dejase de ser el marketplace.
          */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-white px-5 py-3">
          <span className="text-brand-400"><Icono nombre="llave" tam={18} /></span>
          <p className="text-sm text-brand-500">
            <strong className="tabular-nums">{num(datos.renting.activos)}</strong> de esos coches se ofrecen también
            <strong> en renting</strong> en vez de en venta.
          </p>
          <span className="text-[11px] text-brand-300">
            es un producto, no una sección: por eso no suma con las de arriba
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">De dónde vienen las solicitudes</h3>
            <Link to="/leads" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Ver leads →</Link>
          </div>
          {!datos.leads.length ? (
            <p className="text-sm text-brand-300">Todavía no ha entrado ninguna solicitud.</p>
          ) : (
            <ul className="space-y-2.5 list-none p-0 m-0">
              {datos.leads.map((l) => (
                <li key={`${l.portal}·${l.tipo}`} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-brand-500 truncate">
                    {l.portal}
                    <span className="ml-2 text-brand-300">{TIPO_DE_LEAD[l.tipo] ?? l.tipo}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="h-1.5 w-20 rounded-full bg-brand-50 overflow-hidden">
                      <span className="block h-full rounded-full bg-acento"
                            style={{ width: `${leadsTotal > 0 ? Math.max((Number(l.n) / leadsTotal) * 100, 4) : 0}%` }} />
                    </span>
                    <span className="text-[13px] font-bold text-brand-600 tabular-nums w-6 text-right">{l.n}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">Visitas a los coches</h3>
            <Link to="/bookings" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Ver agenda →</Link>
          </div>
          {!visitasTotal ? (
            <p className="text-sm text-brand-300">Todavía no se ha reservado ninguna visita.</p>
          ) : (
            <ul className="space-y-2.5 list-none p-0 m-0">
              {datos.visitas.map((v) => (
                <li key={v.estado} className="flex items-center justify-between">
                  <span className="text-[13px] text-brand-500 capitalize">{v.estado}</span>
                  <span className="text-[13px] font-bold text-brand-600 tabular-nums">{v.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-4">Qué hay publicado, por marca</h3>
        {!datos.marcas.length ? (
          <p className="text-sm text-brand-300">No hay coches publicados.</p>
        ) : (
          <ul className="space-y-2.5 list-none p-0 m-0">
            {datos.marcas.map((m) => (
              <li key={m.marca} className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-brand-500 w-28 shrink-0 truncate">{m.marca}</span>
                <span className="h-2 flex-1 rounded-full bg-brand-50 overflow-hidden">
                  <span className="block h-full rounded-full bg-brand-400"
                        style={{ width: `${Math.max((Number(m.n) / maxMarca) * 100, 2)}%` }} />
                </span>
                <span className="text-[13px] text-brand-500 tabular-nums w-14 text-right">{num(Number(m.n))}</span>
                <span className="text-[12px] text-brand-300 tabular-nums w-20 text-right">{euros(m.precio_medio)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
