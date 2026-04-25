import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type LevantamientoEstado =
  | 'borrador'
  | 'capturando'
  | 'capturado'
  | 'aplicado'
  | 'cancelado';

const META: Record<LevantamientoEstado, { label: string; className: string }> = {
  borrador: {
    label: 'Borrador',
    className: 'border-border bg-muted text-muted-foreground',
  },
  capturando: {
    label: 'Capturando',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
  capturado: {
    label: 'Pendiente firma',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  aplicado: {
    label: 'Aplicado',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
};

export interface LevantamientoStatusBadgeProps {
  estado: string;
  className?: string;
}

export function LevantamientoStatusBadge({ estado, className }: LevantamientoStatusBadgeProps) {
  const meta = META[estado as LevantamientoEstado] ?? {
    label: estado,
    className: 'border-border bg-muted text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={cn('border', meta.className, className)}>
      {meta.label}
    </Badge>
  );
}
