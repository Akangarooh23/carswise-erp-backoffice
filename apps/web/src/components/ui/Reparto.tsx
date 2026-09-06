import { Link } from 'react-router-dom';

/**
 * De dónde viene el dinero, en barras y con la cifra al lado.
 *
 * Un donut con cinco trozos obliga a comparar áreas, que es justo lo que peor
 * se le da al ojo, y hay que buscar cada nombre en una leyenda. Una lista con
 * barras se lee de arriba abajo en el orden que importa, cada nombre está
 * pegado a su barra, y las cifras exactas van al lado en vez de en un globo que
 * hay que provocar con el ratón.
 *
 * Las filas llevan enlace: un número que no lleva a las facturas que lo forman
 * se queda en un número.
 */

export interface Trozo {
  clave: string;
  nombre: string;
  /** Sin IVA. */
  base: number;
  /** Cuántas facturas hay detrás. */
  n: number;
  porcentaje: number;
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export default function Reparto({
  titulo, trozos, tono = 'neutro', a, vacio,
}: {
  titulo: string;
  trozos: readonly Trozo[];
  /** El acento marca los ingresos; el gris, los gastos. */
  tono?: 'acento' | 'neutro';
  /** A dónde lleva cada fila. */
  a?: string;
  /** Qué decir cuando no hay nada, que no es lo mismo que un cero. */
  vacio: string;
}) {
  const relleno = tono === 'acento' ? 'bg-acento' : 'bg-brand-300';

  return (
    <section className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-4">{titulo}</h3>

      {!trozos.length ? (
        <p className="text-sm text-brand-300 py-2">{vacio}</p>
      ) : (
        <ul className="space-y-3.5 list-none p-0 m-0">
          {trozos.map((t) => {
            const fila = (
              <>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[13px] font-semibold text-brand-500 truncate">{t.nombre}</span>
                  <span className="text-[13px] font-bold text-brand-600 tabular-nums whitespace-nowrap">
                    {euros(t.base)}
                    <span className="ml-2 font-medium text-brand-300">{t.porcentaje.toLocaleString('es-ES')} %</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-brand-50 overflow-hidden">
                  <div className={`h-full rounded-full ${relleno}`}
                       style={{ width: `${Math.max(t.porcentaje, 1.5)}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-brand-300">
                  {t.n === 1 ? '1 factura' : `${t.n} facturas`}
                </p>
              </>
            );
            return (
              <li key={t.clave}>
                {a
                  ? <Link to={a} className="block rounded-lg -mx-2 px-2 py-1 hover:bg-brand-50 transition-colors">{fila}</Link>
                  : <div className="py-1">{fila}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
