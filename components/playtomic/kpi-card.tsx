import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/50">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}
