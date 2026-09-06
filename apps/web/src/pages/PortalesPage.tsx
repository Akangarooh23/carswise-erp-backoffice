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

export default function PortalesPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    api.get<Datos>('/portales/analisis')
      .then((r) => { if (r.ok) setDatos(r.data); else setFallo('No se pudo cargar el análisis'); })
      .catch(() => setFallo('Error de conexión'));
  }, []);

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
