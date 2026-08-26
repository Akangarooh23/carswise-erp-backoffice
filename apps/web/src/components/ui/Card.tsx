import Icono, { type NombreIcono } from './Icono.js';
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${padding ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon?: NombreIcono;
  /** Solo se colorea lo que significa algo. El resto, neutro. */
  color?: 'neutro' | 'bien' | 'espera' | 'urgente' | 'acento';
}

const iconBg: Record<string, string> = {
  neutro:  'bg-brand-50 text-brand-400',
  bien:    'bg-emerald-50 text-emerald-600',
  espera:  'bg-amber-50 text-amber-700',
  urgente: 'bg-red-50 text-red-600',
  acento:  'bg-acento-tenue text-acento-texto',
};

export function StatCard({ label, value, sub, icon, color = 'neutro' }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg[color]}`}>
            <Icono nombre={icon} tam={17} />
          </div>
        )}
      </div>
    </Card>
  );
}
