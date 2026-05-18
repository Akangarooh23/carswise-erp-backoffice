interface BadgeProps {
  variant?: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'slate' | 'orange';
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

const variants = {
  green:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  red:    'bg-red-50 text-red-700 ring-1 ring-red-200',
  blue:   'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  purple: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  slate:  'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  orange: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
};

export function Badge({ variant = 'slate', children, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${variants[variant]}`}>
      {children}
    </span>
  );
}

// Pre-baked semantic badges
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    active:           { label: 'Activo',       variant: 'green'  },
    at_risk:          { label: 'En riesgo',     variant: 'yellow' },
    blocked:          { label: 'Bloqueado',     variant: 'red'    },
    open:             { label: 'Abierto',       variant: 'blue'   },
    in_progress:      { label: 'En curso',      variant: 'purple' },
    waiting_customer: { label: 'Esperando',     variant: 'yellow' },
    resolved:         { label: 'Resuelto',      variant: 'green'  },
    closed:           { label: 'Cerrado',       variant: 'slate'  },
    scheduled:        { label: 'Programada',    variant: 'blue'   },
    confirmed:        { label: 'Confirmada',    variant: 'purple' },
    completed:        { label: 'Completada',    variant: 'green'  },
    cancelled:        { label: 'Cancelada',     variant: 'red'    },
    no_show:          { label: 'No apareció',   variant: 'orange' },
    free:             { label: 'Free',          variant: 'slate'  },
    plus:             { label: 'Plus',          variant: 'blue'   },
    premium:          { label: 'Premium',       variant: 'purple' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'slate' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    low:    { label: 'Baja',    variant: 'slate'  },
    medium: { label: 'Media',   variant: 'blue'   },
    high:   { label: 'Alta',    variant: 'orange' },
    urgent: { label: 'Urgente', variant: 'red'    },
  };
  const { label, variant } = map[priority] ?? { label: priority, variant: 'slate' };
  return <Badge variant={variant}>{label}</Badge>;
}
