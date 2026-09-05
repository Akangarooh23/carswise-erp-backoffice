import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono from '../ui/Icono.js';
import type { Expediente } from '../../lib/expedientes-importacion.js';
import { pasosDeLaImportacion, loQueToca, loQueSeEspera } from '../../lib/pasos-de-la-importacion.js';

/**
 * Los coches que están viniendo, y qué hay que hacer con cada uno.
 *
 * El panel contaba coches. Un número no dice por dónde seguir: para saber si
 * había algo que hacer había que abrir Importaciones y mirar los quince, y
 * lo que pasa entonces es que uno se queda tres semanas parado porque nadie
 * se acordó de que el perito no había contestado.
 *
 * El cálculo no se rehace aquí: sale del mismo sitio que la ficha y que el
 * número rojo del menú. Calculado aparte acabaría diciendo otra cosa del
 * mismo coche, y entonces no se cree ninguno de los dos.
 */

export default function CochesEnMarcha() {
  const [coches, setCoches] = useState<Expediente[] | null>(null);

  useEffect(() => {
    api.get<Expediente[]>('/leads?type=import&limit=100')
      .then((r) => { if (r.ok && Array.isArray(r.data)) setCoches(r.data); })
      .catch(() => setCoches([]));
  }, []);

  if (!coches) return null;

  const enMarcha = coches.filter((x) => x.status !== 'Entregado');

  return (
    <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-brand-100">
        <h3 className="font-semibold text-brand-600 text-sm">Coches en marcha</h3>
        <Link to="/importaciones" className="text-acento-texto hover:text-brand-600 text-xs font-medium">
          Ver importaciones →
        </Link>
      </div>

      {enMarcha.length === 0 ? (
        <p className="text-brand-300 text-sm text-center py-8">
          Ningún coche en camino ahora mismo.
        </p>
      ) : (
        <div className="overflow-x-auto"><table className="erp-table">
          <thead><tr><th>Coche</th><th>Cliente</th><th>Etapa</th><th>Ahora toca</th></tr></thead>
          <tbody>
            {enMarcha.map((x) => {
              const pasos = pasosDeLaImportacion(x);
              const toca  = loQueToca(pasos);
              const espera = loQueSeEspera(pasos);
              return (
                <tr key={x.id}>
                  <td className="text-sm font-medium text-brand-500">{x.title}</td>
                  <td className="text-sm text-brand-400">{x.user_email}</td>
                  <td className="text-sm text-brand-400">{x.status}</td>
                  <td>
                    {toca ? (
                      // Lo que depende de nosotros lleva a su pantalla, que es
                      // donde está el botón: encargar la peritación se hace en
                      // Peritaciones, no aquí.
                      <Link to={toca.donde ?? '/importaciones'}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-acento-texto hover:underline">
                        <Icono nombre="rayo" tam={14} />
                        {toca.titulo}
                      </Link>
                    ) : espera ? (
                      // Y una espera se dice sin urgencia: no hay nada que
                      // pulsar, y pintarla igual que una tarea hace que se
                      // dejen de mirar las dos.
                      <span className="text-sm text-brand-300">
                        {espera.titulo}
                        {espera.dias ? ` · ${espera.dias} d` : ''}
                      </span>
                    ) : (
                      <span className="text-sm text-brand-300">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
