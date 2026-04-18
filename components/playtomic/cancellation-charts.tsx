export function CancellationWeekdayChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 520;
  const height = 220;
  const chartHeight = 160;
  const barWidth = 44;
  const gap = 28;
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">Cancelaciones por día</h3>
        <p className="text-sm text-[var(--text)]/55">
          Distribución semanal de reservas canceladas.
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[460px] text-[var(--text)]">
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
            const x = 20 + index * (barWidth + gap);
            const barHeight = (item.value / maxValue) * chartHeight;
            const y = chartHeight - barHeight;
            return (
              <g key={item.label}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx="12" fill="#f43f5e" />
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 8, 12)}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.75"
                >
                  {item.value}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 22}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.5"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function CancellationHourChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 960;
  const height = 220;
  const chartHeight = 160;
  const barWidth = Math.max(12, Math.min(24, width / Math.max(data.length, 1) - 4));
  const gap = Math.max(
    3,
    Math.min(10, (width - barWidth * data.length) / Math.max(data.length - 1, 1))
  );
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">Cancelaciones por hora</h3>
        <p className="text-sm text-[var(--text)]/55">Horas del día con más cancelaciones.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] text-[var(--text)]">
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
            const barHeight = (item.value / maxValue) * chartHeight;
            const y = chartHeight - barHeight;
            const showLabel = index === 0 || index === data.length - 1 || index % 3 === 0;
            return (
              <g key={item.label}>
                <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" fill="#ef4444" />
                {item.value > 0 ? (
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(y - 8, 12)}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    opacity="0.72"
                  >
                    {item.value}
                  </text>
                ) : null}
                {showLabel ? (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 22}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    opacity="0.5"
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
