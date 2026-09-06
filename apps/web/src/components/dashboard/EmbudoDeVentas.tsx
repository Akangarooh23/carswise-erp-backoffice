import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono from '../ui/Icono.js';
import type { Embudo as Datos, Tramo } from '../../types/index.js';

/**
 * Cuánta gente llega, cuánta avanza y dónde se cae.
 *
 * El panel decía «11 leads» sin decir de cuántos vienen, y esa es la mitad que
 * sirve: once de doce visitas es un negocio y once de cuatro mil es otro, y el
 * arreglo de cada caso es el contrario —traer más gente, o dejar de perderla—.
 *
 * **Se cuentan personas, no visitas.** Alguien que recarga la portada catorce
 * veces son catorce eventos y una persona. Por eventos este embudo sale
 * 1.511 → 437 → 139 → 22; por personas, 400 → 8 → 3 → 3. Solo la segunda dice
 * dónde invertir.
 *
 * Y arriba del todo, en una frase, dónde se pierde más gente: cuatro
 * porcentajes obligan a comparar cuatro números para sacar la única conclusión
 * que importa, y eso lo puede hacer la pantalla.
 */

const num = (n: unknown) => (Number(n) || 0).toLocaleString('es-ES');

const TRAMOS: { clave: Tramo; nombre: string }[] = [
  { clave: 'mes', nombre: 'Este mes' },
  { clave: 'trimestre', nombre: 'Este trimestre' },
  { clave: 'anio', nombre: 'Este año' },
];

export default function EmbudoDeVentas() {
  const [tramo, setTramo] = useState<Tramo>('anio');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    api.get<Datos>(`/dashboard/embudo?tramo=${tramo}`)
      .then((r) => { if (vigente && r.ok) setDatos(r.data); })
      .catch(() => {})
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [tramo]);

  if (!datos) return null;

  const { escalones, cuelloDeBotella, origenes } = datos;
  const arriba = escalones[0]?.personas ?? 0;

  return (
    <section className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300">
          Embudo
          <span className="ml-2 normal-case font-semibold text-brand-400">
            · personas, no visitas · {datos.periodo.etiqueta}
          </span>
        </h2>
        <div className="flex rounded-lg border border-brand-200 bg-white p-0.5">
          {TRAMOS.map((t) => (
            <button key={t.clave} type="button" onClick={() => setTramo(t.clave)}
                    aria-pressed={tramo === t.clave}
                    className={'px-3 py-1 text-xs font-semibold rounded-md transition-colors ' +
                      (tramo === t.clave ? 'bg-brand-600 text-white' : 'text-brand-400 hover:text-brand-600')}>
              {t.nombre}
            </button>
          ))}
        </div>
      </div>

      {!arriba ? (
        <div className="rounded-xl border border-brand-200 bg-white px-5 py-8 text-center">
          <p className="text-sm text-brand-300">No ha entrado nadie en este periodo.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
          {cuelloDeBotella && (
            // La conclusión primero. Un embudo con cuatro porcentajes obliga a
            // sacarla a mano cada vez que se mira.
            <p className="mb-4 flex items-start gap-2 text-[13px] text-acento-texto">
              <span className="mt-0.5 shrink-0"><Icono nombre="aviso" tam={15} /></span>
              <span>
                Donde más gente se pierde es en <strong>{cuelloDeBotella.nombre.toLowerCase()}</strong>:{' '}
                se caen <strong className="tabular-nums">{num(cuelloDeBotella.seCaen)}</strong> de{' '}
                {num(cuelloDeBotella.seCaen + cuelloDeBotella.personas)}.
              </span>
            </p>
          )}

          <ol className="space-y-3 list-none p-0 m-0">
            {escalones.map((e) => (
              <li key={e.clave}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[13px] font-semibold text-brand-500">
                    {e.nombre}
                    <span className="ml-2 font-normal text-brand-300">{e.queEs}</span>
                  </span>
                  <span className="text-[13px] whitespace-nowrap">
                    <strong className="font-bold text-brand-600 tabular-nums">{num(e.personas)}</strong>
                    {e.desdeElAnterior !== null && (
                      <span className={'ml-2 tabular-nums ' +
                        (e.desdeElAnterior < 20 ? 'font-semibold text-red-600' : 'text-brand-400')}>
                        {e.desdeElAnterior.toLocaleString('es-ES')} %
                      </span>
                    )}
                  </span>
                </div>
                {/* La barra es contra el primer escalón, no contra el anterior:
                    así se ve la forma del embudo entero de un vistazo. */}
                <div className="h-3 rounded-full bg-brand-50 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-600 transition-all"
                       style={{ width: `${Math.max((e.personas / arriba) * 100, 0.6)}%` }} />
                </div>
                {e.seCaen > 0 && (
                  <p className="mt-1 text-[11px] text-brand-300">
                    se caen {num(e.seCaen)} aquí
                  </p>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-4 pt-4 border-t border-brand-100 text-[11px] text-brand-300">
            Cada persona cuenta en el paso más hondo al que llegó. Alguien que abre veinte veces la
            portada es una persona, no veinte visitas.
          </p>
        </div>
      )}

      {origenes.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-brand-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-300">De dónde llega la gente</h3>
            <Link to="/marketing-analytics" className="text-acento-texto hover:text-brand-600 text-xs font-medium">
              Analítica UTM →
            </Link>
          </div>
          <ul className="space-y-2.5 list-none p-0 m-0">
            {origenes.map((o) => (
              <li key={o.origen} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-brand-500 truncate">{o.origen}</span>
                <span className="flex items-center gap-3 shrink-0 text-[13px] tabular-nums">
                  <span className="text-brand-500">{num(o.personas)}</span>
                  <span className={o.solicitudes > 0 ? 'font-semibold text-brand-600' : 'text-brand-300'}>
                    {o.solicitudes > 0 ? `${num(o.solicitudes)} pidieron` : '– ninguna'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
