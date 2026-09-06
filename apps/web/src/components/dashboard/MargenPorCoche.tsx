import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono from '../ui/Icono.js';

/**
 * Cuánto deja cada coche.
 *
 * El total del mes dice si el mes fue bueno. Lo que dice si el negocio
 * **funciona** es cuánto deja de media una importación: con quince coches, la
 * pregunta «¿cuál nos ha costado dinero?» no se puede contestar mirando un
 * agregado, y uno que pierde 400 € desaparece dentro de un número verde.
 *
 * La media es **solo de los entregados**. Un coche a medio camino tiene el fee
 * cobrado y la mitad de las facturas sin llegar: su margen parece enorme y
 * contesta mal a la pregunta.
 *
 * Y lo que no se ha podido atar a ningún coche se dice arriba. Un gasto
 * huérfano no baja el margen de nadie, así que el número sale mejor de lo que
 * es; con los huérfanos al lado, la cifra se puede usar.
 */

interface Coche {
  id: string;
  vehiculo: string | null;
  estado: string | null;
  ingreso: number;
  gasto: number;
  margen: number;
  porcentaje: number | null;
  facturas: number;
  comprometido: number;
}

interface Datos {
  periodo: string;
  coches: Coche[];
  medioEntregados: number | null;
  cuantosEntregados: number;
  sinAtribuir: { n: number; base: number };
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export default function MargenPorCoche() {
  const [datos, setDatos] = useState<Datos | null>(null);

  useEffect(() => {
    api.get<Datos>('/dashboard/margenes')
      .then((r) => { if (r.ok) setDatos(r.data); })
      .catch(() => {});
  }, []);

  if (!datos || !datos.coches.length) return null;

  // Los que no tienen ni un euro atribuido van al final: son expedientes recién
  // abiertos y ocupan sitio arriba sin decir nada.
  const conDinero = datos.coches.filter((c) => c.facturas > 0);
  const vacios = datos.coches.length - conDinero.length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300">
          Margen por coche
          <span className="ml-2 normal-case font-semibold text-brand-400">· {datos.periodo}</span>
        </h2>
        {datos.medioEntregados !== null && (
          <p className="text-[12px] text-brand-400">
            De media, una importación entregada deja{' '}
            <strong className="text-brand-600 tabular-nums">{euros(datos.medioEntregados)}</strong>
            <span className="text-brand-300"> · {datos.cuantosEntregados === 1
              ? 'de una entregada' : `de ${datos.cuantosEntregados} entregadas`}</span>
          </p>
        )}
      </div>

      {datos.sinAtribuir.n > 0 && (
        // Sin decirlo, el margen sale mejor de lo que es y nada avisa.
        <Link to="/provider-billing"
              className="mb-3 flex items-start gap-2 rounded-lg border border-acento bg-acento-tenue px-3 py-2 text-[12px] font-semibold text-acento-texto hover:border-acento-oscuro">
          <span className="mt-0.5 shrink-0"><Icono nombre="aviso" tam={15} /></span>
          <span>
            {datos.sinAtribuir.n === 1
              ? `Una factura de ${euros(datos.sinAtribuir.base)} no está atada a ningún coche`
              : `${datos.sinAtribuir.n} facturas por ${euros(datos.sinAtribuir.base)} no están atadas a ningún coche`}
            {' '}— ese gasto no baja el margen de nadie, así que estos números salen mejores de lo que son.
          </span>
        </Link>
      )}

      <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto"><table className="erp-table">
          <thead><tr>
            <th>Coche</th><th>Estado</th><th>Ingreso</th><th>Gasto</th>
            <th>Margen</th><th>%</th><th>Facturas</th>
          </tr></thead>
          <tbody>
            {conDinero.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[260px] truncate" title={c.vehiculo ?? ''}>
                  <Link to={`/importaciones?coche=${c.id}`}
                        className="text-sm font-medium text-acento-texto hover:underline">
                    {c.vehiculo || '–'}
                  </Link>
                </td>
                <td className="text-sm text-brand-400">{c.estado || '–'}</td>
                <td className="text-sm text-brand-500 tabular-nums">{euros(c.ingreso)}</td>
                <td className="text-sm text-brand-400 tabular-nums">
                  {euros(c.gasto)}
                  {c.comprometido > 0 && (
                    <span className="ml-1.5 text-[11px] text-acento-texto">
                      +{euros(c.comprometido)} por llegar
                    </span>
                  )}
                </td>
                <td className={'text-sm font-bold tabular-nums ' +
                  (c.margen > 0 ? 'text-emerald-700' : c.margen < 0 ? 'text-red-600' : 'text-brand-400')}>
                  {euros(c.margen)}
                </td>
                <td className="text-sm text-brand-400 tabular-nums">
                  {c.porcentaje === null ? '–' : `${c.porcentaje.toLocaleString('es-ES')} %`}
                </td>
                <td className="text-sm text-brand-300 tabular-nums">{c.facturas}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {vacios > 0 && (
          <p className="px-5 py-2.5 border-t border-brand-100 text-[11px] text-brand-300">
            {vacios === 1
              ? 'Y un expediente más sin ninguna factura todavía.'
              : `Y ${vacios} expedientes más sin ninguna factura todavía.`}
          </p>
        )}
      </div>
    </section>
  );
}
