import { EmptyState } from './empty-state';
import { buildLinePath, formatDateLabel } from './helpers';
import { TONES } from './tones';
import type { ChartConfig } from './types';

export function TrendSvg({
  config,
  expanded = false,
}: {
  config: ChartConfig;
  expanded?: boolean;
}) {
  const primaryValues = config.data.map((point) => point.value);
  const secondaryValues = config.secondaryData?.map((point) => point.value) ?? [];
  const allValues = [...primaryValues, ...secondaryValues];
  const min = Math.min(...allValues, Number.POSITIVE_INFINITY);
  const max = Math.max(...allValues, 0);
  const range = Number.isFinite(min) && max > min ? max - min : 1;
  const tone = TONES[config.key];
  const width = expanded ? 900 : 320;
  const height = expanded ? 360 : 180;
  const strokeWidth = expanded ? 2 : 1.5;
  const dotRadius = expanded ? 2.5 : 2;

  if (!config.data.length) {
    return <EmptyState title={config.emptyTitle} copy={config.emptyCopy} />;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient
            id={`${config.key}-line-${expanded ? 'full' : 'card'}`}
            x1="0%"
            x2="100%"
            y1="0%"
            y2="0%"
          >
            <stop offset="0%" stopColor={tone.lineSoft} />
            <stop offset="100%" stopColor={tone.line} />
          </linearGradient>
          {config.secondaryData?.length ? (
            <linearGradient
              id={`${config.key}-secondary-${expanded ? 'full' : 'card'}`}
              x1="0%"
              x2="100%"
              y1="0%"
              y2="0%"
            >
              <stop
                offset="0%"
                stopColor={config.key === 'bp' ? TONES.bp.secondarySoft : tone.lineSoft}
              />
              <stop
                offset="100%"
                stopColor={config.key === 'bp' ? TONES.bp.secondary : tone.line}
              />
            </linearGradient>
          ) : null}
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => {
          const y = height - 28 - fraction * (height - 52);
          return (
            <line
              key={fraction}
              x1="14"
              x2={width - 14}
              y1={y}
              y2={y}
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1"
            />
          );
        })}
        <path
          d={buildLinePath(config.data, min, range, width, height)}
          fill="none"
          stroke={`url(#${config.key}-line-${expanded ? 'full' : 'card'})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {config.secondaryData?.length ? (
          <path
            d={buildLinePath(config.secondaryData, min, range, width, height)}
            fill="none"
            stroke={`url(#${config.key}-secondary-${expanded ? 'full' : 'card'})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.95"
          />
        ) : null}
        {config.data.map((point, index) => {
          const x = (index / Math.max(config.data.length - 1, 1)) * (width - 28) + 14;
          const y = height - 28 - ((point.value - min) / range) * (height - 52);
          return (
            <circle
              key={`${config.key}-${point.date}`}
              cx={x}
              cy={Number.isFinite(y) ? y : height / 2}
              r={dotRadius}
              fill={tone.dot}
            />
          );
        })}
        {config.secondaryData?.map((point, index) => {
          const x = (index / Math.max(config.secondaryData!.length - 1, 1)) * (width - 28) + 14;
          const y = height - 28 - ((point.value - min) / range) * (height - 52);
          return (
            <circle
              key={`${config.key}-secondary-${point.date}`}
              cx={x}
              cy={Number.isFinite(y) ? y : height / 2}
              r={dotRadius}
              fill={config.key === 'bp' ? TONES.bp.secondaryDot : tone.dot}
            />
          );
        })}
      </svg>
      <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)] dark:text-white/45">
        <span>{formatDateLabel(config.data[0]?.date ?? '')}</span>
        <span>{formatDateLabel(config.data.at(-1)?.date ?? '')}</span>
      </div>
      {config.secondaryData?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[var(--muted-foreground)] dark:text-white/60">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.line }} />
            <span>{config.primaryLabel ?? config.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: config.key === 'bp' ? TONES.bp.secondary : tone.dot }}
            />
            <span>{config.secondaryLabel ?? 'Comparison'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
