import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icono, { type NombreIcono } from './Icono.js';
import type { Role } from '../../types/index.js';

/**
 * Ir a cualquier sitio sin soltar el teclado.
 *
 * El ERP tenia dos manejadores de teclado en toda la aplicacion, y los dos eran
 * «Esc para cerrar». Para alguien que vive ocho horas aqui, levantar la mano al
 * raton para cambiar de seccion son minutos cada dia que no vuelven.
 *
 * Se abre con Ctrl+K —Cmd+K en Mac—, se escribe media palabra y se pulsa Enter.
 * No hace falta acertar el nombre exacto: «fact» encuentra las dos
 * facturaciones, y las letras sueltas valen aunque esten separadas, asi que
 * «mkt» tambien llega a Marketplace.
 */

export interface Destino {
  nombre: string;
  a: string;
  icono: NombreIcono;
  /** Palabras por las que tambien deberia encontrarse. */
  alias?: string;
  roles: Role[];
  /** La tecla de la secuencia «g …», si la tiene. */
  atajo?: string;
}

export const DESTINOS: Destino[] = [
  { nombre: 'Dashboard',               a: '/dashboard',           icono: 'panel',        alias: 'panel inicio resumen', roles: ['admin','support','operations','sales'], atajo: 'd' },
  { nombre: 'Usuarios',                a: '/users',               icono: 'usuarios',     alias: 'clientes cuentas',     roles: ['admin','support','operations','sales'], atajo: 'u' },
  { nombre: 'Marketplace',             a: '/marketplace',         icono: 'coche',        alias: 'vehiculos ofertas vo', roles: ['admin','support','operations','sales'], atajo: 'm' },
  { nombre: 'Agenda',                  a: '/bookings',            icono: 'calendario',   alias: 'visitas reservas',     roles: ['admin','support','operations','sales'], atajo: 'a' },
  { nombre: 'Citas de mantenimiento',  a: '/appointments',        icono: 'llave-inglesa',alias: 'taller revision',      roles: ['admin','support','operations','sales'], atajo: 'c' },
  { nombre: 'Tickets',                 a: '/tickets',             icono: 'ticket',       alias: 'soporte incidencias',  roles: ['admin','support','operations','sales'], atajo: 't' },
  { nombre: 'IDCars',                  a: '/idcars',              icono: 'llave',        alias: 'garaje vehiculos',     roles: ['admin','support','operations'],         atajo: 'i' },
  { nombre: 'Leads',                   a: '/leads',               icono: 'megafono',     alias: 'solicitudes',          roles: ['admin','support','operations','sales'], atajo: 'l' },
  { nombre: 'Contratos',               a: '/contracts',           icono: 'documento',    alias: 'renting ventas',       roles: ['admin','support','operations','sales'], atajo: 'k' },
  { nombre: 'Funnel',                  a: '/funnel',              icono: 'embudo',       alias: 'embudo conversion',    roles: ['admin','sales','operations'],           atajo: 'f' },
  { nombre: 'Analítica UTM',           a: '/marketing-analytics', icono: 'grafico',      alias: 'marketing campanas',   roles: ['admin','sales','operations'] },
  { nombre: 'Talleres',                a: '/workshops',           icono: 'taller',       alias: 'red puntos',           roles: ['admin','operations'],                   atajo: 'w' },
  { nombre: 'Facturación clientes',    a: '/billing',             icono: 'tarjeta',      alias: 'facturas cobros',      roles: ['admin','operations'],                   atajo: 'b' },
  { nombre: 'Facturación proveedores', a: '/provider-billing',    icono: 'edificio',     alias: 'facturas proveedor',   roles: ['admin','operations'] },
  { nombre: 'Consentimientos',         a: '/consentimientos',     icono: 'escudo',       alias: 'rgpd privacidad',      roles: ['admin','operations','support'] },
  { nombre: 'Guía de estilo',          a: '/estilo',              icono: 'ojo',          alias: 'componentes diseno',   roles: ['admin'] },
];

/** «mkt» encuentra Marketplace: valen las letras en orden, aunque esten sueltas. */
function casa(texto: string, busca: string): boolean {
  const t = texto.toLowerCase();
  const b = busca.toLowerCase().trim();
  if (!b) return true;
  if (t.includes(b)) return true;
  let i = 0;
  for (const c of b) {
    i = t.indexOf(c, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

export default function PaletaComandos({
  abierta, cerrar, rol,
}: { abierta: boolean; cerrar: () => void; rol: Role }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState(0);
  const navegar = useNavigate();
  const entrada = useRef<HTMLInputElement>(null);

  const visibles = useMemo(
    () => DESTINOS.filter((d) => d.roles.includes(rol))
      .filter((d) => casa(d.nombre + ' ' + (d.alias ?? ''), busca)),
    [busca, rol]
  );

  useEffect(() => {
    if (abierta) { setBusca(''); setSel(0); setTimeout(() => entrada.current?.focus(), 10); }
  }, [abierta]);

  useEffect(() => { setSel(0); }, [busca]);

  if (!abierta) return null;

  const ir = (d?: Destino) => { if (!d) return; cerrar(); navegar(d.a); };

  return (
    <div
      className="fixed inset-0 z-[100] bg-brand-700/40 backdrop-blur-[2px] flex items-start justify-center pt-[12vh] px-4"
      onClick={cerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Ir a"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden border border-brand-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-brand-100">
          <span className="text-brand-300"><Icono nombre="buscar" tam={18} /></span>
          <input
            ref={entrada}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ir a…"
            aria-label="Buscar sección"
            className="flex-1 h-12 bg-transparent text-[15px] text-brand-600 placeholder:text-brand-300 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, visibles.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); ir(visibles[sel]); }
              else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
            }}
          />
          <kbd className="text-[10px] font-semibold text-brand-300 border border-brand-200 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <ul className="max-h-[52vh] overflow-y-auto py-1.5">
          {visibles.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-brand-300">
              Nada con «{busca}».
            </li>
          )}
          {visibles.map((d, i) => (
            <li key={d.a}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => ir(d)}
                className={
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ' +
                  (i === sel ? 'bg-acento-tenue text-brand-600' : 'text-brand-500 hover:bg-brand-50')
                }
              >
                <Icono nombre={d.icono} tam={17} className="shrink-0" />
                <span className="text-sm font-medium flex-1">{d.nombre}</span>
                {d.atajo && (
                  <span className="text-[10px] text-brand-300 font-mono">g {d.atajo}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="px-4 py-2 border-t border-brand-100 bg-brand-50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-300">
          <span><b className="font-mono">↑↓</b> moverse</span>
          <span><b className="font-mono">↵</b> ir</span>
          <span><b className="font-mono">g</b> + letra sin abrir esto</span>
          <span><b className="font-mono">?</b> todos los atajos</span>
        </div>
      </div>
    </div>
  );
}
