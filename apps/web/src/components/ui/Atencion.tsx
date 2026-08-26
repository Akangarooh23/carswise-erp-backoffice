import { Link } from 'react-router-dom';
import Icono, { type NombreIcono } from './Icono.js';

/**
 * Lo que necesita que alguien haga algo, arriba del todo.
 *
 * El panel tenia diecinueve tarjetas y catorce a cero, todas con el mismo peso
 * visual: «Leads pendientes: 2» —lo unico accionable— se veia igual que «Plan
 * Premium: 0». Un panel que reparte silencio a partes iguales no dice por donde
 * empezar el dia, que es justo para lo que sirve.
 *
 * Aqui solo entra lo que tiene algo pendiente. Si no hay nada, se dice, que
 * tambien es informacion: no es lo mismo «no hay trabajo» que «no lo hemos
 * cargado».
 */

export interface Aviso {
  etiqueta: string;
  valor: number;
  a: string;
  icono: NombreIcono;
  /** urgente pinta en rojo; espera, en ambar. */
  tono?: 'urgente' | 'espera';
}

const TONOS = {
  urgente: 'border-red-200 bg-red-50 hover:border-red-300 text-red-700',
  espera:  'border-acento bg-acento-tenue hover:border-acento-oscuro text-acento-texto',
};

export default function Atencion({ avisos }: { avisos: Aviso[] }) {
  const pendientes = avisos.filter((a) => a.valor > 0);

  if (!pendientes.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-white px-4 py-3">
        <span className="text-emerald-600"><Icono nombre="comprobado" tam={18} /></span>
        <p className="text-sm text-brand-400">
          Todo al día. No hay nada esperando a nadie ahora mismo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-2.5">
        Necesita tu atención
      </h2>
      <div className="flex flex-wrap gap-3">
        {pendientes.map((a) => (
          <Link
            key={a.etiqueta}
            to={a.a}
            className={
              'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ' +
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento ' +
              TONOS[a.tono ?? 'espera']
            }
          >
            <Icono nombre={a.icono} tam={20} className="shrink-0" />
            <span className="text-2xl font-extrabold leading-none tabular-nums">{a.valor}</span>
            <span className="text-[13px] font-semibold leading-tight max-w-[15ch]">{a.etiqueta}</span>
            <span className="text-current opacity-40 group-hover:opacity-100 transition-opacity">
              <Icono nombre="salir" tam={15} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
