import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono from '../ui/Icono.js';
import type { AnalisisDelMarketplace, AnalisisDePortales } from '../../types/index.js';

/**
 * El escaparate: lo nuestro y lo de los demás, separados.
 *
 * El panel ponía «Marketplace VO · 4.469 activos · 23.435 € de precio medio» y
 * las dos cifras estaban mal enfocadas. El marketplace son cuatro negocios
 * —ex-renting, concesionario, particulares e importación— y la media de todos
 * ellos no es el precio de ninguno. Y los 800.000 anuncios de los portales, que
 * son de otros y solo sirven para saber a qué precio está el mercado, no
 * estaban en ninguna parte.
 *
 * Los portales se piden **aparte**. Su consulta agrupa 2,5 GB y tarda un
 * segundo largo; metida con el resto, el panel entero espera por ella. Aquí
 * llega cuando llega y mientras tanto no retiene nada.
 */

const num = (n: unknown) => (Number(n) || 0).toLocaleString('es-ES');
const euros = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

function diasDesde(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function Escaparate() {
  const [vo, setVo] = useState<AnalisisDelMarketplace | null>(null);
  const [portales, setPortales] = useState<AnalisisDePortales | null>(null);

  useEffect(() => {
    api.get<AnalisisDelMarketplace>('/marketplace/analisis')
      .then((r) => { if (r.ok) setVo(r.data); }).catch(() => {});
    api.get<AnalisisDePortales>('/portales/analisis')
      .then((r) => { if (r.ok) setPortales(r.data); }).catch(() => {});
  }, []);

  if (!vo) return null;

  const activos = vo.secciones.reduce((n, s) => n + s.activos, 0);
  const conCoches = vo.secciones.filter((s) => s.activos > 0);

  const p = portales?.portales ?? [];
  const anuncios = p.reduce((n, x) => n + Number(x.total), 0);
  const vivos = p.reduce((n, x) => n + Number(x.activos), 0);
  const parados = p.filter((x) => (diasDesde(x.ultima) ?? 999) > 7).length;

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
        Escaparate
        <span className="ml-2 normal-case font-semibold text-brand-400">· lo nuestro y el mercado</span>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link to="/marketplace/analisis"
              className="lg:col-span-2 block rounded-xl border border-brand-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Marketplace</p>
              <p className="mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums text-brand-600">
                {num(activos)}
              </p>
              <p className="mt-1.5 text-[11px] text-brand-300">coches publicados nuestros</p>
            </div>
            <span className="text-[11px] font-medium text-acento-texto">Ver el análisis →</span>
          </div>

          {/* Las cuatro secciones, con las vacías dichas y no escondidas: que
              Concesionario esté a cero contesta «cuánto stock propio tenemos». */}
          <ul className="mt-4 pt-4 border-t border-brand-100 grid grid-cols-2 sm:grid-cols-4 gap-3 list-none p-0">
            {vo.secciones.map((s) => (
              <li key={s.clave}>
                <p className={'font-display text-[17px] leading-none font-extrabold tabular-nums ' +
                  (s.activos > 0 ? 'text-brand-500' : 'text-brand-200')}>{num(s.activos)}</p>
                <p className="mt-1 text-[11px] font-semibold text-brand-400">{s.nombre}</p>
                <p className="text-[11px] text-brand-300 tabular-nums">{euros(s.precioMedio)}</p>
              </li>
            ))}
          </ul>

          {conCoches.length === 1 && (
            <p className="mt-3 text-[11px] text-brand-300">
              Todo el escaparate es {conCoches[0].nombre.toLowerCase()}: las otras tres secciones
              todavía no tienen coches.
            </p>
          )}
        </Link>

        <Link to="/portales"
              className="block rounded-xl border border-brand-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Portales</p>
            <span className="text-[11px] font-medium text-acento-texto">Ver →</span>
          </div>
          {!portales ? (
            <p className="mt-3 text-sm text-brand-300">Contando anuncios…</p>
          ) : (
            <>
              <p className="mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums text-brand-600">
                {num(vivos)}
              </p>
              <p className="mt-1.5 text-[11px] text-brand-300 leading-snug">
                anuncios vivos de {p.length} plataformas · {num(anuncios)} rastreados
              </p>
              <p className="mt-3 pt-3 border-t border-brand-100 text-[11px] text-brand-300 leading-snug">
                No son nuestro stock: son de otros, y sirven para saber a qué precio está el mercado.
              </p>
              {parados > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-acento-texto">
                  <Icono nombre="aviso" tam={13} />
                  {parados === 1 ? '1 plataforma lleva' : `${parados} plataformas llevan`} más de una semana sin repasarse
                </p>
              )}
            </>
          )}
        </Link>
      </div>
    </section>
  );
}
