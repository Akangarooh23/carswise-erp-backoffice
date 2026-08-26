import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono, { type NombreIcono } from '../components/ui/Icono.js';

/**
 * Las cuatro colas de trabajo, en una sola pantalla.
 *
 * Servicios, visitas, informes de estado y citas son el mismo trabajo: mirar
 * qué hay pendiente, ordenarlo por lo que lleva más tiempo esperando, y
 * moverlo de estado. Cuatro pantallas casi iguales serían cuatro sitios donde
 * arreglar el mismo fallo.
 *
 * Lo que sí cambia por cola son las columnas, así que van en una tabla de
 * configuración y el resto es común.
 *
 * Por defecto se enseña solo lo abierto. Quien entra aquí viene a trabajar, no
 * a leer el archivo: lo cerrado está a un clic.
 */

type Fila = Record<string, unknown>;

interface Columna {
  clave: string;
  titulo: string;
  ancho?: string;
  pinta?: (f: Fila) => string;
}

interface Config {
  titulo: string;
  subtitulo: string;
  icono: NombreIcono;
  columnas: Columna[];
  /** Qué se enseña cuando no hay nada. Dice también por qué puede estar vacía. */
  vacia: string;
}

const ETIQUETA_SERVICIO: Record<string, string> = {
  itv: 'ITV', aceite: 'Cambio de aceite y filtros', revision: 'Revisión general',
  frenos: 'Revisión de frenos', neumaticos: 'Neumáticos', cristales: 'Cristales y parabrisas',
  diagnosis: 'Diagnosis electrónica', carroceria: 'Carrocería y pintura', otro: 'Otro servicio',
};

const texto = (f: Fila, k: string) => (f[k] == null || f[k] === '' ? '–' : String(f[k]));

const CONFIGS: Record<string, Config> = {
  servicios: {
    titulo: 'Solicitudes de servicio',
    subtitulo: 'ITV, aceite, revisiones, frenos, neumáticos, cristales, diagnosis y carrocería',
    icono: 'llave-inglesa',
    vacia: 'Ninguna todavía. Hasta hace poco no se podían pedir desde PopCar: el producto estaba entero pero no tenía puerta de entrada.',
    columnas: [
      { clave: 'service_type', titulo: 'Servicio', pinta: (f) => ETIQUETA_SERVICIO[String(f.service_type)] ?? texto(f, 'service_type') },
      { clave: 'user_email', titulo: 'Cliente' },
      { clave: 'vehicle_title', titulo: 'Vehículo' },
      { clave: 'preferred_province', titulo: 'Provincia' },
      { clave: 'preferred_dates', titulo: 'Cuándo le viene bien' },
    ],
  },
  visitas: {
    titulo: 'Visitas a vehículos',
    subtitulo: 'El comprador pide ver un coche, el vendedor propone franjas y el comprador elige',
    icono: 'calendario',
    vacia: 'Ninguna todavía.',
    columnas: [
      { clave: 'vehicle_title', titulo: 'Vehículo' },
      { clave: 'buyer_name', titulo: 'Comprador', pinta: (f) => texto(f, 'buyer_name') + ' · ' + texto(f, 'buyer_email') },
      { clave: 'seller_email', titulo: 'Vendedor' },
      { clave: 'proposed_slots', titulo: 'Franjas propuestas', pinta: (f) => {
        const s = f.proposed_slots;
        const n = Array.isArray(s) ? s.length : 0;
        return n ? n + (n === 1 ? ' franja' : ' franjas') : 'ninguna aún';
      } },
      { clave: 'confirmed_slot', titulo: 'Confirmada', pinta: (f) =>
        f.confirmed_slot ? new Date(String(f.confirmed_slot)).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–' },
    ],
  },
  informes: {
    titulo: 'Informes de estado',
    subtitulo: 'El puente con CarsWise Check: captura del vehículo y verificación por un taller de la red',
    icono: 'informe',
    vacia: 'Ninguno todavía.',
    columnas: [
      { clave: 'created_by_email', titulo: 'Cliente' },
      { clave: 'vehicle_id', titulo: 'Vehículo' },
      { clave: 'capture_session_id', titulo: 'Sesión de captura' },
      { clave: 'expires_at', titulo: 'Caduca', pinta: (f) =>
        f.expires_at ? new Date(String(f.expires_at)).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '–' },
    ],
  },
  citas: {
    titulo: 'Citas del usuario',
    subtitulo: 'Distintas de las citas de mantenimiento: estas llegan del panel del cliente',
    icono: 'reloj',
    vacia: 'Ninguna todavía.',
    columnas: [
      { clave: 'title', titulo: 'Cita' },
      { clave: 'user_email', titulo: 'Cliente' },
      { clave: 'appointment_type', titulo: 'Tipo' },
      { clave: 'requested_at_text', titulo: 'Cuándo la pidió' },
    ],
  },
};

function diasDesde(s: unknown): number | null {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(String(s)).getTime()) / 86400000);
}

export default function ColaPage() {
  const { cola = '' } = useParams();
  const cfg = CONFIGS[cola];

  const [filas, setFilas] = useState<Fila[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [cerrados, setCerrados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [soloAbiertas, setSoloAbiertas] = useState(true);

  const cargar = () => {
    if (!cfg) return;
    setCargando(true);
    const q = new URLSearchParams();
    if (soloAbiertas) q.set('abiertas', '1');
    if (busca) q.set('q', busca);
    api.get<Fila[]>(`/colas/${cola}?${q}`)
      .then((r) => {
        if (r.ok) {
          setFilas(r.data);
          const extra = r as unknown as { estados?: string[]; cerrados?: string[] };
          if (extra.estados) setEstados(extra.estados);
          if (extra.cerrados) setCerrados(extra.cerrados);
        } else setError('No se ha podido cargar');
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    const t = setTimeout(cargar, busca ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola, busca, soloAbiertas]);

  const mover = async (f: Fila, estado: string) => {
    const r = await api.patch(`/colas/${cola}/${f.id}/estado`, { estado });
    if (!r.ok) { setError(r.error || 'No se ha podido cambiar el estado'); return; }
    cargar();
  };

  const masVieja = useMemo(
    () => filas.reduce<number>((max, f) => Math.max(max, diasDesde(f.created_at) ?? 0), 0),
    [filas]
  );

  if (!cfg) return <p className="text-brand-300 text-sm pt-4">Esa cola no existe.</p>;

  return (
    <div className="space-y-5">
      <PageHeader title={cfg.titulo} subtitle={cfg.subtitulo} />

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700" role="alert">
          <Icono nombre="aviso" tam={16} /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar en la cola"
          className="h-10 w-full max-w-xs rounded-lg border border-brand-200 bg-white px-3 text-sm
                     placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-acento"
        />
        <label className="flex items-center gap-2 text-[13px] text-brand-500 cursor-pointer select-none">
          <input type="checkbox" checked={soloAbiertas} onChange={(e) => setSoloAbiertas(e.target.checked)}
                 className="accent-acento w-4 h-4" />
          Solo lo que sigue abierto
        </label>
        {!cargando && filas.length > 0 && masVieja >= 3 && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 bg-amber-50
                           border border-amber-200 rounded-lg px-2.5 py-1">
            <Icono nombre="reloj" tam={14} />
            La más antigua lleva {masVieja} días esperando
          </span>
        )}
      </div>

      {cargando ? (
        <p className="text-brand-300 text-sm">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center">
          <p className="text-brand-500 font-semibold mb-1">
            {soloAbiertas ? 'Nada pendiente' : 'Nada aquí'}
          </p>
          <p className="text-[13px] text-brand-300 max-w-lg mx-auto">{cfg.vacia}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-white overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Espera</th>
                {cfg.columnas.map((c) => <th key={c.clave}>{c.titulo}</th>)}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const dias = diasDesde(f.created_at);
                const cerrada = cerrados.includes(String(f.status));
                return (
                  <tr key={String(f.id)} className={cerrada ? 'opacity-55' : ''}>
                    <td className={
                      'font-semibold tabular-nums ' +
                      (cerrada ? 'text-brand-300' : dias !== null && dias >= 7 ? 'text-red-600'
                        : dias !== null && dias >= 3 ? 'text-amber-700' : 'text-brand-400')
                    }>
                      {dias === null ? '–' : dias === 0 ? 'hoy' : dias + ' d'}
                    </td>
                    {cfg.columnas.map((c) => (
                      <td key={c.clave} title={c.pinta ? c.pinta(f) : texto(f, c.clave)}>
                        {c.pinta ? c.pinta(f) : texto(f, c.clave)}
                      </td>
                    ))}
                    <td>
                      <select
                        value={String(f.status)}
                        aria-label="Estado"
                        onChange={(e) => mover(f, e.target.value)}
                        className="h-8 rounded-lg border border-brand-200 bg-white px-2 text-[12.5px]
                                   focus:outline-none focus:ring-2 focus:ring-acento"
                      >
                        {estados.map((e) => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
