import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/inventario/format';
import { cn } from '@/lib/utils';

export interface ToleranciaConfig {
  tolerancia_pct: number;
  tolerancia_monto: number;
  firmas_requeridas: number;
}

export interface TolerancePanelProps {
  /** Empresa-level config (from `erp.fn_get_empresa_tolerancia`). */
  config: ToleranciaConfig;
  /** Per-levantamiento overrides (NULL when not set). */
  overridePct?: number | null;
  overrideMonto?: number | null;
  /** Number of lines currently outside tolerance. */
  lineasFueraDeTolerancia?: number;
  className?: string;
}

export function TolerancePanel({
  config,
  overridePct,
  overrideMonto,
  lineasFueraDeTolerancia = 0,
  className,
}: TolerancePanelProps) {
  const effectivePct = overridePct ?? config.tolerancia_pct;
  const effectiveMonto = overrideMonto ?? config.tolerancia_monto;
  const tieneOverride = overridePct != null || overrideMonto != null;
  const hayFuera = lineasFueraDeTolerancia > 0;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        hayFuera && 'border-amber-500/40 bg-amber-500/5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tolerancia
          </div>
          <div className="mt-2 grid grid-cols-3 gap-4 text-sm tabular-nums">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                % por línea
              </div>
              <div className="font-semibold">{effectivePct.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                $ por línea
              </div>
              <div className="font-semibold">{formatCurrency(effectiveMonto)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Firmas
              </div>
              <div className="font-semibold">{config.firmas_requeridas}</div>
            </div>
          </div>
          {tieneOverride && (
            <div className="mt-2 text-xs text-muted-foreground">
              Override del levantamiento (default empresa: {config.tolerancia_pct.toFixed(2)}% /{' '}
              {formatCurrency(config.tolerancia_monto)}).
            </div>
          )}
        </div>
        {hayFuera && (
          <div className="flex shrink-0 items-center gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            {lineasFueraDeTolerancia} línea{lineasFueraDeTolerancia === 1 ? '' : 's'} fuera
          </div>
        )}
      </div>
    </div>
  );
}
