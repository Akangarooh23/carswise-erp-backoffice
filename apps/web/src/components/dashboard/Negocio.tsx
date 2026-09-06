import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icono, { type NombreIcono } from '../ui/Icono.js';
import type { Negocio as Datos } from '../../types/index.js';

/**
 * Los servicios, las citas y las comisiones.
 *
 * Del panel se caían tres cosas que son negocio: lo que vendemos aparte del
 * coche —informes, seguros, mantenimientos, la gestión integral de venta—, de
 * qué son las citas, y lo que nos comisionan los proveedores.
 *
 * **Un servicio a cero sale a cero.** Que la gestión integral de venta no tenga
 * ninguna solicitud es la respuesta a «cómo va eso»; sin la fila, la pregunta se
 * queda sin contestar y nadie se acuerda de mirarla. Va en gris para que no
 * compita con lo que sí tiene datos, pero está.
 */

const num = (n: unknown) => (Number(n) || 0).toLocaleString('es-ES');
const euros = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '–';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

/** Una línea de servicio: qué es, cuánto hay y a dónde lleva. */
function Servicio({ nombre, valor, pie, icono, a, vacio }: {
  nombre: string; valor: string; pie: string; icono: NombreIcono; a: string; vacio: boolean;
}) {
  return (
    <Link to={a}
          className={'flex items-start gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md ' +
            (vacio ? 'border-dashed border-brand-200' : 'border-brand-200 shadow-sm')}>
      <span className={'mt-0.5 shrink-0 ' + (vacio ? 'text-brand-200' : 'text-brand-400')}>
        <Icono nombre={icono} tam={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-300">{nombre}</span>
        <span className={'block mt-1 font-display text-[22px] leading-none font-extrabold tabular-nums ' +
          (vacio ? 'text-brand-200' : 'text-brand-600')}>{valor}</span>
        <span className="block mt-1.5 text-[11px] text-brand-300 leading-snug">{pie}</span>
      </span>
    </Link>
  );
}

/** Cómo se llama cada estado de visita, que en la base están en inglés. */
const ESTADO_DE_VISITA: Record<string, string> = {
  confirmed: 'confirmadas', pending: 'por confirmar', cancelled: 'canceladas',
  completed: 'hechas', expired: 'caducadas',
};

const TIPO_DE_CITA: Record<string, string> = {
  workshop: 'taller', inspection: 'revisión', other: 'otras',
};

export default function Negocio() {
  const [datos, setDatos] = useState<Datos | null>(null);

  useEffect(() => {
    api.get<Datos>('/dashboard/negocio')
      .then((r) => { if (r.ok) setDatos(r.data); })
      .catch(() => {});
  }, []);

  if (!datos) return null;
  const { servicios, citas, comisiones } = datos;

  const visitasTotal = citas.visitas.reduce((n, v) => n + Number(v.n), 0);
  const citasTotal = citas.cliente.reduce((n, c) => n + Number(c.n), 0);

  return (
    <>
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
          Servicios
          <span className="ml-2 normal-case font-semibold text-brand-400">· lo que vendemos aparte del coche</span>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Servicio nombre="Informes de tasación" valor={num(servicios.informes.n)}
                    pie={`${euros(servicios.informes.importe)} cobrados`}
                    icono="informe" a="/colas/informes" vacio={!Number(servicios.informes.n)} />
          <Servicio nombre="Garantías" valor={num(servicios.garantias.vendidas)}
                    pie={`${euros(servicios.garantias.cobrado)} al cliente`}
                    icono="escudo" a="/provider-billing" vacio={!Number(servicios.garantias.vendidas)} />
          <Servicio nombre="Mantenimientos" valor={num(servicios.mantenimientos.n)}
                    pie={Number(servicios.mantenimientos.pendientes)
                      ? `${num(servicios.mantenimientos.pendientes)} sin cerrar`
                      : 'todos cerrados'}
                    icono="taller" a="/colas/servicios" vacio={!Number(servicios.mantenimientos.n)} />
          <Servicio nombre="Seguros" valor={num(servicios.seguros.n)}
                    pie={`${num(servicios.seguros.activos)} en vigor`}
                    icono="escudo" a="/users" vacio={!Number(servicios.seguros.n)} />
          <Servicio nombre="Venta integral" valor={num(servicios.ventaIntegral.n)}
                    pie={Number(servicios.ventaIntegral.n)
                      ? `${num(servicios.ventaIntegral.abiertas)} abiertas`
                      : 'sin solicitudes todavía'}
                    icono="llave" a="/colas/servicios" vacio={!Number(servicios.ventaIntegral.n)} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-3">
          Citas
          <span className="ml-2 normal-case font-semibold text-brand-400">· de ver un coche y de llevarlo al taller</span>
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[13px] font-bold text-brand-600">Ver un coche del marketplace</h3>
              <Link to="/bookings" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Agenda →</Link>
            </div>
            {!visitasTotal ? (
              <p className="text-sm text-brand-300">Todavía no ha pedido nadie ver un coche.</p>
            ) : (
              <ul className="space-y-2 list-none p-0 m-0">
                {citas.visitas.map((v) => (
                  <li key={v.estado} className="flex items-center justify-between">
                    <span className="text-[13px] text-brand-500">{ESTADO_DE_VISITA[v.estado] ?? v.estado}</span>
                    <span className="text-[13px] font-bold text-brand-600 tabular-nums">{v.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[13px] font-bold text-brand-600">Mantenimiento y taller</h3>
              <Link to="/appointments" className="text-acento-texto hover:text-brand-600 text-xs font-medium">Citas →</Link>
            </div>
            {!citasTotal && !Number(citas.taller.n) ? (
              <p className="text-sm text-brand-300">Ninguna cita de taller pedida.</p>
            ) : (
              <ul className="space-y-2 list-none p-0 m-0">
                {citas.cliente.map((c) => (
                  <li key={c.tipo} className="flex items-center justify-between">
                    <span className="text-[13px] text-brand-500">
                      Pedidas por el cliente · {TIPO_DE_CITA[c.tipo] ?? c.tipo}
                    </span>
                    <span className="text-[13px] font-bold text-brand-600 tabular-nums">{c.n}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between pt-2 border-t border-brand-100">
                  <span className="text-[13px] text-brand-500">
                    Confirmadas con taller
                    {Number(citas.taller.proximas) > 0 && (
                      <span className="ml-2 text-acento-texto font-semibold">
                        {num(citas.taller.proximas)} en 7 días
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] font-bold text-brand-600 tabular-nums">{num(citas.taller.n)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </section>

      {/*
        * Las comisiones van pegadas a los servicios y no a la contabilidad: lo
        * que se comisiona sale de haber vendido una garantía o un seguro, y el
        * número solo dice algo al lado de cuántas se vendieron.
        */}
      <Link to="/provider-billing"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-brand-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300">
          Comisiones de proveedores
        </span>
        <span className="font-display text-[22px] leading-none font-extrabold tabular-nums text-brand-600">
          {euros(comisiones.base)}
        </span>
        <span className="text-[12px] text-brand-300">
          {Number(comisiones.n) === 1 ? '1 factura emitida' : `${num(comisiones.n)} facturas emitidas`}, sin IVA
        </span>
        {Number(comisiones.sin_cobrar) > 0 && (
          <span className="text-[12px] font-semibold text-acento-texto">
            {num(comisiones.sin_cobrar)} sin cobrar
          </span>
        )}
      </Link>
    </>
  );
}
