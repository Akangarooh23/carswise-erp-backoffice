import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { StatCard } from '../components/ui/Card.js';
import Pendientes, { usePendientes } from '../components/dashboard/Pendientes.js';
import CochesEnMarcha from '../components/dashboard/CochesEnMarcha.js';
import Finanzas, { DeDondeViene, useFinanzas } from '../components/dashboard/Finanzas.js';
import Negocio from '../components/dashboard/Negocio.js';
import Escaparate from '../components/dashboard/Escaparate.js';
import EmbudoDeVentas from '../components/dashboard/EmbudoDeVentas.js';
import MargenPorCoche from '../components/dashboard/MargenPorCoche.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono from '../components/ui/Icono.js';
import { StatusBadge } from '../components/ui/Badge.js';
import type { DashboardStats } from '../types/index.js';

/**
 * El panel, por partes del negocio.
 *
 * Con todo en una columna había que bajar tres pantallas para llegar al
 * escaparate, y para entonces ya no te acordabas de las cuentas. Son cinco
 * preguntas distintas —qué hay que hacer, cómo va el dinero, cómo va la
 * operación, qué hay publicado y quién lo usa— y cada una se hace en un momento
 * distinto del día.
 *
 * **Pendientes abre el panel** porque es la que se hace primero: al entrar en
 * un ERP por la mañana no se pregunta cuánto se facturó el año pasado. Y lleva
 * el trabajo de los coches además del papeleo, que es lo que hace que esa
 * pestaña tenga algo que enseñar un día normal.
 *
 * Y su número va **en la pestaña**, no dentro. Un aviso escondido detrás de una
 * pestaña que no estás mirando es un aviso que no existe; con el número fuera,
 * se ve que hay cinco cosas que hacer estando en Ofertas.
 *
 * La pestaña va en la dirección (`?ver=gestion`), así que se puede enlazar y
 * sobrevive a recargar la página. Sin eso, cada vuelta al panel empieza otra
 * vez por la primera.
 */

function fmt(n: number) { return n?.toLocaleString('es-ES') ?? '–'; }
function fmtPrice(n: number) {
  if (!n) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string) {
  if (!s) return '–';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const PESTANAS = [
  // Pendientes primero y por defecto: lo primero que se pregunta al abrir el
  // ERP es qué hay que hacer, no cuánto se facturó el año pasado.
  { clave: 'pendientes', nombre: 'Pendientes' },
  { clave: 'financiera', nombre: 'Financiera' },
  { clave: 'gestion',    nombre: 'Gestión' },
  { clave: 'ofertas',    nombre: 'Ofertas' },
  { clave: 'usuarios',   nombre: 'Usuarios' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'];

function esPestana(v: string | null): v is Pestana {
  return PESTANAS.some((p) => p.clave === v);
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  /*
   * De cuándo son los números.
   *
   * El panel se deja abierto. Vuelves a las tres horas, lees «19.805 €» y estás
   * mirando lo de esta mañana sin saberlo: en una pantalla de dinero eso no es
   * un detalle. La hora va arriba y al lado el botón que los vuelve a pedir.
   */
  const [refresco, setRefresco] = useState(0);
  const [cargadoA, setCargadoA] = useState<Date | null>(null);

  // Un solo periodo y una sola petición para los dos bloques de dinero: con
  // dos, el reparto puede no sumar lo que dice el total de arriba.
  const cuentas = useFinanzas(refresco);
  const pendientes = usePendientes(refresco);

  const [params, setParams] = useSearchParams();
  const pedida = params.get('ver');
  const ver: Pestana = esPestana(pedida) ? pedida : 'pendientes';

  useEffect(() => {
    api.get<DashboardStats>('/dashboard/stats').then((res) => {
      if (res.ok) { setStats(res.data); setCargadoA(new Date()); }
      else setError('No se pudieron cargar las estadísticas');
    }).catch(() => setError('Error de conexión')).finally(() => setLoading(false));
  }, [refresco]);

  if (loading) return <div className="text-brand-300 text-sm pt-4">Cargando dashboard…</div>;
  if (error)   return <div className="text-red-500 text-sm pt-4">{error}</div>;
  if (!stats)  return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Dashboard" subtitle="Vista general del negocio" />
        <div className="flex items-center gap-3 pb-1">
          {cargadoA && (
            <span className="text-[11px] text-brand-300 tabular-nums">
              números de las {cargadoA.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" onClick={() => setRefresco((n) => n + 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50">
            <Icono nombre="refrescar" tam={14} />
            Actualizar
          </button>
        </div>
      </div>

      {/*
        * La barra va en su propio bloque con hueco debajo.
        *
        * Con margen negativo, la línea de la barra caía justo encima del
        * encabezado de la primera sección y lo cruzaba por la mitad.
        */}
      <nav className="flex gap-1 border-b border-brand-200 mb-2" aria-label="Partes del negocio">
        {PESTANAS.map((p) => (
          <button key={p.clave} type="button"
                  onClick={() => setParams(p.clave === 'pendientes' ? {} : { ver: p.clave }, { replace: true })}
                  aria-current={ver === p.clave ? 'page' : undefined}
                  className={'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
                    (ver === p.clave
                      ? 'border-acento text-brand-600'
                      : 'border-transparent text-brand-300 hover:text-brand-500')}>
            {p.nombre}
            {/*
              * El número va en la pestaña, no dentro.
              *
              * Así se ve que hay cinco cosas que hacer estando en Ofertas. Sin
              * él hay que entrar para saber si hay algo, y a la tercera vez que
              * no hay nada se deja de entrar: el aviso deja de existir.
              */}
            {p.clave === 'pendientes' && pendientes.total > 0 && (
              <span className="ml-2 inline-block rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums align-middle">
                {pendientes.total}
              </span>
            )}
          </button>
        ))}
      </nav>

      {ver === 'pendientes' && <Pendientes lista={pendientes.lista} />}

      {ver === 'financiera' && (
        <>
          <Finanzas cuentas={cuentas} />
          <DeDondeViene cuentas={cuentas} />

          {/* Y coche a coche, que es lo que dice si el negocio escala. */}
          <MargenPorCoche />
        </>
      )}

      {ver === 'gestion' && (
        <>
          {stats.importacion && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
                Importación
                <span className="ml-2 normal-case font-semibold text-brand-400">· el negocio que está corriendo</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <StatCard label="Coches en marcha" value={fmt(stats.importacion.en_marcha)}
                          sub="pedidos sin entregar" icon="coche" color="neutro" a="/importaciones" />
                <StatCard label="Completadas" value={fmt(stats.importacion.entregados)}
                          sub="entregadas al cliente" icon="comprobado" color="bien" a="/importaciones" />
                <StatCard label="Depósitos retenidos" value={fmtPrice(Number(stats.importacion.retenido))}
                          sub="dinero de clientes sin entregar" icon="euro" color="espera" a="/importaciones" />
                <StatCard label="Facturas sin llegar" value={fmt(stats.importacion.facturas_sin_llegar)}
                          sub={`${fmtPrice(Number(stats.importacion.facturas_sin_llegar_importe))} sin facturar`}
                          icon="documento" color={stats.importacion.facturas_sin_llegar ? 'espera' : 'neutro'}
                          a="/provider-billing" />
                <StatCard label="Publicados de Alemania" value={fmt(stats.importacion.publicados)}
                          sub={`${fmt(stats.importacion.vivos)} siguen a la venta`}
                          icon="ojo" color="neutro" a="/marketplace/analisis" />
              </div>
            </section>
          )}

          {/* Y lo que hay que hacer con cada coche, no solo cuántos hay. */}
          <CochesEnMarcha />

          {/* Los servicios, las citas y lo que nos comisionan. */}
          <Negocio />

          <div className="bg-white rounded-xl border border-brand-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-brand-100">
              <h3 className="font-semibold text-brand-600 text-sm">Próximas citas</h3>
              <Link to="/appointments" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Ver todas →</Link>
            </div>
            {stats.upcomingAppointments.length === 0 ? (
              <p className="text-brand-300 text-sm text-center py-8">Sin citas próximas</p>
            ) : (
              <div className="overflow-x-auto"><table className="erp-table">
                <thead><tr><th>Usuario</th><th>Tipo</th><th>Fecha</th><th>Estado</th></tr></thead>
                <tbody>
                  {stats.upcomingAppointments.map((a) => (
                    <tr key={a.id}>
                      <td className="text-sm font-medium text-brand-500">{a.user_id}</td>
                      <td className="text-sm text-brand-400 capitalize">{a.type.replace('_', ' ')}</td>
                      <td className="text-sm text-brand-400">{fmtDate(a.scheduled_at)}</td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </>
      )}

      {ver === 'ofertas' && (
        <>
          {/* El embudo primero: de cuántos vienen los leads de abajo. */}
          <EmbudoDeVentas />

          <Escaparate />

          {stats.leads && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
                Solicitudes
                <span className="ml-2 normal-case font-semibold text-brand-400">· lo que traen las ofertas</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <StatCard label="Total" value={fmt(stats.leads.total)}
                          sub={`+${fmt(stats.leads.new_7d)} esta semana`} icon="bandeja" color="neutro" a="/leads" />
                <StatCard label="Pendientes" value={fmt(stats.leads.pending)} icon="reloj" color="espera" a="/leads" />
                <StatCard label="Contactados" value={fmt(stats.leads.contacted)} icon="megafono" color="neutro" a="/leads" />
                <StatCard label="Reagendar" value={fmt(stats.leads.reschedule)} icon="historial" color="neutro" a="/leads" />
                <StatCard label="Resueltos" value={fmt(stats.leads.resolved)} icon="comprobado" color="bien" a="/leads" />
              </div>
            </section>
          )}
        </>
      )}

      {ver === 'usuarios' && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">Usuarios</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total usuarios" value={fmt(stats.users?.total)}
                      sub={`+${fmt(stats.users?.new_30d)} este mes`} icon="usuarios" color="neutro" a="/users" />
            <StatCard label="Activos" value={fmt(stats.users?.active)} icon="comprobado" color="bien" a="/users" />
            <StatCard label="Plan Plus" value={fmt(stats.users?.plus)} icon="estrella" color="neutro" a="/users" />
            <StatCard label="Plan Premium" value={fmt(stats.users?.premium)} icon="diamante" color="neutro" a="/users" />
          </div>
        </section>
      )}
    </div>
  );
}
