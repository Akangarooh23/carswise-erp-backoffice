import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import Boton from '../components/ui/Boton.js';
import { Campo, Selector } from '../components/ui/Campo.js';
import Icono from '../components/ui/Icono.js';
import type { Role } from '../types/index.js';

/**
 * El equipo.
 *
 * Hasta ahora no existía: había cuatro cuentas escritas en el código, una por
 * área, y tres personas en Operaciones compartían una. El registro solo podía
 * decir «ops», nunca quién, y dar de baja a alguien obligaba a cambiarle la
 * clave a todo su equipo.
 */

interface Persona {
  id: string;
  email: string;
  nombre: string;
  rol: Role;
  activo: boolean;
  ultimoAcceso?: string | null;
}

const ROLES: { valor: Role; texto: string; queHace: string }[] = [
  // «Administrador», no «Administración»: administración es el área que lleva
  // facturas y bancos, y llamar así al rol que lo puede todo invita a dárselo a
  // quien solo tenía que revisar facturas.
  { valor: 'admin',      texto: 'Administrador',  queHace: 'Todo, incluido dar de alta al equipo' },
  { valor: 'operations', texto: 'Operaciones',    queHace: 'Marketplace, IDCars, talleres y facturación' },
  { valor: 'support',    texto: 'Soporte',        queHace: 'Tickets, usuarios y consentimientos' },
  { valor: 'sales',      texto: 'Comercial',      queHace: 'Leads, contratos y embudo' },
];

const NOMBRE_ROL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.valor, r.texto]));

function fecha(s?: string | null) {
  if (!s) return 'nunca';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EquipoPage() {
  const [gente, setGente] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [alta, setAlta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', rol: 'support' as Role, clave: '' });

  const cargar = () => {
    setCargando(true);
    api.get<Persona[]>('/personal')
      .then((r) => { if (r.ok) setGente(r.data); else setError('No se ha podido cargar el equipo'); })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, []);

  const decir = (m: string) => { setAviso(m); setTimeout(() => setAviso(''), 4000); };

  const crear = async () => {
    setGuardando(true);
    setError('');
    const r = await api.post<Persona>('/personal', form);
    setGuardando(false);
    if (!r.ok) { setError(r.error || 'No se ha podido dar de alta'); return; }
    setAlta(false);
    setForm({ nombre: '', email: '', rol: 'support', clave: '' });
    decir('Alta hecha. Dile su contraseña por un canal seguro, no por correo.');
    cargar();
  };

  const cambiarRol = async (p: Persona, rol: Role) => {
    const r = await api.patch(`/personal/${p.id}/rol`, { rol });
    if (!r.ok) { setError(r.error || 'No se ha podido cambiar el rol'); return; }
    decir(`${p.nombre} pasa a ${NOMBRE_ROL[rol]}.`);
    cargar();
  };

  const cambiarActivo = async (p: Persona) => {
    const r = await api.patch(`/personal/${p.id}/activo`, { activo: !p.activo });
    if (!r.ok) { setError(r.error || 'No se ha podido cambiar'); return; }
    decir(p.activo ? `${p.nombre} ya no puede entrar.` : `${p.nombre} vuelve a tener acceso.`);
    cargar();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo"
        subtitle="Quién entra al ERP y con qué permisos"
        actions={<Boton variante="acento" icono="equipo" onClick={() => { setAlta(true); setError(''); }}>Dar de alta</Boton>}
      />

      {aviso && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">
          <Icono nombre="comprobado" tam={16} /> {aviso}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700" role="alert">
          <Icono nombre="aviso" tam={16} /> {error}
        </div>
      )}

      {cargando ? (
        <p className="text-brand-300 text-sm">Cargando…</p>
      ) : gente.length === 0 ? (
        <div className="rounded-xl border border-brand-200 bg-white px-6 py-10 text-center">
          <p className="text-brand-500 font-semibold mb-1">Todavía no hay nadie dado de alta</p>
          <p className="text-[13px] text-brand-300 max-w-md mx-auto">
            Se está entrando con las cuatro cuentas de arranque, una por área. En
            cuanto des de alta a alguien, el registro de actividad podrá decir
            quién hizo cada cosa en vez de «ops» o «sales».
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-white overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Persona</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gente.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'opacity-55'}>
                  <td className="celda-libre">
                    <p className="font-semibold text-brand-600">{p.nombre}</p>
                    <p className="text-[12px] text-brand-300">{p.email}</p>
                  </td>
                  <td>
                    <select
                      value={p.rol}
                      aria-label={`Rol de ${p.nombre}`}
                      onChange={(e) => cambiarRol(p, e.target.value as Role)}
                      className="h-8 rounded-lg border border-brand-200 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-acento"
                    >
                      {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}
                    </select>
                  </td>
                  <td className="text-brand-400">{fecha(p.ultimoAcceso)}</td>
                  <td>
                    <span className={
                      'text-[11px] font-bold px-2 py-0.5 rounded ' +
                      (p.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-100 text-brand-400')
                    }>
                      {p.activo ? 'Activa' : 'De baja'}
                    </span>
                  </td>
                  <td className="text-right">
                    <Boton tam="sm" variante={p.activo ? 'fantasma' : 'secundario'} onClick={() => cambiarActivo(p)}>
                      {p.activo ? 'Dar de baja' : 'Reactivar'}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-acento bg-acento-tenue px-5 py-4">
        <h3 className="text-[13px] font-bold text-acento-texto mb-1">Las cuatro cuentas de arranque</h3>
        <p className="text-[13px] text-acento-texto/85 max-w-3xl">
          <code className="font-mono">admin@</code>, <code className="font-mono">support@</code>,{' '}
          <code className="font-mono">ops@</code> y <code className="font-mono">sales@</code> ya no
          entran: mientras haya algún Administrador en esta lista, las
          cuatro quedan cerradas. Son la puerta del primer día, y sus contraseñas
          viven en variables de entorno, compartidas y sin nombre detrás.{' '}
          <b>Vuelven a valer si esta lista se queda sin ningún administrador
          activo, o si la base no responde</b>, que es justo cuando hacen falta.
        </p>
      </div>

      {alta && (
        <div className="fixed inset-0 z-50 bg-brand-700/40 backdrop-blur-[2px] flex items-center justify-center px-4"
             onClick={() => setAlta(false)} role="dialog" aria-modal="true" aria-label="Dar de alta">
          <div className="w-full max-w-md rounded-2xl bg-white border border-brand-200 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-brand-100">
              <h2 className="text-lg font-bold text-brand-600">Dar de alta</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Campo etiqueta="Nombre" value={form.nombre} requerido
                     onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <Campo etiqueta="Correo" type="email" value={form.email} requerido
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Selector etiqueta="Rol" value={form.rol}
                        ayuda={ROLES.find((r) => r.valor === form.rol)?.queHace}
                        onChange={(e) => setForm({ ...form, rol: e.target.value as Role })}
                        opciones={ROLES.map((r) => ({ valor: r.valor, texto: r.texto }))} />
              <Campo etiqueta="Contraseña" type="text" value={form.clave} requerido
                     ayuda="Mínimo 10 caracteres. Dásela en persona o por un canal seguro, no por correo."
                     onChange={(e) => setForm({ ...form, clave: e.target.value })} />
            </div>
            <div className="px-6 py-4 border-t border-brand-100 flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setAlta(false)}>Cancelar</Boton>
              <Boton variante="acento" cargando={guardando} onClick={crear}>Dar de alta</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
