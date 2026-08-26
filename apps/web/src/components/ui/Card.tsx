import Icono, { type NombreIcono } from './Icono.js';
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-brand-200 shadow-sm ${padding ? 'p-5' : ''} ${className}`}>
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
  const esCero = value === 0 || value === '0' || value === '–';
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-brand-400 font-medium">{label}</p>
          {/* Un cero no es una noticia. Se pinta apagado para que lo que si
              tiene valor destaque solo, sin tener que leer las diecinueve
              tarjetas una por una. */}
          <p className={`text-2xl font-bold mt-1 tabular-nums ${esCero ? 'text-brand-200' : 'text-brand-600'}`}>{value}</p>
          {sub && <p className="text-xs text-brand-300 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${esCero ? 'bg-brand-50 text-brand-200' : iconBg[color]}`}>
            <Icono nombre={icon} tam={17} />
          </div>
        )}
      </div>
    </Card>
  );
}
