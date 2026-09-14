import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { StatCard } from '../components/ui/Card.js';
import Icono from '../components/ui/Icono.js';

/**
 * Los portales, que no son nuestro escaparate.
 *
 * Estaban dentro de Marketplace y son otra cosa: 800.000 anuncios de otros que
 * se rastrean para saber a qué precio está el mercado. Ni se venden ni se
 * visitan. Al lado de los 4.472 coches nuestros, la suma no contestaba ninguna
 * pregunta: ni «cuánto stock tengo» ni «cómo está el mercado».
 *
 * Lo que se mira aquí es **si el dato sigue vivo**. Un portal con 133.848
 * anuncios y ninguno inactivo no es un portal sano: es uno que nadie ha vuelto
 * a repasar, porque los coches se venden y en algún momento tienen que caerse.
 * Por eso la última fecha va al lado del número y no en otra pantalla.
 */

interface Portal {
  portal: string;
  total: number;
  activos: number;
  inactivos: number;
  alemanas: number;
  precio_medio: string | number | null;
  ultima: string | null;
}

interface Datos {
  portales: Portal[];
  leads: { portal: string; n: number }[];
}

const num = (n: number) => (n ?? 0).toLocaleString('es-ES');
const euros = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

function elDia(v: string | null): string {
  if (!v) return '–';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Cuántos días hace. Null si no hay fecha. */
function diasDesde(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/**
 * Un anuncio nuestro que sigue puesto en un portal con el coche ya vendido.
 *
 * No tiene nada que ver con los 800.000 de arriba: aquéllos son de otros y se
 * rastrean para saber precios; éste es nuestro, con nuestro teléfono debajo.
 */
interface PorRetirar {
  id: string;
  portal: string;
  url: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
}

export default function PortalesPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState('');
  const [porRetirar, setPorRetirar] = useState<PorRetirar[]>([]);
  const [retirando, setRetirando] = useState<string | null>(null);

  function cargaPorRetirar() {
    api.get<PorRetirar[]>('/anuncios-portal/por-retirar')
      .then((r) => { if (r.ok) setPorRetirar(r.data || []); })
      .catch(() => { /* el análisis de portales sirve igual */ });
  }

  useEffect(() => {
    api.get<Datos>('/portales/analisis')
      .then((r) => { if (r.ok) setDatos(r.data); else setFallo('No se pudo cargar el análisis'); })
      .catch(() => setFallo('Error de conexión'));
    cargaPorRetirar();
  }, []);

  /**
   * Se apunta que ya se ha quitado.
   *
   * Solo apaga el aviso: quitarlo de verdad es entrar al portal, y por eso el
   * enlace va delante del botón. Marcarlo sin haberlo quitado deja el anuncio
   * vivo y sin nada que lo recuerde, que es peor que no tener el aviso.
   */
  async function retira(id: string) {
    setRetirando(id);
    const r = await api.post(`/anuncios-portal/${id}/retirar`, {});
    setRetirando(null);
    if (!r.ok) { setFallo('No se ha podido apuntar que está quitado'); return; }
    cargaPorRetirar();
  }

  if (fallo)  return <div className="text-red-500 text-sm pt-4">{fallo}</div>;
  if (!datos) return <div className="text-brand-300 text-sm pt-4">Cargando portales…</div>;

  const { portales } = datos;
  const leadsPorPortal = new Map(datos.leads.map((l) => [l.portal, l.n]));

  const total     = portales.reduce((n, p) => n + Number(p.total), 0);
  const activos   = portales.reduce((n, p) => n + Number(p.activos), 0);
  const inactivos = portales.reduce((n, p) => n + Number(p.inactivos), 0);
  const alemanas  = portales.reduce((n, p) => n + Number(p.alemanas), 0);

  // Un portal que lleva más de una semana sin traer nada está parado. No es un
  // fallo del portal: es que nadie ha vuelto a pasar por él.
  const parados = portales.filter((p) => (diasDesde(p.ultima) ?? 999) > 7);

  return (
    <div className="space-y-6">
      <PageHeader title="Portales"
        subtitle="Los anuncios que se rastrean para saber a qué precio está el mercado. No son nuestro stock." />

      {/*
        * Nuestros anuncios que hay que quitar de los portales.
        *
        * Es a donde manda la línea de Pendientes, y hasta ahora aquí no había
        * nada: el aviso decía «3 anuncios que hay que quitar» y te dejaba en
        * una pantalla de precios de mercado. Retirarlos se podía, pero solo
        * entrando coche a coche desde su encargo — o sea, sabiendo ya cuáles
        * son, que es justo lo que el aviso venía a decirte.
        *
        * Es el caso del Kia Sorento: vendido, y su anuncio vivo con nuestro
        * teléfono debajo.
        */}
      {porRetirar.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50">
            <h2 className="text-sm font-bold text-amber-900">
              {porRetirar.length === 1
                ? 'Un anuncio nuestro que hay que quitar'
                : `${porRetirar.length} anuncios nuestros que hay que quitar`}
            </h2>
            <p className="text-[12.5px] text-amber-800/85 mt-0.5 max-w-3xl">
              Esos coches ya no están a la venta en nuestro escaparate, así que tampoco pueden
              estarlo fuera. El teléfono de esos anuncios es el nuestro: las llamadas por un coche
              vendido las cogemos nosotros.
            </p>
          </div>
          <ul className="divide-y divide-brand-100">
            {porRetirar.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-brand-600 text-sm truncate">
                    {[a.brand, a.model].filter(Boolean).join(' ') || 'Un coche'}
                    {a.plate ? ` · ${a.plate}` : ''}
                  </div>
                  <div className="text-xs text-brand-400">{a.portal}</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {/*
                    * El enlace del anuncio va delante del botón: primero se
                    * entra al portal y se borra, y solo después se marca aquí.
                    * Al revés se apaga el aviso de algo que sigue puesto.
                    */}
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer"
                       className="px-3 py-1.5 text-xs font-bold text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50">
                      Abrir el anuncio
                    </a>
                  )}
                  <button type="button" disabled={retirando === a.id} onClick={() => retira(a.id)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60">
                    {retirando === a.id ? 'Apuntando…' : 'Ya lo he quitado'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parados.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-acento bg-acento-tenue px-4 py-3">
          <span className="text-acento-texto mt-0.5"><Icono nombre="aviso" tam={18} /></span>
          <p className="text-sm text-acento-texto">
            <strong>{parados.length === 1 ? 'Un portal lleva' : `${parados.length} portales llevan`} más de una semana
            sin traer nada</strong>: {parados.map((p) => p.portal).join(', ')}. Mientras tanto, sus precios son los de
            entonces y el mercado que se compara con ellos ya no es este.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Anuncios rastreados" value={num(total)}
                  sub={`${portales.length} plataformas`} icon="tabla" color="neutro" />
        <StatCard label="Vivos" value={num(activos)}
                  sub={total > 0 ? `${Math.round((activos / total) * 100)} % del total` : undefined}
                  icon="comprobado" color="bien" />
        <StatCard label="Caídos" value={num(inactivos)}
                  sub="vendidos o retirados" icon="historial" color="neutro" />
        <StatCard label="Alemanes" value={num(alemanas)}
                  sub="el caladero de importación" icon="coche" color="neutro" a="/importaciones" />
      </div>

      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand-100">
          <h3 className="font-semibold text-brand-600 text-sm">Plataforma a plataforma</h3>
          <Link to="/marketplace" className="text-acento-texto hover:text-brand-600 text-xs font-medium">
            Ver el marketplace →
          </Link>
        </div>
        <div className="overflow-x-auto"><table className="erp-table">
          <thead><tr>
            <th>Portal</th><th>Anuncios</th><th>Vivos</th><th>Caídos</th>
            <th>Precio medio</th><th>Alemanes</th><th>Leads</th><th>Última vez</th>
          </tr></thead>
          <tbody>
            {portales.map((p) => {
              const t = Number(p.total) || 0;
              const vivos = Number(p.activos) || 0;
              const dias = diasDesde(p.ultima);
              return (
                <tr key={p.portal}>
                  <td className="text-sm font-semibold text-brand-500">{p.portal}</td>
                  <td className="text-sm text-brand-500 tabular-nums">{num(t)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-brand-500 tabular-nums w-16">{num(vivos)}</span>
                      {/* La proporción de vivos dice si el portal se repasa: uno
                          con todo vivo es uno que nadie ha vuelto a mirar. */}
                      <span className="h-1.5 w-16 rounded-full bg-brand-50 overflow-hidden shrink-0">
                        <span className="block h-full rounded-full bg-brand-400"
                              style={{ width: `${t > 0 ? Math.round((vivos / t) * 100) : 0}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="text-sm text-brand-300 tabular-nums">{num(Number(p.inactivos) || 0)}</td>
                  <td className="text-sm text-brand-500 tabular-nums">{euros(p.precio_medio)}</td>
                  <td className="text-sm text-brand-400 tabular-nums">{Number(p.alemanas) ? num(Number(p.alemanas)) : '–'}</td>
                  <td className="text-sm text-brand-400 tabular-nums">{leadsPorPortal.get(p.portal) ?? '–'}</td>
                  <td className={`text-sm tabular-nums ${dias !== null && dias > 7 ? 'text-acento-texto font-semibold' : 'text-brand-400'}`}>
                    {elDia(p.ultima)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
