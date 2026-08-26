import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import type { Role } from '../../types/index.js';
import Icono, { type NombreIcono } from '../ui/Icono.js';

interface NavItem {
  to: string;
  label: string;
  icon: NombreIcono;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/dashboard',    label: 'Dashboard',    icon: 'panel',  roles: ['admin','support','operations','sales'] },
  { to: '/users',        label: 'Usuarios',     icon: 'usuarios', roles: ['admin','support','operations','sales'] },
  { to: '/marketplace',  label: 'Marketplace',  icon: 'coche', roles: ['admin','support','operations','sales'] },
  { to: '/bookings',     label: 'Agenda',       icon: 'calendario', roles: ['admin','support','operations','sales'] },
  { to: '/appointments', label: 'Citas Mant.',   icon: 'llave-inglesa', roles: ['admin','support','operations','sales'] },
  { to: '/tickets',      label: 'Tickets',      icon: 'ticket', roles: ['admin','support','operations','sales'] },
  { to: '/idcars',       label: 'IDCars',       icon: 'llave', roles: ['admin','support','operations'] },
  { to: '/leads',        label: 'Leads',        icon: 'megafono', roles: ['admin','support','operations','sales'] },
  { to: '/contracts',    label: 'Contratos',    icon: 'documento', roles: ['admin','support','operations','sales'] },
  { to: '/funnel',            label: 'Funnel',          icon: 'embudo', roles: ['admin','sales','operations'] },
  { to: '/marketing-analytics', label: 'Analítica UTM',  icon: 'grafico', roles: ['admin','sales','operations'] },
  { to: '/workshops',    label: 'Talleres',     icon: 'taller', roles: ['admin','operations'] },
  { to: '/billing',          label: 'Facturación clientes',    icon: 'tarjeta', roles: ['admin','operations'] },
  { to: '/provider-billing', label: 'Facturación proveedores', icon: 'edificio', roles: ['admin','operations'] },
  { to: '/consentimientos',  label: 'Consentimientos', icon: 'escudo', roles: ['admin','operations','support'] },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin', support: 'Soporte', operations: 'Operaciones', sales: 'Comercial',
};
const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-red-500', support: 'bg-sky-500', operations: 'bg-violet-500', sales: 'bg-emerald-500',
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  pendingLeads?: number;
}

export default function Sidebar({ isOpen, onClose, pendingLeads = 0 }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const role = user?.role ?? 'sales';
  const visibleNav = NAV.filter((item) => item.roles.includes(role));

  return (
    <aside
      className={[
        'flex flex-col w-60 shrink-0 h-screen overflow-y-auto',
        // Mobile: fixed drawer with slide animation
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: static in flow, always visible
        'md:relative md:translate-x-0 md:z-auto',
      ].join(' ')}
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo + mobile close button */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* La marca es tipografica: «Pop» amarillo, «Car» blanco. No hace
              falta imagen, escala sola y no se ve borrosa en ninguna pantalla. */}
          <div className="leading-none">
            <p className="font-extrabold text-[19px] tracking-tight">
              <span className="text-acento">Pop</span><span className="text-white">Car</span>
            </p>
            <p className="text-brand-300 text-[10.5px] font-semibold tracking-[0.12em] uppercase mt-1">
              Backoffice
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Cerrar menú"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.293 3.293a1 1 0 011.414 0L8 6.586l3.293-3.293a1 1 0 111.414 1.414L9.414 8l3.293 3.293a1 1 0 01-1.414 1.414L8 9.414l-3.293 3.293a1 1 0 01-1.414-1.414L6.586 8 3.293 4.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icono nombre={item.icon} tam={18} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/leads' && pendingLeads > 0 && (
              <span className="ml-auto min-w-[20px] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold text-center leading-tight">
                {pendingLeads > 99 ? '99+' : pendingLeads}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${ROLE_COLORS[role]}`}>
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="overflow-hidden">
            <p className="text-white text-xs font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-[11px]">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-slate-400 hover:text-white text-xs px-2 py-1.5 rounded hover:bg-slate-800 transition-colors"
        >
          ↩ Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
