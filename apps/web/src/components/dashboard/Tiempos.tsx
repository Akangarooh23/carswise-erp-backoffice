import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono from '../ui/Icono.js';

/**
 * Cuánto se tarda en cada cosa.
 *
 * El panel decía cuántos leads hay y cuántos coches se han entregado, pero no
 * cuánto se tarda, que es la mitad de cómo va una operación. «Dos leads
 * pendientes» es un número tranquilo; «dos leads pendientes desde hace tres
 * meses» es otra cosa, y hasta ahora las dos frases eran el mismo dato.
 *
 * **Se enseña la mediana, no la media.** Con cinco leads contestados en 0, 15,
 * 16, 624 y 696 horas, la media son 270 h y no describe ninguno: los dos
 * olvidados de junio arrastran la cifra. La mediana son 16 h, que sí es lo que
 * suele pasar — y el peor va al lado, porque una mediana buena con un caso de
 * ochocientas horas es una mediana buena y un cliente perdido.
 */

interface Tramo {
  tipico: number | null;
  peor: number | null;
  casos: number;
}

interface Datos {
  contestar: Tramo;
  entregar: Tramo;
  sinTocar: { n: number; dias: number | null };
}

/** «0,3 días» y «7 h» son el mismo dato y solo uno se entiende. */
function comoSeDice(dias: number | null): string {
  if (dias === null || !Number.isFinite(dias)) return '–';
  if (dias < 2) {
    const horas = Math.round(dias * 24);
    return horas <= 1 ? 'el mismo día' : `${horas} h`;
  }
  if (dias < 60) return `${Math.round(dias)} días`;
  return `${Math.round(dias / 30)} meses`;
}

function Tarjeta({ titulo, queEs, tramo, enHoras }: {
  titulo: string; queEs: string; tramo: Tramo; enHoras?: boolean;
}) {
  const aDias = (n: number | null) => (n === null ? null : enHoras ? n / 24 : n);

  return (
    <div className="bg-white rounded-xl border border-brand-200 shadow-sm px-5 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">{titulo}</p>
      <p className="mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums text-brand-600">
        {comoSeDice(aDias(tramo.tipico))}
      </p>
      <p className="mt-1.5 text-[11px] text-brand-300 leading-snug">{queEs}</p>
      <dl className="mt-3 pt-3 border-t border-brand-100 space-y-1 text-[12px]">
        <div className="flex justify-between">
          <dt className="text-brand-300">El que más tardó</dt>
          <dd className="font-semibold text-brand-500 tabular-nums">{comoSeDice(aDias(tramo.peor))}</dd>
        </div>
        <div className="flex justify-between">
          {/* Sin esto, una mediana sacada de un caso parece una ley. */}
          <dt className="text-brand-300">De cuántos sale</dt>
          <dd className="font-semibold text-brand-500 tabular-nums">{tramo.casos}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function Tiempos() {
  const [datos, setDatos] = useState<Datos | null>(null);

  useEffect(() => {
    api.get<Datos>('/dashboard/tiempos')
      .then((r) => { if (r.ok) setDatos(r.data); })
      .catch(() => {});
  }, []);

  if (!datos) return null;
  const { contestar, entregar, sinTocar } = datos;
  if (!contestar.casos && !entregar.casos && !sinTocar.n) return null;

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
        Tiempos
        <span className="ml-2 normal-case font-semibold text-brand-400">· lo que suele tardar cada cosa</span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta titulo="En contestar un lead" enHoras tramo={contestar}
                 queEs="desde que entra hasta que alguien lo toca" />
        <Tarjeta titulo="De solicitud a entrega" tramo={entregar}
                 queEs="una importación entera, de principio a fin" />

        {/*
          * El que cambia la lectura de los otros dos: la mediana puede ser de
          * dieciséis horas y haber dos clientes esperando desde junio.
          */}
        <Link to="/leads"
              className={'block rounded-xl border px-5 py-4 transition-colors ' +
                (sinTocar.n > 0
                  ? 'border-red-200 bg-red-50/60 hover:bg-red-50'
                  : 'border-brand-200 bg-white hover:bg-brand-50')}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Esperando ahora mismo</p>
          <p className={'mt-1.5 font-display text-[27px] leading-none font-extrabold tabular-nums ' +
            (sinTocar.n > 0 ? 'text-red-700' : 'text-brand-600')}>
            {sinTocar.n}
          </p>
          <p className="mt-1.5 text-[11px] text-brand-300 leading-snug">
            {sinTocar.n === 1 ? 'lead que nadie ha tocado' : 'leads que nadie ha tocado'}
          </p>
          {sinTocar.dias !== null && sinTocar.n > 0 && (
            <p className="mt-3 pt-3 border-t border-brand-100 flex items-center gap-1.5 text-[12px] font-semibold text-red-700">
              <Icono nombre="aviso" tam={14} />
              El más viejo lleva {comoSeDice(sinTocar.dias)}
            </p>
          )}
        </Link>
      </div>
    </section>
  );
}
