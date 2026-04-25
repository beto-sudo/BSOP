import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type KpiTone = 'default' | 'success' | 'warning' | 'destructive' | 'muted';

const TONE_CLASSES: Record<KpiTone, string> = {
  default: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
};

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: KpiTone;
  className?: string;
}

export function KpiCard({ label, value, hint, icon, tone = 'default', className }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3', className)}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', TONE_CLASSES[tone])}>
        {value}
      </div>
      {hint != null && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
