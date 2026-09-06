import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import type { PrecioContraElMercado } from '../types/index.js';
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
  const [mercado, setMercado] = useState<PrecioContraElMercado | null>(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    api.get<Datos>('/marketplace/analisis')
      .then((r) => { if (r.ok) setDatos(r.data); else setFallo('No se pudo cargar el análisis'); })
      .catch(() => setFallo('Error de conexión'));
    api.get<PrecioContraElMercado | null>('/kpis/precio-contra-el-mercado')
      .then((r) => { if (r.ok) setMercado(r.data); }).catch(() => {});
  }, []);

  async function recalcula() {
    setCalculando(true);
    const r = await api.post<PrecioContraElMercado | null>('/kpis/precio-contra-el-mercado', {});
    setCalculando(false);
    if (r.ok) setMercado(r.data);
  }

  if (fallo)  return <div className="text-red-500 text-sm pt-4">{fallo}</div>;
  if (!datos) return <div className="text-brand-300 text-sm pt-4">Cargando el marketplace…</div>;

  const totalActivos = datos.secciones.reduce((n, s) => n + s.activos, 0);
  const leadsTotal = datos.leads.reduce((n, l) => n + Number(l.n), 0);
  const visitasTotal = datos.visitas.reduce((n, v) => n + Number(v.n), 0);

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
              {/*
                * Primero todo lo que hay, y debajo lo que está publicado de
                * verdad. Son dos cosas: un coche puede estar en el catálogo y
                * no verlo nadie, y con un solo número no se sabe cuál de las
                * dos se está mirando.
                */}
              <p className={'mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums ' +
                   (s.total > 0 ? 'text-brand-600' : 'text-brand-200')}>
                {num(s.total)}
              </p>
              <p className="mt-1.5 text-[11px] text-brand-300 leading-snug">{s.queEs}</p>
              <dl className="mt-3 pt-3 border-t border-brand-100 space-y-1 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-brand-300">Publicados</dt>
                  <dd className="font-semibold text-brand-500 tabular-nums">
                    {num(s.activos)}
                    {s.total > s.activos && (
                      <span className="ml-1.5 font-medium text-brand-300">
                        · {num(s.total - s.activos)} sin publicar
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-brand-300">Precio medio</dt>
                  <dd className="font-semibold text-brand-500 tabular-nums">{euros(s.precioMedio)}</dd>
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

      {/*
        * Nuestros precios contra los del mercado.
        *
        * Aquí había un gráfico de doce barras con cuántos coches hay de cada
        * marca. Era decoración: saber que hay 846 Nissan no cambia ninguna
        * decisión. Esto sí — y es para lo que sirven los 798.000 anuncios que
        * se rastrean, que hasta ahora solo se contaban.
        */}
      <section className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">
              Nuestros precios contra el mercado
            </h3>
            <p className="text-[11px] text-brand-300 mt-0.5">
              Cada coche contra la media de los publicados en portales de la misma marca, modelo, año y potencia.
              Solo cuenta con tres comparables o más: con uno, la «media del mercado» es el capricho de otro vendedor.
            </p>
          </div>
          <button type="button" onClick={recalcula} disabled={calculando}
            className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50 disabled:opacity-60 whitespace-nowrap">
            {calculando ? 'Calculando…' : mercado ? 'Recalcular' : 'Calcular'}
          </button>
        </div>

        {!mercado ? (
          <p className="text-sm text-brand-300">
            Sin calcular todavía. Tarda unos ocho segundos: recorre los 2,5 GB de anuncios rastreados.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Diferencia media</p>
                <p className={'mt-1 font-display text-[24px] leading-none font-extrabold tabular-nums ' +
                  (Number(mercado.valor.diferencia_media) > 0 ? 'text-red-600' : 'text-emerald-700')}>
                  {Number(mercado.valor.diferencia_media) > 0 ? '+' : ''}{euros(Math.abs(Number(mercado.valor.diferencia_media)))}
                </p>
                <p className="mt-1 text-[11px] text-brand-300">
                  {Number(mercado.valor.pct_medio) > 0 ? '+' : ''}{Number(mercado.valor.pct_medio).toLocaleString('es-ES')} % sobre el mercado
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Por encima</p>
                <p className="mt-1 font-display text-[24px] leading-none font-extrabold tabular-nums text-brand-600">
                  {num(mercado.valor.por_encima)}
                </p>
                <p className="mt-1 text-[11px] text-brand-300">de {num(mercado.valor.comparables)} comparables</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Sin comparable</p>
                <p className="mt-1 font-display text-[24px] leading-none font-extrabold tabular-nums text-brand-400">
                  {num(mercado.valor.publicados - mercado.valor.comparables)}
                </p>
                <p className="mt-1 text-[11px] text-brand-300">no hay tres iguales en portales, o falta la potencia</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Calculado</p>
                <p className="mt-1 text-[13px] font-semibold text-brand-500">
                  {new Date(mercado.cuando).toLocaleString('es-ES',
                    { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className={'mt-1 text-[11px] ' + (mercado.horas >= 24 ? 'text-acento-texto font-semibold' : 'text-brand-300')}>
                  {mercado.horas < 1 ? 'hace un momento'
                    : mercado.horas >= 24 ? `hace ${Math.round(mercado.horas / 24)} días · conviene recalcular`
                    : `hace ${Math.round(mercado.horas)} h`}
                </p>
              </div>
            </div>

            {mercado.valor.los_mas_caros.length > 0 && (
              <div className="mt-5 pt-4 border-t border-brand-100">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-300 mb-2">
                  Los más caros contra su mercado
                </h4>
                <div className="overflow-x-auto"><table className="erp-table">
                  <thead><tr>
                    <th>Coche</th><th>Nuestro precio</th><th>Media del mercado</th>
                    <th>Comparables</th><th>Diferencia</th>
                  </tr></thead>
                  <tbody>
                    {mercado.valor.los_mas_caros.map((c) => (
                      <tr key={c.title + c.price}>
                        <td className="text-sm text-brand-500 max-w-[280px] truncate" title={c.title}>{c.title}</td>
                        <td className="text-sm text-brand-500 tabular-nums">{euros(c.price)}</td>
                        <td className="text-sm text-brand-400 tabular-nums">{euros(c.medio)}</td>
                        <td className="text-sm text-brand-300 tabular-nums">{c.cuantos}</td>
                        <td className="text-sm font-semibold text-red-600 tabular-nums whitespace-nowrap">
                          +{euros(c.diferencia)} · {Number(c.pct).toLocaleString('es-ES')} %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
