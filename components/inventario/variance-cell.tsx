import { formatNumber } from '@/lib/inventario/format';
import { cn } from '@/lib/utils';

export interface VarianceCellProps {
  /** Stock theoretically expected (sistema). */
  sistema: number;
  /** Counted physically. */
  contado: number;
  /** Optional unit (e.g. 'kg', 'pza'). */
  unidad?: string | null;
  /** When true, highlight Δ in destructive tone. */
  fueraDeTolerancia?: boolean;
  className?: string;
}

export function VarianceCell({
  sistema,
  contado,
  unidad,
  fueraDeTolerancia,
  className,
}: VarianceCellProps) {
  const diferencia = contado - sistema;
  const sign = diferencia > 0 ? '+' : '';
  let deltaTone = 'text-muted-foreground';
  if (diferencia !== 0) {
    if (fueraDeTolerancia) {
      deltaTone = 'text-destructive';
    } else if (diferencia > 0) {
      deltaTone = 'text-emerald-600 dark:text-emerald-400';
    } else {
      deltaTone = 'text-amber-600 dark:text-amber-400';
    }
  }

  const u = unidad ? ` ${unidad}` : '';

  return (
    <div className={cn('grid grid-cols-3 gap-3 text-sm tabular-nums', className)}>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sistema</div>
        <div className="font-medium">
          {formatNumber(sistema)}
          {u}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Contado</div>
        <div className="font-medium">
          {formatNumber(contado)}
          {u}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ</div>
        <div className={cn('font-semibold', deltaTone)}>
          {sign}
          {formatNumber(diferencia)}
          {u}
        </div>
      </div>
    </div>
  );
}
