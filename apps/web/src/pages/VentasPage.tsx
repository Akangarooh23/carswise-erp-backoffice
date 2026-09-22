import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Numero } from '../components/Numero.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';

/**
 * Las ventas en curso, todas juntas.
 *
 * Cada venta ya se trabajaba en la ficha de su coche, que es donde están los
 * datos con los que se decide y donde siguen los botones. Lo que no había era
 * dónde verlas: para saber si alguna esperaba algo nuestro había que ir coche
 * por coche, y una venta parada no avisa sola.
 *
 * Las tres pestañas son los tres pasos en que una venta puede estar esperando,
 * y cada una dice qué toca hacer. Se ordenan por antigüedad: arriba lo que
 * lleva más tiempo parado, que es el orden en que duele.
 */

interface Venta {
  id: string;
  numero?: string;
  vehicle_id: string;
  paso: 'financiacion_en_estudio' | 'financiacion_denegada' | 'esperando_ingreso' | null;
  que_toca: string;
  iniciada_at: string | null;
  dias: number | null;
  coche: string;
  matricula: string;
  comprador: string;
  comprador_email: string;
  comprador_telefono: string;
  vendedor: string;
  precio: number | null;
  financia: boolean;
  financiacion_estado: string | null;
  financiacion_entidad: string;
  financiacion_importe: number | null;
}

interface Cuenta {
  todas: number;
  financiacion_en_estudio: number;
  financiacion_denegada: number;
  esperando_ingreso: number;
}

const euros = (n: number | null) =>
  n ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '–';

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';

/* El mismo semáforo que la ficha del coche: no hay un cuarto esquema de color. */
const TONO: Record<string, string> = {
  financiacion_en_estudio: 'bg-amber-50 text-amber-800 border-amber-200',
  financiacion_denegada: 'bg-red-50 text-red-700 border-red-200',
  esperando_ingreso: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const NOMBRE: Record<string, string> = {
  financiacion_en_estudio: 'Financiación en estudio',
  financiacion_denegada: 'Financiación denegada',
  esperando_ingreso: 'Esperando el ingreso',
};

const PESTANAS: { clave: keyof Cuenta; texto: string }[] = [
  { clave: 'todas', texto: 'Todas' },
  { clave: 'financiacion_denegada', texto: 'Financiación denegada' },
  { clave: 'financiacion_en_estudio', texto: 'Financiación en estudio' },
  { clave: 'esperando_ingreso', texto: 'Esperando el ingreso' },
];

export default function VentasPage() {
  const [filas, setFilas] = useState<Venta[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta>({ todas: 0, financiacion_en_estudio: 0, financiacion_denegada: 0, esperando_ingreso: 0 });
  const [pestana, setPestana] = useState<keyof Cuenta>('todas');
  const [busca, setBusca] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const cargar = () => {
      setCargando(true);
      const q = new URLSearchParams();
      if (pestana !== 'todas') q.set('paso', pestana);
      if (busca) q.set('q', busca);
      api.get<Venta[]>(`/ventas?${q}`)
        .then((r) => {
          if (!r.ok) { setError(r.error || 'No se ha podido cargar'); return; }
          setError('');
          setFilas(r.data);
          const meta = (r as unknown as { meta?: { cuenta?: Cuenta } }).meta;
          if (meta?.cuenta) setCuenta(meta.cuenta);
        })
        .catch(() => setError('Error de conexión'))
        .finally(() => setCargando(false));
    };
    const t = setTimeout(cargar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [pestana, busca]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas en curso"
        subtitle="Coches reservados para un comprador: en qué paso está cada uno y qué falta"
      />

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700" role="alert">
          <Icono nombre="aviso" tam={16} /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setPestana(p.clave)}
            aria-pressed={pestana === p.clave}
            className={`h-9 rounded-lg border px-3 text-[13px] font-semibold ${
              pestana === p.clave
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-brand-200 bg-white text-brand-500 hover:border-brand-300'
            }`}
          >
            {p.texto}
            {cuenta[p.clave] > 0 && <span className="ml-1.5 opacity-70">{cuenta[p.clave]}</span>}
          </button>
        ))}
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Comprador, matrícula o coche…"
          aria-label="Buscar una venta"
          className="h-9 w-full max-w-xs rounded-lg border border-brand-200 bg-white px-3 text-sm
                     placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-acento"
        />
      </div>

      {cargando ? (
        <p className="text-brand-300 text-sm">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center">
          <p className="text-brand-500 font-semibold mb-1">Ninguna venta esperando</p>
          <p className="text-[13px] text-brand-300 max-w-lg mx-auto">
            Una venta entra aquí cuando el comprador dice «quiero comprarlo» en el correo que se le
            manda después de la visita. Hasta entonces el coche sigue a la venta.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-white overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Espera</th>
                <th>Coche</th>
                <th>Comprador</th>
                <th>Vendedor</th>
                <th>Precio</th>
                <th>Paso</th>
                <th>Qué toca</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  {/*
                    Lo que lleva esperando, con el mismo semáforo que las colas:
                    a partir de tres días ámbar, de siete rojo. Una venta parada
                    una semana es un cliente que ya no se fía.
                  */}
                  <td className="num">
                    <span
                      className={
                        f.dias != null && f.dias >= 7 ? 'font-bold text-red-700'
                          : f.dias != null && f.dias >= 3 ? 'font-semibold text-amber-700'
                            : 'text-brand-400'
                      }
                    >
                      {f.dias == null ? '–' : f.dias === 0 ? 'hoy' : `${f.dias} d`}
                    </span>
                    <span className="block text-[11px] text-brand-300">{fecha(f.iniciada_at)}</span>
                  </td>
                  <td>
                    <span className="font-semibold">{f.coche || '–'}</span>
                    {f.matricula && <span className="block text-[11px] text-brand-300">{f.matricula}</span>}
                    {/* El número del encargo: lo que se dice al hablar de esta venta. */}
                    <span className="block"><Numero valor={f.numero} /></span>
                  </td>
                  <td>
                    {f.comprador || '–'}
                    {f.comprador_telefono && (
                      <span className="block text-[11px] text-brand-300">{f.comprador_telefono}</span>
                    )}
                  </td>
                  <td>{f.vendedor || '–'}</td>
                  <td className="num">
                    {euros(f.precio)}
                    {f.financia && (
                      <span className="block text-[11px] text-brand-300">
                        {f.financiacion_entidad || 'financia'}
                        {f.financiacion_importe ? ` · ${euros(f.financiacion_importe)}` : ''}
                      </span>
                    )}
                  </td>
                  <td>
                    {f.paso && (
                      <span className={`inline-block rounded-md border px-2 py-0.5 text-[12px] font-semibold ${TONO[f.paso]}`}>
                        {NOMBRE[f.paso]}
                      </span>
                    )}
                  </td>
                  <td className="celda-libre text-[12px] text-brand-400">{f.que_toca}</td>
                  <td>
                    {/*
                      Se entra a la ficha del coche, que es donde están los
                      botones. Esta pantalla enseña lo que hay; decidir se hace
                      donde están los datos con los que se decide.
                    */}
                    <Link
                      to={`/idcars/${f.vehicle_id}`}
                      className="text-[13px] font-semibold text-acento-oscuro hover:underline"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
