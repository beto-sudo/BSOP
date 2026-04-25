import { cn } from '@/lib/utils';

export interface LevantamientoProgressGaugeProps {
  /** Lines already counted. */
  contadas: number;
  /** Total seeded lines. */
  totales: number;
  /** Diameter in px. Defaults to 96. */
  size?: number;
  className?: string;
}

export function LevantamientoProgressGauge({
  contadas,
  totales,
  size = 96,
  className,
}: LevantamientoProgressGaugeProps) {
  const safeTotales = Math.max(totales, 0);
  const safeContadas = Math.max(0, Math.min(contadas, safeTotales));
  const pct = safeTotales === 0 ? 0 : (safeContadas / safeTotales) * 100;
  const strokeWidth = Math.max(6, Math.round(size / 12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  let stroke = 'stroke-muted-foreground/40';
  if (pct >= 100) stroke = 'stroke-emerald-500';
  else if (pct > 0) stroke = 'stroke-sky-500';

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Progreso ${safeContadas} de ${safeTotales}`}
    >
      <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset]', stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-lg font-semibold tabular-nums leading-none">{Math.round(pct)}%</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
          {safeContadas}/{safeTotales}
        </div>
      </div>
    </div>
  );
}
