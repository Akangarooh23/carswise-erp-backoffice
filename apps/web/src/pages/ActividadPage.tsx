import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Icono, { type NombreIcono } from '../components/ui/Icono.js';

/**
 * Quién hizo qué y cuándo.
 *
 * La tabla existía desde el principio, con sus índices, y tenía cero filas:
 * nadie escribía en ella. Hasta ahora no se podía responder a «¿quién cambió el
 * plan de este cliente?».
 *
 * Aquí no se puede borrar nada. Un registro que se puede editar no sirve para
 * lo que sirve un registro.
 */

interface Apunte {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resource_id: string | null;
  payload: unknown;
  ip: string | null;
  created_at: string;
}

/** El icono se elige por lo que se hizo; si no, por dónde se hizo. */
const ICONO: Record<string, NombreIcono> = {
  alta: 'equipo', desactivar: 'aviso', reactivar: 'comprobado',
  cambiar_rol: 'escudo', cambiar_clave: 'llave', cambiar_plan: 'tarjeta',
  cambiar_estado: 'lapiz', servicio: 'servicio', correccion: 'documento',
  crear: 'documento', editar: 'lapiz', borrar: 'aviso',
  bulk: 'tabla', notify: 'sobre', publish: 'megafono', state: 'lapiz',
  units: 'coche', run: 'refrescar',
};

/** Cómo se dice cada acción dentro de una frase. */
const TEXTO: Record<string, string> = {
  alta: 'dio de alta a', desactivar: 'dio de baja a', reactivar: 'reactivó a',
  cambiar_rol: 'cambió el rol de', cambiar_clave: 'cambió la contraseña de',
  cambiar_plan: 'cambió el plan de',
  crear: 'creó', editar: 'editó', borrar: 'borró',
  bulk: 'cambió en bloque', notify: 'avisó al cliente de', publish: 'publicó',
  units: 'añadió una unidad a', run: 'lanzó',
  cambiar_estado: 'cambió el estado de', state: 'cambió el estado de',
  // Un apunte no se borra: se corrige con otro, como un asiento contable. Si se
  // pudieran quitar las líneas incómodas, esto dejaría de probar nada.
  correccion: 'anotó una corrección sobre',
};

/**
 * De `api.marketplace.vo` a «un vehículo del marketplace».
 *
 * Lo que guarda el registro es la dirección de la API, que es exacta y no se
 * queda vieja. Pero en pantalla hay que leerlo, no descifrarlo.
 */
const RECURSO: Record<string, string> = {
  'marketplace.vo':            'un vehículo del marketplace',
  'marketplace.vo.units':      'las unidades de un vehículo',
  'marketplace.vo.bulk':       'varios vehículos',
  'marketplace.vo.bulk-with-units': 'una importación de Excel',
  'marketplace.offers':        'una oferta de portal',
  'marketplace.particulares':  'un vehículo de particular',
  'marketplace.vo.units.':     'una unidad',
  'leads':                     'un lead',
  'idcars':                    'un IDCar',
  'contracts':                 'un contrato',
  'tickets':                   'un ticket',
  'visits':                    'una visita',
  'appointments':              'una cita',
  'workshops':                 'un taller',
  'users':                     'un usuario',
  'personal':                  'el personal',
  'provider-billing':          'una factura de proveedor',
  'invoices':                  'una factura',
  'funnel':                    'el embudo',
  'auditoria':                 'este mismo registro',
};

function nombreRecurso(r: string): string {
  return RECURSO[r] ?? r.replace(/^api\./, '').replace(/\./g, ' › ');
}

function cuando(s: string) {
  const d = new Date(s);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return 'hace ' + min + ' min';
  if (min < 60 * 24) return 'hace ' + Math.round(min / 60) + ' h';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ActividadPage() {
  const [apuntes, setApuntes] = useState<Apunte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [quien, setQuien] = useState('');

  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => {
      api.get<Apunte[]>('/actividad?limit=200' + (quien ? '&actor=' + encodeURIComponent(quien) : ''))
        .then((r) => { if (r.ok) setApuntes(r.data); })
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [quien]);

  return (
    <div className="space-y-5">
      <PageHeader title="Actividad" subtitle="Quién hizo qué y cuándo" />

      <input
        type="search"
        value={quien}
        onChange={(e) => setQuien(e.target.value)}
        placeholder="Buscar por persona…"
        aria-label="Buscar por persona"
        className="h-10 w-full max-w-sm rounded-lg border border-brand-200 bg-white px-3 text-sm
                   placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-acento"
      />

      {cargando ? (
        <p className="text-brand-300 text-sm">Cargando…</p>
      ) : apuntes.length === 0 ? (
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center">
          <p className="text-brand-500 font-semibold mb-1">Nada registrado todavía</p>
          <p className="text-[13px] text-brand-300 max-w-md mx-auto">
            Aquí irá apareciendo cada cambio: quién lo hizo, sobre qué y cuándo.
            Las contraseñas nunca se guardan, ni siquiera ocultas.
          </p>
        </div>
      ) : (
        <ul className="rounded-xl border border-brand-200 bg-white divide-y divide-brand-100">
          {apuntes.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 text-brand-300 shrink-0">
                <Icono nombre={ICONO[a.action] ?? 'historial'} tam={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-brand-600">
                  <b className="font-semibold">{a.actor}</b>{' '}
                  {TEXTO[a.action] ?? a.action.replace(/_/g, ' ')}{' '}
                  <span className="text-brand-400">
                    {(a.payload as { email?: string } | null)?.email ?? nombreRecurso(a.resource)}
                  </span>
                  {a.action === 'cambiar_rol' && (a.payload as { de?: string; a?: string } | null)?.a && (
                    <span className="text-brand-400">
                      {' '}· {(a.payload as { de?: string }).de} → {(a.payload as { a?: string }).a}
                    </span>
                  )}
                </p>
                {(a.payload as { nota?: string } | null)?.nota && (
                  <p className="text-[12.5px] text-brand-400 mt-1 leading-snug max-w-3xl">
                    {(a.payload as { nota: string }).nota}
                  </p>
                )}
                <p className="text-[11.5px] text-brand-300 mt-0.5">
                  {cuando(a.created_at)}
                  {a.resource_id && <span className="font-mono"> · {a.resource_id}</span>}
                  {a.ip && <span className="font-mono"> · {a.ip}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
