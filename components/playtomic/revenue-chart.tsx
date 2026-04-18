import type { ChartBucket } from './types';

export function RevenueChart({ data }: { data: ChartBucket[] }) {
  const width = 920;
  const chartHeight = 280;
  const barWidth = Math.max(8, Math.min(28, width / Math.max(data.length, 1) - 4));
  const gap = Math.max(
    4,
    Math.min(12, (width - barWidth * data.length) / Math.max(data.length - 1, 1))
  );
  const maxValue = Math.max(...data.map((item) => item.total), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-[var(--text)]/65">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Padel
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          Tennis
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${chartHeight + 36}`}
          className="min-w-[760px] text-[var(--text)]"
        >
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartHeight - tick * chartHeight;
            return (
              <line
                key={tick}
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
              />
            );
          })}
          {data.map((item, index) => {
            const x = index * (barWidth + gap);
            const padelHeight = (item.padel / maxValue) * chartHeight;
            const tennisHeight = (item.tennis / maxValue) * chartHeight;
            const totalHeight = padelHeight + tennisHeight;
            const yTop = chartHeight - totalHeight;
            return (
              <g key={item.key}>
                <rect
                  x={x}
                  y={chartHeight - padelHeight}
                  width={barWidth}
                  height={padelHeight}
                  rx={Math.min(6, barWidth / 2)}
                  fill="#10b981"
                />
                <rect
                  x={x}
                  y={yTop}
                  width={barWidth}
                  height={tennisHeight}
                  rx={Math.min(6, barWidth / 2)}
                  fill="#0ea5e9"
                />
                {index === 0 ||
                index === data.length - 1 ||
                index % Math.ceil(data.length / 6) === 0 ? (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fill="currentColor"
                    opacity="0.45"
                  >
                    {item.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
