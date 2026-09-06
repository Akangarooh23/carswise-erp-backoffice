import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono, { type NombreIcono } from '../ui/Icono.js';

/**
 * Todo lo que espera a alguien, en un sitio y arriba del todo.
 *
 * Estaba repartido: unas fichas amarillas aquí arriba, dos avisos dentro de la
 * pestaña Financiera, otro en Portales y otro en Comisiones. Repartido así se
 * ve lo de la pestaña en la que estás y lo demás no existe —y justo lo de
 * dentro de una pestaña era lo que cuesta dinero: dos facturas de la UE sin
 * decidir su tipo no dejan salir el 349—.
 *
 * Es una **lista y no fichas sueltas**. Con fichas caben cuatro y el resto se
 * va a una segunda fila que ya no se mira; y en una ficha no cabe decir por qué
 * importa, que es lo que evita tener que preguntarlo. En lista caben nueve, se
 * leen de arriba abajo en el orden que importa, y cada una lleva a su pantalla.
 */

interface Pendiente {
  clave: string;
  etiqueta: string;
  /** En singular: «1 facturas» se lee mal. */
  una: string;
  porque: string;
  n: number;
  a: string;
  icono: string;
  tono: 'urgente' | 'espera';
}

const TONOS = {
  urgente: {
    caja: 'border-red-200 bg-red-50/60 hover:bg-red-50',
    numero: 'text-red-700',
    icono: 'text-red-600',
  },
  espera: {
    caja: 'border-acento bg-acento-tenue/60 hover:bg-acento-tenue',
    numero: 'text-acento-texto',
    icono: 'text-acento-texto',
  },
};

export default function Pendientes() {
  const [lista, setLista] = useState<Pendiente[] | null>(null);

  useEffect(() => {
    api.get<{ pendientes: Pendiente[] }>('/dashboard/pendientes')
      .then((r) => { if (r.ok) setLista(r.data.pendientes); })
      .catch(() => setLista([]));
  }, []);

  if (!lista) return null;

  const total = lista.reduce((s, p) => s + p.n, 0);

  if (!lista.length) {
    return (
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-2.5">Pendientes</h2>
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-white px-4 py-3">
          <span className="text-emerald-600"><Icono nombre="comprobado" tam={18} /></span>
          <p className="text-sm text-brand-400">
            Todo al día. No hay nada esperando a nadie ahora mismo.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-2.5">
        Pendientes
        <span className="ml-2 normal-case font-semibold text-brand-400">
          · {total === 1 ? '1 cosa que hacer' : `${total.toLocaleString('es-ES')} cosas que hacer`}
        </span>
      </h2>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 list-none p-0 m-0">
        {lista.map((p) => {
          const t = TONOS[p.tono] ?? TONOS.espera;
          return (
            <li key={p.clave}>
              <Link to={p.a}
                    className={'group flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors ' +
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento ' + t.caja}>
                <span className={'shrink-0 ' + t.icono}>
                  <Icono nombre={p.icono as NombreIcono} tam={18} />
                </span>
                <span className={'text-2xl font-extrabold leading-none tabular-nums shrink-0 ' + t.numero}>
                  {p.n.toLocaleString('es-ES')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold leading-tight text-brand-600">{p.n === 1 ? p.una : p.etiqueta}</span>
                  {/* El porqué al lado del número: sin él hay que preguntar qué
                      pasa si no se hace, y no se pregunta. */}
                  <span className="block text-[11px] leading-tight text-brand-400 mt-0.5">{p.porque}</span>
                </span>
                <span className="text-brand-300 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                  <Icono nombre="salir" tam={15} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
