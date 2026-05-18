import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth.js';
import type { Role } from '../../types/index.js';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/dashboard',    label: 'Dashboard',    icon: '⊞',  roles: ['admin','support','operations','sales'] },
  { to: '/users',        label: 'Usuarios',     icon: '👤', roles: ['admin','support','operations','sales'] },
  { to: '/marketplace',  label: 'Marketplace',  icon: '🚗', roles: ['admin','support','operations','sales'] },
  { to: '/appointments', label: 'Citas',        icon: '📅', roles: ['admin','support','operations','sales'] },
  { to: '/tickets',      label: 'Tickets',      icon: '🎫', roles: ['admin','support','operations','sales'] },
  { to: '/idcars',       label: 'IDCars',       icon: '🔑', roles: ['admin','support','operations'] },
  { to: '/leads',        label: 'Leads',        icon: '📩', roles: ['admin','support','operations','sales'] },
  { to: '/workshops',    label: 'Talleres',     icon: '🔧', roles: ['admin','operations'] },
  { to: '/billing',      label: 'Facturación',  icon: '💳', roles: ['admin','operations'] },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin', support: 'Soporte', operations: 'Operaciones', sales: 'Comercial',
};
const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-red-500', support: 'bg-sky-500', operations: 'bg-violet-500', sales: 'bg-emerald-500',
};

export default function Sidebar() {
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
      className="flex flex-col w-60 shrink-0 h-screen overflow-y-auto"
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚗</span>
          <div>
            <p className="text-white font-bold text-sm leading-tight">CarsWise</p>
            <p className="text-slate-400 text-[11px]">ERP Backoffice</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
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
